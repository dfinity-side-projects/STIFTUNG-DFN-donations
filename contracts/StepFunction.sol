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
 * @title:  A configurable step function 
 * @author: Timo Hanke <timo.t.hanke@gmail.com> 
 *
 * The contract implements a step function going down from an initialValue to 0 in a number of steps (nSteps).
 * The steps are distributed equally over a given time (phaseLength).
 * Having n steps means that the time phaseLength is divided into n+1 sub-intervalls of equal length during each of which the function value is constant. 
 */
 
pragma solidity ^0.4.6;

contract StepFunction {
  uint public phaseLength;
  uint public nSteps;
  uint public step;

  function StepFunction(uint _phaseLength, uint _initialValue, uint _nSteps) {
    // Throw if phaseLength does not leave enough room for number of steps
    if (_nSteps > _phaseLength) { throw; } 
  
    // The reduction in value per step 
    step = _initialValue / _nSteps;
    
    // Throw if _initialValue was not divisible by _nSteps
    if ( step * _nSteps != _initialValue) { throw; } 

    phaseLength = _phaseLength;
    nSteps = _nSteps; 
  }
 
  /*
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
