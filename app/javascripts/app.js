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


// -----------------------------------------------------------------------------
// TODO

// The following configuration needs changes for production:
// - Change defaultNetwork to `livenet`
// - Change FOUNDATION_ADDRESS to a valid livenet bitcoin address
// - Change HOSTED_NODES to a list of Insight root URLs
// - Adjust bitcoin polling interval (recommended: >10000)

var Insight = require('bitcore-explorers').Insight;
var bitcore = require('bitcore-lib');
bitcore.Networks.defaultNetwork = bitcore.Networks.testnet;

var BITCOIN_FOUNDATION_ADDRESS = 'mpraKTVqqgTxUpYDu1yHakrGLogRcYt5Xo'
var BITCOIN_HOSTED_NODES = ["hosted"];
var BITCOIN_HOSTED_NODE = BITCOIN_HOSTED_NODES[0];
var BITCOIN_CHK_FWD_INTERVAL = 5000;

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
// for PRODUCTION version: place hard-coded constant here
var FDCAddr = FDC.deployed().address;

// FDC ABI signatures
var donateAs = "0d9543c5";
var donateAsWithChecksum = "ceadd9c8";

// *
// *** Application logic ***
// *

// Constructor
var App = function (userAccounts, testUI) {
    ui.logger("Initializing main extension application...");

    if (testUI) {
        this.setDummyDisplayValues();
        return;
    }

    this.tryForwardBalance = true;    // try to forward wallet balance
    this.contFwdingOnNewData = false; // used to indicate set fwding on new poll data

    this.ethFwdTimeout = undefined;   // handle to current timer for Etheruem forwarding
    this.ethPollTimeout = undefined;  // handle to current timer for Ethereum polling
    this.ethConnectionRetries = 0;    // number consecutive provider connection fails
    this.saidBalanceTooSmall = false; // told user balance too small?
    this.lastBalanceSeen;             // last balance we saw
    this.ethConnected = -1;
    this.donationPhase = 0;           // seed funder
    this.ethBalance = undefined;      // balance of ETH forwarding wallet
    this.accs = userAccounts;
    this.lastTask = 'task-agree';
    this.lastEthereumNode = ETHEREUM_LOCAL_NODE;
    this.lastBitcoinNode = BITCOIN_HOSTED_NODE;

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
    this.setEthereumNode(this.lastEthereumNode);
    this.setBitcoinNode(this.lastBitcoinNode);

    ui.logger("Retrieving status from FDC contract: " + FDC.deployed().address);

    // Create a new BitcoinHelper to gather BTC donations:
    this.btcWorker = new BitcoinWorker();

    // start polling the FDC for stats
    this.pollStatus();

    // start forwarding any ETH we see!
    this.tryForwardETH();

    // start forwarding any BTC we see!
    // TODO: add this
    //this.tryForwardBTC();

    ui.updateLocationBlocker();
}

/*
 * This is an async variation of the web3 connection test, which by default is synchronous and freezes the browser
 * on a bad node/connection.
 * @returns {boolean} - since it's async the return result is only based on previous set result.By default it's false.
 */
