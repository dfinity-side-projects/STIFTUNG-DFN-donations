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


var Accounts = function (seedStr) {

    // single quote == hardened derivation
    this.HDPathDFN = "m/44'/223'/0'/0/0"; // key controlling DFN allocation
    this.HDPathETHForwarder = "m/44'/60'/0'/0/0";  // ETH key forwarding donation for HDPathDFN key
    this.HDPathBTCForwarder = "m/44'/0'/0'/0/0";   // BTC key forwarding donation for HDPathDFN key

    // this.seed = seedStr;
    this.DFN = {};
    this.ETH = {};
    this.BTC = {};


}

var Mnemonic =  require('bitcore-mnemonic');
var bitcore =  require('bitcore-lib');

Accounts.prototype.HDPrivKeyToAddr = function (privHex) {
    /* TODO: verify padding, sometimes we get:

     ethereumjs-util.js:16925 Uncaught RangeError: private key length is invalid(…)
     exports.isBufferLength	@	ethereumjs-util.js:16925
     publicKeyCreate	@	ethereumjs-util.js:17454
     exports.privateToPublic	@	ethereumjs-util.js:6400
     exports.privateToAddress	@	ethereumjs-util.js:6501
     Accounts.HDPrivKeyToAddr	@	app.js:57286
     Accounts	@	app.js:57263

     which likely is the common padding bug of privkey being less than 32 bytes
     */
    var addrBuf = EthJSUtil.privateToAddress(EthJSUtil.toBuffer(privHex));
    return EthJSUtil.bufferToHex(addrBuf);
}



function padPrivkey(privHex) {
    return ("0000000000000000" + privHex).slice(-64);
}
// Generate an HD seed string. Note that we *never* store the seed. With the
// seed, an attacker can gain access to the user's DFN later.
Accounts.prototype.generateSeed = function () {
    var code = new Mnemonic(Mnemonic.Words.ENGLISH);
    return code.toString();

}

// Generate 1. the user's DFINITY address 2. their forwarding addresses, and
// 3. the private keys for the forwarding addresses. Note that we *never* store
// the seed. With the seed, an attacker cn gain access to the user's DFN later.
Accounts.prototype.generateKeys = function (seedStr) {
    //var code = new this.Mnemonic(this.Mnemonic.Words.ENGLISH);
    var code = new Mnemonic(seedStr);
    var masterKey = code.toHDPrivateKey();
    var DFNPriv = masterKey.derive(this.HDPathDFN);

    var DFNPrivPadded = "0x" + padPrivkey(DFNPriv.toObject().privateKey);
    this.DFN.addr = this.HDPrivKeyToAddr(DFNPrivPadded);


}


