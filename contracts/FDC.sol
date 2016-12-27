/*
The MIT License (MIT)

Copyright (c) 2016 DFINITY Stiftung 

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

/**
 * @title:  The DFINITY Stiftung donation contract (FDC).
 * @author: Timo Hanke <timo.t.hanke@gmail.com> 
 *
 * This contract 
 *  - accepts on-chain donations for the foundation in ether 
 *  - tracks on-chain and off-chain donations made to the foundation
 *  - assigns unrestricted tokens to addresses provided by donors
 *  - assigns restricted tokens to DFINITY Stiftung and early contributors 
 *    
 * On-chain donations are received in ether are converted to Swiss francs (CHF).
 * Off-chain donations are received and recorded directly in Swiss francs.
 * Tokens are assigned at a rate of 10 tokens per CHF. 
 *
 * There are two types of tokens initially. Unrestricted tokens are assigned to
 * donors and restricted tokens are assigned to DFINITY Stiftung and early 
 * contributors. Restricted tokens are converted to unrestricted tokens in the 
 * finalization phase, after which only unrestricted tokens exist.
 *
 * After the finalization phase, tokens assigned to DFINITY Stiftung and early 
 * contributors will make up a pre-defined share of all tokens. This is achieved
 * through burning excess restricted tokens before their restriction is removed.
 */

pragma solidity ^0.4.6;

