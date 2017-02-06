/**
 *  DFINITY Donation Chrome Extension
 *  (C) 2016 DFINITY Stiftung (http://dfinity.network)
 *
 *  This Chrome extension provides a guided process for user to donate Bitcoin or
 *  Ether, in return for DFINITY Network Participation Token (DFN) recommendation from
 *  DFINITY Stiftung, a Swiss non-profit dedicated to DFINITY Network research,
 *  development and promotion.
 *
 *  This client:
 *    - generates new seed and derive DFN address
 *    - forwards ETH/BTC from a temporary address (which is also derived from the same
 *      seed) to the Foundation Donation Contract(FDC). The FDC is a set of smart
 *      contracts running on Ethereum, which registers the donation and
 *      corresponding DFN token recommendation amount
 *    - requires connecting to a Ethereum node (regardless of Ether or Bitcoin donation)
 *    - requires connecting to a Bitcoin node for Bitcoin donation
 *    - can withdrawal remaining Eth from the temporary withdrawal address
 *
 *  Refer to FDC code for detailed logic on donation.
 *
 */
"use strict";

var account;

// *
// *** Constants ***
// *

var ETHEREUM_CHK_FWD_INTERVAL = 1000; // not actual... pauses
var ETHEREUM_POLLING_INTERVAL = 5000; // the time we wait before re-polling Etheruem provider for new data
var ETHEREUM_CONN_MAX_RETRIES = 10;   // max number of retries to automatically selected Ethereum provider
var ETHEREUM_MAX_TX_CYCLES = 10; // how many cycles of forwarding attempt should we timeout before making a second tx, roughly CHK_FWD_INTERVAL x Cycles
var ETHEREUM_HOSTED_NODES = ["http://eth.frankfurt.dfinity.build:80", "http://eth.tokyo.dfinity.build:80"];


// -----------------------------------------------------------------------------
// TODO

// The following configuration needs changes for production:
// - Change FOUNDATION_ADDRESS to a valid livenet bitcoin address
// - Change HOSTED_NODES to a list of Insight root URLs

var Insight = require('bitcore-explorers').Insight;
var bitcore = require('bitcore-lib');
bitcore.Networks.defaultNetwork = bitcore.Networks.livenet;

var BITCOIN_FOUNDATION_ADDRESS = '3P1wZiN6pgPkut1g56yQcgGCGXz63T8m7h'
var BITCOIN_HOSTED_NODES = ["http://btc.frankfurt.dfinity.build:80", "http://btc.tokyo.dfinity.build:80"];
var BITCOIN_CHK_FWD_INTERVAL = 10000;


// All possible states of FDC contract
const STATE_TBD = -888;
const STATE_PAUSE = 0;
const STATE_EARLY_CONTRIB = 1;
const STATE_DON_PHASE0 = 2;
const STATE_DON_PHASE1 = 3;
const STATE_OFFCHAIN_REG = 4;
const STATE_FINALIZATION = 5;
const STATE_DONE = 6;

// -----------------------------------------------------------------------------
// These constants will be initialized upon window load because of dependency on web3
var GAS_PRICE;                      // estimate price of gas
var MIN_DONATION;                   // minimum donation allowed
var MAX_DONATE_GAS;                 // maximum gas used making donation
var MAX_DONATE_GAS_COST;            // estimate maximum cost of gas used
var MIN_FORWARD_AMOUNT;             // minimum amount we will try to forward
const VALUE_TRANSFER_GAS = 21000;
var VALUE_TRANSFER_GAS_COST;

// FDC address
var FDCAddr = null;
var FDC_PRODUCTION_ADDR = "0x1Be116204bb55CB61c821a1C7866fA6f94b561a5"

var DEV_MODE = false;
var SHOW_XPUB = false;

// FDC ABI signatures
var donateAsWithChecksum = "ceadd9c8";


// *
// *** Application logic ***
// *

