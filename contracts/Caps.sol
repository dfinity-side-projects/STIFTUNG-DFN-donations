// TODO: set to exact version before release
pragma solidity >=0.4.1;

contract Caps {

  mapping(uint => uint) public cap;
  mapping(uint => uint) public counter;

  function setCap(uint i, uint _cap) internal {
    cap[i] = _cap;
  }
  
  function addTowardsCap(uint i, uint amount) internal returns (bool firstReached) {
    firstReached = (counter[i] < cap[i]) && (counter[i] + amount >= cap[i]);
    counter[i] += amount;
  }

  function capReached(uint i) constant returns (bool) {
    return (counter[i] >= cap[i]);
  }
}
