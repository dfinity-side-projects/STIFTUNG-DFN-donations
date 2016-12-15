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

var accounts;
var account;

// *
// *** Constants ***
// *

var ETHEREUM_CHK_FWD_INTERVAL = 1000; // not actual... pauses
var ETHEREUM_POLLING_INTERVAL = 5000; // the time we wait before re-polling Etheruem provider for new data
var ETHEREUM_CONN_MAX_RETRIES = 10;   // max number of retries to automatically selected Ethereum provider
var ETHEREUM_HOSTED_NODES = ["http://54.149.199.242:8545/", "http://54.202.187.131:8545"];
var ETHEREUM_LOCAL_NODE = "http://localhost:8545";


// -----------------------------------------------------------------------------
// TODO

// The following configuration needs changes for production:
// - Change defaultNetwork to `livenet`
// - Change FOUNDATION_ADDRESS to a valid livenet bitcoin address
// - Change HOSTED_NODES to a list of Insight root URLs
// - Adjust bitcoin polling interval (recommended: >10000)

var Insight = require('bitcore-explorers').Insight;
var bitcore = require('bitcore-lib');
bitcore.Networks.defaultNetwork = bitcore.Networks.livenet;

var BITCOIN_FOUNDATION_ADDRESS = 'mpraKTVqqgTxUpYDu1yHakrGLogRcYt5Xo'
var BITCOIN_HOSTED_NODES = ["hosted"];
var BITCOIN_HOSTED_NODE = BITCOIN_HOSTED_NODES[0];
var BITCOIN_CHK_FWD_INTERVAL = 5000;

var STATE_TBD = -888;
var STATE_INVALID_CONTRACT = -999;
var STATE_PAUSE = 0;
var STATE_EARLY_CONTRIB = 1;
var STATE_DON_PHASE0 = 2;
var STATE_DON_PHASE1 = 3;
var STATE_OFFCHAIN_REG = 4;
var STATE_FINALIZATION = 5;
var STATE_DONE = 6;


// -----------------------------------------------------------------------------

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
var FDCAddr = null;
var FDC_PRODUCTION_ADDR = "0xAeCdd1B710728FA68b85cF463e874Dd1b86F7C2A"


// FDC ABI signatures
var donateAs = "0d9543c5";
var donateAsWithChecksum = "ceadd9c8";


// *
// *** Application logic ***
// *

// Constructor
var App = function (userAccounts, testUI) {
    ui.logger("Initializing main extension application...");


    this.tryForwardBalance = true;    // try to forward wallet balance
    this.contFwdingOnNewData = false; // used to indicate set fwding on new poll data

    this.ethFwdTimeout = undefined;   // handle to current timer for Etheruem forwarding
    this.ethPollTimeout = undefined;  // handle to current timer for Ethereum polling
    this.ethConnectionRetries = 0;    // number consecutive provider connection fails
    this.saidBalanceTooSmall = false; // told user balance too small?
    this.lastBalanceSeen;             // last balance we saw
    this.ethConnected = -1;
    this.lastTxId = null;
    this.donationPhase = 0;           // seed funder
    this.ethBalance = undefined;      // balance of ETH forwarding wallet
    this.accs = userAccounts;
    this.lastTask = 'task-agree';
    this.lastEthereumNode = ETHEREUM_HOSTED_NODES[0];
    this.lastBitcoinNode = BITCOIN_HOSTED_NODE;
    this.donationState = STATE_TBD;;


    // Try Dev FDC param first, then default fdc addr, then local migration
    // TODO DISABLE THIS FOR FINAL VERSION!!!
    if (window.location.href.indexOf("fdc") != -1) {
        FDCAddr = getParameterByName("fdc", window.location.href);
        console.log("Using Custom FDC:" + FDCAddr)
    } else if (!FDC_PRODUCTION_ADDR) {
        FDCAddr = FDC.deployed().address;
        console.log("Using locally deployed FDC for testing:" + FDCAddr)
    } else if (FDC_PRODUCTION_ADDR) {
        FDCAddr = FDC_PRODUCTION_ADDR;
    }

    this.setCurrentTask(this.lastTask);
    this.setGenesisDFN(undefined);

    this.setUiUserAddresses();
    /*
     if (this.accs.ETH.addr != undefined && this.accs.DFN.addr != undefined) {
     ui.setUserAddresses(this.accs.ETH.addr, addrWithChecksum(this.accs.DFN.addr));
     }
     */
    ui.setUserSeed(undefined);

    this.setFunderChfReceived(undefined);
    // this.setEthereumNode(this.lastEthereumNode);
    // this.setBitcoinNode(this.lastBitcoinNode);

    this.loadNodes();

    ui.logger("Retrieving status from FDC contract: " + FDCAddr);

    // Create a new BitcoinHelper to gather BTC donations:
    this.btcWorker = new BitcoinWorker();

    // start polling the FDC for stats
    this.pollStatus();

    // start forwarding any ETH we see!
    this.tryForwardETH();

    ui.updateLocationBlocker();
}