// Constructor
var App = function (userAccounts) {
    ui.logger("Initializing main extension application...");

    this.tryForwardBalance = true;    // try to forward wallet balance
    this.fwdingOnlyOnNewData = false; // used to indicate set fwding on new poll data

    this.ethFwdTimeout = undefined;   // handle to current timer for Ethereum forwarding
    this.ethPollTimeout = undefined;  // handle to current timer for Ethereum polling
    this.ethConnectionRetries = 0;    // number of consecutive provider connection fails
    this.txWaitCycles = 0;            // waiting cycle counter since last tx submitted (to prevent unnecessary resubmitting same tx)
    this.saidBalanceTooSmall = false; // told user balance too small?
    this.ethConnected = -1;
    this.lastTxId = null;
    this.donationPhase = 0;           // seed funder
    this.ethBalance = undefined;      // balance of ETH forwarding wallet
    this.accs = userAccounts;
    this.ethNodesTried = {};
    this.lastTask = 'task-agree';
    this.lastEthereumNode = "hosted";
    this.lastBitcoinNode = "hosted";
    this.donationState = STATE_TBD;

    // Code for dev mode only
    if (!DEV_MODE) {
        FDCAddr = FDC_PRODUCTION_ADDR;
    } else {
        // Dev Mode: use truffle prev deployed instance
        FDCAddr = FDC.deployed().address;
    }

    this.setCurrentTask(this.lastTask);
    this.setGenesisDFN(undefined);
    this.setUiUserAddresses();
    this.setFunderChfReceived(undefined);


    ui.setUserSeed(undefined);

    // Load previous saved node information if possible
    this.loadNodes();

    ui.logger("Retrieving status from FDC contract: " + FDCAddr);

    // Create a new BitcoinHelper to gather BTC donations:
    this.btcWorker = new BitcoinWorker();

    // start forwarding any ETH we see!
    this.tryForwardETH();

    ui.updateLocationBlocker();
}

/*
 * This is an async variation of the web3 connection test, which by default is synchronous and freezes the browser
 * on a bad node/connection.
 * @returns {boolean} - since it's async the return result is only based on previous set result. By default it's false.
 */
Web3.prototype.isConnectedAsync = function (success, err) {
    // console.log("isConnectedAsync () checking ...");

    try {
        this.currentProvider.sendAsync({
            id: 9999999999,
            jsonrpc: "2.0",
            method: 'net_listening',
            params: []
        }, function (error, result) {
            if (error != null) {
                app.ethConnected = 0;
                if (err) {
                    err();
                }
            }
            else {
                app.ethConnected = 1;
                if (success) {
                    success();
                }
            }
        });
        if (app.ethConnected == 1) {
            return true;

        }
        else {
            return false;
        }
    } catch (e) {
        return false;
    }
}

