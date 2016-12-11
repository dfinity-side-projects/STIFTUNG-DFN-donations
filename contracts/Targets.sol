pragma solidity ^0.4.6;

contract Targets {

  mapping(uint => uint) public target;
  mapping(uint => uint) public counter;

  function setTarget(uint i, uint _target) internal {
    target[i] = _target;
  }
  
  function addTowardsTarget(uint i, uint amount) internal returns (bool firstReached) {
    firstReached = (counter[i] < target[i]) && (counter[i] + amount >= target[i]);
    counter[i] += amount;
  }

  function targetReached(uint i) constant returns (bool) {
    return (counter[i] >= target[i]);
  }
}