contract('FDC', function (accounts) {

    function syncVmClock() {
        web3.currentProvider.send({method: "evm_increaseTime", params: [time - getVmTime()]})
    }

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
        var totalWeiDonated = web3.toBigNumber(0);
        var totalTokenExpected = web3.toBigNumber(0);

        // donation phase = {0, 1} of the donation stage
        // lifecycleStage = {0 .. 8} of all the possible stages of the FDC lifecycle
        var donationPhase = 0;
        var lifecycleStage = 0;

        // Keeping track of donated amount
        var dfnTokens = 0;
        var lastAmount = 0;
        var WEI_PER_CHF = web3.toWei("0.1", "ether");

        var phaseStartTime = [], phaseEndtime = [];
        var EARLY_CONTRIBUTORS = 10;

        // printStatus();
        var FDC_CONSTANTS = ["earlyContribEndTime", "phase0EndTime",
            "phase1StartTime", "phase1EndTime", "finalizeStartTime",
            "finalizeEndTime",
            "phase0Cap", "phase1Cap",
            "phase0Multiplier", "phase1Steps", "phase1StepSize",
            "earlyContribShare", "gracePeriodAfterCap",
            "tokensPerCHF", "phase0StartTime"
        ]

        var testSuites = [
            {
                phase0: {
                    target: "meet",   // meet, exceed, below
                    min_donations: 5  // over how many donations
                },
                phase1: {
                    target: "meet",   // meet, exceed, below
                    min_donations: 6,  // over how many donations
                    steps: 5 //  cover how many multiplier transitions
                }
            }
        ]





        var fdcConstants = {}


        /**
         * Returns a random number between min (inclusive) and max (exclusive)
         */
        function randomAmount(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }


        // Below's the main test flow.
        var testSuite = function () {
            return new Promise(function () {
                printStatus();

                var p = Promise.resolve();
                p = p.then(generateAndRegisterEarlyContribs)
                p = p.then(function() {
                    advanceVmTimeTo(fdcConstants["phase0StartTime"]);
                });
                for (var i in testSuites) {
                    const test = testSuites[i];
                    const phase0 = test["phase0"];
                    var minDonations = phase0["min_donations"];
                    var amountDonated = 0;
                    var etherCap = fdcConstants["phase0Cap"] / 100 / 10;
                    var target = phase0["target"];
                    var chunk = etherCap / minDonations;
                    console.log(" /////// ====   TEST SUITE:  Register early contribs  ==== \\\\\\\\\\ ")


                    console.log(" /////// ====   TEST SUITE:  PHASE 0, minDonations = " + minDonations + " , target = " + target + "  ==== \\\\\\\\\\ ")

                    for (var donationTx = 0; ; donationTx++) {
                        const amt = randomAmount(1, chunk);
                        if (target == "meet") {
                            if (amountDonated + amt > etherCap) {
                                amountDonated += amt;
                                p = p.then(function () {
                                    return makeDonationAndValidate(chunk)
                                });
                                break;
                            }

                        } else if (target == "exceed") {
                            if (amountDonated > etherCap && randomAmount(0, 100) > 50)
                                break;
                        } else { // below target
                            if (amountDonated + amt + minDonations >= etherCap) {
                                // Skip this round and get a new random number
                                donationTx--;
                                continue;
                            }
                            if (donationTx >= minDonations && randomAmount(0, 100) > 50) {
                                break;
                            }
                        }
                        amountDonated += amt;
                        p = p.then(function () {
                            return makeDonationAndValidate(amt);
                        });
                    }
                }
                return p;
            })
        };


        // Set exchange rate first
        var p = fdc.setWeiPerCHF(WEI_PER_CHF, {gas: 300000, from: accounts[2]});

        // Wait a few seconds (unstable if doesn't wait), before making donations
        p = p.then(function () {
            setTimeout(function () {
                printStatus();
                Promise.resolve("success").then(initConstants).then(testSuite);
            }, 3000);
        });


        ///////////////  FUNCTIONS /////////////////////////////////
        function initConstants() {
            var f = Promise.resolve();
            console.log("init constants");
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

        function validateEarlyContrib(address, amount) {
            return fdcGetterPromise("tokens", [address])
                .then(fdcGetterPromise.bind(null, "restrictions", [address]))
                .then(function () {
                    console.log(" - Asserting early contrib tokens / restricted:" + getterValues["tokens"] + " / " + getterValues["restrictions"]);
                    assert.equal(amount, getterValues["tokens"]);
                    assert.equal(amount, getterValues["restrictions"]);
                })
        }

        function registerAndValidateEarlyContrib(address, amount, memo) {
            return new Promise(function (resolve, reject) {
                fdc.registerEarlyContrib(address, amount, memo, {gas: 300000, from: accounts[1]})
                    .then(function (success) {
                        console.log(" Early contrib addr registered: " + address + " - " + amount + " - " + memo);

                        assert.notEqual(success, null, "Early Contrib Registration failed");
                        validateEarlyContrib(address, amount).then(resolve);
                    });
            })
        }

        function validateFinalization() {
            return new Promise(function(r, e) {
                advanceVmTimeTo(fdcConstants["finalizeStartTime"])

                r();
            });
        }

        var earlyContribs = {};


        function generateAndRegisterEarlyContribs() {
            earlyContribs = {};
            var p = Promise.resolve();


            for (var i = 0; i < EARLY_CONTRIBUTORS; i++) {

                var account = new Accounts();
                var seed = account.generateSeed();
                account.generateKeys(seed);

                var addr = account.DFN.addr;
                earlyContribs[addr] = 100000;
            }

            return new Promise(function (resolve, reject) {
                for (var addr in earlyContribs) {
                    p = p.then(registerAndValidateEarlyContrib.bind(null,addr,earlyContribs[addr], "Contributor"));
                }
                p.then(resolve);
            });
        }


        // Calculate bonus based on remaining time left
        function getPhase1Bonus(time) {

            var timeLeft = fdcConstants["phase1EndTime"] - time;
            var duration = (fdcConstants["phase1EndTime"] - fdcConstants["phase1StartTime"])
            console.log("phase1step: " + fdcConstants["phase1Steps"]);
            var perPeriod = duration / (fdcConstants["phase1Steps"].valueOf());
            var bonus = Math.ceil(timeLeft / perPeriod) * fdcConstants["phase1StepSize"];
            console.log(" - Using Phase 1 bonus of: " + bonus + " [ " + timeLeft + "/" + duration + "/" + perPeriod + "]");
            return bonus;
        }

        function calcDfnAmountAtTime(cents, time, phase) {
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

        function totalDfnAmountAtTime(cents, time, phase) {
            if (phase == 1) {
                return calcDfnAmountAtTime(cents, time, phase) + calcDfnAmountAtTime(chfCentsDonated[0], time, 0);
            } else if (phase == 0) {
                return calcDfnAmountAtTime(cents, time, phase);
            }
        }

        var getterValues = {};

        function fdcGetterPromise(getterFunction, params) {
            return new Promise(function (resolve, reject) {
                fdc[getterFunction].apply(this, params).then(function (res) {
                    getterValues[getterFunction] = res;
                    resolve();
                })
            });
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
                totalWeiDonated = totalWeiDonated.add(lastWeiDonated);

                var lastCentsDonated = lastWeiDonated.mul(100).div(WEI_PER_CHF);
                console.log("Last wei donated: " + lastWeiDonated);
                // chfCentsDonated[donationPhase] += Math.floor((lastWeiDonated * 100) / WEI_PER_CHF);
                chfCentsDonated[donationPhase] = chfCentsDonated[donationPhase].add(lastCentsDonated);

                var values = getterValues;
                var p = fdcGetterPromise("getStatus", [donationPhase, DFNAddr, ETHForwardAddr])
                // .then(fdcGetterPromise.bind(null, "weiDonated", ETHForwardAddr, values))
                // .then(fdcGetterPromise.bind(null, "tokens", DFNAddr, values))
                    .then(fdcGetterPromise.bind(null, "restrictions", [DFNAddr], values));
                p = p.then(function () {
                    var fdcChfCentsDonated = values["getStatus"][8].valueOf();
                    var fdcTotalDfnToken = values["getStatus"][4].valueOf();
                    var fdcTokenAssigned = values["getStatus"][9].valueOf();
                    var fdcWeiDonated = values["getStatus"][11].valueOf();
                    console.log(" - Validating FDC donated amount in wei: " + totalWeiDonated + " == " + fdcWeiDonated);

                    assert.equal(totalWeiDonated, fdcWeiDonated, "Donation in Wei doesn't match with FDC");

                    console.log(" - Validating FDC donated amount in chf: " + fdcChfCentsDonated);
                    assert.equal(chfCentsDonated[donationPhase].valueOf(), fdcChfCentsDonated, "Total Donation in CHF doesn't match with FDC");

                    // todo: should only use local calculation and avoid using remote FDC variables for assertions
                    // var expectedToken = calcDfnAmountAtTime(chfCentsDonated[donationPhase], getLastBlockTime(), donationPhase);
                    var expectedToken = calcDfnAmountAtTime(lastCentsDonated, getLastBlockTime(), donationPhase);
                    totalTokenExpected = totalTokenExpected.add(expectedToken);
                    console.log(" - Validating FDC tokens got: " + totalTokenExpected + " == " + fdcTokenAssigned);
                    assert.equal(totalTokenExpected, fdcTotalDfnToken, "FDC Total DFN amount doesn't match with expectation");
                    assert.equal(totalTokenExpected, fdcTokenAssigned, "FDC Assigned DFN amount doesn't match with expectation");
                    resolve(true);

                });
            });
        };
        // var targetReachTime= [];

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
                        // targetReachTime[donationPhase] = getLastBlockTime();
                        printStatus();

                        for (var i = 0; i < 7; i++) {
                            const k = i;
                            fdc.phaseEndTime(i).then(function (f) {
                                console.log("Phase " + k + " ends at: " + f);
                            });
                        }
                        wait(5000, false);
                        var timeLeft = endTime - getVmTime();

                        assert.isAtMost(timeLeft, fdcConstants["gracePeriodAfterCap"]);

                        // assert.isAtLeast(timeLeft, fdcConstants["gracePeriodAfterCap"] - 30);
                        console.log(" --> Assert success. Remaining time: " + (endTime - getLastBlockTime()));
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


        function makeDonationAndValidate(amount) {
            return new Promise(function (resolve, reject) {
                if (!amount)
                    amount = 5000;
                console.log("\n  ==== [PHASE " + donationPhase + "] " + "  Making " + amount + " Ether donations  ===");

                makeDonation(amount)
                    .then(onDonatedAssertAmount)
                    .then(assertPhaseEndTime)
                    .then(resolve);
            });
        }

        /*
         *  Make multiple donations for specified times, and per interval.
         *  TODO: Also support randomizedAmount if true.
         *
         */
        function makeDonationsAndValidate(amount, times, interval, randomizedAmount) {
            return new Promise(function (resolve, reject) {
                console.log("\n  ==== [PHASE " + donationPhase + "] " + "  Making " + times + " x " + amount + " Ether donations  ===");
                p = makeDonationAndValidate(amount);
                for (var i = 0; i < times - 1; i++) {
                    p = p.then(makeDonationAndValidate.bind(null, amount));
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

        function promisifySync(fn) {
            return Promise.bind(null, function(resolve, reject) {
                fn();
                resolve();
            });
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
})
;