// Forward any ETH we can see lying in our wallet as a donation!
App.prototype.tryForwardETH = function () {

    // Are we in right donation phase?
    if (this.donationState != STATE_DON_PHASE0 && this.donationState != STATE_DON_PHASE1) {
        this.scheduleTryForwardETH();
        return;
    }

    // Clear any other fwding attempts
    if (this.ethFwdTimeout) {
        clearTimeout(this.ethFwdTimeout);
    }


    var isConnected = web3.isConnectedAsync(this.setEthereumClientStatus.bind(ui, "OK"));


    // we are forwarding, connected and have seen an ETH balance?
    if ((this.fwdingOnlyOnNewData && !this.tryForwardBalance) || !isConnected ||
        this.ethBalance == undefined || this.ethBalance.equals(0)) {
        if (!isConnected) {
            this.setEthereumClientStatus("disconnected");
            console.log("Not connected to web3. Can't forward ETH. Trying later");
        }

        // try again later!
        this.scheduleTryForwardETH();
        return;
    }


    // enough ETH in wallet to forward as donation?
    if (web3.toBigNumber(this.ethBalance).lt(MIN_FORWARD_AMOUNT)) {
        if (!this.saidBalanceTooSmall) {
            this.saidBalanceTooSmall = true;
            ui.logger("Waiting balance at forwarding address ... too small to donate (" +
                web3.fromWei(this.ethBalance, 'ether') + " ETH)");
        }
        this.scheduleTryForwardETH();
        return;

    }

    // Prepare to forward

    var self = this;

    this.saidBalanceTooSmall = false;

    self.fwdingOnlyOnNewData = false;
    self.tryForwardBalance = false;

    // handle connection error issues
    var handleConnErr = function (e) {
        try {
            ui.logger("Error forwarding balance as donation: " + JSON.stringify(e));
            ui.showErrorEthForwarding();

        } finally {
            self.fwdingOnlyOnNewData = true;
            // user must manually restart forwarding.. otherwise a smart contract
            // error would cause all their balance to be used up in gas when retrying!
        }
    }
    var donating = web3.fromWei(self.ethBalance, 'ether');

    web3.eth.getTransactionCount(self.accs.ETH.addr, function (err, accNonce) {
        if (err) {
            handleConnErr(err);
            return;
        }

        var value = web3.eth.getBalance(self.accs.ETH.addr).sub(MAX_DONATE_GAS_COST);
        var txData = "0x" + packArg2(donateAsWithChecksum, self.accs.DFN.addr, addrChecksum(self.accs.DFN.addr));
        // console.log("txData:" + txData);
        var dataBuf = EthJSUtil.toBuffer(txData);
        // console.log("txData:" + EthJSUtil.bufferToHex(dataBuf));

        var txObj = {};
        txObj.to = FDCAddr;
        txObj.gasPrice = web3.toHex(GAS_PRICE);
        txObj.gasLimit = web3.toHex(MAX_DONATE_GAS);
        txObj.nonce = accNonce;
        txObj.data = dataBuf
        txObj.value = web3.toHex(value);

        var tx = new EthJS(txObj);
        var privBuf = EthJSUtil.toBuffer(self.accs.ETH.priv);
        tx.sign(privBuf);
        var signedTx = EthJSUtil.bufferToHex(tx.serialize());
        console.log("tx payload to be sent: " + signedTx);

        var hash = "0x" + tx.hash(true).toString('hex');

        // check for duplicate tx
        console.log(hash);

        // De-duping tx that might be: a) just submitted very recently b) in the pending block of the node
        // or (c) already mined but somehow missed
        if ((self.lastTxId == hash && self.txWaitCycles < ETHEREUM_MAX_TX_CYCLES)
            || web3.eth.getBlock("pending").transactions.includes(hash)

        ) {
            console.log("Same forwarding tx is in the queue... " + self.lastTxId);
            self.fwdingOnlyOnNewData = true;
            if (self.lastTxId == hash) {
                self.txWaitCycles++;
            }
            self.scheduleTryForwardETH();
            return;
        }
        if ((self.lastTxId == hash && self.txWaitCycles >= ETHEREUM_MAX_TX_CYCLES)) {
            handleConnErr("Timeout waiting for previous forwarding transaction. Check your Ethereum node connection or Retry manually");
            self.fwdingOnlyOnNewData = true;
            return;
        }

        // Detect if a previous tx exist and has exception. Stop and warn user, so we don't drain the balance on gas
        if (self.lastTxId != null) {
            var txReceipt = web3.eth.getTransactionReceipt(self.lastTxId);
            console.log("Tx Receipt: " + txReceipt);
            if (txReceipt != null) {
                // Likely an exception if gas used == max gas
                console.log("*** Gas used vs. max gas: " + txReceipt["gasUsed"] + "//" + MAX_DONATE_GAS);
                self.lastTxId = null;

                if (MAX_DONATE_GAS == txReceipt["gasUsed"]) {
                    handleConnErr("Previous tx likely caused an exception (used up all the gas available). Check if the donation has ended, or retry later.")
                    self.fwdingOnlyOnNewData = true;
                    return;
                } else {
                    self.fwdingOnlyOnNewData = true;
                    self.scheduleTryForwardETH();
                    console.log("Already mined the tx. ")
                    return;
                }
                // Reset the last tx id, as it's now clear
            }
        }


        ui.logger("Attempting to forward " + donating + " ETH...");

        // Let's do it!
        web3.eth.sendRawTransaction(signedTx, function (err, txID) {
            // Handle error. Ignore occasional err msg from Parity where there's duplicate transaction problem (which is caused by
            // we attempt another fwding before previous one clears). This shouldn't occur frequently as it should be
            // taken care of with previous duplicate tx detection.
            if (err && err.toString().indexOf("with the same hash was already imported") == -1) {
                handleConnErr(err);
                return;
            } else if (err && err.toString().indexOf("with the same hash was already imported") != -1) {
                self.fwdingOnlyOnNewData = true;
                self.scheduleTryForwardETH();
                return;
            }

            self.lastTxId = txID; // Record the tx id for future comparison
            try {
                ui.logger("Broadcasted donation forwarding: " + donating + " ETH (txID=" + txID + ")");
                self.txWaitCycles = 0;
                self.fwdingOnlyOnNewData = true; // start forwarding again only on new data incoming
            } finally {
                self.scheduleTryForwardETH();
            }
        });
    });


}

