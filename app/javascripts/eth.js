const Wallet = require('ethereumjs-wallet');
const ProviderEngine = require("web3-provider-engine");
const WalletSubprovider = require('web3-provider-engine/subproviders/wallet.js');
const Web3Subprovider = require("web3-provider-engine/subproviders/web3.js");
const G = window.DFNConstants;
var ethProvider = null;


/**
 * EthForwarder wraps simple functions to donate and withdrawal ETH with a given account object
 *
 */
var EthForwarder = function (accounts, fdc) {
    this.accounts = accounts;
    this.fdc = fdc;
    if (ethProvider == null)
        ethProvider = new Web3.providers.HttpProvider(G.DEFAULT_ETHEREUM_NODE);
    
    var engine = new ProviderEngine.Engine();
    var wallet = Wallet.fromPrivateKey(EthJSUtil.toBuffer(accounts.ETH.priv))
    engine.addProvider(new WalletSubprovider(wallet, {}));
    engine.addProvider(new Web3Subprovider(ethProvider));
    engine.start(); // Required by the provider engine.
    FDC.setProvider(engine);
}

//// Donate specified value (minus gas cost). From/to address are all extracted from associated accounts object. ////
EthForwarder.prototype.donate = function(wei) {
    var self = this;
    return new Promise((success,reject) => {
        console.log(wei.toString());
        const donating = web3.toBigNumber(wei - G.MAX_DONATE_GAS_COST);
        if (donating < 0) {
            reject("Not enough value to cover donation tx cost");
            return;
        }
        console.log(donating.toString());
        self.fdc.donateAsWithChecksum(self.accounts.DFN.addr, addrChecksum(self.accounts.DFN.addr).slice(2), {
            from: self.accounts.ETH.addr,
            value: donating,
            gas: G.MAX_DONATE_GAS,
            gasPrice: G.GAS_PRICE
        }).then((txId) => {
            console.log(txId);
            success(txId);
        }).catch((e) => {
            console.log(e);
            reject(e);
        });
    });
}

module.exports=EthForwarder;