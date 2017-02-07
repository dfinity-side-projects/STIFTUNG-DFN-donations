var Wallet = require('ethereumjs-wallet');
var ProviderEngine = require("web3-provider-engine");
var WalletSubprovider = require('web3-provider-engine/subproviders/wallet.js');
var Web3Subprovider = require("web3-provider-engine/subproviders/web3.js");
var ethProvider = null;

var EthForwarder = function (accounts) {
    this.accounts = accounts;
    if (ethProvider == null)
        ethProvider = new Web3.providers.HttpProvider(DEFAULT_ETHEREUM_NODE);
    
    var engine = new ProviderEngine.Engine();
    engine.addProvider(new WalletSubprovider(wallet, {}));
    engine.addProvider(new Web3Subprovider(ethProvider));
    engine.start(); // Required by the provider engine.
    FDC.setProvider(engine);
}

EthForwarder.prototype.setEthNode = function(node) {

}

EthForwarder.prototype.donate = function(accounts) {
    return new Promise((success,reject) => {
        fdc.donateAsWithChecksum("0xc3d2a1629d3990d8b9d9799c8675ec18c6f00247", "000247", {
            from: "0xcd8b60a0a22fb280de833778b8ee6786d32bcf82",
            gas: 35000
        }).then((txId) => {
            success(txId);
        }).catch((e) => {
            reject(e);
        });
    });
}