// reschedule...
App.prototype.scheduleTryForwardETH = function () {
    this.ethFwdTimeout = setTimeout(function () {
        app.tryForwardETH();
    }, ETHEREUM_CHK_FWD_INTERVAL);
}
// re-activate...
App.prototype.retryForwarding = function () {
    // stop showing user error box. We're back in business...
    ui.hideErrorEthForwarding();
    // flag we can continue forwarding available balance
    this.fwdingOnlyOnNewData = true;
    this.tryForwardETH();
}

App.prototype.withdrawETH = function (toAddr) {
    var self = this;
    web3.eth.getTransactionCount(self.accs.ETH.addr, function (err, accNonce) {
        if (err) {
            ui.logger("Withdraw failed - unable to get transaction information for the forwarding address. Check your Ethereum node connection.")
            return;
        }

        var bal = web3.eth.getBalance(self.accs.ETH.addr);
        var value = bal.sub(VALUE_TRANSFER_GAS_COST);
        if (value.isNegative() || value.isZero()) {
            ui.logger("Withdraw failed - not enough balance to withdraw");
            return;
        }

        var txObj = {};
        txObj.to = toAddr;
        txObj.gasPrice = web3.toHex(GAS_PRICE);
        txObj.gasLimit = web3.toHex(VALUE_TRANSFER_GAS);
        txObj.nonce = accNonce;
        txObj.data = EthJSUtil.toBuffer("");
        txObj.value = web3.toHex(value);

        var tx = new EthJS(txObj);
        var privBuf = EthJSUtil.toBuffer(self.accs.ETH.priv);
        tx.sign(privBuf)
        var signedTx = EthJSUtil.bufferToHex(tx.serialize());

        web3.eth.sendRawTransaction(signedTx, function (err, txID) {
            if (err) {
                ui.logger("Withdraw failed - failed to send the transaction. Check your Ethereum node connection. " + err);
                return;
            }
            try {
                ui.logger("Sent withdraw tx: " + value + " ETH (txID=" + txID + ")");
                self.fwdingOnlyOnNewData = true; // start fowarding again on new data
            } finally {
            }
        });
    });
}

