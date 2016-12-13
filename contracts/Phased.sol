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

/*
 * @title:  A contract that advances through multiple configurable phases over time.
 * @author: Timo Hanke <timo.t.hanke@gmail.com> 
 * 
 * Phases are defined by their transition times. The moment one phase ends the next one starts.
 * Each time belongs to exactly one phase.
 *
 * The contract allows a limited set of changes to be applied to the phase transitions while the contract is active.
 * As a matter of principle, changes are prohibited from effecting the past. They may only ever affect future phase transitions.
 *
 * The permitted changes are:
 *   - add a new phase after the last one
 *   - end the current phase right now and transition to the next phase immediately 
 *   - delay the start of a future phase (thereby pushing out all subsequent phases by an equal amount of time)
 *   - define a maximum delay for a specified phase 
 */
 
pragma solidity ^0.4.6;

contract Phased {
  /**
   * Array of transition times defining the phases
   *   
   * phaseEndTime[i] is the time when phase i has just ended.
   * Phase i is defined as the following time interval: [ phaseEndTime[i-1], phaseEndTime[i] )
   */
  uint[] public phaseEndTime;

  /**
   * Number of phase transitions N = phaseEndTime.length 
   *
   * There are N+1 phases, numbered 0,..,N.
   * The first phase has no start and the last phase has no end.
   */
  uint public N; 

  /**
   *  Maximum delay for phase transitions
   *
   *  maxDelay[i] is the maximum amount of time by which the transition phaseEndTime[i] can be delayed.
  */
  mapping(uint => uint) public maxDelay; 

  /*
   * The contract has no constructor.
   * The contract initialized itself with no phase transitions (N = 0) and one phase (N+1=1).
   *
   * There are two PUBLIC functions (getters):
   *  - getPhaseAtTime
   *  - isPhase
   *  - getPhaseStartTime
   *
   * Note that both functions are guaranteed to return the same value when called twice with the same argument (but at different times).
   */

  /**
   * Return the number of the phase to which the given time belongs.
   *
   * Return value i means phaseEndTime[i-1] <= time < phaseEndTime[i].
   * The given time must not be in the future (because future phase numbers may still be subject to change).
   */
  function getPhaseAtTime(uint time) constant returns (uint n) {
    // Throw if time is in the future
    if (time > now) { throw; }
    
    // Loop until we have found the "active" phase
    while (n < N && phaseEndTime[n] <= time) {
      n++;
    }
  }

  /**
   * Return true if the given time belongs to the given phase.
   *
   * Returns the logical equivalent of the expression (phaseEndTime[i-1] <= time < phaseEndTime[i]).
   *
   * The given time must not be in the future (because future phase numbers may still be subject to change).
   */
  function isPhase(uint time, uint n) constant returns (bool) {
    // Throw if time is in the future
    if (time > now) { throw; }
    
    // Throw if index is out-of-range
    if (n >= N) { throw; }
    
    // Condition 1
    if (n > 0 && phaseEndTime[n-1] > time) { return false; } 
    
    // Condition 2
    if (n < N && time >= phaseEndTime[n]) { return false; } 
   
    return true; 
  }
  
  /**
   * Return the start time of the given phase.
   *
   * This function is provided for convenience.
   * The given phase number must not be 0, as the first phase has no start time.
   * If calling for a future phase number the caller must be aware that future
   * phase times can be subject to change.
   */
  function getPhaseStartTime(uint n) constant returns (uint) {
    // Throw if phase is the first phase
    if (n == 0) { throw; }
   
    return phaseEndTime[n-1];
  }
    
  /*
   *  There are 4 INTERNAL functions:
   *    1. addPhase
   *    2. setMaxDelay
   *    3. delayPhaseEndBy
   *    4. endCurrentPhaseIn
   *
   *  This contract does not implement access control to these function, so they are made internal.
   */
   
  /**
   * 1. Add a phase after the last phase.
   *
   * The argument is the new endTime of the phase currently known as the last phase, or, in other words the start time of the newly introduced phase.  
   * All calls to addPhase() MUST be with strictly increasing time arguments.
   * It is not allowed to add a phase transition that lies in the past relative to the current block time.
   */
  function addPhase(uint time) internal {
    // Throw if new transition time is not strictly increasing
    if (N > 0 && time <= phaseEndTime[N-1]) { throw; } 

    // Throw if new transition time is not in the future
    if (time <= now) { throw; }
   
    // Append new transition time to array 
    phaseEndTime.push(time);
    N++;
  }
  
  /**
   * 2. Define a limit on the amount of time by which the given transition (i) can be delayed.
   *
   * By default, transitions can not be delayed (limit = 0).
   */
  function setMaxDelay(uint i, uint timeDelta) internal {
    // Throw if index is out-of-range
    if (i >= N) { throw; }

    maxDelay[i] = timeDelta;
  }

  /**
   * 3. Delay the end of the given phase (n) by the given time delta. 
   *
   * The given phase must not have ended.
   *
   * This function can be called multiple times for the same phase. 
   * The defined maximum delay will be enforced across multiple calls.
   */
  function delayPhaseEndBy(uint n, uint timeDelta) internal {
    // Throw if index is out of range
    if (n >= N) { throw; }

    // Throw if phase has already ended
    if (now >= phaseEndTime[n]) { throw; }

    // Throw if the requested delay is higher than the defined maximum for the transition
    if (timeDelta > maxDelay[n]) { throw; }

    // Subtract from the current max delay, so maxDelay is honored across multiple calls
    maxDelay[n] -= timeDelta;

    // Push out all subsequent transitions by the same amount
    for (uint i = n; i < N; i++) {
      phaseEndTime[i] += timeDelta;
    }
  }

  /**
   * 4. End the current phase early.
   *
   * The current phase must not be the last phase, as the last phase has no end.
   * The current phase will end at time now plus the given time delta.
   *
   * The minimal allowed time delta is 1. This is avoid a race condition for 
   * other transactions that are processed in the same block. 
   * Setting phaseEndTime[n] to now would push all later transactions from the 
   * same block into the next phase.
   * If the specified timeDelta is 0 the function gracefully bumps it up to 1.
   */
  function endCurrentPhaseIn(uint timeDelta) internal {
    // Get the current phase number
    uint n = getPhaseAtTime(now);

    // Throw if we are in the last phase
    if (n >= N) { throw; }
   
    // Set timeDelta to the minimal allowed value
    if (timeDelta == 0) { 
      timeDelta = 1; 
    }
    
    // The new phase end should be earlier than the currently defined phase end, otherwise we don't change it.
    if (now + timeDelta < phaseEndTime[n]) { 
      phaseEndTime[n] = now + timeDelta;
    }
  }
}

    
    
     
