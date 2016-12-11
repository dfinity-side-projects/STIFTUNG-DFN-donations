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

        if (!flag) {

            setTimeout(function () {

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
        var chfCentsDonated = [web3.toBigNumber(0), web3.toBigNumber(0)]
        var weiDonated = web3.toBigNumber(0);

        // donation phase = {0, 1} of the donation stage
        // lifecycleStage = {0 .. 8} of all the possible stages of the FDC lifecycle
        var donationPhase = 0;
        var lifecycleStage = 0;

        // Keeping track of donated amount
        var dfnTokens = 0;
        var lastAmount = 0;
        var WEI_PER_CHF = web3.toWei("0.1", "ether");

        var phaseStartTime =[], phaseEndtime = [];

        // printStatus();


        // Below's the main test flow.
        var test = function () {
            // printStatus();
            Promise.resolve("success")
                .then(initConstants)
                .then(function () {
                    printStatus();
                    advanceVmTimeTo(fdcConstants["phase0StartTime"]);
                }).then(function () {
                return makeMultiDonations(25000, 5, 1, 1)
            }).then(function () {
                return advanceToPhase(4, 0)
            }).then(function () {
                return makeMultiDonations(600000, 5, 1, 1)
            });
        }
        // Set exchange rate first
        var p = fdc.setWeiPerCHF(WEI_PER_CHF, {gas: 300000, from: accounts[2]});

        // Wait a few seconds (unstable if doesn't wait), before making donations
        p = p.then(function () {
            setTimeout(function () {
                test();
            }, 3000);
        });

        var FDC_CONSTANTS = ["earlyContribEndTime", "phase0EndTime",
            "phase1StartTime", "phase1EndTime", "finalizeStartTime",
            "finalizeEndTime",
            "phase0Cap","phase1Cap",
            "phase0Multiplier", "phase1Steps", "phase1StepSize",
            "earlyContribShare", "gracePeriodAfterCap",
            "tokensPerCHF", "phase0StartTime"
        ]


        var fdcConstants = {}

        ///////////////  FUNCTIONS /////////////////////////////////
        function initConstants() {
            var f = Promise.resolve();
            var constants = FDC_CONSTANTS;
            return new Promise(function (resolve, reject) {
                for (var i in constants) {
                    const key = constants[i];
                    const index = i;
                    f = f.then(fdc[key]);
                    f = f.then(function (c) {
                        fdcConstants[key] = parseInt(c.valueOf());
                        console.log(" [[ Constant - " + key + " : " + c + " ]]");
                        if (index == constants.length - 1)
                            resolve();
                    });
                }
            });
        }



        function printStatus() {
            fdc.getStatus(0, 1, 1).then(function (s) {
                console.log(s);
            })
        }

        function getStatus() {
            return new Promise(function (resolve, reject) {
                fdc.getStatus(donationPhase, DFNAddr, ETHForwardAddr).then(function (s) {
                    resolve(s);
                })
            });
        }

        // Calculate bonus based on remaining time left
        function getPhase1Bonus(time) {

            var timeLeft =  fdcConstants["phase1EndTime"] - time;
            var duration = (fdcConstants["phase1EndTime"] - fdcConstants["phase1StartTime"])
            console.log("phase1step: " + fdcConstants["phase1Steps"]);
            var perPeriod = duration / (fdcConstants["phase1Steps"].valueOf());
            var bonus = Math.ceil(timeLeft / perPeriod ) * fdcConstants["phase1StepSize"];
            console.log(" - Using Phase 1 bonus of: " + bonus + " [ " + timeLeft + "/" + duration + "/" + perPeriod + "]");
            return bonus;
        }

        function calcDfnAmountAtTime (cents, time, phase) {
            var multiplier = 100;
            var startTime = phaseStartTime[phase];
            if (phase == 0) {
                multiplier = fdcConstants["phase0Multiplier"];
            } else if (phase == 1) {
                multiplier += getPhase1Bonus(time);
                console.log(" Using Phase 1 bonus multiplier: " + multiplier);
            }
            return Math.floor((cents.mul(multiplier).mul(fdcConstants["tokensPerCHF"]).div(10000)));
        }
        function totalDfnAmountAtTime (cents, time, phase) {
            if (phase == 1) {
                return calcDfnAmountAtTime(cents, time, phase) + calcDfnAmountAtTime(chfCentsDonated[0], time, 0);
            } else if (phase == 0) {
                return calcDfnAmountAtTime (cents, time, phase);
            }
        }


        /*
         Called upon donation complete (resolved), and validate FDC vs. local records on:
         - Donation amount
         - Token amount
         */
        function onDonatedAssertAmount(lastWeiDonated) {
            return new Promise(function (resolve, reject) {
                // wait(1000, false);
                // console.log("[t: " + getVmTime() + "] onDonated() - last donated amount [local value] " + lastWeiDonated);
                weiDonated = weiDonated.add(lastWeiDonated);

                var lastCentsDonated =  Math.floor((lastWeiDonated * 100) / WEI_PER_CHF);
                console.log("Last wei donated: " + lastWeiDonated);
                // chfCentsDonated[donationPhase] += Math.floor((lastWeiDonated * 100) / WEI_PER_CHF);
                chfCentsDonated[donationPhase] = chfCentsDonated[donationPhase].add((lastWeiDonated).mul(100).div(WEI_PER_CHF));

                var fdcChfCentsDonated, fdcDfnTokens;
                // Assert local donation record = FDC records
                getStatus().then(function (res) {
                    var fdcChfCentsDonated = res[8].valueOf();
                    var fdcDfnToken = res[4].valueOf();
                    var fdcWeiDonated = res[11].valueOf();
                    var startTime = res[5];      // expected start time of specified donation phase
                    var endTime = res[6];        // expected end time of specified donation phase

                    console.log(" - Validating FDC donated amount in wei: " + weiDonated + " == " + fdcWeiDonated);
                    console.log(" - Validating FDC donated amount in chf: " + fdcChfCentsDonated );

                    assert.equal(chfCentsDonated[donationPhase], fdcChfCentsDonated);
                    console.log(" - Assert success: [cents donated] " + chfCentsDonated[donationPhase] + " ==" + fdcChfCentsDonated)

                    // todo: should only use local calculation and avoid using remote FDC variables for assertions
                    // var expectedToken = calcDfnAmountAtTime(chfCentsDonated[donationPhase], getLastBlockTime(), donationPhase);
                    var expectedToken = totalDfnAmountAtTime(chfCentsDonated[donationPhase], getLastBlockTime(), donationPhase);
                    console.log(" - Validating FDC tokens got: " + expectedToken + " == " + fdcDfnToken);

                    assert.equal(expectedToken, fdcDfnToken);
                    resolve(true);
                });
            });
        };

        /*
         * Check if the current phase end time has been adjusted based on the cap reached status
         */
        function assertPhaseEndTime() {
            return new Promise(function (resolve, reject) {
                getStatus().then(function (res) {
                    var startTime = res[5];      // expected start time of specified donation phase
                    var endTime = res[6];        // expected end time of specified donation phase

                    var phaseCap = donationPhase == 0 ? fdcConstants["phase0Cap"] : fdcConstants["phase1Cap"];
                    console.log(" - Asserting if remaining end time less than 1hr if cap reached: chfCents = " + chfCentsDonated[donationPhase] + " // cap = " + phaseCap);
                    if (chfCentsDonated[donationPhase].greaterThanOrEqualTo(phaseCap)) {
                        console.log(" --> Target reached. End time should shorten to " + fdcConstants["gracePeriodAfterCap"] + " seconds ");
                        printStatus();

                        for (var i = 0; i < 7; i++) {
                            const k = i;
                            fdc.phaseEndTime(i).then(function(f) {
                                console.log("Phase " + k + " ends at: " + f);
                            });
                        }
                        wait(5000, false);
                        var timeLeft = endTime - getVmTime();

                        assert.isAtMost(timeLeft, fdcConstants["gracePeriodAfterCap"]);

                        assert.isAtLeast(timeLeft, fdcConstants["gracePeriodAfterCap"] - 10);
                        console.log(" --> Assert success. Remaining time: " + (endTime - getVmTime()));
                        resolve();
                    } else {
                        console.log(" --> Target NOT reached. Phase 0/1 End time should be 6 weeks apart from start time.");
                        // If in seed / main donation phase, then it should have 6 weeks
                        if (lifecycleStage == 4)
                            assert.isAtLeast(endTime - startTime, (fdcConstants["phase1EndTime"] - fdcConstants["phase1StartTime"]));
                        else if (lifecycleStage == 2) {
                            assert.isAtLeast(endTime - startTime, (fdcConstants["phase0EndTime"] - fdcConstants["phase0StartTime"]));
                        }

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
                console.log("\n  ==== [PHASE " + donationPhase + "] " + "  Making " + times + " x " + amount + " Ether donations  ===");
                var donateAndValidate = function () {
                    return makeDonation(amount).then(onDonatedAssertAmount).then(assertPhaseEndTime);
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
                    lifecycleStage = target;
                    if (phase >= 2 && phase <= 3) {
                        donationPhase = 0;
                        phaseStartTime[donationPhase] = target;
                    } else if (phase >= 4) {
                        donationPhase = 1;
                        phaseStartTime[donationPhase] = target;
                    }

                    console.log(" *** PHASE SHIFTED TO: " + donationPhase);
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

        function getLastBlockTime() {
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
                    // assert.isOk(false, 'not enough balance to forward');
                } else {
                    // console.log("Enough balance for forwarding: " + web3.fromWei(balance, 'ether') + " ETH");
                    var accNonce = web3.eth.getTransactionCount(ETHForwardAddr);
                    // var value = web3.toBigNumber(web3.toWei(amount, 'ether')).sub(txFee); // TODO: all ether: balance.sub(txFee);
                    var amountWei = web3.toBigNumber(web3.toWei(amount, 'ether'));
                    // console.log("\ntxFee: " + txFee + "  // amount: " + value);
                    //var txData     = "0x" + packArg(donateAs, app.DFNAcc.addr);
                    fdc.donateAs(DFNAddr, {
                        from: ETHForwardAddr,
                        value: amountWei,
                        gasPrice: gasPrice,
                        gas: FDCDonateGasMax
                    }).then(function (txID) {
                        console.log("\n makeDonation() " + amount + " Ether completed. tx id: " + txID);
                        // verify donation was registered
                        getStatus().then(function (res) {
                            var donationCount = res[3];  // total individual donations made (a count)
                            assert.equal(donationCount.valueOf(), ++totalDonationCount, "Donation count not correct");
                            resolve(amountWei);
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