// Poll Ethereum for status information from FDC and wallet
App.prototype.pollStatus = function (firstTry) {
    if (this.ethPollTimeout) clearTimeout(this.ethPollTimeout);

    var isConnected = web3.isConnectedAsync(this.setEthereumClientStatus.bind(ui, "OK"));

    // connected?
    if (!isConnected && !firstTry) {
        console.log("Unsuccessful polling status from FDC, scheduling retry 5 seconds later");
        if (this.ethConnectionRetries > 1)
            ui.logger("Still trying to connect to an Ethereum node...[Retry #" + this.ethConnectionRetries + "/" + ETHEREUM_CONN_MAX_RETRIES + "] ");
        // adjust connection if too many fails and appropriate
        this.ethConnectionRetries++;
        // reschedule next polling
        if (this.ethConnectionRetries < ETHEREUM_CONN_MAX_RETRIES) {
            this.schedulePollStatus(); // bail, try later...
        } else {
            this.adjustConnection();
        }
        return;
    }
    if (this.ethConnectionRetries > 0 && isConnected) {
        ui.logger("Successfully connected to an Ethereum node.");
        this.onEthereumConnect();
        this.setEthereumClientStatus("OK");
    }
    this.ethConnectionRetries = 0;

    var dfnAddr = this.accs.DFN.addr;
    var ethAddr = this.accs.ETH.addr;
    var btcAddr = this.accs.BTC.addr;

    // Address defined yet?
    if (this.accs.DFN.addr == undefined || this.accs.ETH.addr == undefined) {
        // If addresses not defined, we'll put a dummy one for now in order to get aggregate stats
        dfnAddr = "-1";
        ethAddr = "-1";
        btcAddr = "-1";
    }

    // retrieve status information from the FDC...
    var self = this;
    var fdc = FDC.at(FDCAddr);

    var p = Promise.resolve();
    // console.log("Querying using dfnAddr: " + dfnAddr);
    p = p.then(fdc.getStatus.call.bind(this, self.donationPhase, dfnAddr, ethAddr));
    p = p.then(function (res) {
        try {
            // parse status data
            var currentState = res[0];      // current state (an enum)
            var fxRate = res[1];            // exchange rate of CHF -> ETH (Wei/CHF)
            var donationCount = res[3];     // total individual donations made (a count)
            var totalTokenAmount = res[4];  // total DFN planned allocated to donors
            var startTime = res[5];         // expected start time of specified donation phase
            var endTime = res[6];           // expected end time of specified donation phase
            var isTargetReached = res[7];   // whether phase target has been reached
            var chfCentsDonated = res[8];   // total value donated in specified phase as CHF
            if (ethAddr != -1 && dfnAddr != -1) {
                var tokenAmount = res[9];       // total DFN planned allocted to donor (user)
                var ethFwdBalance = res[10];    // total ETH (in Wei) waiting in forwarding address
                var donated = res[11];          // total ETH (in Wei) donated so far
            }

            // if the forwarding balance has changed, then we may have to inform the user
            // that it is "still" too small
            if (self.ethBalance != undefined && !self.ethBalance.equals(ethFwdBalance)) {
                self.saidBalanceTooSmall = false;
            }
            // console.log("*** Got new eth balance: " + ethFwdBalance);
            self.ethBalance = ethFwdBalance;

            // new data means we can restart forwarding...
            // - we do this b/c if the user has just failed to forward due to an
            // exception, their balance will have decreased due to gas consumption.
            // We need to refresh their balance before trying to forward again or
            // we will try to send more than we have. There is a race condition here
            // but unlikely to trigger and doesn't cost user money just error msg.
            if (self.fwdingOnlyOnNewData) {
                self.tryForwardBalance = true;
            }

            self.donationState = currentState;

            // update user interface with status info
            self.updateUI(currentState, fxRate, donationCount, totalTokenAmount,
                startTime, endTime, isTargetReached, chfCentsDonated, tokenAmount,
                self.ethBalance, donated);
        } finally {
            // do this all over again...
            self.schedulePollStatus();
        }
    }).catch(function (e) {
        try {
            ui.logger("Error querying Ethereum: " + e + " " + JSON.stringify(e));
            throw e;
        } finally {
            // do this all over again...
            self.schedulePollStatus();
        }
    });
}

// reschedule...
App.prototype.schedulePollStatus = function () {
    this.ethPollTimeout = setTimeout(function () {
        app.pollStatus();
    }, ETHEREUM_POLLING_INTERVAL);
}

App.prototype.generateSeed = function () {
    var seed = this.accs.generateSeed().trim();
    return seed;
}

// Update the UI with retrieved status information
App.prototype.updateUI = function (currentState, fxRate, donationCount,
                                   totalTokenAmount, startTime, endTime, isTargetReached, chfCentsDonated,
                                   tokenAmount, fwdBalance, donated) {

    ui.setDonationState(currentState, startTime);
    ui.setGenesisDFN(tokenAmount);
    ui.setFunderTotalReceived(chfCentsDonated / 100);
    ui.setForwardedETH(web3.fromWei(donated, 'ether'));
    ui.setRemainingETH(web3.fromWei(fwdBalance, 'ether'));
}

