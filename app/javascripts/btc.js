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

// The Bitcoin donation flow is as follows:

// 1. (External) The USER sends money to the CLIENT ADDRESS, a unique Bitcoin
//    address generated by this extension.

// 2. The CLIENT ADDRESS is watched for incoming transactions, and the contained
//    outputs are forwarded to the CENTRAL ADDRESS, including an OP_RETURN output
//    with the CLIENT DFINITY DATA.

// 3. One of three things happen:
//    a. (External) the funds reach the CENTRAL ADDRESS successfully, and are
//       included in the donation campaign.

//    b. A temporary failure (eg low fee, or double-spend) triggers a retry of
//       step 2.

//    c. A permanent failure (eg campaign ended) allows for a refund, sent to an
//       external address.

var bitcore = require('bitcore-lib')

var TX_FEE_MULTIPLIER = 1.5


function BitcoinWorker() {
  this.isWorking = false
}


BitcoinWorker.prototype.start = function(config) {
  var self = this

  // Client configuration:
  self.clientPrivateKey  = bitcore.PrivateKey(config.privateKey)
  self.clientAddress     = self.clientPrivateKey.toAddress()
  self.clientDfinityData = bitcore.util.buffer.hexToBuffer(config.dfinityAddress.slice(2))

  // Central configuration:
  self.centralAddress = bitcore.Address(config.centralAddress)

  // External block explorer configuration:
  self.pollIntervalMs  = config.pollIntervalMs || 5000
  self.bitcoinProvider = config.bitcoinProvider

  // self worker considers itself "connected" if the last HTTP request it made
  // was successful (starts disconnected):
  self.isConnected = false

  self.listeners = {
    onConnectionChange: config.onConnectionChange || function() {},
    onError: config.onError || function() {},
  }

  // Start watching CLIENT ADDRESS and forwarding funds:
  self.isWorking = true

  function nextWatchTick() {
    if (! self.isWorking)
      return

    self.tryForwardBTC().then(function() {
      setTimeout(nextWatchTick, self.pollIntervalMs)
    })
  }

  nextWatchTick()
}


BitcoinWorker.prototype.stop = function() {
  this.isWorking = false
}


BitcoinWorker.prototype.tryForwardBTC = function() {
  var self = this;

  // if (app.donationState != STATE_DON_PHASE0 && app.donationState != STATE_DON_PHASE1)
  //     return Promise.resolve();

  return this.trySendBTC(this.centralAddress)
    .then(function(tx) {
      if (tx) self.log('Forwarded funds to central address')
    })
}


BitcoinWorker.prototype.tryRefundBTC = function(address) {
  var self = this

  return this.trySendBTC(address)
    .then(function(tx) {
      if (tx) self.log('Sent back funds to provided address ' + address)
   })
}


BitcoinWorker.prototype.trySendBTC = function(address) {
  var self = this

  return Promise.resolve()
    .then(function() {
      self.log('Getting UTXOs')

      return self.getClientUtxos()
    })
    .then(function(utxos) {
      self.log('Found ' + utxos.length + ' UTXOs')
      if (utxos.length == 0 || utxos == undefined) return;

      var tx = self.makeTransaction(utxos, address)

      return self.sendTransaction(tx)
    })
    .catch(function(err) {
      self.logError(err)
      self.listeners.onError(err)
    })
}


BitcoinWorker.prototype.getClientUtxos = function() {
  return this.callProvider('getUnspentUtxos', this.clientAddress)
}


BitcoinWorker.prototype.sendTransaction = function(tx) {
  return this.callProvider('broadcast', tx)
}


BitcoinWorker.prototype.callProvider = function(method) {
  var self = this
  var args = Array.prototype.slice.call(arguments, 1)

  return new Promise(function(resolve, reject) {
    function callback(err, result) {
      if (err) {
        self.setConnected(false)
        reject(err)
      } else {
        self.setConnected(true)
        resolve(result)
      }
    }

    args.push(callback)

    return self.bitcoinProvider[method].apply(self.bitcoinProvider, args)
  })
}


BitcoinWorker.prototype.setConnected = function(isConnected) {
  if (this.isConnected !== isConnected) {
    this.isConnected = isConnected
    this.listeners.onConnectionChange(this.isConnected)
  }
}


BitcoinWorker.prototype.makeTransaction = function(utxos, address) {
  const fee = this.calculateFee(utxos)
  const amount = utxoSum(utxos) - fee

  if (amount < 0) {
    throw new Error("Amount is lower than estimated required fee")
  }

  return new bitcore.Transaction()
    .from(utxos)
    .to(address, amount)
    .addData(this.clientDfinityData)
    .sign(this.clientPrivateKey)
}


BitcoinWorker.prototype.calculateFee = function(utxos) {
  // Craft a fake transaction to take advange of Bitcore's fee estimator:
  var bitcoreFee = new bitcore.Transaction()
    .from(utxos)
    .to(this.centralAddress, 0)
    .change(this.clientAddress)
    .addData(this.clientDfinityData)
    .getFee()

  return Math.ceil(bitcoreFee * TX_FEE_MULTIPLIER)
}


BitcoinWorker.prototype.log = function(...args) {
  console.log('[BTC]', ...args)
}


BitcoinWorker.prototype.logError = function(...args) {
  console.error('[BTC]', ...args)
}


function utxoSum(utxos) {
  return utxos.reduce(function(total, nextUtxo) {
    return total + nextUtxo.satoshis
  }, 0)
}

