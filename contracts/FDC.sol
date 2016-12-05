// TODO: set to exact version before release
pragma solidity >=0.4.1;

import "TokenTracker.sol";
import "Phased.sol";
import "StepFunction.sol";
import "Caps.sol";
import "Parameters.sol";

contract FDC is TokenTracker, Phased, StepFunction, Caps, Parameters {

  //
  // States
  //
  
  // The FDC over its lifetime runs through a number of states. We let
  // the base contract track the states over time (phases). However,
  // the FDC defines the following convenient phase names and provides
  // a mapping to translate the internal numbering of the base
  // contract phases to the semantic state names. The mapping will be
  // defined in the constructor.

  enum state {
    pause,          
    earlyContrib,  // Registration of early contribution
    donPhase0,     // Capped on-chain-only donation phase
    donPhase1,     // Uncapped donation phase for on- and off-chain donations 
    offChainReg,   // Grace period for registration of off-chain donations
    finalization,  // Adjustment of early contributions down to 20% of all tokens
    done           // Read-only phase
  }

  mapping(uint => state) stateOfPhase;

  //
  // FDC State
  //

  // The global state is defined by the following base contracts and global variables.

  // see TokenTracker for token balances
  // see Phased for phase based on time
  // see Caps for status of donation caps 
  uint public weiPerCHF;       // exchange rate between Eth and CHF 
  uint public totalWeiDonated; // total number of wei donated on-chain so far 
  mapping(address => uint) public weiDonated; // Wei donated per address

  //
  // Access control 
  //

  // The following configuration parameters define the permissions for
  // all access restricted functionality of the FDC. They are set by
  // the constructor.

  address public foundationWallet; // wallet address to which on-chain donations are being forwarded
  address public registrarAuth; // address of contract that is allowed to register early contributions and off-chain donations
  address public exchangeRateAuth; // address of contract that is allowed to update weiPerCHF (the Eth-CHF exchange rate)

  //
  // Events
  //

  // The following events are logged to produce a receipt.
  // DonationReceipt:    token amount assigned for an on-chain or off-chain contribution 
  // EarlyContribRecipt: token amount assigned for an early contribution 
  // BurnReceipt:        token amount that got burned during finalization

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

  //
  // Constructor
  //

  function FDC(address _foundationWallet,
               address _registrarAuth,
               address _exchangeRateAuth)
    TokenTracker(earlyContribShare)
    StepFunction(phase1EndTime-phase1StartTime,phase1Steps,phase1StepSize) // phaseLength, nStep, step
  {
    foundationWallet  = _foundationWallet;
    registrarAuth     = _registrarAuth;
    exchangeRateAuth  = _exchangeRateAuth;

    // initialize phased base contract
      stateOfPhase[0] = state.earlyContrib;

    addPhase(earlyContribEndTime); // transition 0
    
      stateOfPhase[1] = state.pause;

    addPhase(phase0StartTime); // transition 1
    
      stateOfPhase[2] = state.donPhase0;

    addPhase(phase0EndTime); // transition 2
    
      stateOfPhase[3] = state.offChainReg;

    addPhase(phase1StartTime); // transition 3
    
      stateOfPhase[4] = state.donPhase1;

    addPhase(phase1EndTime); // transition 4
    
      stateOfPhase[5] = state.offChainReg;

    addPhase(finalizeStartTime); // transition 5
    
      stateOfPhase[6] = state.finalization;

    addPhase(finalizeEndTime); // transition 6
    
      stateOfPhase[7] = state.done;

    // set max delay for start of donation phase 1
    setMaxDelay(3, maxDelay);

    // initialize Caps base contract
    setCap(uint(state.donPhase0), phase0Cap);
    setCap(uint(state.donPhase1), phase1Cap);
  }
  
  //
  // Helpers
  //

  // get current state (now)
  function getState() constant returns (state) {
    return stateOfPhase[getPhaseAtTime(now)];
  }
  
  // return the bonus multiplier at the specified time
  // at times outside of the donation phases there is no valid multiplier
  // we have to handle that error gracefully instead of throw
  function getMultiplierAtTime(uint time) constant returns (uint) {
    uint phase = getPhaseAtTime(time);

    // If time lies in donation phase 0 we return the constant multiplier 
    if (stateOfPhase[phase] == state.donPhase0) {
      return phase0Multiplier;
    }

    // If time lies in donation phase 1 we return the step function
    if (stateOfPhase[phase] == state.donPhase1) {
      return 100 + getStepFunction(time - getPhaseStartTime(phase));
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
  function delayDonPhase1(uint timedelta) returns (uint) {
    // Require permission
    if (msg.sender != registrarAuth) { throw; }

    return delayPhaseEndBy(3, timedelta);
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
    // Log the tokens before applying multipliers towards the cap counter
    // If cap first reached (= return value) then schedule early phase end 
    uint phase = getPhaseAtTime(timestamp);
    bool capReached = addTowardsCap(phase, chfCents);
    if (capReached && phase == getPhaseAtTime(now)) {
      endCurrentPhaseIn(gracePeriodAfterCap);
    }

    // Apply the multiplier that was valid at the given time 
    uint bonusMultiplier = getMultiplierAtTime(timestamp);
    chfCents = (chfCents * bonusMultiplier * expandFraction) / (100 * expandFraction);

    // Convert chfCents into tokens
    uint tokenAmount = chfCents / chfCentsPerToken;
//    uint tokenAmount = (chfCents * tokensPerCHF) / 100;

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
      bool isCapReached,      // whether target cap specified phase reached
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
      isCapReached = capReached(2);
      chfCentsDonated = counter[2];
    } else {
      // i = 4
      startTime = phaseEndTime[3];
      endTime = phaseEndTime[4];
      isCapReached = capReached(4);
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