// Adjust the connection after too many failures e.g. try new full node
App.prototype.adjustConnection = function () {
    var self = this;
    // Mark as tried
    self.ethNodesTried[this.ethereumNode] = true;

    for (var i in ETHEREUM_HOSTED_NODES) {
        var node = ETHEREUM_HOSTED_NODES[i];
        if (!self.ethNodesTried[node]) {
            ui.logger("Trying a different hosted node: " + node)
            self.ethConnectionRetries = 0;
            self.setETHNodeInternal(node);
            break;
        }
        if (i == ETHEREUM_HOSTED_NODES.length -1) {
            ui.logger("Can't connect to any of the hosted nodes. Please check your Internet connection and refresh the page.")
            this.setBitcoinClientStatus('error connecting');
        }
    }

}

// Set current task given to user making donations
App.prototype.setCurrentTask = function (tId) {
    ui.setCurrentTask(tId);
}

// ETH node
// Set the Etheruem full node we are connecting to
App.prototype.setEthereumNode = function (host) {
    // console.log("Set Ethereum node: " + host);

    if (host == "hosted") {
        // TODO: add logic to randomly choose which hosted node to connect to
        // TODO: add fallback logic if one hosted node is down
        if (ETHEREUM_HOSTED_NODES.length > 1) {
            var nodeIndex = getRandomInt(0, ETHEREUM_HOSTED_NODES.length - 1);
            this.setETHNodeInternal(ETHEREUM_HOSTED_NODES[nodeIndex]);
        } else {
            this.setETHNodeInternal(ETHEREUM_HOSTED_NODES[0]);
        }

    } else {
        host = host.replace(/(\r\n|\n|\r)/gm, ""); // line breaks
        host = host.replace(/\s/g, '') // all whitespace chars
        host = host.replace(/\/$/g, '')  // remove trailing "/"

        // Add a prefix http if none found
        if (host.match("^(?!http:)^(?!https:).*.*:[0-9]*[/]*$")) {
            host += "http://";
        }
        var splits = host.split(':');
        var port = splits[splits.length - 1];
        if ((port.length < 2 && port.length > 5) || port.match(/^[0-9]+$/) == null) {
            ui.logger("Host string must end with valid port, e.g. \":8545\"");
            return;
        }
        this.setETHNodeInternal(host);
    }
    this.accs.saveStates();

}

App.prototype.setETHNodeInternal = function (host) {
    ui.logger("Connecting to: " + host + "...");
    this.setEthereumClientStatus('connecting...');
    this.ethConnected = 0;
    this.ethConnectionRetries = 0;
    this.ethereumNode = host;
    ui.setEthereumNode(host);

    var provider = new web3.providers.HttpProvider(this.ethereumNode);
    web3.setProvider(provider);
    FDC.setProvider(provider);

    // Instantly connect to new node to fetch status
    this.pollStatus();
}

App.prototype.setForwardedETH = function (fe) {
    ui.setForwardedETH(fe);
}

App.prototype.setRemainingETH = function (re) {
    ui.setRemainingETH(re);
}


App.prototype.setEthereumClientStatus = function (status) {
    if (status == "OK") {
        // ui.logger("Connected successfully to an Etheruem node");
        ui.setEthereumClientStatus("&#10004 connected, forwarding...");

        // now we're connected, grab all the values we need
        // this.pollStatus();
    } else
        ui.setEthereumClientStatus("not connected (" + status + ")");
}

App.prototype.onEthereumConnect = function () {
    this.setEthereumClientStatus("OK");

    // Save nodes only if it's successfully connected
    this.saveNodes();

}

App.prototype.onEthereumDisconnect = function (errCode) {
    this.setEthereumClientStatus(errCode);
}