/*
 * This is an async variation of the web3 connection test, which by default is synchronous and freezes the browser
 * on a bad node/connection.
 * @returns {boolean} - since it's async the return result is only based on previous set result.By default it's false.
 */
Web3.prototype.isConnectedAsync = function () {
    // console.log("isConnectedAsync () checking ...");

    try {
        this.currentProvider.sendAsync({
            id: 9999999999,
            jsonrpc: '2.0',
            method: 'net_listening',
            params: []
        }, function (error, result) {
            if (error != null) {
                app.ethConnected = 0;
            }
            else {
                app.ethConnected = 1;
            }
        });
        if (app.ethConnected == 1)
            return true;
        else
            return false;
    } catch (e) {
        return false;
    }
}

var lastTxHash = "";

// Forward any ETH we can see lying in our wallet as a donation!
App.prototype.tryForwardETH = function () {

    if (this.donationState != STATE_DON_PHASE0 && this.donationState != STATE_DON_PHASE1) {
        // console.log("Not in the right phase. Try again later");

        this.scheduleTryForwardETH();
        return;
    }


    if (this.ethFwdTimeout) clearTimeout(this.ethFwdTimeout);


    // we are forwarding, connected and have seen an ETH balance?
    if (!web3.isConnectedAsync()) {
        console.log("Not connected to web3. Trying later");

    }
    if (!this.tryForwardBalance || !web3.isConnectedAsync() ||
        this.ethBalance == undefined || this.ethBalance.equals(0)) {
        // try again later!

        // console.log("Web3 not connected or eth balance = 0. Try later.");
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
    } else {
        // yes...
        var self = this;
        var fdc = FDC.at(FDCAddr);

        this.saidBalanceTooSmall = false;
        var donating = web3.fromWei(this.ethBalance, 'ether');
        ui.logger("Attempting to forward " + donating + " ETH...");
        // will continue forwarding only on success!
        self.tryForwardBalance = false;
        self.contFwdingOnNewData = false;

        // do the donation
        var handleConnErr = function (e) {
            try {
                ui.logger("Error forwarding balance as donation: " + e + " " + JSON.stringify(e));
                ui.showErrorEthForwarding();
                // user must manually restart forwarding.. otherwise a smart contract
                // error would cause all their balance to be used up in gas when retrying!
            } finally {
                self.scheduleTryForwardETH();
            }
        }

        web3.eth.getTransactionCount(self.accs.ETH.addr, function (err, accNonce) {
            if (err) {
                handleConnErr(err);
                return;
            }


            var value = self.ethBalance.sub(MAX_DONATE_GAS_COST);
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
            tx.sign(privBuf)
            var signedTx = EthJSUtil.bufferToHex(tx.serialize());
            console.log("Attempt to send tx payload: " + signedTx);
            // check for duplicate tx in mempool
            if (self.lastTxId != null && web3.eth.getBlock("pending").transactions.includes(self.lastTxId)) {
                console.log("Same forwarding tx still in the queue ... " + self.lastTxId);
                self.scheduleTryForwardETH();
                return;
            }
            web3.eth.sendRawTransaction(signedTx, function (err, txID) {
                // Handle error. Ignore special err case where there's duplicate transaction problem (which is caused by
                // we attempt another fwding before previous one clears)
                if (err && err.toString().indexOf("with the same hash was already imported") == -1) {
                    handleConnErr(err);
                    return;
                }
                self.lastTxId = txID;
                try {
                    ui.logger("Successfully donated : " + donating + " ETH (txID=" + txID + ")");
                    self.contFwdingOnNewData = true; // start fowarding again on new data
                } finally {
                    self.scheduleTryForwardETH();
                }
            });
        });
    }
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
    this.contFwdingOnNewData = true;
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
                self.contFwdingOnNewData = true; // start fowarding again on new data
            } finally {
            }
        });
    });
}

