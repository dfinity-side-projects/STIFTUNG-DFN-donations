"use strict";

var accounts;
var account;

// *
// *** Constants ***
// *

var ETHEREUM_CHK_FWD_INTERVAL = 1000; // not actual... pauses
var ETHEREUM_POLLING_INTERVAL = 5000; // the time we wait before re-polling Etheruem provider for new data
var ETHEREUM_CONN_MAX_RETRIES = 10;   // max number of retries to automatically selected Ethereum provider
var ETHEREUM_HOSTED_NODES = ["TODO"];
var ETHEREUM_LOCAL_NODE = "http://localhost:8545";

var GAS_PRICE;                      // estimate price of gas
var MIN_DONATION;                   // minimum donation allowed
var MAX_DONATE_GAS;                 // maximum gas used making donation
var MAX_DONATE_GAS_COST;            // estimate maximum cost of gas used
var MIN_FORWARD_AMOUNT;             // minimum amount we will try to forward
var VALUE_TRANSFER_GAS = 21000;
var VALUE_TRANSFER_GAS_COST;
// TODO if there's congestion, the gas price might go up. We need to handle
// this better or leave sufficent margin cannot fail

// FDC address
// for PRODUCTION version: place hard-coded constant here
var FDCAddr = FDC.deployed().address;

// FDC ABI signatures
var donateAs =  "0d9543c5";
var donateAsWithChecksum =  "ceadd9c8";

// *
// *** Application logic ***
// *



// Constructor
var Backend = function(userAccounts, stateVar) {

    this.state = stateVar;
    var state = this.state;

    this.logger("Initializing main extension application...");

    this.tryForwardBalance = true;    // try to forward wallet balance
    this.contFwdingOnNewData = false; // used to indicate set fwding on new poll data

    this.ethFwdTimeout = undefined;   // handle to current timer for Etheruem forwarding
    this.ethPollTimeout = undefined;  // handle to current timer for Ethereum polling
    this.ethConnectionRetries = 0;    // number consecutive provider connection fails
    this.saidBalanceTooSmall = false; // told user balance too small?
    this.lastBalanceSeen;             // last balance we saw
    this.donationPhase = 0;           // seed funder
    this.ethBalance = undefined;      // balance of ETH forwarding wallet
    this.accs = userAccounts;
    this.lastTask = 'task-agree';
    this.lastEthereumNode = ETHEREUM_LOCAL_NODE;

    this.setCurrentTask(this.lastTask);
    state.set("current-task", this.lastTask);
    state.set("genesis-dfn", undefined);

    if (this.accs.ETH.addr != undefined && this.accs.DFN.addr != undefined) {
        this.setUserAddresses(this.accs.ETH.addr, this.accs.DFN.addr);
    }
    this.state.set("seed", undefined);
    this.state.set("funder-total-received",undefined);
    this.setEthereumNode(this.lastEthereumNode);
    this.logger("Retrieving status from FDC contract: "+FDC.deployed().address);

    // start polling the FDC for stats
    this.pollStatus();

    // start forwarding any ETH we see!
    this.tryForwardETH();

    this.runLocationCheck();
}

Backend.prototype.logger = function(text) {
    this.state.logger(text);
}