// BTC node
// Set the Bitcoin node we are connecting to
App.prototype.setBitcoinNode = function (host) {

    if (host == "hosted") {
        if (BITCOIN_HOSTED_NODES.length > 1) {
            var nodeIndex = getRandomInt(0, BITCOIN_HOSTED_NODES.length - 1);
            this.setBTCNodeInternal(BITCOIN_HOSTED_NODES[nodeIndex]);
        } else {
            this.setBTCNodeInternal(BITCOIN_HOSTED_NODES[0]);
        }
    } else {
        host = host.replace(/(\r\n|\n|\r)/gm, ""); // line breaks
        host = host.replace(/\s/g, '') // all whitespace chars
        host = host.replace(/\/$/g, '')  // remove trailing "/"

        // Add a prefix http if none found
        if (host.match("^(?!http:)^(?!https:).*.*:[0-9]*[/]*$")) {
            host += "http://";
        }
        var splits = host.split(':');
        // var port = splits[splits.length - 1];
        // if ((port.length < 2 && port.length > 5) || port.match(/^[0-9]+$/) == null) {
        //     ui.logger("Host string must end with valid port, e.g. \":3001\"");
        //     return;
        // }
        this.setBTCNodeInternal(host);
    }
    this.accs.saveStates();

}

App.prototype.setBTCNodeInternal = function (host) {
    ui.logger("Connecting to: " + host + "...");
    this.setBitcoinClientStatus('connecting...');
    this.btcConnected = 0;
    this.btcConnectionRetries = 0;
    this.bitcoinNode = host;
    ui.setBitcoinNode(host);

    this.bitcoinProvider = this.bitcoinNode !== 'hosted' ?
        new Insight(this.bitcoinNode) :
        new Insight();


}

App.prototype.setForwardedBTC = function (fb) {
    this.forwardedBTC = fb;
    ui.setForwardedBTC(fb);
}

App.prototype.setRemainingBTC = function (rb) {
    this.remainingBTC = rb;
    ui.setRemainingBTC(rb);
}

App.prototype.retryForwardingBtc = function () {
    ui.hideErrorBtcForwarding();
    this.setBitcoinClientStatus('retrying');
    this.startBitcoinWorker();
}

App.prototype.withdrawBtc = function (toAddr) {
    this.btcWorker.tryRefundBTC(toAddr)
}

App.prototype.setBitcoinClientStatus = function (status) {
    this.btcClientStatus = status;
    if (status == "OK") {
        // ui.logger("Connected successfully to an Etheruem node");
        ui.setBitcoinClientStatus("&#10004 connected, forwarding...");

        // now we're connected, grab all the values we need
        // this.pollStatus();
    } else if (status == "tbc") {
        ui.setBitcoinClientStatus("to be connected automatically")
    } else {
        var message = "not connected";
        if (status) message += " (" + status + ")";

        ui.setBitcoinClientStatus(message);
    }
}

App.prototype.onBitcoinConnect = function () {
    this.setBitcoinClientStatus("OK");
    // Save nodes only if it's successfully connected
    this.saveNodes()
}

App.prototype.onBitcoinDisconnect = function (errCode) {
    this.setBitcoinClientStatus(errCode);
}

App.prototype.onBitcoinError = function (err) {
    var isConnectionError = (err.cors === 'rejected')
    if (isConnectionError) {
        ui.setBitcoinClientStatus('connecting...');

    } else {
        this.btcWorker.stop();
        ui.setBitcoinClientStatus('error');
        ui.showErrorBtcForwarding(err);
    }
}

App.prototype.startBitcoinWorker = function () {
    var self = this;

    function onConnectionChange(isConnected) {
        if (isConnected) self.onBitcoinConnect(); else self.onBitcoinDisconnect();
    }

    function onError(err) {
        self.onBitcoinError(err)
    }

    this.btcWorker.start({
        privateKey: this.accs.BTC.priv,
        clientDfinityData: addrWithChecksum(this.accs.DFN.addr).slice(2),
        centralAddress: BITCOIN_FOUNDATION_ADDRESS,
        bitcoinProvider: this.bitcoinProvider,
        pollIntervalMs: BITCOIN_CHK_FWD_INTERVAL,

        onConnectionChange: onConnectionChange,
        onError: onError,
    });
}


