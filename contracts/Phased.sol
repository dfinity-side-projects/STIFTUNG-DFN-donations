// TODO: set to exact version before release
pragma solidity >=0.4.1;

contract Phased {
  // transition times between phases
  uint[] public phaseEndTime;

  // N = phaseEndTime.length = number of phase transitions
  // Transitions are numbered 0,..,N-1
  // N+1 = number of phases 
  // Phases are numbered 0,..,N
  // phaseEndTime[i] means: end of phase i (exclusive), beginning of phase i+1 (inclusive)
  uint public N; 

  // forward adjustability of phase end times
  // maps i to the maximum time by which phaseEndTime[i] can be moved forward (i.e. adjusted to a later time) 
  mapping(uint => uint) public maxDelay; 

  //
  // Constructor
  // The two functions setPhases() and setMaxDelay() are intended to be called only once, right after the constructor.
  //

  function Phased() {
    N = 0; // 1 phase, 0 transitions
  }

  // Defines the phases

  // Add a phase after the last phase. The time argument is the new endTime of the phase currently known as the last phase, or, in other words the start time of the newly introduced phase.
  // All calls to addPhase() MUST be with strictly increasing time arguments.
  function addPhase(uint time) internal {
    // Enforce strictly increasing phase transition times
    if (N > 0 && time <= phaseEndTime[N-1]) { throw; } 

    N++;
    phaseEndTime.push(time);
  }
  
  // Defines a limit on the delay that can later be imposed on the given phase. By default phases can not be delayed (limit = 0).
  function setMaxDelay(uint i, uint timeDelta) internal {
    // Throw if out of range
    if (i >= N) { throw; }

    maxDelay[i] = timeDelta;
  }

  //
  // Public API for queries
  //

  // Determine current phase (= index of next phaseEndTime)
  // The returned value lies in the interval [0,N].
  // 0 means time is before the first transition time.
  // N means time is after or equal to the last transition time.
  // phase i means phaseEndTime[i-1] <= time < phaseEndTime[i]
  function getPhaseAtTime(uint time) constant returns (uint) {
    uint i;

    while (i < N && phaseEndTime[i] <= time) {
      i++;
    }

    return i; 
  }

  //
  // Internal API to change phase end times
  //   delayTransitionBy() and endCurrentPhaseIn()
  // This contract does not implement access control to these
  // function, so they are made internal.
  //
  
  // adjust transition time forward
  // this can be called multiple times throughout the lifetime of the contract
  // function returns the transition time after the adjustment was made
  function delayPhaseEndBy(uint i, uint timeDelta) internal returns (uint) {
    // index out of range
    if (i >= N) { throw; }

    // phase has already ended
    if (phaseEndTime[i] >= now) { throw; }

    // limit forwarding to allowed max 
    // If beyond then we throw as the call is unlikely to be intentional.
    if (timeDelta == 0 || timeDelta > maxDelay[i]) { throw; }

    // subtract from the current max delay, so maxDelay is honored
    // even when delayEndBy is called multiple times
    maxDelay[i] -= timeDelta;

    // delaying always pushes out all subsequent transitions by the same amount
    for (uint j = i; j < N; j++) {
      phaseEndTime[j] += timeDelta;
    }

    return phaseEndTime[i];
  }

  // end the current phase early, at now + timeDelta
  // TODO remove return value
  // returns the new end time
  // return value is 0 if we are past the last transition, i.e. there is no phase to end
  function endCurrentPhaseIn(uint timeDelta) internal {
    uint phase = getPhaseAtTime(now);

    // If we are past the last transition then we throw as it is unlikely to be intentional.
    if (phase == N) { throw; }
    
    // We can only ever end a phase earlier than intended before, never later.
    // If timeDelta is too big then we don't change anything and return. 
    if (now + timeDelta > phaseEndTime[phase]) { return; }

    // adjust the next transition time
    phaseEndTime[phase] = now + timeDelta;
  }

  //
  // Getters
  //

  function getPhaseStartTime(uint phase) constant returns (uint) {
    return phaseEndTime[phase - 1];
  }
    
}

    
    
     