// Poll Ethereum for status information from FDC and wallet
App.prototype.pollStatus = function () {
    if (this.ethPollTimeout) clearTimeout(this.ethPollTimeout);

    // connected?
    if (!web3.isConnectedAsync()) {
        if (this.ethConnectionRetries > 1)
            ui.logger("Still trying to connect to an Ethereum node...");
        // adjust connection if too many fails and appropriate
        this.adjustConnection(++this.ethConnectionRetries);
        // reschedule next polling
        if (this.ethConnectionRetries < ETHEREUM_CONN_MAX_RETRIES) {
            this.schedulePollStatus(); // bail, try later...
        } else {
            ui.logger("Max ETH node connection retries reached. Giving up for now. ");
        }
        return;
    }
    this.onEthereumConnect();
    if (this.ethConnectionRetries > 0) {
        ui.logger("Successfully connected to an Ethereum node.");
    }
    this.ethConnectionRetries = 0;


    var dfnAddr = this.accs.DFN.addr;
    var ethAddr = this.accs.ETH.addr;
    var btcAddr = this.accs.BTC.addr;

    // Address defined yet?
    if (this.accs.DFN.addr == undefined || this.accs.ETH.addr == undefined) {
        // this.schedulePollStatus(); // bail, try later...
        // return;

        // If addreses not defined, we'll put a dummy one for now in order to get aggregate stats
        dfnAddr = "-1";
        ethAddr = "-1";
        btcAddr = "-1";
    }


    // retrieve status information from the FDC...
    var self = this;
    var fdc = FDC.at(FDCAddr);


    var p = Promise.resolve();
    p = p.then(fdc.getStatus.call.bind(this, self.donationPhase, dfnAddr, ethAddr));
    p = p.then(function (res) {
        try {

            if (self.donationState == STATE_INVALID_CONTRACT) {
                // console.log("Not in right state. Skipping status poll processing.");
                return;
            }

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

            self.donationState = currentState;

            // update user interface with status info
            self.updateUI(currentState, fxRate, donationCount, totalTokenAmount,
                startTime, endTime, isTargetReached, chfCentsDonated, tokenAmount,
                self.ethBalance, donated);
        } finally {
            // do this all over again...
            self.schedulePollStatus();
        }
    })
        .catch(function (e) {
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
App.prototype.useSeed = function (s) {
    this.accs.generateKeys(s);
}


App.prototype.useNewSeed = function () {
    var seed = this.generateSeed();
    this.accs.generateKeys(seed);
    this.setUiUserAddresses();
    // this.accs = new Accounts(seed);
//    this.setUserAddresses(this.accs.ETH.addr, addrWithChecksum(this.accs.DFN.addr));
    ui.setUserSeed(seed);
    seed = "";
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
App.prototype.adjustConnection = function (retries) {

}

// Set current task given to user making donations
App.prototype.setCurrentTask = function (tId) {
    this.currentTask = tId;
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
            var nodeIndex = getRandomInt(0, ETHEREUM_HOSTED_NODES.length-1);
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
    this.saveNodes();

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
    // console.log("Set forwarded ETH: " + fe);
    this.forwardedETH = fe;
    ui.setForwardedETH(fe);
}

App.prototype.setRemainingETH = function (re) {
    this.remainingETH = re;
    ui.setRemainingETH(re);
}


App.prototype.setEthereumClientStatus = function (status) {
    this.ethClientStatus = status;
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
}

App.prototype.onEthereumDisconnect = function (errCode) {
    this.setEthereumClientStatus(errCode);
}

// BTC node
// Set the Bitcoin node we are connecting to
App.prototype.setBitcoinNode = function (host) {

    if (host == "hosted") {
        if (BITCOIN_HOSTED_NODES.length > 1) {
            var nodeIndex = getRandomInt(0, BITCOIN_HOSTED_NODES.length-1);
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
        var port = splits[splits.length - 1];
        if ((port.length < 2 && port.length > 5) || port.match(/^[0-9]+$/) == null) {
            ui.logger("Host string must end with valid port, e.g. \":3001\"");
            return;
        }
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

    this.saveNodes();

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
    } else {
        var message = "not connected";
        if (status) message += " (" + status + ")";

        ui.setBitcoinClientStatus(message);
    }
}

App.prototype.onBitcoinConnect = function () {
    this.setBitcoinClientStatus("OK");
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
        ui.showErrorBtcForwarding();
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
        dfinityAddress: this.accs.DFN.addr,
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
    ui.setUserAddresses(ETHAddr, BTCAddr, addrWithChecksum(DFNAddr));
}

App.prototype.setFunderChfReceived = function (chf) {
    this.funderChfReceived = chf;
    ui.setFunderTotalReceived(chf);
}

App.prototype.setGenesisDFN = function (dfn) {
    this.genesisDFN = dfn;
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
        "ethereum-node",
    ], function (s) {
        if (s["bitcoin-node"] != null) {
            self.setBitcoinNode(s["bitcoin-node"])
        } else {
            self.setBitcoinNode(self.lastBitcoinNode);
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

window.onload = function () {
    web3.eth.getAccounts(function (err, accs) {

        // First initialize UI wrapper so we can report errors to user
        console.log("Wiring up HTML DOM...");
        ui = new UI();
        ui.wireUpDOM();
        console.log("User interface ready.");

        // Initialize constants
        // TODO: dynamic gas price
        GAS_PRICE = web3.toBigNumber(20000000000); // 20 Shannon
        MIN_DONATION = web3.toWei('1', 'ether');
        MAX_DONATE_GAS = 200000; // highest measured gas cost: 138048
        MAX_DONATE_GAS_COST = web3.toBigNumber(MAX_DONATE_GAS).mul(GAS_PRICE);
        MIN_FORWARD_AMOUNT = web3.toBigNumber(MIN_DONATION).plus(MAX_DONATE_GAS_COST);

        VALUE_TRANSFER_GAS_COST = web3.toBigNumber(VALUE_TRANSFER_GAS).mul(GAS_PRICE);
        //
        // Load current account details from Storage
        //

        ui.logger("Restoring default account information from storage");

        //
        // Initialize our Ethereum accounts, and DFN private key
        // (if they exist already)
        //

        var userAccounts = new Accounts();


        // ui.logger("user accounts created");
        // console.log("userAccounts: " + JSON.stringify(userAccounts));
        ui.logger("Now starting application ... ");

        //
        // Bootstrap our app...
        //

        app = new App(userAccounts);
        //app = new App(account, account, true);

        ui.afterAppLoaded();
        // First attempt to load stored keys if any.
        // If loading fails, then simply wait user to generate new seed or import seed

        userAccounts.loadStates(function () {
            ui.setUserAddresses(app.accs.ETH.addr, app.accs.BTC.addr, addrWithChecksum(app.accs.DFN.addr));
            ui.readTerms();
            ui.disableTerms();
            ui.markSeedGenerated();
            ui.makeTaskDone('task-agree');
            ui.makeTaskDone('task-create-seed');
            ui.setCurrentTask('task-understand-fwd-eth');

            app.startBitcoinWorker();
        })
    });
}

