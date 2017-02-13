pragma solidity >=0.4.6;

import "./FDC.sol";

/* Helper contract to, in a single tx, make multiple calls to the
   unauthenticated `unrestrict` function in the FDC.

   Originally we wanted the FDC API to finalize all early contributor
   addresses, but since this could easily run OOG, the FDC API instead
   takes a single address so we can guarantee upper bound on gas usage
   per call.

   With a configurable loop outside the FDC, we can easily finalize
   thousands of addresses over N blocks, with N depending on what the
   block gas limit is at time of finalization.

 */

contract Finalizer {

  FDC fdc;
  function Finalizer(address _fdc) {
    fdc = FDC(_fdc);
  }

  function unrestrict(uint start, uint end) {
    for (uint256 i = start; i < end; i++) {
      // TODO: type error
      //var addr = fdc.early_contrib_addrs[i];
      //fdc.unrestrict(addr);
    }
  }
}
