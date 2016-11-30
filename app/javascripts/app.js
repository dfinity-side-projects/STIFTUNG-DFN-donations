var accounts;
var account;

// *
// *** Constants ***
// *

var ETHEREUM_CHK_FWD_INTERVAL = 1000; // not actual... pauses
var ETHEREUM_POLLING_INTERVAL = 5000; // the time we wait before re-polling Etheruem provider for new data
var ETHEREUM_CONN_MAX_RETRIES = 10;   // max number of retries to automatically selected Ethereum provider

var GAS_PRICE;                      // estimate price of gas
var MIN_DONATION;                   // minimum donation allowed
var MAX_DONATE_GAS;                 // maximum gas used making donation
var MAX_DONATE_GAS_COST;            // estimate maximum cost of gas used
var MIN_FORWARD_AMOUNT;             // minimum amount we will try to forward
// TODO if there's congestion, the gas price might go up. We need to handle
// this better or leave sufficent margin cannot fail

// *
// *** Application logic ***
// *

// Constructor
var App = function(dfnAddr, fwdAddr, testUI) {
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
  this.donationPhase = 0;           // seed funder
  this.ethBalance = undefined;      // balance of ETH forwarding wallet
  this.dfnAddr = dfnAddr;
  this.fwdAddr = fwdAddr;
  this.lastTask = 'task-agree';
  this.lastEthereumNode = "127.0.0.1";
  
  this.setCurrentTask(this.lastTask);
  this.setFowardingKeysETH(this.fwdAddr, this.fwdAddr); // TODO
  this.setGenesisDFN(undefined);	
  this.setFunderChfReceived(undefined);
  this.setEthereumNode(this.lastEthereumNode);
  
  ui.logger("Retrieving status from FDC contract: "+FDC.deployed().address);
  
  // start polling the FDC for stats
  this.pollStatus();
  
  // start forwarding any ETH we see!
  this.tryForwardETH();
}

// Forward any ETH we can see lying in our wallet as a donation!
App.prototype.tryForwardETH = function() {
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
    fdc.donateAs(this.dfnAddr, { from: self.fwdAddr,
      value: this.ethBalance.sub(MAX_DONATE_GAS_COST), gasPrice: GAS_PRICE,
      gas: MAX_DONATE_GAS}).then(function(txID) {
        try {
          console.log("Successfully donated : " + donating + " ETH (txID=" + txID + ")");
          self.contFwdingOnNewData = true; // start fowarding again on new data
        } finally {
          self.scheduleTryForwardETH();
        }
    }).catch(function(e) {
      try {
        ui.logger("Error forwarding balance as donation: "+e+" "+JSON.stringify(e));
        ui.showErrorEthForwarding();
        // user must manually restart forwarding.. otherwise a smart contract
        // error would cause all their balance to be used up in gas when retrying!
      } finally {
        self.scheduleTryForwardETH();
      }
    });
  }	
}
// reschedule...
App.prototype.scheduleTryForwardETH = function() {
  this.ethFwdTimeout = setTimeout(function() { app.tryForwardETH(); }, ETHEREUM_CHK_FWD_INTERVAL);
}
// re-activate...
App.prototype.retryForwarding = function() {
  // stop showing user error box. We're back in business...
  ui.hideErrorEthForwarding();
  // flag we can continue forwarding available balance
  this.contFwdingOnNewData = true;
}

