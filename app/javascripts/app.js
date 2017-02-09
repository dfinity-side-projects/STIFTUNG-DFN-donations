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

////// DEPENDENCIES //////

const G = window.DFNConstants;

// TODO
// The following configuration needs changes for production:
// - Change FOUNDATION_ADDRESS to a valid livenet bitcoin address
var Insight = require('bitcore-explorers').Insight;
var bitcore = require('bitcore-lib');
bitcore.Networks.defaultNetwork = bitcore.Networks.livenet;

// FDC address
var FDCAddr = null;

// *
// *** Application logic ***
// *

// Constructor
var App = function (userAccounts) {
    ui.logger("Initializing main extension application...");
    
    this.tryForwardBalance = true;    // try to forward wallet balance
    this.contFwdingOnNewData = false; // used to indicate set fwding on new poll data
    
    this.ethFwdTimeout = undefined;   // handle to current timer for Ethereum forwarding
    this.ethPollTimeout = undefined;  // handle to current timer for Ethereum polling
    this.ethConnectionRetries = 0;    // number of consecutive provider connection fails
    this.txWaitCycles = 0;            // waiting cycle counter since last tx submitted (to prevent unnecessarily resubmitting same tx)
    this.saidBalanceTooSmall = false; // told user balance too small?
    this.lastTxId = null;
    this.donationPhase = 0;           // seed funder
    this.ethBalance = undefined;      // balance of ETH forwarding wallet
    this.accs = userAccounts;
    this.ethNodesTried = {};          // map of nodes we tried / not tried so far
    this.donationState = G.STATE_TBD;
    
    // Start a regular ETH poller to update connection status
    this.ethPoller = new EthPoller(this.onEthereumConnect.bind(this), this.onEthereumDisconnect.bind(this));
    
    // Code for dev mode only
    if (!G.DEV_MODE) {
        FDCAddr = G.FDC_PRODUCTION_ADDR;
    } else {
        // Dev Mode: use truffle prev deployed instance
        FDCAddr = FDC.deployed().address;
    }
    
    // Reset to current task by default
    this.setCurrentTask("task-agree");
    this.setUiUserAddresses();
    this.setGenesisDFN(undefined);
    this.setFunderChfReceived(undefined);
    ui.setUserSeed(undefined);
    
    // Load & connect to previous saved node information if possible
    this.loadNodes();
    
    ui.logger("Retrieving status from FDC contract: " + FDCAddr);
    
    // Create a new BitcoinHelper to gather BTC donations:
    this.btcWorker = new BitcoinWorker();
    
    // start forwarding any ETH we see!
    this.tryForwardETH();
    
    // Block certain countries for regulatory reasons
    ui.updateLocationBlocker();
}

// Check all conditions before forwarding ETH
App.prototype.canForwardETH = function () {
    // Are we in right donation phase?
    if (this.donationState != G.STATE_DON_PHASE0 && this.donationState != G.STATE_DON_PHASE1) {
        return false;
    }
    
    // we are forwarding, connected and have seen an ETH balance?
    if (!this.tryForwardBalance || !this.ethPoller.isConnected() ||
        this.ethBalance == undefined || this.ethBalance.equals(0)) {
        return false;
    }
    
    // enough ETH in wallet to forward as donation?
    if (web3.toBigNumber(this.ethBalance).lt(G.MIN_FORWARD_AMOUNT)) {
        if (!this.saidBalanceTooSmall) {
            this.saidBalanceTooSmall = true;
            ui.logger("Waiting balance at forwarding address ... too small to donate (" +
                web3.fromWei(this.ethBalance, 'ether') + " ETH)");
        }
        return false;
    }
    return true;
}

