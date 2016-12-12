pragma solidity ^0.4.6;

import "TokenTracker.sol";
import "Phased.sol";
import "StepFunction.sol";
import "Targets.sol";
import "Parameters.sol";

/**
 * The DFINITY foundation donation contract (FDC).
 *
 * This contract 
 *  - accepts on-chain donations for the foundation in ether 
 *  - tracks on-chain and off-chain donations made to the foundation
 *  - assigns unrestricted tokens to addresses provided by donors
 *  - assigns restricted tokens to itself and to early contributors
 *    
 * On-chain donations are received in ether are converted to Swiss francs (CHF).
 * Off-chain donations are received and recorded directly in Swiss francs.
 * Tokens are assigned at a rate of 10 tokens per CHF. 
 *
 * There are two types of tokens intially. Unrestricted tokens are assigned to 
 * donors and restricted tokens are assigned to the foundation and early 
 * contributors. Restricted tokens are converted to unrestricted tokens in the 
 * finalization phase, after which only unrestricted tokens exist.
 *
 * After the finalization phase, tokens assigned to the foundation and early 
 * contributors will make up a pre-defined share of all tokens. This is achieved
 * through burning excess restricted tokens before their restriction is removed.
 */

contract FDC is TokenTracker, Phased, StepFunction, Targets, Parameters {

  /*
   * Phases
   *
   * The FDC over its lifetime runs through a number of phases. These phases are
   * tracked by the base contract Phased.
   *
   * The FDC maps the chronologically defined phase numbers to semantically 
   * defined states.
   */

  // The FDC states
  enum state {
    pause,         // Pause without any activity 
    earlyContrib,  // Registration of early contributions
    donPhase0,     // Donation phase 0  
    donPhase1,     // Donation phase 1 
    offChainReg,   // Grace period for registration of off-chain donations
    finalization,  // Adjustment of early contributions down to their share
    done           // Read-only phase
  }

  // Mapping from phase number (from the base contract Phased) to FDC state 
  mapping(uint => state) stateOfPhase;

  /**
   * Tokens
   *
   * The FDC uses base contract TokenTracker to:
   *  - track token assignments for donors (unrestricted tokens)
   *  - track token assignments for early contributors (restricted tokens)
   *  - convert early contributor tokens down to the right amount
   *
   * The FDC uses the base contract Targets to:
   *  - track the targets measured in CHF for each donation phase
   */
   
  /**
   * Exchange rate and ether handling
   *
   * The FDC keeps track of:
   *  - the exchange rate between ether and Swiss francs
   *  - the total and per address ether donations
   */
   
  // Exchange rate between ether and Swiss francs
  uint public weiPerCHF;       
  
  // Total number of Wei donated on-chain so far 
  uint public totalWeiDonated; 
  
  // Mapping from address to total number of Wei donated for the address
  mapping(address => uint) public weiDonated; 

  /**
   * Access control 
   * 
   * The following three addresses have access to restricted functions of the 
   * FDC and to the donated funds.
   */
   
  // Wallet address to which on-chain donations are being forwarded
  address public foundationWallet; 
  
  // Address that is allowed to register early contributions and off-chain 
  // donations and delay donation phase 1
  address public registrarAuth; 
  
  // Address that is allowed to update the exchange rate
  address public exchangeRateAuth; 

  /**
   * Events
   *
   *  - DonationReceipt:     logs an on-chain or off-chain donation
   *  - EarlyContribReceipt: logs the registration of an early contribution 
   *  - BurnReceipt:         logs the burning of token during finalization
   */

  event DonationReceipt (address indexed addr,
                         string indexed currency,
                         uint indexed bonusMultiplierApplied,
                         uint timestamp,
                         uint tokenAmount,
                         bytes32 memo);
  event EarlyContribReceipt (address indexed addr,
                             uint tokenAmount,
                             bytes32 memo);
  event BurnReceipt (address indexed addr,
                     uint tokenAmountBurned);

  /**
   * Constructor
   *
   * The constructor defines 
   *  - the privileged addresses for access control
   *  - the phases in base contract Phased
   *  - the mapping between phase numbers and states
   *  - the targets in base contract Targets 
   *  - the share for early contributors in base contract TokenTracker
   *  - the step function for the bonus calculation in donation phase 1 
   *
   * All configuration parameters are taken from base contract Parameters.
   */
  function FDC(address _foundationWallet,
               address _registrarAuth,
               address _exchangeRateAuth)
    TokenTracker(earlyContribShare)
    StepFunction(phase1EndTime-phase1StartTime, phase1InitialBonus, phase1BonusSteps) 
  {
    /**
     * Set privileged addresses for access control
     */
    foundationWallet  = _foundationWallet;
    registrarAuth     = _registrarAuth;
    exchangeRateAuth  = _exchangeRateAuth;

    /**
     * Initialize base contract Phased
     * 
     *           |------------------------- Phase number (0-7)
     *           |    |-------------------- State name
     *           |    |               |---- Transition number (0-6)
     *           V    V               V
     */
    stateOfPhase[0] = state.earlyContrib; 
    addPhase(earlyContribEndTime); // 0
    stateOfPhase[1] = state.pause;
    addPhase(phase0StartTime);     // 1
    stateOfPhase[2] = state.donPhase0;
    addPhase(phase0EndTime);       // 2 
    stateOfPhase[3] = state.offChainReg;
    addPhase(phase1StartTime);     // 3
    stateOfPhase[4] = state.donPhase1;
    addPhase(phase1EndTime);       // 4 
    stateOfPhase[5] = state.offChainReg;
    addPhase(finalizeStartTime);   // 5 
    stateOfPhase[6] = state.finalization;
    addPhase(finalizeEndTime);     // 6 
    stateOfPhase[7] = state.done;

    // Maximum delay for start of donation phase 1 (= transition 3)
    setMaxDelay(3, maxDelay);

    /**
     * Initialize base contract Targets
     */
    setTarget(2, phase0Target);
    setTarget(4, phase1Target);
  }
  
  /**
   * PUBLIC functions
   * 
   *  - getState
   */

  /**
   * Get current state at the current block time 
   */
  function getState() constant returns (state) {
    return stateOfPhase[getPhaseAtTime(now)];
  }
  
  /**
   * Return the bonus multiplier at a given time
   *
   * The given must lie in one of the donation phases because otherwise there
   * is no valid multiplier.
   */
  function getMultiplierAtTime(uint time) constant returns (uint) {
    // Get phase number
    uint n = getPhaseAtTime(time);

    // If time lies in donation phase 0 we return the constant multiplier 
    if (stateOfPhase[n] == state.donPhase0) {
      return 100 + phase0Bonus;
    }

    // If time lies in donation phase 1 we return the step function
    if (stateOfPhase[n] == state.donPhase1) {
      return 100 + getStepFunction(time - getPhaseStartTime(n));
    }

    // Throw outside of donation phases
    throw;
  }

  //
  // PUBLIC API
  //

  /* `donateAsWithChecksum` is useful for and integrated with flows
     where the user manually enters the tx data, e.g. when sending
     directly from an exchange.

     `donate` is used when the sender is the recipient and `donateFor`
     can be used by e.g. contracts that have already validated the
     recipient address and do not need a checksum.
  */
  function donateAsWithChecksum(address addr, bytes4 checksum) payable returns (bool) {
    // SHA256 is used as more readily available outside Ethereum libs
    bytes32 hash = sha256(addr);
    if (bytes4(hash) != checksum) { throw ; }

    return donateAs(addr);
  }

  // Give an on-chain donation
  function donateAs(address addr) payable returns (bool) {
    // Reject donations outside the donation phases
    state st = getState();
    if (st != state.donPhase0 && st != state.donPhase1) { throw; }

    // Reject donation amounts outside the allowed interval
    if (msg.value < minDonation) { throw; }

    // The exchange rate must have been set first before donations can be accepted
    if (weiPerCHF == 0) { throw; } 

    // Accept donation, defer forwarding to the end of this function
    totalWeiDonated += msg.value;
    weiDonated[addr] += msg.value;

    // Convert Wei to CHF cents
    uint chfCents = (msg.value * 100) / weiPerCHF;
    
    // Do the book-keeping
    bookDonation(addr, now, chfCents, "ETH", "");

    // Now do the deferred forwarding call
    // TODO is the if clause needed? can the call fail but not throw itself?
    if (!foundationWallet.call.value(this.balance)()) { throw; }

    return true;
  }

  function finalize(address addr) returns (bool) {
    // The function is only available during the finalization phase
    if (getState() != state.finalization) { throw; }

    // Close down further assignments in TokenTracker
    if (!assignmentsClosed) { closeAssignments(); }

    // Burn and issue burn receipt
    uint tokensBurned = unrestrict(addr); 
    BurnReceipt(addr, tokensBurned);

    // close finalization phase
    if (isUnrestricted()) { endCurrentPhaseIn(0); }
    
    return true;
  }

  function empty() returns (bool) {
    return foundationWallet.call.value(this.balance)();
  }

  // Delay donation phase 1
  function delayDonPhase1(uint timedelta) returns (bool) {
    // Require permission
    if (msg.sender != registrarAuth) { throw; }

    delayPhaseEndBy(3, timedelta);
    
    return true;
  }
 
  //
  // AUTHENTICATED API
  //

  // Set the exchange rate for Eth-CHF in wei per CHF
  // TODO Change this function to setWeiPerCHF
  function setWeiPerCHF(uint weis) returns (bool) {
    // Require permission
    if (msg.sender != exchangeRateAuth) { throw; }

    // Set the global state variable for exchange rate 
    weiPerCHF = weis;
    return true;
  }

  // Register an early contribution
  function registerEarlyContrib(address addr, uint tokenAmount, bytes32 memo) returns (bool) {
    // Require permission
    if (msg.sender != registrarAuth)      { throw; }

    // Reject registrations outside the early contribution phase
    if (getState() != state.earlyContrib) { throw; }

    // assign tokens in TokenTracker
    assign(addr, tokenAmount, true);
    
    // Issue early contribution receipt
    EarlyContribReceipt(addr, tokenAmount, memo);
    return true;
  }

  // Register an off-chain donation
  // TODO document what happens if timestamp is invalid
  function registerOffChainDonation(address addr, uint timestamp, uint chfCents, string currency, bytes32 memo) returns (bool) {
    // Require permission
    if (msg.sender != registrarAuth) { throw; }

    // We need the current phase and state
    uint currentPhase = getPhaseAtTime(now);
    state currentState = stateOfPhase[currentPhase];
    
    // Reject registrations outside the two donation phases (incl. their extended registration periods for off-chain donations)
    if (currentState != state.donPhase0 && currentState != state.donPhase1 && currentState != state.offChainReg) { throw; }
   
    // The timestamp defines the donation phase and the multiplier.
    // It can't be in the future because future phase times might still change
    if (timestamp > now) { throw; }
   
    // We need phase and state of the timestamp  
    uint timestampPhase = getPhaseAtTime(timestamp);
    state timestampState = stateOfPhase[timestampPhase];
   
    // Reject timestamps outside (the correct) donation phase 
    if (currentState == state.donPhase0 && timestampState != currentState) { throw; }
    if (currentState == state.donPhase1 && timestampState != currentState) { throw; }
    if (currentState == state.offChainReg && timestampPhase != currentPhase - 1) { throw; }

    // Do the book-keeping
    bookDonation(addr, timestamp, chfCents, currency, memo);

    return true;
  }

  //
  // Internal Functions
  //

  // Put an accepted donation in the books.
  // This function cannot throw as all checks have been done before. 
  // This function is agnostic to the source of the donation (on-chain or off-chain) and to the currency (the currency argument is passed through to the DonationReceipt)
  // The phase argument is redundant because it could be derived from the timestamp. However, it is passed in to save the gas of re-calculating it.
  function bookDonation(address addr, uint timestamp, uint chfCents, string currency, bytes32 memo) private {
    // Log the tokens before applying multipliers towards the target counter
    // If target first reached (= return value) then schedule early phase end 
    uint phase = getPhaseAtTime(timestamp);
    bool targetReached = addTowardsTarget(phase, chfCents);
    if (targetReached && phase == getPhaseAtTime(now)) {
      endCurrentPhaseIn(gracePeriodAfterTarget);
    }

    // Apply the multiplier that was valid at the given time 
    uint bonusMultiplier = getMultiplierAtTime(timestamp);
    chfCents = (chfCents * bonusMultiplier) / 100;

    // Convert chfCents into tokens
    //    uint tokenAmount = chfCents / chfCentsPerToken;
    uint tokenAmount = (chfCents * tokensPerCHF) / 100;

    // assign unrestricted tokens in TokenTracker
    assign(addr,tokenAmount,false);

    // Issue donation receipt
    DonationReceipt(addr, currency, bonusMultiplier, timestamp, tokenAmount, memo);
  }

  //
  // External getters
  //

  // Not used internally. Utility function that retrieves general status of the
  // funder and information specific to a donor.
  //  donationPhase - phase of the funder. 0=seed, 1=main
  //  dfnAddr       - public key address of donor's DFN proposed account
  //  fwdAddr       - public key address of donor's donation forwarding app
  function getStatus(uint donationPhase, address dfnAddr, address fwdAddr)
    public constant
    returns (
      state currentState,     // current state (an enum)
      uint fxRate,            // exchange rate of CHF -> ETH (Wei/CHF)
      uint currentMultiplier, // current bonus multiplier in percent (0 if outside of)
      uint donationCount,     // total individual donations made (a count)
      uint totalTokenAmount,  // total DFN planned allocated to donors
      uint startTime,         // expected start time of specified donation phase
      uint endTime,           // expected end time of specified donation phase
      bool isTargetReached,   // whether phase target has been reached
      uint chfCentsDonated,   // total value donated in specified phase as CHF
      uint tokenAmount,       // total DFN planned allocted to donor (user)
      uint fwdBalance,        // total ETH (in Wei) waiting in fowarding address
      uint donated)           // total ETH (in Wei) donated by DFN address 
  {
    // global state
    currentState = getState();
    
    // phase dependent state
    if (currentState == state.donPhase0 || currentState == state.donPhase1) {
      currentMultiplier = getMultiplierAtTime(now);
    } 
    
    if (donationPhase == 0) {
      // i = 2
      startTime = phaseEndTime[1];
      endTime = phaseEndTime[2];
      isTargetReached = targetReached(2);
      chfCentsDonated = counter[2];
    } else {
      // i = 4
      startTime = phaseEndTime[3];
      endTime = phaseEndTime[4];
      isTargetReached = targetReached(4);
      chfCentsDonated = counter[4];
    }
    
    fxRate = weiPerCHF;
    donationCount = totalUnrestrictedAssignments;
    totalTokenAmount = totalUnrestrictedTokens;

    // addr dependent state
    tokenAmount = tokens[dfnAddr];
    fwdBalance = fwdAddr.balance;
    donated = weiDonated[dfnAddr];
  }
}