// Poll Ethereum for status information from FDC and wallet
App.prototype.pollStatus = function() {
  if (this.ethPollTimeout) clearTimeout(this.ethPollTimeout);
  
  // connected?
  if (!web3.isConnected()) {
    ui.logger("Not connected to Ethereum...");
    // adjust connection if too many fails and appropriate
    this.adjustConnection(++this.ethConnectionRetries);
    // reschedule next polling
    this.schedulePollStatus(); // bail, try later...
    return;
  }
  this.ethConnectionRetries = 0;
  console.log("Ethereum provider: "+JSON.stringify(web3.currentProvider));

  // retrieve status information from the FDC...
  var self = this;
  var fdc = FDC.deployed();
  fdc.getStatus.call(this.donationPhase, this.dfnAddr, this.fwdAddr, {from: account}).then(function(res) {
      try {
        console.log("FDC.getStatus: "+JSON.stringify(res));
        
        // parse status data
        var currentState = res[0];   // current state (an enum)
        var fxRate = res[1];         // exchange rate of CHF -> ETH (Wei/CHF)
        var currentMultiplier = res[2]; // current bonus multiplier in percent (0 if outside of ) 
        var donationCount = res[3];  // total individual donations made (a count)
        var totalTokenAmount = res[4];// total DFN planned allocated to donors
        var startTime = res[5];      // expected start time of specified donation phase
        var endTime = res[6];        // expected end time of specified donation phase
        var isCapReached = res[7];   // whether target cap specified phase reached
        var chfCentsDonated = res[8];// total value donated in specified phase as CHF
        var tokenAmount = res[9];    // total DFN planned allocted to donor (user)
        var ethFwdBalance = res[10];  // total ETH (in Wei) waiting in fowarding address	 
        var donated = res[11];       // total ETH (in Wei) donated so far 
        
        // if the fowarding balance has changed, then we may have to inform the user
        // that it is "still" too small
        if (self.ethBalance != undefined && !self.ethBalance.equals(ethFwdBalance))
          self.saidBalanceTooSmall = false;
        self.ethBalance = ethFwdBalance;
        
        // new data means we can restart forwarding... 
        // - we do this b/c if the user has just failed to forward due to an
        // exception, their balance will have decreased due to gas consumption. 
        // We need to refresh their balance before trying to forward again or 
        // we will try to send more than we have. There is a race condition here
        // but unlikely to trigger and doesn't cost user money just error msg.
        if (self.contFwdingOnNewData)
          self.tryForwardBalance = true;
        
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
      ui.logger("Error querying Ethereum: "+e+" "+JSON.stringify(e));
    } finally {
      // do this all over again...
      self.schedulePollStatus();
    }
  });
}
// reschedule...
App.prototype.schedulePollStatus = function() {
  this.ethPollTimeout = setTimeout(function() { app.pollStatus(); }, ETHEREUM_POLLING_INTERVAL);
}

// Update the UI with retrieved status information
App.prototype.updateUI = function(currentState, fxRate, donationCount,
    totalTokenAmount, startTime, endTime, isCapReached, chfCentsDonated,
    tokenAmount, fwdBalance, donated) {
   
   ui.setETHForwardingAddress(fwdAddr);
   ui.setGenesisDFN(totalTokenAmount);
   ui.setFunderTotalReceived(chfCentsDonated/100);
   ui.setForwardedETH(web3.fromWei(donated, 'ether'));
   ui.setRemainingETH(web3.fromWei(fwdBalance, 'ether'));
}

// Adjust the connection after too many failures e.g. try new full node
App.prototype.adjustConnection = function(retries) {
  if (retries > ETHEREUM_CONN_MAX_RETRIES) {
    // TODO try another provider?
  }
}

// Set current task given to user making donations
App.prototype.setCurrentTask = function(tId) {
  console.log("Set current task: "+tId);
  this.currentTask = tId;
  ui.setCurrentTask(tId);
}

// Set the Etheruem full node we are connecting to 
App.prototype.setEthereumNode = function(ip) {
  console.log("Set Ethereum node: "+ip);
  this.setEthereumClientStatus('connecting...');
  this.ethereumNode = ip;
  ui.setEthereumNode(ip);
  if (this.ethereumNode != undefined) {
    this.reconnectEthereumClient();
  }
  // TODO save node to storage
}

// Set the Ethereum forwarding keys
App.prototype.setFowardingKeysETH = function(pub, priv) {
  console.log("Set Ethereum forwarding public key: "+pub);
  console.log("Set Ethereum forwarding private key: "+priv);
  this.forwardingPubKeyEth = pub;
  this.forwardingPrivKeyETH = priv;
  ui.setETHForwardingAddress(this.forwardingPubKeyEth);
}