// Forward any ETH we can see lying in our wallet as a donation!
Backend.prototype.tryForwardETH = function() {
    if (this.ethFwdTimeout) clearTimeout(this.ethFwdTimeout);

    // we are forwarding, connected and have seen an ETH balance?
    if (!this.tryForwardBalance || !web3.isConnected() ||
        this.ethBalance == undefined || this.ethBalance.equals(0)) {
        // try again later!
        this.scheduleTryForwardETH();
        return;
    }

    // enough ETH in wallet to foward as donation?
    if (web3.toBigNumber(this.ethBalance).lt(MIN_FORWARD_AMOUNT)) {
        if (!this.saidBalanceTooSmall) {
            this.saidBalanceTooSmall = true;
            this.logger("Waiting balance at forwarding address too small to donate (" +
                web3.fromWei(this.ethBalance, 'ether') + " ETH)");
        }
        this.scheduleTryForwardETH();
    } else {
        // yes...
        var self = this;
        var fdc = FDC.deployed();
        this.saidBalanceTooSmall = false;
        var donating = web3.fromWei(this.ethBalance, 'ether');
        this.logger("Forwarding " + donating + " ETH...");
        // will continue forwarding only on success!
        self.tryForwardBalance = false;
        self.contFwdingOnNewData = false;

        // do the donation
        var handleConnErr = function(e) {
            try {
                state.logger("Error forwarding balance as donation: "+e+" "+JSON.stringify(e));
                ui.showErrorEthForwarding();
                // user must manually restart forwarding.. otherwise a smart contract
                // error would cause all their balance to be used up in gas when retrying!
            } finally {
                self.scheduleTryForwardETH();
            }
        }

        web3.eth.getTransactionCount(self.accs.ETH.addr, function(err, accNonce) {
            if (err) {
                handleConnErr(err);
                return;
            }

            var value = self.ethBalance.sub(MAX_DONATE_GAS_COST);
            // console.log("addr:" + self.accs.DFN.addr);
            var addrBuf = EthJSUtil.toBuffer(self.accs.DFN.addr);
            // console.log("addrBuf:" + EthJSUtil.bufferToHex(addrBuf));
            var checksumBuf = EthJSUtil.sha256(addrBuf).slice(0,4); // first 4 bytes
            // console.log("checksumBuf:" + EthJSUtil.bufferToHex(checksumBuf));
            var checksum = EthJSUtil.bufferToHex(checksumBuf)
            // console.log("checksum:" + checksum);
            var txData2 = "0x" + packArg2(donateAsWithChecksum, self.accs.DFN.addr, checksum);
            // console.log("txData:" + txData2);
            var dataBuf = EthJSUtil.toBuffer(txData2);
            // console.log("txData:" + EthJSUtil.bufferToHex(dataBuf));

            var txObj      = {};
            txObj.to       = FDCAddr;
            txObj.gasPrice = web3.toHex(GAS_PRICE);
            txObj.gasLimit = web3.toHex(MAX_DONATE_GAS);
            txObj.nonce    = accNonce;
            txObj.data     = dataBuf
            txObj.value    = web3.toHex(value);

            var tx = new EthJS(txObj);
            var privBuf = EthJSUtil.toBuffer(self.accs.ETH.priv);
            tx.sign(privBuf)
            var signedTx = EthJSUtil.bufferToHex(tx.serialize());

            web3.eth.sendRawTransaction(signedTx, function(err, txID) {
                if (err) {
                    handleConnErr(err);
                    return;
                }

                try {
                    console.log("Successfully donated : " + donating + " ETH (txID=" + txID + ")");
                    self.contFwdingOnNewData = true; // start fowarding again on new data
                } finally {
                    self.scheduleTryForwardETH();
                }
            });
        });
    }
}
// reschedule...
Backend.prototype.scheduleTryForwardETH = function() {
    var t= this;
    this.ethFwdTimeout = setTimeout(function() { t.tryForwardETH(); }, ETHEREUM_CHK_FWD_INTERVAL);
}
// re-activate...
Backend.prototype.retryForwarding = function() {
    // stop showing user error box. We're back in business...
    ui.hideErrorEthForwarding();
    // flag we can continue forwarding available balance
    this.contFwdingOnNewData = true;
}

// TODO: merge common parts of tx handling for forwarding and withdrawal
Backend.prototype.withdrawETH = function(toAddr) {
    var self = this;
    web3.eth.getTransactionCount(self.accs.ETH.addr, function(err, accNonce) {
        if (err) {
            // TODO: error handling
            console.log("could not get tx count: " + err);
            return;
        }

        // TODO: remove web3.eth.getBalance call once self.ethBalance works (currently buggy
        // as not immediately updated after failed forwarding tx)
        // https://github.com/dfinity/STIFTUNG-DFN-donations/issues/1
        var bal = web3.eth.getBalance(self.accs.ETH.addr);
        var value = bal.sub(VALUE_TRANSFER_GAS_COST);
        // TODO: move this validation to before showing withdraw option
        if (value.isNegative() || value.isZero()) {
            this.logger("Not enough balance to withdraw");
            return;
        }

        var txObj      = {};
        txObj.to       = toAddr;
        txObj.gasPrice = web3.toHex(GAS_PRICE);
        txObj.gasLimit = web3.toHex(VALUE_TRANSFER_GAS);
        txObj.nonce    = accNonce;
        txObj.data     = EthJSUtil.toBuffer("");
        txObj.value    = web3.toHex(value);

        var tx = new EthJS(txObj);
        var privBuf = EthJSUtil.toBuffer(self.accs.ETH.priv);
        tx.sign(privBuf)
        var signedTx = EthJSUtil.bufferToHex(tx.serialize());

        web3.eth.sendRawTransaction(signedTx, function(err, txID) {
            if (err) {
                // TODO: error handling
                console.log("could not send raw tx: " + err);
                return;
            }

            try {
                console.log("Sent withdraw tx: " + value + " ETH (txID=" + txID + ")");
                this.logger("Sent withdraw tx: " + value + " ETH (txID=" + txID + ")");
                self.contFwdingOnNewData = true; // start fowarding again on new data
                // TODO: track state of withdraw tx
            } finally {
                // TODO: track state of withdraw tx
            }
        });
    });
}

