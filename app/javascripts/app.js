var accounts;
var account;

// *
// *** Constants ***
// *

var ETHEREUM_POLLING_INTERVAL = 5000; // the time we wait before re-polling Etheruem provider for new data
var ETHEREUM_CONN_MAX_RETRIES = 10; // max number of retries to automatically selected Ethereum provider

var GAS_PRICE;											// estimate price of gas
var MIN_DONATION;										// minimum donation allowed
var MAX_DONATE_GAS;									// maximum gas used making donation
var MAX_DONATE_GAS_COST;						// estimate maximum cost of gas used
var MIN_FORWARD_AMOUNT;							// minimum amount we will try to forward
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
	
	this.ethPollTimeout = undefined;	// handle to current timer for Ethereum polling
	this.ethConnectionRetries = 0;		// number consecutive provider connection fails
	this.donationPhase = 0;						// seed funder
	this.dfnAddr = dfnAddr;
	this.fwdAddr = fwdAddr;
	this.lastTask = 'task-agree';
	this.lastEthereumNode = "127.0.0.1";
	
	this.setCurrentTask(this.lastTask);
	this.setFowardingKeysETH(this.fwdAddr, this.fwdAddr); // TODO
	this.setGenesisDFN(undefined);	
	this.setFunderChfReceived(undefined);
	this.setEthereumNode(this.lastEthereumNode);
	
	ui.logger("Retrieving status from Ethereum...");
	// setTimeout(function() { app.pollStatus(); }, 0);
	this.pollStatus();
}

// Polls Ethereum for updates
App.prototype.pollStatus = function() {
  if (this.ethPollTimeout) clearTimeout(this.ethPollTimeout);
	var self = this;
  		
  // Connected?
  
  if (!web3.isConnected()) {
    ui.logger("Not connected to Ethereum...");
    // adjust connection if too many fails and appropriate
    app.adjustConnection(++this.ethConnectionRetries);
    // reschedule next polling
    app.schedulePollStatus(); // bail, try later...
    return;
  }
  this.ethConnectionRetries = 0;
  console.log("Ethereum provider: "+JSON.stringify(web3.currentProvider));

 
  // Retrieve status information from the FDC...

  var fdc = FDC.deployed();
  fdc.getStatus.call(this.donationPhase, this.dfnAddr, this.fwdAddr, {from: account}).then(function(res) {
	    try {
	    	// Got status info...
	    	console.log("Got FDC.getStatus: "+JSON.stringify(res));
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
	    	
	      // update user interface with status info
	      self.updateUI(currentState, fxRate, donationCount, totalTokenAmount,
	      	startTime, endTime, isCapReached, chfCentsDonated, tokenAmount, fwdBalance);
	      
	      // has ETH been received in the forwarding address?? Hooray. Forward it!
	      if (self.fwdAddr)
	      	return self.forwardETHbalanceToFDC(fwdBalance);
    } finally {
      app.schedulePollStatus();
    }
  }).catch(function(e) {
    try {
      ui.logger("Error querying Ethereum: "+e+" "+JSON.stringify(e));
    } finally {
      app.schedulePollStatus();
    }
  });
}

App.prototype.updateUI = function(currentState, fxRate, donationCount, totalTokenAmount,
	      	startTime, endTime, isCapReached, chfCentsDonated, tokenAmount, fwdBalance) {
	 
	 ui.setETHForwardingAddress(fwdAddr);
	 ui.setGenesisDFN(totalTokenAmount);
	 ui.setFunderTotalReceived(chfCentsDonated/100);
	 ui.setForwardedETH(web3.fromWei(fwdBalance, 'ether'));
	 ui.setRemainingETH(web3.fromWei(fwdBalance, 'ether'));
}

App.prototype.forwardETHbalanceToFDC = function(balance) {
	var self = this;	
	var fdc = FDC.deployed();
	
  if (web3.toBigNumber(balance).lt(MIN_FORWARD_AMOUNT)) {
  	// not enough ETH to forward
  	ui.logger("Remaining balance at forwarding address too small to donate");
  } else {
  	ui.logger("Forwarding " + web3.fromWei(balance, 'ether') + " ETH...");
  	// forward as donation...
    return fdc.donateAs(this.dfnAddr, {
    	from: self.fwdAddr,
    	value: balance.sub(MAX_DONATE_GAS_COST),
    	gasPrice: GAS_PRICE,
    	gas: MAX_DONATE_GAS}).then(function(txID) {
    		console.log("Sent forwarding tx with txid: " + txID);
    }).catch(function(e) {
      	ui.logger("Error forwarding balance as donation: "+e+" "+JSON.stringify(e));
    });
  }	
}

App.prototype.schedulePollStatus = function() {
		this.ethPollTimeout = setTimeout(function() { app.pollStatus(); }, ETHEREUM_POLLING_INTERVAL);
}

App.prototype.adjustConnection = function(retries) {
  if (retries > ETHEREUM_CONN_MAX_RETRIES) {
    // TODO try another provider?
  }
}

App.prototype.setCurrentTask = function(tId) {
	console.log("Set current task: "+tId);
	this.currentTask = tId;
	ui.setCurrentTask(tId);
}

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
		GAS_PRICE						= web3.toBigNumber(20000000000); // 20 Shannon
		MIN_DONATION				= web3.toWei('1', 'ether');
		MAX_DONATE_GAS			= 200000; // highest measured gas cost: 138048
		MAX_DONATE_GAS_COST = web3.toBigNumber(MAX_DONATE_GAS).mul(GAS_PRICE);
		MIN_FORWARD_AMOUNT	= web3.toBigNumber(MIN_DONATION).plus(MAX_DONATE_GAS_COST);

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
    account = accounts[0];
    
    //
    // Bootstrap our app...
    //
    
    dfnAddr = account;
		fwdAddr = account;
    
    ui.setETHForwardingAddress(account);
    
    app = new App(account, account);
    //app = new App(account, account, true); 
  });
}