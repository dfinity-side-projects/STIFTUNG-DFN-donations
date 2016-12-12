var EthJSUtil = require("../app/deps/ethereumjs-util.js");

function addrChecksum(addr) {
    // convert to buffer
    var addrBuf = EthJSUtil.toBuffer(addr);
    // hash the buffer and take first 4 bytes
    var checksumBuf = EthJSUtil.sha256(addrBuf).slice(0, 4);
    return EthJSUtil.bufferToHex(checksumBuf);
}

function addrWithChecksum(addr) {
    return addr + addrChecksum(addr).slice(2);
}

// mine n blocks
function evmMine(blocks) {
 for (var i = 0; i < blocks; i++) {
    web3.currentProvider.send({method: 'evm_mine'});
 } 
}

// jump seconds ahead with the EVM clock
// Note: 
// It is possible to call this with a fractional number of seconds (incl. from truffle console).
// However, if it is fractional it breaks the whole test framework in the "before all" hook.
// We prevent this here by rounding the argument. 
// However, one can still break everything by calling evm_increaseTime from the console.
function evmJump(seconds) {
  var delta = Math.round(seconds);
  return parseInt(web3.currentProvider.send({jsonrpc: '2.0', method: 'evm_increaseTime', params: [delta]}).result);
}

// return time of EVM clock in seconds since epoch
function evmGetTime() {
  return Date.now()/1000 + evmJump(0); 
}

// jump to time in seconds since epoch
function evmJumpTo(targetTime) {
  evmJump(targetTime - evmGetTime());
}

contract('FDC', function(accounts) {

  it("We will set the Wei to CHF exchange rate", function() {
    var fdc = FDC.deployed();
    console.log("Setting exchange rate on FDC at "+fdc.address);
    return fdc.setWeiPerCHF(web3.toWei('0.125', 'ether'), {gas:300000, from: accounts[2]}).then(function(txID) {
      console.log("Successfully set the exchange rate!");
    }).catch(function(e) {
      console.log("Test exception: "+e);
      throw e;
    });
  });

  it("We should get some stats back", function() {
     var fdc = FDC.deployed();
     var donationPhase=0;
     var dfnAddr=accounts[0];
     var fwdAddr=accounts[0];
     return fdc.getStatus(donationPhase, dfnAddr, fwdAddr).then(function(res) {
         // parse status data
         var currentState = res[0];      // current state (an enum)
         var fxRate = res[1];            // exchange rate of CHF -> ETH (Wei/CHF)
         var currentMultiplier = res[2]; // current bonus multiplier in percent (0 if outside of )
         var donationCount = res[3];     // total individual donations made (a count)
         var totalTokenAmount = res[4];  // total DFN planned allocated to donors
         var startTime = res[5];         // expected start time of specified donation phase
         var endTime = res[6];           // expected end time of specified donation phase
         var isTargetReached = res[7];   // whether phase target has been reached
         var chfCentsDonated = res[8];   // total value donated in specified phase as CHF
         var tokenAmount = res[9];       // total DFN planned allocted to donor (user)
         var ethFwdBalance = res[10];    // total ETH (in Wei) waiting in forwarding address
         var donated = res[11];          // total ETH (in Wei) donated so far

         console.log("Received from getStatus(): "+JSON.stringify(res));
         assert.equal(chfCentsDonated.valueOf(), 0, "Donation count wasn't initialized to zero");
     }).catch(function(e) {
        console.log("Test exception: "+e);
        throw e;
     });
  });

  it("We should be able to access the evm time", function() {
    var ts = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    console.log("Last block number: " + web3.eth.blockNumber + " at time " + ts);
    console.log("Calling evmMine");
    var blocks = 1;
    evmMine(blocks);
    var ts = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    console.log("New block number after mining " + blocks + "blocks: " + web3.eth.blockNumber + " at time " + ts);
    console.log("EVM is ahead of system clock by " + evmJump(0) + " seconds.");
    console.log("Difference EVM time derived from system clock - block timestamp: " + (evmGetTime() - ts));
    console.log("Jumping 100 seconds ahead"); 
    evmJump(100);
    console.log("EVM is ahead of system clock by " + evmJump(0) + " seconds.");
    console.log("Jumping ahead to time " + (ts + 1000));
    evmJumpTo(ts+1000);
    console.log("EVM is ahead of system clock by " + evmJump(0) + " seconds.");
    console.log("EVM current time: " + evmGetTime());
  }); 
});
