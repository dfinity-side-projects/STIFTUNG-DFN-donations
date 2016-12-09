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
         var currentState = res[0];   // current state (an enum)
         var fxRate = res[1];         // exchange rate of CHF -> ETH (Wei/CHF)
         var donationCount = res[2];  // total individual donations made (a count)
         var totalTokenAmount = res[3];// total DFN planned allocated to donors
         var startTime = res[4];      // expected start time of specified donation phase
         var endTime = res[5];        // expected end time of specified donation phase
         var isCapReached = res[6];   // whether target cap specified phase reached
         var chfCentsDonated = res[7];// total value donated in specified phase as CHF
         var tokenAmount = res[8];    // total DFN planned allocted to donor (user)
         var fwdBalance = res[9];     // total ETH (in Wei) waiting in fowarding address

         console.log("Received from getStatus(): "+JSON.stringify(res));
         assert.equal(chfCentsDonated.valueOf(), 0, "Donation count wasn't initialized to zero");
     }).catch(function(e) {
        console.log("Test exception: "+e);
        throw e;
     });
  });


    it("Phase 1 testing", function () {
        /* Global Test variables  */
        var ETHForwardAddr = accounts[4];
        var DFNAddr = accounts[5];
        var totalDonationCount = 0;  // total individual donations made (a count)
        var fdc = FDC.deployed();

        // Keeping track of CHF donated so far
        var chfCentsDonated = 0;
        var weiDonated = 0;

        // Keeping track of donated amount
        var dfnTokens = 0;
        var lastAmount = 0;
        var WEI_PER_CHF =web3.toWei("0.1", "ether");

        printStatus();
        fdc.setWeiPerCHF(WEI_PER_CHF, {gas: 300000, from: accounts[2]}).then(function() {
            setTimeout(function() {
                printStatus();
                makeMultiDonations(5000,20, 1,1);
            },3000);
        });

        function printStatus() {
            fdc.getStatus(0,1,1).then(function(s) {
                console.log(s);
            })
        }

        function getStatus() {
            return new Promise(function(resolve, reject) {
                fdc.getStatus(0,1,1).then(function(s) {
                    resolve(s);
                })
            });
        }

        /* Make multiple donations per */
        function makeMultiDonations(amount, times, interval, randomizedAmount) {
            var onDonated = function(lastWeiDonated) {
                return new Promise(function(resolve, reject) {
                    console.log("onDonated() - donated amount [local value] " + lastWeiDonated);
                    weiDonated += lastWeiDonated;
                    chfCentsDonated += (lastWeiDonated * 100) / WEI_PER_CHF;
                    var fdc_chfCentsDonated, fdc_dfnTokens;
                    // Assert local donation record = FDC records
                    getStatus().then(function (res) {
                        fdc_chfCentsDonated = res[8].valueOf();
                        console.log("  - onDonated() - fdc donated amount: " + fdc_chfCentsDonated);
                        fdc_dfnTokens = res[4].valueOf();
                        assert.equal(chfCentsDonated, fdc_chfCentsDonated);
                        resolve(true);
                    });
                });
            };

            var donateAndValidate = function() {return makeDonation(amount).then(onDonated);};
            p = donateAndValidate();
            for (var i = 0; i < times - 1; i++) {
                p = p.then(donateAndValidate);
            }
        }

        /* Fast forward system time to next phase */
        function advancePhase(phase) {

        }

        /* Set current exchange rate for ETH:CHF */
        function setExchangeRate() {

        }


        /* Make a single donation */
        function makeDonation(amount) {
            return new Promise (function (resolve, reject) {
                // calculate gas & amount to forward
                var gasPrice = web3.toBigNumber(20000000000); // 20 Shannon
                var FDCMinDonation = web3.toWei('1', 'ether');
                var FDCDonateGasMax = 500000; // highest measured gas cost: 138048
                var gasCost = web3.toBigNumber(FDCDonateGasMax).mul(gasPrice);
                var minBalance = web3.toBigNumber(FDCMinDonation).plus(gasCost);
                var balance = web3.eth.getBalance(ETHForwardAddr);

                if (ETHForwardAddr == null || web3.toBigNumber(balance).lt(minBalance)) {
                    assert.isOk(false, 'not enough balance to forward');
                } else {
                    console.log("enough balance for forwarding: " + web3.fromWei(balance, 'ether') + " ETH");
                    var accNonce = web3.eth.getTransactionCount(ETHForwardAddr);
                    var txFee = web3.toBigNumber(gasPrice).mul(web3.toBigNumber(FDCDonateGasMax));
                    var value = web3.toBigNumber(web3.toWei(amount, 'ether')).sub(txFee); // TODO: all ether: balance.sub(txFee);
                    console.log("txFee: " + txFee);
                    console.log("amount: " + value);
                    //var txData     = "0x" + packArg(donateAs, app.DFNAcc.addr);
                    fdc.donateAs(DFNAddr,  {
                        from: ETHForwardAddr,
                        value: value,
                        gasPrice: gasPrice,
                        gas: FDCDonateGasMax
                    }).then(function (txID) {
                        console.log("makeDonation() completed. tx id: " + txID);
                        // verify donation was registered
                        fdc.getStatus(2, DFNAddr, ETHForwardAddr).then(function (res) {
                            var donationCount = res[3];  // total individual donations made (a count)
                            assert.equal(donationCount.valueOf(), ++totalDonationCount, "Donation count not correct");
                            resolve(web3.toWei(amount, "ether") - txFee);
                        });

                    }).catch(function (e) {
                        console.log("Error sending ETH forwarding tx: " + e);
                        reject();
                    });
                }
            });

        }


    });
});
