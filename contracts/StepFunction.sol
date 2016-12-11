pragma solidity ^0.4.6;

// implements a step function going down in <nSteps> steps from a start value down to 0
// each step reduces the function value by <step>
// there are <nSteps>+1 sub-intervalls with a constant function value  
// the start value during the first sub-interval is nSteps * step
contract StepFunction {
  uint public phaseLength;
  uint public nSteps;
  uint public step;

  // constructor
  function StepFunction(uint _phaseLength, uint _initialValue, uint _nSteps) {
    // throw if not enough room for <nSteps> steps 
    if (_nSteps > _phaseLength) { throw; } 
   
    step = _initialValue / _nSteps;
    // throw if _initialValue is not divisible by _nSteps
    if ( step * _nSteps != _initialValue) { throw; } 

    phaseLength = _phaseLength;
    nSteps = _nSteps; 
  }
  
  // edge cases:
  //  step = 0: is valid, will create the constant zero function
  //  nSteps = 0: is valid, will create the constant zero function (only 1 sub-interval)
  //  phaseLength = 0..nSteps-1: is valid, but unlikely to be intended (so the constructor throws)
  // elapsedTime MUST be in the intervall [0,phaseLength)
  function getStepFunction(uint elapsedTime) constant returns (uint) {
    if (elapsedTime >= phaseLength) { throw; }
    
    uint timeLeft  = phaseLength - elapsedTime - 1; // lies in the intervall [0,phaseLength)

    // Steps away from reaching end value
    // At elapsedTime = 0 stepsLeft is equal to nSteps.
    // One second before that, at elapsedTime = -1, the equation would yield nSteps + 1.
    uint stepsLeft = ((nSteps + 1) * timeLeft) / phaseLength; 

    // Apply the step function
    return stepsLeft * step;
  }
}
