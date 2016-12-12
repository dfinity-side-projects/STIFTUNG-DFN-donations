pragma solidity >=0.4.6;

import "FDC.sol";

contract Forwarder {
  FDC public fdc;
  address public donorAddr;

  function Forwarder(address fdcAddr, address _donorAddr) {
    // The forwarder should not have positive balance
    if (msg.value > 0) { throw; }
    
    fdc = FDC(fdcAddr);
    donorAddr = _donorAddr;
  }

  function () payable { 
    fdc.donateAs.value(msg.value)(donorAddr);
  }
}
    