import "TokenTracker.sol";
import "Phased.sol";
import "StepFunction.sol";
import "Targets.sol";
import "Parameters.sol";

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
    earlyContrib,  // Registration of DFINITY Stiftung/early contributions
    donPhase0,     // Donation phase 0  
    donPhase1,     // Donation phase 1 
    offChainReg,   // Grace period for registration of off-chain donations
    finalization,  // Adjustment of DFINITY Stiftung/early contribution tokens
                   // down to their share
    done           // Read-only phase
  }

  // Mapping from phase number (from the base contract Phased) to FDC state 
  mapping(uint => state) stateOfPhase;

  /*
   * Tokens
   *
   * The FDC uses base contract TokenTracker to:
   *  - track token assignments for 
   *      - donors (unrestricted tokens)
   *      - DFINITY Stiftung/early contributors (restricted tokens)
   *  - convert DFINITY Stiftung/early contributor tokens down to their share
   *
   * The FDC uses the base contract Targets to:
   *  - track the targets measured in CHF for each donation phase
   *
   * The FDC itself:
   *  - tracks the memos of off-chain donations (and prevents duplicates)
   *  - tracks donor and early contributor addresses in two lists
   */
   
  // Mapping to store memos that have been used. Used to prevent duplication.
  mapping(bytes32 => bool) memoUsed;

  // List of registered addresses (each address will appear in one)
  address[] donorList;  
  address[] earlyContribList;  
  
  /*
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

  /*
   * Access control 
   * 
   * The following three addresses have access to restricted functions of the 
   * FDC and to the donated funds.
   */
   
  // Wallet address to which on-chain donations are being forwarded
  address public foundationWallet; 
  
  // Address that is allowed to register DFINITY Stiftung/early contributions
  // and off-chain donations and to delay donation phase 1
  address public registrarAuth; 
  
  // Address that is allowed to update the exchange rate
  address public exchangeRateAuth; 

  // Address that is allowed to update the other authenticated addresses
  address public masterAuth; 

  /*
   * Global variables
   */
 
  // The phase numbers of the donation phases (set by the constructor, 
  // thereafter constant)
  uint phaseOfDonPhase0;
  uint phaseOfDonPhase1;
  
  /*
   * Events
   *
   *  - DonationReceipt:     logs an on-chain or off-chain donation
   *  - EarlyContribReceipt: logs the registration of early contribution 
   *  - BurnReceipt:         logs the burning of token during finalization
   */
  event DonationReceipt (address indexed addr,          // DFN address of donor
                         string indexed currency,       // donation currency
                         uint indexed bonusMultiplierApplied, // depends stage
                         uint timestamp,                // time occurred
                         uint tokenAmount,              // DFN to b recommended
                         bytes32 memo);                 // unique note e.g TxID
  event EarlyContribReceipt (address indexed addr,      // DFN address of donor 
                             uint tokenAmount,          // *restricted* tokens
                             bytes32 memo);             // arbitrary note
  event BurnReceipt (address indexed addr,              // DFN address adjusted
                     uint tokenAmountBurned);           // DFN deleted by adj.

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
  function FDC(address _foundationWallet, address _masterAuth)
    TokenTracker(earlyContribShare)
    StepFunction(phase1EndTime-phase1StartTime, phase1InitialBonus, 
                 phase1BonusSteps) 
  {
    /*
     * Set privileged addresses for access control
     */
    foundationWallet  = _foundationWallet;
    masterAuth     = _masterAuth;
    exchangeRateAuth  = _masterAuth;
    registrarAuth  = _masterAuth;

    /*
     * Initialize base contract Phased
     * 
     *           |------------------------- Phase number (0-7)
     *           |    |-------------------- State name
     *           |    |               |---- Transition number (0-6)
     *           V    V               V
     */
    stateOfPhase[0] = state.earlyContrib; 
    addPhase(phase0StartTime);     // 0
    stateOfPhase[1] = state.donPhase0;
    addPhase(phase0EndTime);       // 1 
    stateOfPhase[2] = state.offChainReg;
    addPhase(phase1StartTime);     // 2
    stateOfPhase[3] = state.donPhase1;
    addPhase(phase1EndTime);       // 3 
    stateOfPhase[4] = state.offChainReg;
    addPhase(finalizeStartTime);   // 4 
    stateOfPhase[5] = state.finalization;
    addPhase(finalizeEndTime);     // 5 
    stateOfPhase[6] = state.done;

    // Let the other functions know what phase numbers the donation phases were
    // assigned to
    phaseOfDonPhase0 = 1;
    phaseOfDonPhase1 = 3;
    
    // Maximum delay for start of donation phases 
    setMaxDelay(phaseOfDonPhase0 - 1, donPhaseMaxDelay);
    setMaxDelay(phaseOfDonPhase1 - 1, donPhaseMaxDelay);

    /*
     * Initialize base contract Targets
     */
    setTarget(phaseOfDonPhase0, phase0Target);
    setTarget(phaseOfDonPhase1, phase1Target);
  }
  
  /*
   * PUBLIC functions
   * 
   * Un-authenticated:
   *  - getState
   *  - getMultiplierAtTime
   *  - donateAsWithChecksum
   *  - finalize
   *  - empty
   *  - getStatus
   *
   * Authenticated:
   *  - registerEarlyContrib
   *  - registerOffChainDonation
   *  - setExchangeRate
   *  - delayDonPhase1
   *  - setRegistrarAuth
   *  - setExchangeRateAuth
   *  - setAdminAuth
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
   * The given time must  
   *  - lie in one of the donation phases, 
   *  - not lie in the future.
   * Otherwise there is no valid multiplier.
   */
  function getMultiplierAtTime(uint time) constant returns (uint) {
    // Get phase number (will throw if time lies in the future)
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

  /**
   * Send donation in the name a the given address with checksum
   *
   * The second argument is a checksum which must equal the first 4 bytes of the
   * SHA-256 digest of the byte representation of the address.
   */
  function donateAsWithChecksum(address addr, bytes4 checksum) 
    payable 
    returns (bool) 
  {
    // Calculate SHA-256 digest of the address 
    bytes32 hash = sha256(addr);
    
    // Throw is the checksum does not match the first 4 bytes
    if (bytes4(hash) != checksum) { throw ; }

    // Call un-checksummed donate function 
    return donateAs(addr);
  }

  /**
   * Finalize the balance for the given address
   *
   * This function triggers the conversion (and burn) of the restricted tokens
   * that are assigned to the given address.
   *
   * This function is only available during the finalization phase. It manages
   * the calls to closeAssignments() and unrestrict() of TokenTracker.
   */
  function finalize(address addr) {
    // Throw if we are not in the finalization phase 
    if (getState() != state.finalization) { throw; }

    // Close down further assignments in TokenTracker
    closeAssignmentsIfOpen(); 

    // Burn tokens
    uint tokensBurned = unrestrict(addr); 
    
    // Issue burn receipt
    BurnReceipt(addr, tokensBurned);

    // If no restricted tokens left
    if (isUnrestricted()) { 
      // then end the finalization phase immediately
      endCurrentPhaseIn(0); 
    }
  }

  /**
   * Send any remaining balance to the foundation wallet
   */
  function empty() returns (bool) {
    return foundationWallet.call.value(this.balance)();
  }

  /**
   * Get status information from the FDC
   *
   * This function returns a mix of
   *  - global status of the FDC
   *  - global status of the FDC specific for one of the two donation phases
   *  - status related to a specific token address (DFINITY address)
   *  - status (balance) of an external Ethereum account 
   *
   * Arguments are:
   *  - donationPhase: donation phase to query (0 or 1)
   *  - dfnAddr: token address to query
   *  - fwdAddr: external Ethereum address to query
   */
  function getStatus(uint donationPhase, address dfnAddr, address fwdAddr)
    public constant
    returns (
      state currentState,     // current state (an enum)
      uint fxRate,            // exchange rate of CHF -> ETH (Wei/CHF)
      uint currentMultiplier, // current bonus multiplier (0 if invalid)
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
    // The global status
    currentState = getState();
    if (currentState == state.donPhase0 || currentState == state.donPhase1) {
      currentMultiplier = getMultiplierAtTime(now);
    } 
    fxRate = weiPerCHF;
    donationCount = totalUnrestrictedAssignments;
    totalTokenAmount = totalUnrestrictedTokens;
   
    // The phase specific status
    if (donationPhase == 0) {
      startTime = getPhaseStartTime(phaseOfDonPhase0);
      endTime = getPhaseStartTime(phaseOfDonPhase0 + 1);
      isTargetReached = targetReached(phaseOfDonPhase0);
      chfCentsDonated = counter[phaseOfDonPhase0];
    } else {
      startTime = getPhaseStartTime(phaseOfDonPhase1);
      endTime = getPhaseStartTime(phaseOfDonPhase1 + 1);
      isTargetReached = targetReached(phaseOfDonPhase1);
      chfCentsDonated = counter[phaseOfDonPhase1];
    }
    
    // The status specific to the DFN address
    tokenAmount = tokens[dfnAddr];
    donated = weiDonated[dfnAddr];
    
    // The status specific to the Ethereum address
    fwdBalance = fwdAddr.balance;
  }
  
  /**
   * Set the exchange rate between ether and Swiss francs in Wei per CHF
   *
   * Must be called from exchangeRateAuth.
   */
  function setWeiPerCHF(uint weis) {
    // Require permission
    if (msg.sender != exchangeRateAuth) { throw; }

    // Set the global state variable for exchange rate 
    weiPerCHF = weis;
  }

  /**
   * Register early contribution in the name of the given address
   *
   * Must be called from registrarAuth.
   *
   * Arguments are:
   *  - addr: address to the tokens are assigned
   *  - tokenAmount: number of restricted tokens to assign
   *  - memo: optional dynamic bytes of data to appear in the receipt
   */
  function registerEarlyContrib(address addr, uint tokenAmount, bytes32 memo) {
    // Require permission
    if (msg.sender != registrarAuth) { throw; }

    // Reject registrations outside the early contribution phase
    if (getState() != state.earlyContrib) { throw; }

    // Add address to list if new
    if (!isRegistered(addr, true)) {
      earlyContribList.push(addr);
    }
    
    // Assign restricted tokens in TokenTracker
    assign(addr, tokenAmount, true);
    
    // Issue early contribution receipt
    EarlyContribReceipt(addr, tokenAmount, memo);
  }

  /**
   * Register off-chain donation in the name of the given address
   *
   * Must be called from registrarAuth.
   *
   * Arguments are:
   *  - addr: address to the tokens are assigned
   *  - timestamp: time when the donation came in (determines phase and bonus)
   *  - chfCents: value of the donation in cents of Swiss francs
   *  - currency: the original currency of the donation (three letter string)
   *  - memo: optional bytes of data to appear in the receipt
   *
   * The timestamp must not be in the future. This is because the timestamp 
   * defines the donation phase and the multiplier and future phase times are
   * still subject to change.
   *
   * If called during a donation phase then the timestamp must lie in the same 
   * phase and if called during the extended period for off-chain donations then
   * the timestamp must lie in the immediately preceding donation phase. 
   */
  function registerOffChainDonation(address addr, uint timestamp, uint chfCents, 
                                    string currency, bytes32 memo)
  {
    // Require permission
    if (msg.sender != registrarAuth) { throw; }

    // The current phase number and state corresponding state
    uint currentPhase = getPhaseAtTime(now);
    state currentState = stateOfPhase[currentPhase];
    
    // Reject registrations outside the two donation phases (incl. their
    // extended registration periods for off-chain donations)
    if (currentState != state.donPhase0 && currentState != state.donPhase1 &&
        currentState != state.offChainReg) {
      throw;
    }
   
    // Throw if timestamp is in the future
    if (timestamp > now) { throw; }
   
    // Phase number and corresponding state of the timestamp  
    uint timestampPhase = getPhaseAtTime(timestamp);
    state timestampState = stateOfPhase[timestampPhase];
   
    // Throw if called during a donation phase and the timestamp does not match
    // that phase.
    if ((currentState == state.donPhase0 || currentState == state.donPhase1) &&
        (timestampState != currentState)) { 
      throw;
    }
    
    // Throw if called during the extended period for off-chain donations and
    // the timestamp does not lie in the immediately preceding donation phase.
    if (currentState == state.offChainReg && timestampPhase != currentPhase-1) {
      throw;
    }

    // Throw if the memo is duplicated
    if (memoUsed[memo]) {
      throw;
    }

    // Set the memo item to true
    memoUsed[memo] = true;

    // Do the book-keeping
    bookDonation(addr, timestamp, chfCents, currency, memo);
  }

  /**
   * Delay a donation phase
   *
   * Must be called from the address registrarAuth.
   *
   * This function delays the start of donation phase 1 by the given time delta
   * unless the time delta is bigger than the configured maximum delay.
   */
  function delayDonPhase(uint donPhase, uint timedelta) {
    // Require permission
    if (msg.sender != registrarAuth) { throw; }

    // Pass the call on to base contract Phased
    // Delaying the start of a donation phase is the same as delaying the end 
    // of the preceding phase
    if (donPhase == 0) {
      delayPhaseEndBy(phaseOfDonPhase0 - 1, timedelta);
    } else if (donPhase == 1) {
      delayPhaseEndBy(phaseOfDonPhase1 - 1, timedelta);
    }
  }

  /**
   * Set new authenticated address for setting exchange rate
   * 
   * Must be called from the address masterAuth.
   */
  function setExchangeRateAuth(address newAuth) {
    // Require permission
    if (msg.sender != masterAuth) { throw; }
 
    exchangeRateAuth = newAuth;
  }

  /**
   * Set new authenticated address for registrations
   * 
   * Must be called from the address masterAuth.
   */
  function setRegistrarAuth(address newAuth) {
    // Require permission
    if (msg.sender != masterAuth) { throw; }
 
    registrarAuth = newAuth;
  }

  /**
   * Set new authenticated address for admin
   * 
   * Must be called from the address masterAuth.
   */
  function setMasterAuth(address newAuth) {
    // Require permission
    if (msg.sender != masterAuth) { throw; }
 
    masterAuth = newAuth;
  }

  /*
   * PRIVATE functions
   *
   *  - donateAs
   *  - bookDonation
   */
  
  /**
   * Process on-chain donation in the name of the given address 
   *
   * This function is private because it shall only be called through its 
   * wrapper donateAsWithChecksum.
   */
  function donateAs(address addr) private returns (bool) {
    // The current state
    state st = getState();
    
    // Throw if current state is not a donation phase
    if (st != state.donPhase0 && st != state.donPhase1) { throw; }

    // Throw if donation amount is below minimum
    if (msg.value < minDonation) { throw; }

    // Throw if the exchange rate is not yet defined
    if (weiPerCHF == 0) { throw; } 

    // Update counters for ether donations
    totalWeiDonated += msg.value;
    weiDonated[addr] += msg.value;

    // Convert ether to Swiss francs
    uint chfCents = (msg.value * 100) / weiPerCHF;
    
    // Do the book-keeping
    bookDonation(addr, now, chfCents, "ETH", "");

    // Forward balance to the foundation wallet
    return foundationWallet.call.value(this.balance)();
  }

  /**
   * Put an accepted donation in the books.
   *
   * This function
   *  - cannot throw as all checks have been done before, 
   *  - is agnostic to the source of the donation (on-chain or off-chain)
   *  - is agnostic to the currency 
   *    (the currency argument is simply passed through to the DonationReceipt)
   *
   * The phase argument is redundant because it could be derived from the 
   * timestamp. However, it is passed in to save the gas of re-calculating it.
   */
  function bookDonation(address addr, uint timestamp, uint chfCents, 
                        string currency, bytes32 memo) private
  {
    // The current phase
    uint phase = getPhaseAtTime(timestamp);
    
    // Add amount to the counter of the current phase
    bool targetReached = addTowardsTarget(phase, chfCents);
    
    // If the target was crossed then start the grace period
    if (targetReached && phase == getPhaseAtTime(now)) {
      if (phase == phaseOfDonPhase0) {
        endCurrentPhaseIn(gracePeriodAfterPhase0Target);
      } else if (phase == phaseOfDonPhase1) {
        endCurrentPhaseIn(gracePeriodAfterPhase1Target);
      }
    }

    // Bonus multiplier that was valid at the given time 
    uint bonusMultiplier = getMultiplierAtTime(timestamp);
    
    // Apply bonus to amount in Swiss francs
    chfCents = (chfCents * bonusMultiplier) / 100;

    // Convert Swiss francs to amount of tokens
    uint tokenAmount = (chfCents * tokensPerCHF) / 100;

    // Add address to list if new
    if (!isRegistered(addr, false)) {
      donorList.push(addr);
    }
    
    // Assign unrestricted tokens in TokenTracker
    assign(addr,tokenAmount,false);

    // Issue donation receipt
    DonationReceipt(addr, currency, bonusMultiplier, timestamp, tokenAmount, 
                    memo);
  }
}