// Set the user's DFN addr & ETH forwarding addr in the UI
App.prototype.setUiUserAddresses = function () {
    var ETHAddr = this.accs.ETH.addr;
    var BTCAddr = this.accs.BTC.addr;
    var DFNAddr = this.accs.DFN.addr;
    var DFNAcct = this.accs.DFNAccount.xpub;
    ui.setUserAddresses(ETHAddr, BTCAddr, addrWithChecksum(DFNAddr), DFNAcct);
}

App.prototype.setFunderChfReceived = function (chf) {
    ui.setFunderTotalReceived(chf);
}

App.prototype.setGenesisDFN = function (dfn) {
    ui.setGenesisDFN(dfn);
}

App.prototype.doImportSeed = function (seed) {
    this.accs.generateKeys(seed);
    this.accs.saveStates();
    this.setUiUserAddresses();

    app.startBitcoinWorker();
}


App.prototype.saveNodes = function () {
    var self = this;
    if (self.bitcoinNode) {
        saveToStorage({
            "bitcoin-node": self.bitcoinNode,

        }, function () {
            // ui.logger("Bitcoin node info saved in Chrome storage.");
        });
    }
    if (self.ethereumNode) {
        saveToStorage({
            "ethereum-node": self.ethereumNode
        }, function () {
            // ui.logger("Ethereum node info saved in Chrome storage.");
        });
    }

}

App.prototype.loadNodes = function () {
    var self = this;
    loadfromStorage([
        "bitcoin-node",
        "ethereum-node"
    ], function (s) {
        if (s["bitcoin-node"] != null) {
            self.setBitcoinNode(s["bitcoin-node"])
        } else {
            self.setBitcoinNode(self.lastBitcoinNode);
            self.setBitcoinClientStatus("tbc");
        }
        if (s["ethereum-node"] != null) {
            self.setEthereumNode(s["ethereum-node"])
        } else {
            self.setEthereumNode(self.lastEthereumNode);
        }
        // ui.logger("Etheruem and Bitcoin node info loaded from Chrome storage: " + s);
    });
}


// *
// *** Main ***
// *

var ui;  // user interface wrapper
var app; // our main application

var initEthConstants = () => {
    GAS_PRICE = web3.toBigNumber(40000000000); // 20 Shannon
    MIN_DONATION = web3.toWei('1', 'ether');
    MAX_DONATE_GAS = 300000; // highest measured gas cost: 138048
    MAX_DONATE_GAS_COST = web3.toBigNumber(MAX_DONATE_GAS).mul(GAS_PRICE);
    MIN_FORWARD_AMOUNT = web3.toBigNumber(MIN_DONATION).plus(MAX_DONATE_GAS_COST);

    VALUE_TRANSFER_GAS_COST = web3.toBigNumber(VALUE_TRANSFER_GAS).mul(GAS_PRICE);
}

window.onload = function () {

    // First initialize UI wrapper so we can report errors to user
    console.log("Wiring up HTML DOM...");
    ui = new UI();
    ui.wireUpDOM();
    console.log("User interface ready.");

    // Initialize constants
    initEthConstants();

    ui.logger("Restoring default account information from storage");

    // Initialize our Ethereum accounts, and DFN private key
    // (if they exist already)
    var userAccounts = new Accounts();
    ui.logger("Now starting application ... ");

    // Bootstrap our app...
    app = new App(userAccounts);

    // Now that app is loaded, let UI do some initialization work that depends upon App
    ui.afterAppLoaded();

    // First attempt to load stored keys if any.
    // If loading fails, then simply wait user to generate new seed or import seed
    userAccounts.loadStates(function () {
        // Load user addresses from saved state
        app.setUiUserAddresses();

        // Skip all terms and seed generation steps
        ui.readTerms();
        ui.disableTerms();
        ui.markSeedGenerated();
        ui.makeTaskDone('task-agree');
        ui.makeTaskDone('task-create-seed');
        ui.setCurrentTask('task-understand-fwd-eth');

        // Update current connection status immediately and start Bitcoin worker
        app.pollStatus(true);
        app.startBitcoinWorker();
    });
};