// Poll Ethereum for status information from FDC and wallet
Backend.prototype.pollStatus = function() {
    if (this.ethPollTimeout) clearTimeout(this.ethPollTimeout);

    console.log("polling ...");
    // connected?
    if (!web3.isConnected()) {
        this.logger("Not connected to Ethereum...");
        // adjust connection if too many fails and appropriate
        this.adjustConnection(++this.ethConnectionRetries);
        // reschedule next polling
        this.schedulePollStatus(); // bail, try later...
        return;
    }

    var number = web3.eth.blockNumber;
    this.state.set("block-number", number);

    this.onEthereumConnect();
    this.ethConnectionRetries = 0;
    console.log("Ethereum provider: "+JSON.stringify(web3.currentProvider));


    // Address defined yet?
    console.log(this.accs.DFN.addr);
    if (this.accs.DFN.addr == undefined || this.accs.ETH.addr ==undefined) {
        this.schedulePollStatus(); // bail, try later...
        return;
    }



    // retrieve status information from the FDC...
    var self = this;
    var fdc = FDC.deployed();
    fdc.getStatus.call(this.donationPhase,
        this.accs.DFN.addr,
        this.accs.ETH.addr).then(function(res) {
        try {
            console.log("FDC.getStatus: "+JSON.stringify(res));

            // parse status data
            var currentState = res[0];      // current state (an enum)
            var fxRate = res[1];            // exchange rate of CHF -> ETH (Wei/CHF)
            var currentMultiplier = res[2]; // current bonus multiplier in percent (0 if outside of )
            var donationCount = res[3];     // total individual donations made (a count)
            var totalTokenAmount = res[4];  // total DFN planned allocated to donors
            var startTime = res[5];         // expected start time of specified donation phase
            var endTime = res[6];           // expected end time of specified donation phase
            var isCapReached = res[7];      // whether target cap specified phase reached
            var chfCentsDonated = res[8];   // total value donated in specified phase as CHF
            var tokenAmount = res[9];       // total DFN planned allocted to donor (user)
            var ethFwdBalance = res[10];    // total ETH (in Wei) waiting in forwarding address
            var donated = res[11];          // total ETH (in Wei) donated so far

            // if the fowarding balance has changed, then we may have to inform the user
            // that it is "still" too small
            if (self.ethBalance != undefined && !self.ethBalance.equals(ethFwdBalance)) {
                self.saidBalanceTooSmall = false;
            }
            self.ethBalance = ethFwdBalance;

            // new data means we can restart forwarding...
            // - we do this b/c if the user has just failed to forward due to an
            // exception, their balance will have decreased due to gas consumption.
            // We need to refresh their balance before trying to forward again or
            // we will try to send more than we have. There is a race condition here
            // but unlikely to trigger and doesn't cost user money just error msg.
            if (self.contFwdingOnNewData) {
                self.tryForwardBalance = true;
            }

            // update user interface with status info
            self.updateUI(currentState, fxRate, donationCount, totalTokenAmount,
                startTime, endTime, isCapReached, chfCentsDonated, tokenAmount,
                self.ethBalance, donated);

        } finally {
            // do this all over again...
            self.schedulePollStatus();
        }
    }).catch(function(e) {
        try {
            this.logger("Error querying Ethereum: "+e+" "+JSON.stringify(e));
        } finally {
            // do this all over again...
            self.schedulePollStatus();
        }
    });
}
// reschedule...
Backend.prototype.schedulePollStatus = function() {
    var t = this;
    this.ethPollTimeout = setTimeout(function() { t.pollStatus(); }, ETHEREUM_POLLING_INTERVAL);
}

Backend.prototype.generateSeed = function() {
    var seed = this.accs.generateSeed().trim();
    return seed;
}



// Update the UI with retrieved status information
Backend.prototype.updateUI = function(currentState, fxRate, donationCount,
                                      totalTokenAmount, startTime, endTime, isCapReached, chfCentsDonated,
                                      tokenAmount, fwdBalance, donated) {
    var state = this.state;

    state.set("genesis-dfn",tokenAmount);
    state.set("funder-total-received",chfCentsDonated/100);
    state.set("forwarded-eth",web3.fromWei(donated, 'ether'));
    state.set("remaining-eth",web3.fromWei(fwdBalance, 'ether'));
}

