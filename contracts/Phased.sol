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

  // Constructor
  // The constructor itself is empty. There are no phase transitions (N = 0) and one phase (N+1=1)
  //
  // The two functions setPhases() and setMaxDelay() are intended to be called only once. They make up the "constructor". 

  // Add a phase after the last phase. The time argument is the new endTime of the phase currently known as the last phase, or, in other words the start time of the newly introduced phase.
  // All calls to addPhase() MUST be with strictly increasing time arguments.
  function addPhase(uint time) internal {
    // Enforce strictly increasing phase transition times
    if (N > 0 && time <= phaseEndTime[N-1]) { throw; } 

    // It is not allowed to add a phase transition now or in the past
    if (time <= now) { throw; }
    
    N++;
    phaseEndTime.push(time);
  }
  
  // Defines a limit on the delay that can later be imposed on the given phase. By default phases can not be delayed (limit = 0).
  function setMaxDelay(uint i, uint timeDelta) internal {
    // Throw if index is out-of-range
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

  // More efficiently than the loop in getPhaseAtTime() we can simply check if time lies in a given phase number or not
  function isPhase(uint time, uint i) constant returns (bool) {
    // Throw if index is out-of-range
    if (i >= N) { throw; }
   
    // We want to return true iff phaseEndTime[i-1] <= time < phaseEndTime[i]
    
    // Condition 1
    if (i > 0 && phaseEndTime[i-1] > time) { return false; } 
    
    // Condition 2
    if (i < N && time >= phaseEndTime[i]) { return false; } 
   
    return true; 
  }
  
  //
  // Internal API to change phase end times
  //   delayTransitionBy() and endCurrentPhaseIn()
  // This contract does not implement access control to these
  // function, so they are made internal.
  //
  
  // adjust transition time forward
  // this can be called multiple times throughout the lifetime of the contract
  // i = phase number
  function delayPhaseEndBy(uint i, uint timeDelta) internal {
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
  }

  // end the current phase early, at now + timeDelta
  function endCurrentPhaseIn(uint timeDelta) internal {
    uint phase = getPhaseAtTime(now);

    // If we are past the last transition then we throw as it is unlikely to be intentional.
    if (phase == N) { throw; }
    
    // We can only ever end a phase earlier than intended before, never later.
    // Adjust the next transition time unless timeDelta is too big 
    if (now + timeDelta < phaseEndTime[phase]) { 
      phaseEndTime[phase] = now + timeDelta;
    }
  }

  //
  // Getters
  //

  // i = phase number
  function getPhaseStartTime(uint i) public constant returns (uint) {
    // Phase 0 has no start time
    if (i == 0) { throw; }
    
    return phaseEndTime[i-1];
  }
    
}

    
    
     
