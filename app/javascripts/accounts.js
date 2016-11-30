var Accounts = function(seedStr) {
  var Mnemonic = BitcoreMnemonic;
  var dummyCode = new Mnemonic(Mnemonic.Words.ENGLISH);
  bitcore = dummyCode.getBitcore();

  // single quote == hardened derivation
  this.HDPathDFN          = "m/44'/223'/0'/0/0"; // key controlling DFN allocation
  this.HDPathETHForwarder = "m/44'/60'/0'/0/0";  // ETH key forwarding donation for HDPathDFN key
  this.HDPathBTCForwarder = "m/44'/0'/0'/0/0";   // BTC key forwarding donation for HDPathDFN key

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
  var masterKey                  = code.toHDPrivateKey();
  var DFNPriv                    = masterKey.derive(this.HDPathDFN);
  var DFNAddr                    = this.HDPrivKeyToAddr(DFNPriv);
  this.DFNAcc.addr               = DFNAddr;
  var ETHPriv                    = masterKey.derive(this.HDPathETHForwarder);
  this.ETHForwarderAcc.priv      = ETHPriv.toString();
  this.ETHForwarderAcc.addr      = this.HDPrivKeyToAddr(ETHPriv);

  var BTCPriv                    = masterKey.derive(this.HDPathBTCForwarder);
  this.BTCForwarderAcc.priv      = BTCPriv.toString();
  var BTCAddr                    = new bitcore.Address(BTCPriv.publicKey, bitcore.Networks.livenet);
  this.BTCForwarderAcc.addr      = BTCAddr.toString();

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
  var priv = new bitcore.PrivateKey(hdPrivKey.toObject().privateKey);
  return EthJSUtil.bufferToHex(EthJSUtil.privateToAddress(priv.toBuffer()));
}

//exports = module.exports = {Accounts};