// Adjust the connection after too many failures e.g. try new full node
Backend.prototype.adjustConnection = function(retries) {
    if (retries > ETHEREUM_CONN_MAX_RETRIES) {
        // TODO try another provider?
    }
}

// Set current task given to user making donations
Backend.prototype.setCurrentTask = function(tId) {
    this.currentTask = tId;
    this.state.set("current-task",tId);
}

// Set the Etheruem full node we are connecting to
Backend.prototype.setEthereumNode = function(host) {
    console.log("Set Ethereum node: " + host);

    if (host == "hosted") {
        // TODO: add logic to randomly choose which hosted node to connect to
        // TODO: add fallback logic if one hosted node is down
        this.setETHNodeInternal(ETHEREUM_HOSTED_NODES[0]);
    } else {
        host = host.replace(/(\r\n|\n|\r)/gm,""); // line breaks
        host = host.replace(/\s/g,'') // all whitespace chars
        if (!host.startsWith('http://') && !host.startsWith('https://')) {
            this.logger("Ethereum full node host must start with http:// or https://");
            return;
        }
        var splits = host.split(':');
        var port = splits[splits.length-1];
        if ((port.length != 4 && port.length != 5) || port.match(/^[0-9]+$/) == null) {
            this.logger("Host string must end with valid port, e.g. \":8545\"");
            return;
        }
        this.setETHNodeInternal(host);
    }
}

Backend.prototype.setETHNodeInternal = function(host) {
    this.logger("Connecting to: " + host + "...");
    this.setEthereumClientStatus('connecting...');
    this.ethereumNode = host;
    this.state.set("ethereum-node",host);

    web3.setProvider(new web3.providers.HttpProvider(this.ethereumNode));
    // TODO: reconnect immediately instead of waiting for next poll
    // TODO save node to storage
}

// Set the user's DFN addr & ETH forwarding addr
Backend.prototype.setUserAddresses = function(ETHAddr, DFNAddr) {
    this.DFNAddr = DFNAddr;
    state.set("dfn-address", EthJSUtil.toChecksumAddress(DFNAddr));
    state.set("eth-address", EthJSUtil.toChecksumAddress(ETHAddr));
}



Backend.prototype.setForwardedETH = function(fe) {
    console.log("Set forwarded ETH: "+fe);
    this.forwardedETH = fe;
    this.state.set("forwarded-eth",fe);
}

Backend.prototype.setRemainingETH = function(re) {
    console.log("Set remaining ETH: "+re);
    this.remainingETH = re;
    this.state.set("remaining-eth",re);
}


Backend.prototype.doImportSeed = function(seed) {
    this.accs.generateKeys(seed);
    this.setUserAddresses(backend.accs.ETH.addr,backend.accs.DFN.addr);
}

Backend.prototype.setEthereumClientStatus = function(status) {
    this.ethClientStatus = status;
    if (status == "OK") {
        // this.logger("Connected successfully to an Etheruem node");
        this.state.set("ethereum-client-status","&#10004 connected, forwarding...");


        // now we're connected, grab all the values we need
        // this.pollStatus();
    } else
        this.state.set("ethereum-client-status","not connected ("+status+")");
}

Backend.prototype.onEthereumConnect = function() {
    this.setEthereumClientStatus("OK");
}

Backend.prototype.onEthereumDisconnect = function(errCode) {
    this.setEthereumClientStatus(errCode);
}


Backend.prototype.runLocationCheck = function () {
    var usBlocker = document.getElementById("us-person-error");
    var agreeButton = document.getElementById("agree-terms-button");
    ajaxGet("http://ip-api.com/json/", function (data) {
        var countryCode = JSON.parse(data)["countryCode"];
        this.state.set("countryCode", countryCode);

    }, function (err) {
        this.state.set("countryCode", "error");
    });
}


// TODO: move to utils / accounts module?

// for single arg functions
// https://github.com/ethereum/wiki/wiki/Ethereum-Contract-ABI
function packArg(ABISig, arg) {
    return ABISig + "000000000000000000000000" + arg.replace("0x", "");
}

function packArg2(ABISig, arg20, arg4) {
    return ABISig + "000000000000000000000000" + arg20.replace("0x", "") + arg4.replace("0x", "");
}

