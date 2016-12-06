// if seedStr == null then a new seed is generated, otherwise
// keys are derived deterministically from the passed seed if it's valid
var Accounts = function(seedStr) {
  this.Mnemonic = BitcoreMnemonic;
  var dummyCode = new this.Mnemonic(this.Mnemonic.Words.ENGLISH);
  this.bitcore = dummyCode.getBitcore();

  // single quote == hardened derivation
  this.HDPathDFN          = "m/44'/223'/0'/0/0"; // key controlling DFN allocation
  this.HDPathETHForwarder = "m/44'/60'/0'/0/0";  // ETH key forwarding donation for HDPathDFN key
  this.HDPathBTCForwarder = "m/44'/0'/0'/0/0";   // BTC key forwarding donation for HDPathDFN key

  // this.seed = seedStr;
  this.DFN      = {};
  this.ETH      = {};
  this.BTC      = {};
  
  // for backwards compatibility, strip out when complete flow is implemented
  // loadKeys should be called by the App, not by the constructor, but that flow is not yet implemented
  this.loadKeys();
}

// https://github.com/bitpay/bitcore-lib/blob/master/docs/hierarchical.md
// keys are compressed and
// https://github.com/ethereumjs/ethereumjs-util/blob/master/docs/index.md#pubtoaddress
// expects the 32 bytes without the leading compression-indicating
// byte (see YP eq 213)
Accounts.prototype.HDPrivKeyToAddr = function(privHex) {
  /* TODO: verify padding, sometimes we get:

     ethereumjs-util.js:16925 Uncaught RangeError: private key length is invalid(…)
     exports.isBufferLength	@	ethereumjs-util.js:16925
     publicKeyCreate	@	ethereumjs-util.js:17454
     exports.privateToPublic	@	ethereumjs-util.js:6400
     exports.privateToAddress	@	ethereumjs-util.js:6501
     Accounts.HDPrivKeyToAddr	@	app.js:57286
     Accounts	@	app.js:57263

     which likely is the common padding bug of privkey being less than 32 bytes
  */
  var addrBuf = EthJSUtil.privateToAddress(EthJSUtil.toBuffer(privHex));
  return EthJSUtil.bufferToHex(addrBuf);
}

//exports = module.exports = {Accounts};

// Generate an HD seed string. Note that we *never* store the seed. With the
// seed, an attacker can gain access to the user's DFN later.
Accounts.prototype.generateSeed = function() {
  var code = new this.Mnemonic(this.Mnemonic.Words.ENGLISH);
  return code.toString();
  
//  return this.Mnemonic(this.Mnemonic.Words.ENGLISH).toString();
}

// Generate 1. the user's DFINITY address 2. their forwarding addresses, and
// 3. the private keys for the forwarding addresses. Note that we *never* store
// the seed. With the seed, an attacker cn gain access to the user's DFN later.
Accounts.prototype.generateKeys = function(seedStr) {
  //var code = new this.Mnemonic(this.Mnemonic.Words.ENGLISH);
  var code = new this.Mnemonic(seedStr);
  var masterKey = code.toHDPrivateKey();
  var DFNPriv   = masterKey.derive(this.HDPathDFN);
  var ETHPriv   = masterKey.derive(this.HDPathETHForwarder);
  var BTCPriv   = masterKey.derive(this.HDPathBTCForwarder);

  var DFNPrivPadded = "0x" + padPrivkey(ETHPriv.toObject().privateKey);
  this.DFN.addr = this.HDPrivKeyToAddr(DFNPrivPadded);

  this.ETH.priv = "0x" + padPrivkey(ETHPriv.toObject().privateKey);
  this.ETH.addr = this.HDPrivKeyToAddr(this.ETH.priv);

  var BTCAddr   = new this.bitcore.Address(BTCPriv.publicKey, this.bitcore.Networks.livenet);
  this.BTC.addr = BTCAddr.toString();
  this.BTC.priv = "0x" + BTCPriv.toObject().privateKey;
}

// Write the user's keys to storage e.g. Chrome storage
Accounts.prototype.saveKeys = function() {
  // if (!keys) return;
  
  if (typeof(chrome) !== "undefined") {
    // We have access to Chrome storage e.g. as does Chrome extension
    // http://stackoverflow.com/questions/3937000/chrome-extension-accessing-localstorage-in-content-script
    ui.logger("Saving keys to Chrome storage");
  }
  else if (typeof(Storage) !== "undefined") {
    // We have access to browser storage
    // http://www.w3schools.com/html/html5_webstorage.asp
    ui.logger("Saving keys to local Web page storage. WARNING this storage not secure");
  } else {
    ui.logger("WARNING: No storage facility available to save keys to");
  }  
 
  // dummy version returns true always 
  return true;
}

// Load the user's keys from storage e.g. Chrome storage. If the operate fails,
// an exception is thrown. If no keys were previously saved, no keys are loaded
// and the key values will be undefined
Accounts.prototype.loadKeys = function() {
  if (typeof(chrome) !== "undefined") {
    // We have access to Chrome storage e.g. as does Chrome extension
    // http://stackoverflow.com/questions/3937000/chrome-extension-accessing-localstorage-in-content-script
    ui.logger("Querying Chrome storage for keys");
  }
  else if (typeof(Storage) !== "undefined") {
    // We have access to browser storage
    // http://www.w3schools.com/html/html5_webstorage.asp
    ui.logger("Querying local Web page storage for keys. WARNING this storage not secure");
  } else {
    ui.logger("WARNING: No storage facility that can query for keys");
  }
  
  // dummy version simply re-generates dummy keys from a hardwired address
  // uncomment for testing the situation when no keyss are found in storage
  var success = false;
  if (success) {
    this.generateKeys("drill expose helmet journey flat arrange twelve cliff pepper broken damp denial");
    ui.logger("Simulating keys found in storage. Dummy keys loaded (change this code if you want to test the other flow)");
    return true;
  } else {
    ui.logger("Simulating no keys in storage");
    return false;
  }
}

function padPrivkey(privHex) {
  return ("0000000000000000" + privHex).slice(-64);
}