///// Forward any ETH we can see lying in our wallet as a donation //////
App.prototype.tryForwardETH = function () {
    // Clear any other fwding attempts
    if (this.ethFwdTimeout) {
        clearTimeout(this.ethFwdTimeout);
    }
    
    // Check all mandatory states for forwarding
    if (!this.canForwardETH()) {
        this.scheduleTryForwardETH();
        return;
    }
    
    // Prepare to forward
    var self = this;
    
    if (self.ethForwarder == null)
        self.ethForwarder = new window.EthForwarder(self.accs, FDC.at(FDCAddr));
    
    // Reset flags
    self.saidBalanceTooSmall = false;
    self.contFwdingOnNewData = false;
    self.tryForwardBalance = false;
    self.ethForwarder.donate(self.ethBalance)
        .then(() => {
            try {
                ui.logger("Successfully donated: " + web3.fromWei(self.ethBalance, 'ether') + " ETH");
                // Resume next forwarding upon new data
                self.contFwdingOnNewData = true;
            } finally {
                self.scheduleTryForwardETH();
            }
        }).catch((e) => {
        try {
            // Show user the error message which allow manually retry forwarding
            ui.logger("Error forwarding balance as donation: " + JSON.stringify(e));
            ui.showErrorEthForwarding();
        } finally {
            // Schedule the forwarding thread, which won't actually fwd until user manually retry (because we haven't set flags here)
            self.scheduleTryForwardETH();
        }
    });
}

// reschedule...
App.prototype.scheduleTryForwardETH = function () {
    this.ethFwdTimeout = setTimeout(function () {
        app.tryForwardETH();
    }, G.ETHEREUM_CHK_FWD_INTERVAL);
}
// re-activate...
App.prototype.retryForwarding = function () {
    // stop showing user error box. We're back in business...
    ui.hideErrorEthForwarding();
    // flag we can continue forwarding available balance
    this.contFwdingOnNewData = true;
    this.tryForwardETH();
}

App.prototype.withdrawETH = function (toAddr) {
    var self = this;
    if (self.ethForwarder == null)
        self.ethForwarder = new window.EthForwarder(self.accs, FDC.at(FDCAddr));
    self.ethForwarder.withdrawETH(toAddr).then(() => {
        ui.logger("Successfully withdraw ETH. ");
        self.contFwdingOnNewData = true;
    }).catch((err) => {
        ui.logger("Failed to withdraw ETH ... " + JSON.stringify(err));
    });
    
}

// Poll Ethereum for status information from FDC and wallet
App.prototype.pollStatus = function () {
    if (this.ethPollTimeout) clearTimeout(this.ethPollTimeout);
    
    // connected?
    if (!this.ethPoller.isConnected()) {
        // reschedule next polling
        if (this.ethConnectionRetries < G.ETHEREUM_CONN_MAX_RETRIES) {
            this.schedulePollStatus(); // bail, try later...
        }
        return;
    }
    this.ethConnectionRetries = 0;
    var dfnAddr = this.accs.DFN.addr;
    var ethAddr = this.accs.ETH.addr;
    
    // Address defined yet?
    if (this.accs.DFN.addr == undefined || this.accs.ETH.addr == undefined) {
        // If addresses not defined, we'll put a dummy one for now in order to get aggregate stats
        dfnAddr = "-1";
        ethAddr = "-1";
    }
    
    // retrieve status information from the FDC...
    var self = this;
    var fdc = FDC.at(FDCAddr);
    
    var p = Promise.resolve();
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
    }, G.ETHEREUM_POLLING_INTERVAL);
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

