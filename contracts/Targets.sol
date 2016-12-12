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
 * @title:  An arbitrary number of counters that can flag when a pre-configured target is reached.
 * @author: Timo Hanke <timo.t.hanke@gmail.com> 
 *
 * Each counter is identified by its counter id, a uint.
 * Counters can never decrease.
 * 
 * The contract has no constructor. The target values are set and re-set via setTarget().
 */

pragma solidity ^0.4.6;

contract Targets {

  // Mapping from counter id to counter value 
  mapping(uint => uint) public counter;
  
  // Mapping from counter id to target value 
  mapping(uint => uint) public target;

  // A public getter that returns whether the target was reached
  function targetReached(uint id) constant returns (bool) {
    return (counter[id] >= target[id]);
  }
  
  /**
   * Modifying counter or target are internal functions.
   */
  
  // (Re-)set the target
  function setTarget(uint id, uint _target) internal {
    target[id] = _target;
  }
 
  // Add to the counter 
  // The function returns whether this current addition makes the counter reach or cross its target value 
  function addTowardsTarget(uint id, uint amount) internal returns (bool firstReached) {
    firstReached = (counter[id] < target[id]) && (counter[id] + amount >= target[id]);
    counter[id] += amount;
  }
}
