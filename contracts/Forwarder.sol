pragma solidity >=0.4.6;

import "FDC.sol";

contract Forwarder {
  FDC public fdc;
  address public donorAddr;
  bytes4 public checksum;

  function Forwarder(address fdcAddr, address _donorAddr) {
    fdc = FDC(fdcAddr);
    donorAddr = _donorAddr;
    checksum = bytes4(sha256(_donorAddr));
  }

  function () payable { 
    fdc.donateAsWithChecksum.value(msg.value)(donorAddr, checksum);
  }
}
    
