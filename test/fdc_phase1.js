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

var Mnemonic = require('bitcore-mnemonic');
//var bitcore = require('bitcore-lib');

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
            /* Test Parameters */
            var EARLY_CONTRIBUTORS = 1;
            var testSuites = [
                {
                    phase0: {
//                        target: "exceed",   // meet, exceed, below
                        target: "min",   // meet, exceed, below
                        min_donations: 1  // over how many donations
                    },
                    phase1: {
                        target: "meet",   // meet, exceed, below
                        min_donations: 5,  // over how many donations
                        steps: 5 //  cover how many multiplier transitions
                    }
                }
            ]
            var DELAY = 90 * 24 * 3600; // n days 

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

            // printStatus();

            var FDC_CONSTANTS = ["earlyContribEndTime", "phase0EndTime",
                "phase1StartTime", "phase1EndTime", "finalizeStartTime",
                "finalizeEndTime",
                "phase0Target", "phase1Target",
                "phase0Bonus", "phase1InitialBonus", "phase1BonusSteps",
                "earlyContribShare", "gracePeriodAfterTarget",
                "tokensPerCHF", "phase0StartTime"
            ]


            var fdcConstants = {}


            /**
             * Returns a random number between min (inclusive) and max (exclusive)
             */
            function randomAmount(min, max) {
                return Math.floor(Math.random() * (max - min + 1)) + min;
            }


            // p = Promise chain, phase0 = spec of phase 0 testing
            function addPhase0Tests(p, phase0) {
                var minDonations = phase0["min_donations"];
                var amountDonated = 0;
                var fdcTarget = fdcConstants["phase0Target"] / 100 / 10;
                var target = phase0["target"];
                var chunk = fdcTarget / minDonations / 2; // TODO made chunk artificially smaller

                p = p.then(advanceToPhase.bind(null,2, 0));

                for (var donationTx = 0; ; donationTx++) {
                    const amt = randomAmount(1, chunk);

                    if (target == "meet") {
                        if (amountDonated + amt > fdcTarget) {
                            amountDonated += amt;
                            p = p.then(makeDonationAndValidate.bind(null, 0,0, chunk));

                            break;
                        }
                    } else if (target == "exceed") {
                        // 50:50 probability of stopping if mission accomplished :)
                        if (amountDonated > fdcTarget && randomAmount(0, 100) > 80)
                            break;
                    } else { // below target
                        if (amountDonated + amt + minDonations >= fdcTarget) {
                            // Skip this round and get a new random number
                            donationTx--;
                            continue;
                        }
                        if (donationTx >= minDonations && randomAmount(0, 100) > 50) {
                            break;
                        }
                    }
                    amountDonated += amt;
                    p = p.then(makeDonationAndValidate.bind(null, 0,0, amt));

                }
                return p;
            }

            function addPhase1Tests(p, phase1) {
                var minDonations = phase1["min_donations"];
                var amountDonated = 0;
                var fdcTarget = fdcConstants["phase1Target"] / 100 / 10;
                var target = phase1["target"];
                var chunk = fdcTarget / minDonations;

                var bonusSteps = fdcConstants["phase1BonusSteps"];
                var requiredSteps = phase1["steps"];

                p = p.then(delayPhase1.bind(null, DELAY)).then(onDelayAssertStartTime);
                p = p.then(initConstants);
                p = p.then(printStatus.bind(null, 1));
                p = p.then(delayPhase1.bind(null, DELAY)).then(onDelayAssertStartTime);
                p = p.then(initConstants);
                p = p.then(printStatus.bind(null, 1));

                const multiplierInterval = (fdcConstants["phase1EndTime"] - fdcConstants["phase1StartTime"]) / (fdcConstants["phase1BonusSteps"] + 1);
                p = p.then(advanceToPhase.bind(null,4, 0));

                var currentStep = 0;

                for (var donationTx = 0; ; donationTx++) {
                    const amt = randomAmount(1, chunk);

                    if (target == "meet") {
                        if (amountDonated + amt > fdcTarget) {
                            amountDonated += amt;
                            p = p.then(makeDonationAndValidate.bind(null, 1,currentStep, chunk));
                            break;
                        }
                    } else if (target == "exceed") {
                        // 20% probability of stopping if mission accomplished :)
                        if (amountDonated > fdcTarget && randomAmount(0, 100) > 80)
                            break;
                    } else { // below target
                        if (amountDonated + amt + minDonations >= fdcTarget) {
                            // Skip this round and get a new random number
                            donationTx--;
                            continue;
                        }
                        if (donationTx >= minDonations && randomAmount(0, 100) > 50) {
                            break;
                        }
                    }
                    amountDonated += amt;
                    p = p.then(makeDonationAndValidate.bind(null, 1,currentStep, amt));


                    if (currentStep < bonusSteps) {
                        if (currentStep < requiredSteps && randomAmount(0, 100) > 50) {
                            currentStep++;
                            const s = currentStep;
                            const offset = multiplierInterval * s;
                            const targetTime = fdcConstants["phase1StartTime"] + offset;
                            p = p.then(function () {
                                console.log("  Total delay :" + totalDelay);
                                console.log("  Multiplier Step " + s + " offset:" + offset);
                                console.log("  Multiplier Step " + s + " time target:" + (targetTime + totalDelay));
                                advanceVmTimeTo(targetTime + totalDelay);
                                console.log(" *** Advancing to Phase 1 bonus multiplier step " + s);
                            });
                        } else {
                                // break;
                        }
                    } else {
                        // continue;
                    }


                }
                return p;

            }

            // Below's the main test flow.
            var testSuite = function () {
                return new Promise(function () {
                    printStatus();

                    var p = Promise.resolve();
                    p = p.then(generateAndRegisterEarlyContribs)
                    // p = p.then(function () {
                        // advanceVmTimeTo(fdcConstants["phase0StartTime"]);
                    // });
                    for (var i in testSuites) {
                        const test = testSuites[i];
                        const phase0 = test["phase0"];
                        const phase1 = test["phase1"];
                        p = p.then(addPhase0Tests.bind(null, p, phase0));
                        p = p.then(addPhase1Tests.bind(null, p, phase1));
                        p.then(validateFinalization);
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


            function printStatus(phase) {
                if (phase == null || phase == undefined)
                    phase = 0;
                console.log(" ==> Status for Phase " + phase);
                fdc.getStatus(phase, 1, 1).then(function (s) {
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
                        assert.equal(amount, getterValues["tokens"].toString());
                        assert.equal(amount, getterValues["restrictions"].toString());
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

            function finalizeEarlyContrib(addr) {
                return new Promise(function (r, e) {
                    console.log(" Finalized tokens for " + addr);
                    fdc.finalize(addr).then(r);
                });
            }

            function doValidateFinalizedToken(addr) {
                return new Promise(function (r, e) {
                    var finalizedTokens = getterValues["tokens"].valueOf();
                    earlyContribs[addr]["finalized"] = finalizedTokens;
                    assert.equal(getterValues["restrictions"].valueOf(), 0, "Restricted tokens for " + addr + " should be zero after finalization");
                    finalizedTotalEarlyContrib = finalizedTotalEarlyContrib.add(finalizedTokens);
                    console.log(" - Assert success finalized tokens for " + addr + " : " + finalizedTokens);
                    r();
                });
            }

            function validateFinalization() {
                return new Promise(function (r, e) {
                    // printStatus();
                    console.log(" //////=====  FINALIZING & VALIDATING EARLY CONTRIBUTOR TOKENS ==== \\\\\\\\ ")
                    advanceVmTimeTo(fdcConstants["finalizeStartTime"] + totalDelay);
                    p = Promise.resolve();
                    for (var addr in earlyContribs) {
                        p = p.then(finalizeEarlyContrib.bind(null, addr));
                    }
                    // Add up all early contrib tokens adjusted
                    finalizedTotalEarlyContrib = web3.toBigNumber(0);
                    for (var a in earlyContribs) {
                        const addr = a;
                        p = p.then(fdcGetterPromise.bind(null, "tokens", [addr]))
                            .then(fdcGetterPromise.bind(null, "restrictions", [addr]))
                            .then(doValidateFinalizedToken.bind(null, addr));
                    }

                    p = p.then(getStatus).then
                    (function (status) {
                        var tokensTotal = status[4];
                        console.log("Total tokens of early contrib: " + finalizedTotalEarlyContrib + "  [total: " + tokensTotal + "]");
                        assert.isAtLeast(finalizedTotalEarlyContrib.toNumber(), tokensTotal * (EARLY_CONTRIB_PERC ) / 100 - tokensTotal * .001, " Early contrib should be at least 19.99% of Total tokens");
                        assert.isAtMost(finalizedTotalEarlyContrib.toNumber(), tokensTotal * (EARLY_CONTRIB_PERC ) / 100, " Early contrib should be no more than 20% of Total tokens");


                    });

                });
            }
            
            var totalDelay = 0;
            
            function delayPhase1(timeDelta) {
                return new Promise(function (resolve, reject) {
                    printStatus(1);
                    fdc.delayDonPhase1(timeDelta, {gas: 100000, from: accounts[1]})
                        .then(function (success) {
                            console.log(" Donation phase 1 delayed by: " + timeDelta  + " seconds");
                            resolve(timeDelta);
                        });
                })
            }
            
            function onDelayAssertStartTime(delay) {
                return new Promise(function (resolve, reject) {
                   totalDelay += delay; 
                   fdc.getPhaseStartTime(4).then(function (startTime) {
                       assert.equal(startTime, fdcConstants["phase1StartTime"] + totalDelay, "Phase 1 start time in FDC should be equal to initial constant + " + totalDelay);
                       console.log("start time after delay: " + fdcConstants["phase1StartTime"] + " / " + totalDelay + "/" + startTime);
                       resolve();
                   });
                });
            }
           
            var EARLY_CONTRIB_PERC = 20;

            var earlyContribs = {};
            var origTotalEarlyContrib = 0;
            var finalizedTotalEarlyContrib = web3.toBigNumber(0);


            function generateAndRegisterEarlyContribs() {
                earlyContribs = {};
                console.log(" /////// ====   TEST SUITE:  Register early contribs  ==== \\\\\\\\\\ ")

                console.log(" Generate early contribs ...");
                var p = Promise.resolve();


                for (var i = 0; i < EARLY_CONTRIBUTORS; i++) {

                    var account = new Accounts();
                    var seed = account.generateSeed();
                    account.generateKeys(seed);
                    var addr = account.DFN.addr;
                    console.log(" Early contrib generated: " + addr);

                    var amount = Math.floor(300000000 / EARLY_CONTRIBUTORS);
                    earlyContribs[addr] = {original: amount, finalized: -1, restricted: -1};
                    origTotalEarlyContrib += earlyContribs[addr]["original"];
                }

                return new Promise(function (resolve, reject) {
                    for (var addr in earlyContribs) {
                        p = p.then(registerAndValidateEarlyContrib.bind(null, addr, earlyContribs[addr]["original"], "Contributor"));
                    }
                    p.then(resolve);
                });
            }


            // Calculate bonus based on remaining time left
            function getPhase1Bonus(time) {

                var timeLeft = fdcConstants["phase1EndTime"] + totalDelay - time;
                var duration = (fdcConstants["phase1EndTime"] - fdcConstants["phase1StartTime"])

                var nSteps = fdcConstants["phase1BonusSteps"].valueOf() + 1;
                var perPeriod = duration / nSteps;
                var step = fdcConstants["phase1InitialBonus"] / fdcConstants["phase1BonusSteps"]; // should be an integer
                var bonus = (Math.ceil(timeLeft / perPeriod) - 1) * step; 
                console.log("phase1InitialBonus: " + fdcConstants["phase1InitialBonus"]);
                console.log("phase1BonusSteps: " + fdcConstants["phase1BonusSteps"]);
                console.log("Time: " + time);
                console.log(" - Using Phase 1 bonus of: " + bonus + " [ " + timeLeft + "/" + duration + "/" + perPeriod + "]");
                return bonus;
            }

            function calcDfnAmountAtTime(cents, time, phase) {
                var multiplier = 100;
                var startTime = phaseStartTime[phase];
                if (phase == 0) {
                    multiplier = 100 + fdcConstants["phase0Bonus"];
                } else if (phase == 1) {
                    multiplier += getPhase1Bonus(time);
                    // console.log(" Using Phase 1 bonus multiplier: " + multiplier);
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
                        console.log(" - Validating FDC tokens got (expected == FDC): " + totalTokenExpected + " == " + fdcTokenAssigned);
                        assert.equal(fdcTotalDfnToken, totalTokenExpected.valueOf(), "FDC Total DFN amount doesn't match with expectation");
                        assert.equal(fdcTokenAssigned, totalTokenExpected.valueOf(), "FDC Assigned DFN amount doesn't match with expectation");
                        resolve(true);

                    });
                });
            };
            // var targetReachTime= [];

            /*
             * Check if the current phase end time has been adjusted based on the target reached status
             */
            function assertPhaseEndTime() {
                return new Promise(function (resolve, reject) {
                    getStatus().then(function (res) {
                        var startTime = res[5];      // expected start time of specified donation phase
                        var endTime = res[6];        // expected end time of specified donation phase

                        var phaseTarget = donationPhase == 0 ? fdcConstants["phase0Target"] : fdcConstants["phase1Target"];
                        console.log(" - Asserting if remaining end time less than 1hr if target reached: chfCents = " + chfCentsDonated[donationPhase] + " // cap = " + phaseTarget);
                        if (chfCentsDonated[donationPhase].greaterThanOrEqualTo(phaseTarget)) {
                            console.log(" --> Target reached. End time should shorten to " + fdcConstants["gracePeriodAfterTarget"] + " seconds ");
                            // targetReachTime[donationPhase] = getLastBlockTime();
                            // printStatus();

                            for (var i = 0; i < 7; i++) {
                                const k = i;
                                fdc.phaseEndTime(i).then(function (f) {
                                    console.log("Phase " + k + " ends at: " + f);
                                });
                            }
                            wait(5000, false);
                            var timeLeft = endTime - getVmTime();

                            assert.isAtMost(timeLeft, fdcConstants["gracePeriodAfterTarget"]);

                            assert.isAtLeast(timeLeft, fdcConstants["gracePeriodAfterTarget"] - 30);
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


            function makeDonationAndValidate(phase, step, amount) {
                return new Promise(function (resolve, reject) {
                    console.log("\n  ==== [Phase " + phase + ", Step " + step + "] " + "  Making " + amount + " Ether donations  ===");

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
                printStatus();
                web3.currentProvider.send({method: "evm_increaseTime", params: [time - getVmTime()]})
                getVmTime();
                // wait(1000);
            }

            function promisifySync(fn) {
                return Promise.bind(null, function (resolve, reject) {
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
                        console.log(" *** PHASE SHIFTED TO: " + phase + "(donation phase " + donationPhase + ")");
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
                        fdc.donateAsWithChecksum(DFNAddr, addrChecksum(DFNAddr), {
                            from: ETHForwardAddr,
                            value: amountWei,
                            gasPrice: gasPrice,
                            gas: FDCDonateGasMax
                        }).then(function (txID) {
                            console.log("\n makeDonation() " + amount + " Ether completed. tx id: " + txID);
                            // verify donation was registered
                            getStatus().then(function (res) {
                                var donationCount = res[3];  // total individual donations made (a count)
                                // assert.equal(donationCount.valueOf(), ++totalDonationCount, "Donation count not correct");
                                resolve(amountWei);
                            });
                        }).catch(function (e) {
                            console.log("Error sending ETH forwarding tx: " + e);
                            reject();
                        });
                    }
                });

            }


        }
    );
})
;
