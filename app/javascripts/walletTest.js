window.onload = function() {
    var Wallet = require('../deps/ethereumjs-wallet.js');
    console.log(Wallet);
// var EthereumJSUtil = require("ethereumjs-util");
    var ProviderEngine = require("web3-provider-engine");
    console.log("Loading ... Wallet Test Engines ...");
    console.log(ProviderEngine);
    console.log(Engine);
    var WalletSubprovider = require('web3-provider-engine/subproviders/wallet.js');
    var Web3Subprovider = require("web3-provider-engine/subproviders/web3.js");
    var Web3 = require("web3");
    var FDC = require("../../build/contracts/FDC.sol.js");

    var wallet = Wallet.fromPrivateKey(EthJSUtil.toBuffer("0x87816c5936ebd7b44435cdc509a1486b1610f0d9a0fb2cac538dc81ba607dee8"))
    var address = "0x" + wallet.getAddress().toString("hex");

    var providerUrl = "http://54.201.221.105:8545";
    var engine = new ProviderEngine();
    engine.addProvider(new WalletSubprovider(wallet, {}));
    engine.addProvider(new Web3Subprovider(new Web3.providers.HttpProvider(providerUrl)));
    engine.start(); // Required by the provider engine.
    FDC.setProvider(engine);
    var fdc = FDC.at("0x1b2B5a7331B4CD621376ffC068c4A473CBC2e11D");
    console.log(address);

    fdc.getStatus(0, 0, 0).then((s) => {
        console.log(JSON.stringify(s));
        fdc.donateAsWithChecksum("0xc3d2a1629d3990d8b9d9799c8675ec18c6f00247", "000247", {
            from: "0xcd8b60a0a22fb280de833778b8ee6786d32bcf82",
            gas: 35000
        }).then((s) => {
            console.log(s);
        });
    })
}