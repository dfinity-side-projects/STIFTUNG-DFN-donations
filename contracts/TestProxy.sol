pragma solidity >=0.4.1;

import "FDC.sol";

/* Used only by the unit tests. It implements a simple proxy for the
   FDC to verify the `is_contract` function in Base.sol as well some
   helpers used by the FDC tests.
 */

contract TestProxy {

  FDC fdc;

  function TestProxy(address _fdc) {
    fdc = FDC(_fdc);
  }

  function testDonate() payable returns (bool) {
    bool res = fdc.donateAs.value(msg.value).gas(200000)(msg.sender);
    return res;
  }

  function getBlockTime() constant returns (uint) {
    return now;
  }
}