App.prototype.setFunderChfReceived = function(chf) {
  console.log("Set funder CHF received: "+chf);
  this.funderChfReceived = chf;
  ui.setFunderTotalReceived(chf);
}

App.prototype.setGenesisDFN = function(dfn) {
  console.log("Set genesis DFN: "+dfn);
  this.genesisDFN = dfn;
  ui.setGenesisDFN(dfn);
}

App.prototype.setForwardedETH = function(fe) {
  console.log("Set forwarded ETH: "+fe);
  this.forwardedETH = fe;
  ui.setForwardedETH(fe);
}

App.prototype.setRemainingETH = function(re) {
  console.log("Set remaining ETH: "+re);
  this.remainingETH = re;
  ui.setRemainingETH(re);
}

App.prototype.setEthereumClientStatus = function(status) {
  this.ethClientStatus = status;
  if (status == "OK") {
    ui.setEthereumClientStatus("&#10004 connected, forwarding...");
    // now we're connected, grab all the values we need
    // this.pollStatus();
  } else
    ui.setEthereumClientStatus("not connected ("+status+")");
}

App.prototype.reconnectEthereumClient = function() {
  // Configure the IP address into the Ethereum client object
  // Make it connect/reconnect...
  ui.logger("Connecting to Ethereum node "+this.ethereumNode+"...");
}

App.prototype.onEthereumConnect = function() {
  this.setEthereumClientStatus("OK");
}

App.prototype.onEthereumDisconnect = function(errCode) {
  this.setEthereumClientStatus(errCode);
}

// HTML testing function
// 1 in main.js, uncomment 
//	var app = new App(true);
// 2 then set values below to see how they appear in HTML interface
App.prototype.setDummyDisplayValues = function() { 
  ui.logger("TESTING: setting dummy values...");
  this.setCurrentTask('task-agree');
  this.setGenesisDFN(282819);
  this.setForwardedETH(000);
  this.setRemainingETH(100);
  this.setFowardingKeysETH("1ES2uBmbXP1pn1KBjPMwwUMbhDHiRuiRkf", undefined);
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

window.onload = function() {
  web3.eth.getAccounts(function(err, accs) {
    
    // First initialize UI wrapper so we can report errors to user
    console.log("Wiring up HTML DOM...");
    ui = new UI();
    console.log("User interface ready.");

    // Initialize constants
    GAS_PRICE           = web3.toBigNumber(20000000000); // 20 Shannon
    MIN_DONATION        = web3.toWei('1', 'ether');
    MAX_DONATE_GAS      = 200000; // highest measured gas cost: 138048
    MAX_DONATE_GAS_COST = web3.toBigNumber(MAX_DONATE_GAS).mul(GAS_PRICE);
    MIN_FORWARD_AMOUNT  = web3.toBigNumber(MIN_DONATION).plus(MAX_DONATE_GAS_COST);

    //
    // Load current account details from Storage
    //
    
    ui.logger("Restoring defaults from storage");
    
    //
    // Initialize our Ethereum accounts, and DFN private key
    // (if they exist already)
    //
       
    if (err != null) {
      alert("There was an error fetching your accounts.");
      return;
    }
    
    if (accs.length == 0) {
      alert("Couldn't get any accounts! Make sure your Ethereum client is configured correctly.");
      return;
    }
    
    accounts = accs;
      account = accounts[4];
    
    //
    // Bootstrap our app...
    //
    
    dfnAddr = account;
    fwdAddr = account;
    
    ui.setETHForwardingAddress(account);

    // TODO: integrate & persist user accounts
    // TODO: remember to clear userAccounts.seed after user has backed it up!
    //
    // userAccounts.DFNAcc.addr
    // userAccounts.ETHForwarderAcc.addr
    // userAccounts.ETHForwarderAcc.priv
    var userAccounts = new Accounts();
    console.log("userAccounts: " + JSON.stringify(userAccounts));

    app = new App(account, account);
    //app = new App(account, account, true); 
  });
}