// Adjust the connection after too many failures and try new node
App.prototype.adjustEthConnection = function () {
    var self = this;
    // Mark as tried
    self.ethNodesTried[this.ethereumNode] = true;
    
    for (var i in G.ETHEREUM_HOSTED_NODES) {
        var node = G.ETHEREUM_HOSTED_NODES[i];
        if (!self.ethNodesTried[node]) {
            ui.logger("Trying a different hosted node: " + node)
            self.ethConnectionRetries = 0;
            self.setETHNodeInternal(node);
            break;
        }
        if (i == G.ETHEREUM_HOSTED_NODES.length - 1) {
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
        if (G.ETHEREUM_HOSTED_NODES.length > 1) {
            var nodeIndex = getRandomInt(0, G.ETHEREUM_HOSTED_NODES.length - 1);
            this.setETHNodeInternal(G.ETHEREUM_HOSTED_NODES[nodeIndex]);
        } else {
            this.setETHNodeInternal(G.ETHEREUM_HOSTED_NODES[0]);
        }
        
    } else {
        host = host.replace(/(\r\n|\n|\r)/gm, ""); // line breaks
        host = host.replace(/\s/g, '') // all whitespace chars
        host = host.replace(/\/$/g, '')  // remove trailing "/"
        
        // Add a prefix http if none found
        if (host.match("^(?!http:)^(?!https:).*.*:[0-9]*[/]*$")) {
            host += "http://";
        }
        this.setETHNodeInternal(host);
    }
    this.accs.saveStates();
    
}

App.prototype.setETHNodeInternal = function (host) {
    ui.logger("Connecting to: " + host + "...");
    // this.setEthereumClientStatus('connecting...');
    this.ethConnectionRetries = 0;
    this.ethereumNode = host;
    ui.setEthereumNode(host);
    
    var provider = new web3.providers.HttpProvider(this.ethereumNode);
    web3.setProvider(provider);
    FDC.setProvider(provider);
    this.ethPoller.nodeChanged();
    
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
    ui.logger("Successfully connected to an etheruem node.")
    // Save nodes only if it's successfully connected
    this.saveNodes();
    
}

App.prototype.onEthereumDisconnect = function (errCode) {
    this.setEthereumClientStatus(errCode);
    this.ethConnectionRetries++;
    ui.logger("Still trying to connect to an Ethereum node...[Retry #" + this.ethConnectionRetries + "/" + G.ETHEREUM_CONN_MAX_RETRIES + "] ");
    if (this.ethConnectionRetries >= G.ETHEREUM_CONN_MAX_RETRIES) {
        this.adjustEthConnection();
    }
    
}

// BTC node
// Set the Bitcoin node we are connecting to
App.prototype.setBitcoinNode = function (host) {
    
    if (host == "hosted") {
        if (G.BITCOIN_HOSTED_NODES.length > 1) {
            var nodeIndex = getRandomInt(0, G.BITCOIN_HOSTED_NODES.length - 1);
            this.setBTCNodeInternal(G.BITCOIN_HOSTED_NODES[nodeIndex]);
        } else {
            this.setBTCNodeInternal(G.BITCOIN_HOSTED_NODES[0]);
        }
    } else {
        host = host.replace(/(\r\n|\n|\r)/gm, ""); // line breaks
        host = host.replace(/\s/g, '') // all whitespace chars
        host = host.replace(/\/$/g, '')  // remove trailing "/"
        
        // Add a prefix http if none found
        if (host.match("^(?!http:)^(?!https:).*.*:[0-9]*[/]*$")) {
            host += "http://";
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
        centralAddress: G.BITCOIN_FOUNDATION_ADDRESS,
        bitcoinProvider: this.bitcoinProvider,
        pollIntervalMs: G.BITCOIN_CHK_FWD_INTERVAL,
        
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
    
    // Reset ETH and Bitcoin forwarder
    this.ethForwarder = null;
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
            self.setBitcoinNode(G.DEFAULT_BITCOIN_NODE);
            self.setBitcoinClientStatus("tbc");
        }
        if (s["ethereum-node"] != null) {
            self.setEthereumNode(s["ethereum-node"])
        } else {
            self.setEthereumNode(G.DEFAULT_ETHEREUM_NODE);
        }
        // ui.logger("Etheruem and Bitcoin node info loaded from Chrome storage: " + s);
    });
}

// *
// *** Main ***
// *

var ui;  // user interface wrapper
var app; // our main application
var account; // maintain current acocunt

var initEthConstants = () => {
    G.GAS_PRICE = web3.toBigNumber(40000000000); // 40 Shannon
    G.MIN_DONATION = web3.toWei('1', 'ether');
    G.MAX_DONATE_GAS = 300000; // highest measured gas cost: 138048
    G.MAX_DONATE_GAS_COST = web3.toBigNumber(G.MAX_DONATE_GAS).mul(G.GAS_PRICE);
    G.MIN_FORWARD_AMOUNT = web3.toBigNumber(G.MIN_DONATION).plus(G.MAX_DONATE_GAS_COST);
    G.VALUE_TRANSFER_GAS_COST = web3.toBigNumber(G.VALUE_TRANSFER_GAS).mul(G.GAS_PRICE);
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
        app.pollStatus();
        app.startBitcoinWorker();
    });
};

