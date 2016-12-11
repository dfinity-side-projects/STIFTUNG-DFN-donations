pragma solidity ^0.4.6;

/**
 * A step function used for the bonus in donation phase 1
 *
 * The contract implements a step function going down over from an initialValue to 0 in a number of steps (nSteps).
 * The steps are distributed equally over a given time (phaseLength).
 * Having n steps means that the time phaseLength is divided into n+1 sub-intervalls of equal length during each of which the function value is constant. 
 * 
 */
 
contract StepFunction {
  uint public phaseLength;
  uint public nSteps;
  uint public step;

  function StepFunction(uint _phaseLength, uint _initialValue, uint _nSteps) {
    // We throw if phaseLength does not leave enough room for number of steps
    if (_nSteps > _phaseLength) { throw; } 
  
    // The reduction in value per step 
    step = _initialValue / _nSteps;
    
    // We throw if _initialValue was not divisible by _nSteps
    if ( step * _nSteps != _initialValue) { throw; } 

    phaseLength = _phaseLength;
    nSteps = _nSteps; 
  }
 
  /**
   * Note the following edge cases.
   *   initialValue = 0: is valid and will create the constant zero function
   *   nSteps = 0: is valid and will create the constant zero function (only 1 sub-interval)
   *   phaseLength < nSteps: is valid, but unlikely to be intended (so the constructor throws)
   */
  
  /**
   * Evaluate the step function at a given time  
   *
   * elapsedTime MUST be in the intervall [0,phaseLength)
   * The return value is between initialValue and 0, never negative.
   */
  function getStepFunction(uint elapsedTime) constant returns (uint) {
    // Throw is elapsedTime is out-of-range
    if (elapsedTime >= phaseLength) { throw; }
    
    // The function value will bel calculated from the end value backwards
    // Hence we need the time left, which will lie in the intervall [0,phaseLength)
    uint timeLeft  = phaseLength - elapsedTime - 1; 

    // Calculate the number of steps away from reaching end value
    // When verifying the forumla below it may help to note:
    //   at elapsedTime = 0 stepsLeft evaluates to nSteps,
    //   at elapsedTime = -1 stepsLeft would evaluate to nSteps + 1.
    uint stepsLeft = ((nSteps + 1) * timeLeft) / phaseLength; 

    // Apply the step function
    return stepsLeft * step;
  }
}
