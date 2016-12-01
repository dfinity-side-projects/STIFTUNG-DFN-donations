var Accounts = function(seedStr) {
  var Mnemonic = BitcoreMnemonic;
  var dummyCode = new Mnemonic(Mnemonic.Words.ENGLISH);
  bitcore = dummyCode.getBitcore();

  // single quote == hardened derivation
  this.HDPathDFN          = "m/44'/223'/0'/0/0"; // key controlling DFN allocation
  this.HDPathETHForwarder = "m/44'/60'/0'/0/0";  // ETH key forwarding donation for HDPathDFN key
  this.HDPathBTCForwarder = "m/44'/0'/0'/0/0";   // BTC key forwarding donation for HDPathDFN key

  // seed string and mnemonic code
  var code;
  if (seedStr != null) {
    code = new Mnemonic(seedStr);
  } else {
    code = new Mnemonic(Mnemonic.Words.ENGLISH);
    seedStr = code.toString();
  }

  this.seed = seedStr;

  this.DFNAcc                    = {};
  this.ETHForwarderAcc           = {};
  this.BTCForwarderAcc           = {};
 
  // convert mnemonic code to master privkey 
  var masterKey                  = code.toHDPrivateKey();
  
  // derive extended priv keys
  var DFNPriv                    = masterKey.derive(this.HDPathDFN);
  var ETHPriv                    = masterKey.derive(this.HDPathETHForwarder);
  var BTCPriv                    = masterKey.derive(this.HDPathBTCForwarder);
 
  // convert privkey to address 
//  var DFNAddr                    = this.HDPrivKeyToAddr(DFNPriv);
  var BTCAddr                    = new bitcore.Address(BTCPriv.publicKey, bitcore.Networks.livenet);
  // EthAddr ?
 
  // enter address into account structure 
  this.ETHForwarderAcc.addr      = this.HDPrivKeyToAddr(ETHPriv);
  this.BTCForwarderAcc.addr      = BTCAddr.toString();
  this.DFNAcc.addr               = this.HDPrivKeyToAddr(DFNPriv);
  
  // enter privkey into account structure 
  this.ETHForwarderAcc.priv      = ETHPriv.toString();
  this.BTCForwarderAcc.priv      = BTCPriv.toString();
  

  console.log("this.DFNAcc: "          + JSON.stringify(this.DFNAcc));
  console.log("this.ETHForwarderAcc: " + JSON.stringify(this.ETHForwarderAcc));
  console.log("this.BTCForwarderAcc: " + JSON.stringify(this.BTCForwarderAcc));
}

// https://github.com/bitpay/bitcore-lib/blob/master/docs/hierarchical.md
// keys are compressed and
// https://github.com/ethereumjs/ethereumjs-util/blob/master/docs/index.md#pubtoaddress
// expects the 32 bytes without the leading compression-indicating
// byte (see YP eq 213)
Accounts.prototype.HDPrivKeyToAddr = function(hdPrivKey) {
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
  var priv = new bitcore.PrivateKey(hdPrivKey.toObject().privateKey);
  return EthJSUtil.bufferToHex(EthJSUtil.privateToAddress(priv.toBuffer()));
}

//exports = module.exports = {Accounts};
