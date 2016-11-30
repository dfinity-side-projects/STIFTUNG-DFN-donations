// setup web3, bitcore-mnemonic and bitcore deps
var web3;
web3 = new Web3();
var Mnemonic = BitcoreMnemonic;
var dummyCode = new Mnemonic(Mnemonic.Words.ENGLISH);
bitcore = dummyCode.getBitcore();

// generate accounts from seed
var seed = "shoulder ahead fitness canvas plate turtle field humor sugar broken juice planet";
var userAccounts = new Accounts(seed);
console.log("userAccounts: " + JSON.stringify(userAccounts));

var DFNAddr = userAccounts.DFNAcc.addr

console.log("seed: " + seed);
console.log("DFN addr: " + DFNAddr);

// verify we can, from the seed, derive the key which correctly signs the prior
// derived DFN address
var obj = seedToDFNKey(seed);
var derivedKey = obj.p;
var derivedAddr = obj.a;
console.log("addr from seed: " + derivedAddr);

var gasPrice = new web3.BigNumber(20000000000); // 20 Shannon
var gasLimit = new web3.BigNumber(300000);
var value = new web3.BigNumber(42);

var txObj      = {};
//txObj.from     = from;
txObj.to       = '0xc7876ee3d67a70a548bec27abece6fe9420f22be';
txObj.gasPrice = web3.toHex(gasPrice);
txObj.gasLimit = web3.toHex(gasLimit);
txObj.nonce    = 0;
txObj.data     = EthJSUtil.toBuffer('0x');
txObj.value    = web3.toHex(value);

var tx = new EthJS(txObj);
var privBuf = derivedKey.privateKey.toBuffer();
tx.sign(privBuf);
var signedTx = EthJSUtil.bufferToHex(tx.serialize());
console.log("signedTx: " + signedTx);

var isSigValid = tx.verifySignature();
console.log("isSigValid: " + isSigValid);

var recoveredAddr = EthJSUtil.bufferToHex(tx.getSenderAddress());
console.log("recoverAddr: " + recoveredAddr);

var addrEqual = DFNAddr === recoveredAddr;
document.getElementById('test1').innerHTML = '\
<h3>Generated addr: ' + DFNAddr + '</h3>\
<h3>Addr from seed: ' + derivedAddr + '</h3>\
<h3>Recovered addr: ' + recoveredAddr + '</h3>\
<h3>Recovered addr equal to generated: ' + addrEqual + '</h3>\
';

function seedToDFNKey(seed) {
  var code = new Mnemonic(seed, Mnemonic.Words.ENGLISH)
  var xpriv = code.toHDPrivateKey();
  var priv = xpriv.derive(userAccounts.HDPathDFN);
  var addr = userAccounts.HDPrivKeyToAddr(priv);
  return {p: priv, a: addr};
}
