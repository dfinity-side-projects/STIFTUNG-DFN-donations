module.exports = function(deployer, network) {
    if (network != "live") {
        var accounts = web3.eth.accounts;
        var walletAddr = accounts[0];
        var registrar = accounts[1];
        var exchangeRateAddr = accounts[2];
        if (network == "ropsten") {
            walletAddr = registrar = exchangeRateAddr = "0x8C482C7793c98a01B0bf03b332436f53325A7d2B";
        } else if (network == "live") {
            walletAddr = registrar = exchangeRateAddr = "0x0a6e23d3a9d6a1ed31f4791614bbc44c04930c66";
        }
        //
        // Deploy FDC using the standard accounts provided by testRPC for testing
        // purposes. These can be accessed from any test unit :)
        //
        deployer.deploy(FDC, walletAddr, registrar).then(function() {
            // deployed OK!
            var fdc = FDC.deployed();
            console.log("FDC deployed at "+fdc.address+"\nUsing controllers:\n"+
                " foundationWalletAddr =    "+walletAddr+"\n donationRegistrarAddr =   "+
                registrar+"\n exchangeRateUpdaterAddr = "+ exchangeRateAddr);
            // configure initial exchange rate necessary for operation

            /*fdc.setWeiPerCHF(web3.toWei('0.125', 'ether'), {gas:300000, from: exchangeRateAddr}).then(function(txID) {
                console.log("Configured initial exchange rate for new FDC");
            }).catch(function(e) {
                console.log("Exception setting initial exchange rate in FDC: "+e);
                throw e;
            });
            */

        }).catch(function(e) {
            console.log("Error deploying FDC");
        });
    } else {
        //
        // TODO add identities of multi-sig controllers for production!!
        //
        var foundationWalletAddr = "0x733DcDb9a7C60067d65eC731C49e95eD995e59fD";
        // Identity of dummy registrar
        var donationRegistrarAddr = "0x733DcDb9a7C60067d65eC731C49e95eD995e59fD";
        // Identity of dummy exchange rate updater
        var exchangeRateUpdaterAddr = "0x733DcDb9a7C60067d65eC731C49e95eD995e59fD";

        deployer.deploy(FDC, foundationWalletAddr, donationRegistrarAddr);
    }
};
