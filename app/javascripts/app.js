var accounts;
var account;

// *
// *** Application logic ***
// *

var ETHEREUM_POLLING_INTERVAL = 5000; // the time we wait before re-polling Etheruem provider for new data
var ETHEREUM_CONN_MAX_RETRIES = 10; // max number of retries to automatically selected Ethereum provider

// Constructor
var App = function(testUI) {
	ui.logger("Initializing main extension application...");

	// Bomb out if just testing HTML interface (config values in func)
	if (testUI) {
		this.setDummyDisplayValues(); 
		this.pollStatus();
		return;
	}	

	// Reload persistent state from storage.
	// - last task stage
	// - last Ethereum node IP used
	// - last forwarding address key pair
	var lastTask = 'task-agree';
	var lastEthereumNode = "127.0.0.1";
	var lastForwardingPubKeyEth = undefined;
	var lastForwardingPrivKeyETH = undefined;
	// TODO actually try to read values from storage	
	// ...
	
	// Intialize task and keys...
	this.setCurrentTask(lastTask);
	this.setFowardingKeysETH(lastForwardingPubKeyEth, lastForwardingPrivKeyETH);

	// Intialize "on chain" values...
	// - once the Ethereum node is set, on chain values will be updated on successful connection
	this.setGenesisDFN(undefined);	
	this.setFunderChfReceived(undefined);
	this.setEthereumNode(lastEthereumNode);
	
	setTimeout(function() { app.pollStatus(); }, 1000);
}

var ethPollTimeout;             // handle to current timer for Ethereum polling
var ethConnectionRetries = 0;   // number consecutive provider connection fails

var donationPhase = 0;					// seed funder
var dfnAddr;
var fwdAddr;

// Polls Ethereum for updates
App.prototype.pollStatus = function() {
  if (ethPollTimeout) clearTimeout(ethPollTimeout);
  	
  //
  // Are we connected...?
  //
  if (!web3.isConnected()) {
    ui.logger("Not connected to Ethereum...");
    // adjust connection if too many fails and appropriate
    app.adjustConnection(++ethConnectionRetries);
    // reschedule next polling
    app.schedulePollStatus(); // bail, try later...
    return;
  }
  ethConnectionRetries = 0;
  console.log("Ethereum provider: "+JSON.stringify(web3.currentProvider));

  //
  // Retrieve all relevant status in a single call to the FDC
  //  
  // retrieve data from FDC contract
  var fdc = FDC.deployed();
  fdc.getStatus.call(donationPhase, dfnAddr, fwdAddr, {from: account}).then(function(res) {
	    try {
	    	console.log("FDC.getStatus: "+JSON.stringify(res));
	    	
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
	    	
	      // Update user interface
	      app.updateUI(currentState, fxRate, donationCount, totalTokenAmount,
	      	startTime, endTime, isCapReached, chfCentsDonated, tokenAmount, fwdBalance);
	      
	      // If ETH has been received, forward it!
	      // TODO if (fwdAddrValue > FWDING_ADDRESS_CHANGE) { ...
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

App.prototype.schedulePollStatus = function() {
		ethPollTimeout = setTimeout(function() { app.pollStatus(); }, ETHEREUM_POLLING_INTERVAL);
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
    ui = new UI();
    ui.logger("Initilizing extension, inc. reading storage");
    
    //
    // Load current account details from Storage
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
    
    app = new App();
    //app = new App(true); 
  });
}