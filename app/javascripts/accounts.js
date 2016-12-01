// if seedStr == null then a new seed is generated, otherwise
// keys are derived deterministically from the passed seed if it's valid
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

  this.DFN      = {};
  this.ETH      = {};
  this.BTC      = {};
  var masterKey = code.toHDPrivateKey();
  var DFNPriv   = masterKey.derive(this.HDPathDFN);
  var ETHPriv   = masterKey.derive(this.HDPathETHForwarder);
  var BTCPriv   = masterKey.derive(this.HDPathBTCForwarder);

  var DFNAddr   = this.HDPrivKeyToAddr(DFNPriv);
  this.DFN.addr = DFNAddr;

  this.ETH.priv = "0x" + ETHPriv.toObject().privateKey;
  this.ETH.addr = this.HDPrivKeyToAddr(ETHPriv);

  var BTCAddr   = new bitcore.Address(BTCPriv.publicKey, bitcore.Networks.livenet);
  this.BTC.addr = BTCAddr.toString();
  this.BTC.priv = "0x" + BTCPriv.toObject().privateKey;
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
