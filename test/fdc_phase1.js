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


contract('FDC', function (accounts) {

    it("We will set the Wei to CHF exchange rate", function () {
        var fdc = FDC.deployed();
        console.log("Setting exchange rate on FDC at " + fdc.address);
        return fdc.setWeiPerCHF(web3.toWei('0.125', 'ether'), {gas: 300000, from: accounts[2]}).then(function (txID) {
            console.log("Successfully set the exchange rate!");
        }).catch(function (e) {
            console.log("Test exception: " + e);
            throw e;
        });
    });

    it("We should get some stats back", function () {
        var fdc = FDC.deployed();
        var donationPhase = 0;
        var dfnAddr = accounts[0];
        var fwdAddr = accounts[0];
        return fdc.getStatus(donationPhase, dfnAddr, fwdAddr).then(function (res) {
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

            console.log("Received from getStatus(): " + JSON.stringify(res));
            assert.equal(chfCentsDonated.valueOf(), 0, "Donation count wasn't initialized to zero");
        }).catch(function (e) {
            console.log("Test exception: " + e);
            throw e;
        });
    });

    function wait(waitTime, flag) {

        if(!flag) {

            setTimeout(function() {

                // alert();
                wait(waitTime, true);

            }, waitTime);
            return;

        }

        // code that you cannot modify

    }

    it("Phase 1 testing", function () {
        /* Global Test variables  */
        var ETHForwardAddr = accounts[4];
        var DFNAddr = accounts[5];
        var totalDonationCount = 0;  // total individual donations made (a count)
        var fdc = FDC.deployed();

        // Keeping track of CHF donated so far
        var chfCentsDonated = [0,0]
        var weiDonated = 0;
        var currentPhase = 0;

        // Keeping track of donated amount
        var dfnTokens = 0;
        var lastAmount = 0;
        var WEI_PER_CHF = web3.toWei("0.1", "ether");


        var PHASE0_CAP, PHASE1_CAP;
        // printStatus();


        // Below's the main test flow.
        var test= function() {
            // printStatus();
            initConstants();
            var t = makeMultiDonations(25000, 5, 1, 1);
            t = t.then(function() { return advanceToPhase(4,0) });
            t = t.then(function() { return makeMultiDonations(200000, 5, 1,1 ) });
        }
        // Set exchange rate first
        var p = fdc.setWeiPerCHF(WEI_PER_CHF, {gas: 300000, from: accounts[2]});

        // Wait a few seconds (unstable if doesn't wait), before making donations
        p = p.then(function () { setTimeout(function () { test(); }, 3000); });



        ///////////////  FUNCTIONS /////////////////////////////////
        function initConstants() {
            return new Promise(function (resolve, reject) {
                var f = fdc.phase0Cap();
                f = f.then(function (c) {
                    PHASE0_CAP = c
                });
                f = f.then(fdc.phase1Cap);
                f = f.then(function (c) {
                    PHASE1_CAP = c
                });
                f = f.then(function (c) {
                    console.log(" CAPS: " + PHASE0_CAP + ", " + PHASE1_CAP);
                });
            });
        }


        function printStatus() {
            fdc.getStatus(0, 1, 1).then(function (s) {
                console.log(s);
            })
        }

        function getStatus() {
            return new Promise(function (resolve, reject) {
                fdc.getStatus(currentPhase, DFNAddr, ETHForwardAddr).then(function (s) {
                    resolve(s);
                })
            });
        }

        /* Called upon donation complete (resolved), and validate FDC donation amount vs. local record */
        function onDonated (lastWeiDonated) {
            return new Promise(function (resolve, reject) {
                // wait(1000, false);
                // console.log("[t: " + getVmTime() + "] onDonated() - last donated amount [local value] " + lastWeiDonated);
                weiDonated += lastWeiDonated;
                chfCentsDonated[currentPhase] += Math.ceil((lastWeiDonated * 100) / WEI_PER_CHF);

                var fdc_chfCentsDonated, fdc_dfnTokens;
                // Assert local donation record = FDC records
                getStatus().then(function (res) {
                    fdc_chfCentsDonated = res[8].valueOf();
                    console.log(" - Validating FDC donated amount: " + fdc_chfCentsDonated);
                    fdc_dfnTokens = res[4].valueOf();
                    assert.equal(chfCentsDonated[currentPhase], fdc_chfCentsDonated);
                    console.log(" - Assert success: " + chfCentsDonated[currentPhase] + " ==" + fdc_chfCentsDonated)


                    resolve(true);
                });
            });
        };

        /*
         * Check if the current phase end time has been adjusted based on the target reach status
         */
        function assertPhaseEndTime() {
            return new Promise(function (resolve, reject) {
                getStatus().then(function (res) {
                    var startTime = res[5];      // expected start time of specified donation phase
                    var endTime = res[6];        // expected end time of specified donation phase

                    var phaseCap = currentPhase==0 ? PHASE0_CAP : PHASE1_CAP;
                    console.log(" - Asserting if remaining end time less than 1hr if cap reached: chfCents = " + chfCentsDonated[currentPhase] + " // cap = " + phaseCap);
                    if (chfCentsDonated[currentPhase] >= phaseCap) {
                        console.log(" --> Target reached. End time should shorten to < 1hr");
                        assert.isAtMost(endTime - getVmTime(), 3600);
                        console.log(" --> Assert success. Remaining time: " + (endTime - getVmTime()));
                        resolve();
                    } else  {
                        console.log(" --> Target NOT reached. End time should keep as is.");

                        resolve();
                    }
                });
            });
        }

        /*
         *  Make multiple donations for specified times, and per interval.
         *  TODO: Also support randomizedAmount if true.
         *
         */
        function makeMultiDonations(amount, times, interval, randomizedAmount) {
            return new Promise(function (resolve, reject) {
                console.log ("\n  ==== [PHASE " + currentPhase + "] " + "  Making " + times + " x "  + amount + " Ether donations  ===");
                var donateAndValidate = function () {
                    return makeDonation(amount).then(onDonated).then(assertPhaseEndTime);
                };
                p = donateAndValidate();
                for (var i = 0; i < times - 1; i++) {
                    p = p.then(donateAndValidate);
                }
                p.then(resolve);
            });
        }

        /*
         [synchronous] testrpc only
         Fast forward VM time to specified time. If already there then ignore
         */
        function advanceVmTimeTo(time) {
            console.log(" \n *** Time advanced to " + time);
            web3.currentProvider.send({method: "evm_increaseTime", params: [time - getVmTime()]})
        }

        /*
         [synchronous] testrpc only
         Fast forward VM system time by X seconds
         */
        function advanceVmTimeBy(seconds) {
            web3.currentProvider.send({method: "evm_increaseTime", params: [seconds]})
        }

        /*
         Advance to specified phase, with a given offset by seconds (e.g. phase 0 minus one second).
         This function use the exact same definition from FDC.sol in terms of definition of phase
         i.e.
         stateOfPhase[0] = state.earlyContrib;
         stateOfPhase[1] = state.pause;
         stateOfPhase[2] = state.donPhase0;
         stateOfPhase[3] = state.offChainReg;
         stateOfPhase[4] = state.donPhase1;
         stateOfPhase[5] = state.offChainReg;
         stateOfPhase[6] = state.finalization;
         stateOfPhase[7] = state.done;
         */
        function advanceToPhase(phase, offset) {
            if (phase == 0)
                throw Exception("Not allowed to start from 0");

            return new Promise(function (resolve, reject) {
                fdc.getPhaseStartTime(phase).then(function f(startTime) {

                    var target = startTime - offset;
                    advanceVmTimeTo(target);
                    if (phase >= 2 && phase <= 3) {
                        currentPhase = 0;
                    } else if (phase >= 4) {
                        currentPhase = 1;
                    }
                    console.log(" *** PHASE SHIFTED TO: " + currentPhase);
                    resolve();
                });
            });
        }

        // Return time diff between VM minus system time
        function getVmTimeDiff() {
            return getVmTime() - Date.now();
        }

        // Sync call to get VM time
        function getVmTime() {
            web3.currentProvider.send({method: "evm_mine"});
            ts = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
            return ts;
        }

        /*
         [asynchronous]
         Set current exchange rate for ETH:CHF
         */
        function setExchangeRate() {
        }


        /*
         [Promise]
         Make a single donation
         */
        function makeDonation(amount) {
            return new Promise(function (resolve, reject) {
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
                    // console.log("Enough balance for forwarding: " + web3.fromWei(balance, 'ether') + " ETH");
                    var accNonce = web3.eth.getTransactionCount(ETHForwardAddr);
                    var txFee = web3.toBigNumber(gasPrice).mul(web3.toBigNumber(FDCDonateGasMax));
                    var value = web3.toBigNumber(web3.toWei(amount, 'ether')).sub(txFee); // TODO: all ether: balance.sub(txFee);
                    // console.log("\ntxFee: " + txFee + "  // amount: " + value);
                    //var txData     = "0x" + packArg(donateAs, app.DFNAcc.addr);
                    fdc.donateAs(DFNAddr, {
                        from: ETHForwardAddr,
                        value: value,
                        gasPrice: gasPrice,
                        gas: FDCDonateGasMax
                    }).then(function (txID) {
                        console.log("\n makeDonation() " + value + " Ether completed. tx id: " + txID);
                        // verify donation was registered
                        getStatus().then(function (res) {
                            var donationCount = res[3];  // total individual donations made (a count)
                            assert.equal(donationCount.valueOf(), ++totalDonationCount, "Donation count not correct");
                            var amt = Math.ceil(web3.toWei(amount, "ether") - txFee);
                            resolve(amt);
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