Web3.prototype.isConnectedAsync = function() {
    // console.log("isConnectedAsync () checking ...");

    try {
        this.currentProvider.sendAsync({
            id: 9999999999,
            jsonrpc: '2.0',
            method: 'net_listening',
            params: []
        }, function(error, result) {
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
    } catch(e) {
        return false;
    }
}

// Forward any ETH we can see lying in our wallet as a donation!
App.prototype.tryForwardETH = function () {

    if (this.ethFwdTimeout) clearTimeout(this.ethFwdTimeout);


    // we are forwarding, connected and have seen an ETH balance?
    if (!web3.isConnectedAsync()) {
        console.log("Not connected to web3. Trying later");
    }
    if (!this.tryForwardBalance || !web3.isConnectedAsync() ||
        this.ethBalance == undefined || this.ethBalance.equals(0)) {
        // try again later!

        this.scheduleTryForwardETH();

        return;
    }

    // enough ETH in wallet to foward as donation?
    if (web3.toBigNumber(this.ethBalance).lt(MIN_FORWARD_AMOUNT)) {
        if (!this.saidBalanceTooSmall) {
            this.saidBalanceTooSmall = true;
            ui.logger("Waiting balance at forwarding address too small to donate (" +
                web3.fromWei(this.ethBalance, 'ether') + " ETH)");
        }
        this.scheduleTryForwardETH();
    } else {
        // yes...
        var self = this;
        var fdc = FDC.deployed();
        this.saidBalanceTooSmall = false;
        var donating = web3.fromWei(this.ethBalance, 'ether');
        ui.logger("Forwarding " + donating + " ETH...");
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

            web3.eth.sendRawTransaction(signedTx, function (err, txID) {
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

// TODO: merge common parts of tx handling for forwarding and withdrawal
App.prototype.withdrawETH = function (toAddr) {
    var self = this;
    web3.eth.getTransactionCount(self.accs.ETH.addr, function (err, accNonce) {
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
            ui.logger("Not enough balance to withdraw");
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
                // TODO: error handling
                console.log("could not send raw tx: " + err);
                return;
            }

            try {
                console.log("Sent withdraw tx: " + value + " ETH (txID=" + txID + ")");
                ui.logger("Sent withdraw tx: " + value + " ETH (txID=" + txID + ")");
                self.contFwdingOnNewData = true; // start fowarding again on new data
                // TODO: track state of withdraw tx
            } finally {
                // TODO: track state of withdraw tx
            }
        });
    });
}

// Poll Ethereum for status information from FDC and wallet
App.prototype.pollStatus = function () {
    console.log("pollStatus()");
    if (this.ethPollTimeout) clearTimeout(this.ethPollTimeout);

    // connected?
    if (!web3.isConnectedAsync()) {
        ui.logger("Not connected to Ethereum...");
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
    this.ethConnectionRetries = 0;
    console.log("Ethereum provider: " + JSON.stringify(web3.currentProvider));


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
    var fdc = FDC.deployed();

    fdc.getStatus.call(this.donationPhase,
        dfnAddr,
        ethAddr).then(function (res) {
        try {
            console.log("FDC.getStatus: " + JSON.stringify(res));

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

    ui.setGenesisDFN(tokenAmount);
    ui.setFunderTotalReceived(chfCentsDonated / 100);
    ui.setForwardedETH(web3.fromWei(donated, 'ether'));
    ui.setRemainingETH(web3.fromWei(fwdBalance, 'ether'));
}

// Adjust the connection after too many failures e.g. try new full node
App.prototype.adjustConnection = function (retries) {
    if (retries > ETHEREUM_CONN_MAX_RETRIES) {
        // TODO try another provider?
    }
}

// Set current task given to user making donations
App.prototype.setCurrentTask = function (tId) {
    this.currentTask = tId;
    ui.setCurrentTask(tId);
}

// ETH node
// Set the Etheruem full node we are connecting to
App.prototype.setEthereumNode = function (host) {
    console.log("Set Ethereum node: " + host);

    if (host == "hosted") {
        // TODO: add logic to randomly choose which hosted node to connect to
        // TODO: add fallback logic if one hosted node is down
        this.setETHNodeInternal(ETHEREUM_HOSTED_NODES[0]);
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

    console.log("New provider set to:" + provider);


    // TODO: reconnect immediately instead of waiting for next poll
    // TODO save node to storage
}

App.prototype.setForwardedETH = function (fe) {
    console.log("Set forwarded ETH: " + fe);
    this.forwardedETH = fe;
    ui.setForwardedETH(fe);
}

App.prototype.setRemainingETH = function (re) {
    console.log("Set remaining ETH: " + re);
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
    console.log("Set Bitcoin node: " + host);

    if (host == "hosted") {
        // TODO: add logic to randomly choose which hosted node to connect to
        // TODO: add fallback logic if one hosted node is down
        this.setBTCNodeInternal(BITCOIN_HOSTED_NODES[0]);
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

    // TODO: reconnect immediately instead of waiting for next poll
    // TODO save node to storage
}

App.prototype.setForwardedBTC = function (fb) {
    console.log("Set forwarded BTC: " + fb);
    this.forwardedBTC = fb;
    ui.setForwardedBTC(fb);
}

App.prototype.setRemainingBTC = function (rb) {
    console.log("Set remaining BTC: " + rb);
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
    this.btcWorker.stop(); // stop until user clicks retry
}

App.prototype.onBitcoinError = function(err) {
    // TODO find a better way to differentiate HTTP errors from Bitcoin errors
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
        privateKey     : this.accs.BTC.priv,
        dfinityAddress : this.accs.DFN.addr,
        centralAddress : BITCOIN_FOUNDATION_ADDRESS,
        bitcoinProvider: this.bitcoinProvider,
        pollIntervalMs : BITCOIN_CHK_FWD_INTERVAL,

        onConnectionChange: onConnectionChange,
        onError: onError,
    });
}


// Set the user's DFN addr & ETH forwarding addr in the UI
App.prototype.setUiUserAddresses = function () {
    var ETHAddr = this.accs.ETH.addr;
    var BTCAddr = this.accs.BTC.addr;
    var DFNAddr = this.accs.DFN.addr;
    console.log("Set Ethereum forwarding addr: " + ETHAddr);
    console.log("Set Bitcoin forwarding addr: " + BTCAddr);
    console.log("Set DFN addr: " + DFNAddr);
    console.log("Set DFN addr with checksum: " + addrWithChecksum(DFNAddr));
    ui.setUserAddresses(ETHAddr, BTCAddr, addrWithChecksum(DFNAddr));
}

App.prototype.setFunderChfReceived = function (chf) {
    console.log("Set funder CHF received: " + chf);
    this.funderChfReceived = chf;
    ui.setFunderTotalReceived(chf);
}

App.prototype.setGenesisDFN = function (dfn) {
    console.log("Set genesis DFN: " + dfn);
    this.genesisDFN = dfn;
    ui.setGenesisDFN(dfn);
}

App.prototype.doImportSeed = function (seed) {
    this.accs.generateKeys(seed);
    this.accs.saveKeys();
    this.setUiUserAddresses();

    app.startBitcoinWorker();
}


// TODO: can be removed now as truffle is integrated for development?
// HTML testing function
// 1 in main.js, uncomment
//	var app = new App(true);
// 2 then set values below to see how they appear in HTML interface
App.prototype.setDummyDisplayValues = function () {
    ui.logger("TESTING: setting dummy values...");
    this.setCurrentTask('task-agree');
    this.setGenesisDFN(282819);
    this.setForwardedETH(000);
    this.setRemainingETH(100);
    this.setFunderChfReceived(762521);
    this.setEthereumClientStatus("OK");
    this.setEthereumNode("127.0.0.1");
    this.setEthereumClientStatus("OK");
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

        ui.logger("Restoring defaults from storage");

        //
        // Initialize our Ethereum accounts, and DFN private key
        // (if they exist already)
        //

        // TODO: persistence of accounts. for now, for testing, we generate new accounts on each load.
        // TODO: remember to clear userAccounts.seed after user has backed it up!
        var userAccounts = new Accounts();



        // ui.logger("user accounts created");
        // console.log("userAccounts: " + JSON.stringify(userAccounts));
        ui.logger("now starting App");

        //
        // Bootstrap our app...
        //

        app = new App(userAccounts);
        //app = new App(account, account, true);

        // First attempt to load stored keys if any.
        // If loading fails, then simply wait user to generate new seed or import seed
        userAccounts.loadKeys(function() {
            // TODO fix this: why can't we call this./app?
            // app.setUiUserAddresses();
            ui.setUserAddresses(app.accs.ETH.addr, app.accs.BTC.addr, addrWithChecksum(app.accs.DFN.addr));
            ui.readTerms();
            ui.markSeedGenerated();
            ui.makeTaskDone('task-agree');
            ui.makeTaskDone('task-create-seed');
            ui.setCurrentTask('task-understand-fwd-eth');

            app.startBitcoinWorker();
        })
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
