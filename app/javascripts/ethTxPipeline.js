

var DEFAULT_ETH_TX_POLLING_INTERVAL = 750;
var DEFAULT_ETH_TX_DELAY_TIMEOUT = DEFAULT_ETH_TX_POLLING_INTERVAL*100;
var DEFAULT_ETH_TX_COUNT_RETRY_DELAY = 1000;

var EthTxPipeline = function () {
	this.lastNonce = -1;
}

EthTxPipeline.prototype.prepareTx = function(fromAddr, onReady) {
    var self = this;
	var getTxCountAsync = function(fromAddr, onReady) {
		web3.eth.getTransactionCount(fromAddr, "pending", function(error, result) {
			if (!error) {
				// inform caller to supply tx with specified nonce
				var nonce = result+1;
				if (nonce <= self.lastNonce) // try prevent "missing" submitted tx
					nonce =  self.lastNonce+1;
				self.lastNonce = nonce;
				onReady(nonce);
			} else {
				// error, retry after delay...
				setTimeout(function() {
					getTxCountAsync();
				}, DEFAULT_ETH_TX_COUNT_RETRY_DELAY);
			}
		});
	};
    getTxCountAsync(fromAddr, onReady);
}

web3.eth.getTransactionMined = function (txnHash, txnGas, interval, timeout) {
    var interval = interval ? interval : DEFAULT_ETH_TX_POLLING_INTERVAL;
    var timeout = timeout ? timeout : DEFAULT_ETH_TX_DELAY_TIMEOUT;
    var delay = 0;
    var transactionMinedAsync = function(txnHash, txnGas, resolve, reject) {
        try {
            web3.eth.getTransactionReceipt(txnHash, function(error, result) {
            	if (error) {
            		reject(error);
            	} else {
            		if (result == null) {
            			// Receipt not yet ready... poll again after interval
            			delay += interval;
            			if (delay >= DEFAULT_ETH_TX_DELAY_TIMEOUT)
            				reject("Timed Out Waiting For TX");
            			else
            				setTimeout(function () {
            					transactionReceiptAsync(txnHash, resolve, reject);
            				}, interval);            			
            		} else {
            			// we got a tx receipt. Interrogate gas used to see if 
            			// it ran successfully
		            	if (receipt.gasUsed < txnGas)
		            		// success!
		            		resolve(receipt);
		            	else
		            		// failure / exception was thrown
		            		reject("Exception: Out of Gas");            			
            		}
            	}
            });
        } catch(e) {
        	// probably encountered connection failure
        	// TODO change code to continue in case connection failure we
        	// should not reject for that reason.
            reject(e);
        }
    };

    if (Array.isArray(txnHash)) {
        var promises = [];
        for (var i=0; i<txnHash.length; i++) {
        	promises.push(web3.eth.getTransactionMined(txnHash[i], txnGas[i], interval, timeout));
        }
        return Promise.all(promises);
    } else {
        return new Promise(function (resolve, reject) {
                transactionMinedAsync(txnHash, txnGas, resolve, reject);
            });
    }
};