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
"use strict";

// if seedStr == null then a new seed is generated, otherwise
// keys are derived deterministically from the passed seed if it's valid
var Accounts = function (seedStr) {
    this.Mnemonic = require('bitcore-mnemonic');
    this.bitcore = require('bitcore-lib')

    // single quote == hardened derivation
    this.HDPathDFN = "m/44'/223'/0'/0/0"; // key controlling DFN allocation
    this.HDPathDFNAccount = "m/44'/223'/0'"; // Account level path for DFN allocation
    this.HDPathETHForwarder = "m/44'/60'/0'/0/0";  // ETH key forwarding donation for HDPathDFN key
    this.HDPathBTCForwarder = "m/44'/0'/0'/0/0";   // BTC key forwarding donation for HDPathDFN key

    // this.seed = seedStr;
    this.DFN = {};
    this.DFNAccount = {};
    this.ETH = {};
    this.BTC = {};



}



// https://github.com/bitpay/bitcore-lib/blob/master/docs/hierarchical.md
// keys are compressed and
// https://github.com/ethereumjs/ethereumjs-util/blob/master/docs/index.md#pubtoaddress
// expects the 32 bytes without the leading compression-indicating
// byte (see YP eq 213)

Accounts.prototype.HDPrivKeyToAddr = function (privHex) {
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


// Generate an HD seed string. Note that we *never* store the seed. With the
// seed, an attacker can gain access to the user's DFN later.
Accounts.prototype.generateSeed = function () {
    var code = new this.Mnemonic(this.Mnemonic.Words.ENGLISH);
    return code.toString();

//  return this.Mnemonic(this.Mnemonic.Words.ENGLISH).toString();
}

// Generate 1. the user's DFINITY address 2. their forwarding addresses, and
// 3. the private keys for the forwarding addresses. Note that we *never* store
// the seed. With the seed, an attacker cn gain access to the user's DFN later.
Accounts.prototype.generateKeys = function (seedStr) {
    //var code = new this.Mnemonic(this.Mnemonic.Words.ENGLISH);
    var code = new this.Mnemonic(seedStr);
    var masterKey = code.toHDPrivateKey();
    var DFNPriv = masterKey.derive(this.HDPathDFN);
    var DFNAccount = masterKey.derive(this.HDPathDFNAccount);
    var ETHPriv = masterKey.derive(this.HDPathETHForwarder);
    var BTCPriv = masterKey.derive(this.HDPathBTCForwarder);
    var DFNPrivPadded = "0x" + padPrivkey(DFNPriv.toObject().privateKey);
    this.DFN.addr = this.HDPrivKeyToAddr(DFNPrivPadded);
    // console.log(seedStr);
    // console.log(DFNAccount.xpubkey);
    this.DFNAccount.xpub = DFNAccount.xpubkey;

    this.ETH.priv = "0x" + padPrivkey(ETHPriv.toObject().privateKey);
    this.ETH.addr = this.HDPrivKeyToAddr(this.ETH.priv);

    var BTCAddr = new this.bitcore.Address(BTCPriv.publicKey);
    this.BTC.addr = BTCAddr.toString();
    this.BTC.priv = BTCPriv.toObject().privateKey;
}

// Write the user's keys to storage e.g. Chrome storage
Accounts.prototype.saveStates = function () {
    if (this.DFN.addr != undefined &&
        this.ETH.addr != undefined &&
        this.ETH.priv != undefined &&
        this.BTC.addr != undefined &&
        this.BTC.priv != undefined
    ) {
        saveToStorage({
            "dfn-address": this.DFN.addr,
            "dfn-account-xpub": this.DFNAccount.xpub,
            "eth-address": this.ETH.addr,
            "eth-private-key": this.ETH.priv,
            "btc-address": this.BTC.addr,
            "btc-private-key": this.BTC.priv,


        }, function () {
            // ui.logger("DFN, BTC and ETH address successfully saved in Chrome storage.");
        });
    }
}

// Load the user's keys from storage e.g. Chrome storage. If the operate fails,
// an exception is thrown. If no keys were previously saved, no keys are loaded
// and the key values will be undefined
Accounts.prototype.loadStates = function (successFn) {
    var self = this;
    loadfromStorage([
        "dfn-address",
        "dfn-account-xpub",
        "eth-address",
        "eth-private-key",
        "btc-address",
        "btc-private-key",
    ], function (s) {

        if (s["dfn-address"] != null && s["dfn-address"] != undefined
            && s["eth-address"]!= null && s["eth-private-key"]!=null
            && s["btc-address"] != null && s["btc-private-key"]!= null
           ) {
            self.DFN.addr = s["dfn-address"];
            self.ETH.addr = s["eth-address"];
            self.ETH.priv = s["eth-private-key"];
            self.BTC.addr = s["btc-address"];
            self.BTC.priv = s["btc-private-key"];
            self.DFNAccount.xpub = s["dfn-account-xpub"];
            console.log("Loaded DFN addr:" + self.DFN.addr);
            successFn();
        }

        // ui.logger("DFN, BTC and ETH address loaded successfully. ");
    });
}


function padPrivkey(privHex) {
    return ("0000000000000000" + privHex).slice(-64);
}
