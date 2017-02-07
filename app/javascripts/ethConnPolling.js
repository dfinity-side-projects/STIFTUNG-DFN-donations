/*
 * Regularly ping the Web3 connection to see if the Ethereum node is reachable. 
 * Update the this.connected variable upon status changes such that isConnected()
 * returns a reasonably current status. Pings are performed asynchronously to prevent
 * browser freezes e.g. that can happen when calling web3.isConnected() causing a
 * connection attempt to be made that does not fail immediately although no connection
 * is possible.
 */

var DEFAULT_ETH_CONN_POLLING_INTERVAL = 2500;

// onConnected - called when transitioning to connected state
// onConnectionError - called when transitioning out of connected state
// pingInterval - interval that pings are made
var EthPoller = function (onConnected, onConnectionError, pingInterval) {
	this.connected = false;
	this.onConnected = onConnected;
	this.onConnectionError = onConnectionError;
	this.pingInterval = pingInterval;
	if (this.pingInterval == undefined)
		this.pingInterval = DEFAULT_ETH_CONN_POLLING_INTERVAL;
	this.hPollTimeout = 0;
	this.connectionId = 0; // keep track node reconfigs
	this.schedulePing();
}

// Returns whether the Ethereum node was connected when the last ping was
// performed.
EthPoller.prototype.isConnected = function() {
	return this.connected;
}

// If the Web3 node is reconfigured, then you MUST notify the poller so that
// it can immediately update the change in connection status
EthPoller.prototype.nodeChanged = function() {
	this.connectionId++;
	this.onPingError("Ethereum node changed"); 
}

// Schedule a ping of the Ethereum node  
EthPoller.prototype.schedulePing = function() {
	// Clear existing timeout e.g. after this.nodeChanged interrupts relay
	clearTimeout(this.hPollTimeout);
	// Setup ping after interval
	var poller = this;
	this.hPollTimeout = setTimeout(function() { poller.ping(); }, this.pingInterval);
}

// Ping the Ethereum node to test the connection 
EthPoller.prototype.ping = function() {
	try {
		web3.asyncPing(this);
	} catch (e) {
		this.onPingError(JSON.stringify(e)); 		
	}
}

// Connection ping success
EthPoller.prototype.onPingSuccess = function() {
	if (this.onConnected && !this.connected)
		try { this.onConnected(); } catch(e) {} //untrusted
	this.connected = true;	
	// setup next ping...
	this.schedulePing();
}

// Connection ping error
EthPoller.prototype.onPingError = function(error) {
	if (this.onConnectionError && this.connected)
		try { this.onConnectionError(error); } catch(e) {} //untrusted
	this.connected = false;	
	// setup next ping...
	this.schedulePing();
}

// Extend Web3 with asynchronous connection polling function
Web3.prototype.asyncPing = function(poller) {
	var connectionId = this.connectionId;
    this.currentProvider.sendAsync(
    	// ping asynchronously...	
        {
            id: 9999999999,
            jsonrpc: "2.0",
            method: 'net_listening',
            params: []
        },
        // handle result of asyc call
        function (error, result) {
        	// check callback for poller's current connection
        	if (poller.connectionId == connectionId) { 
        		// route result to handler
	            if (error != null) 
	                poller.onPingError(error);
	            else
	                poller.onPingSuccess();
        	}
        }
    );
}