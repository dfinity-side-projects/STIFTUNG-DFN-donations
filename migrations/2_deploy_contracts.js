module.exports = function(deployer, network) {
    if (network != "live") {
	var name = "Testnet FDC"; 
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
        deployer.deploy(FDC, registrar, name).then(function() {
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
        // Deploy FDC with master from Ledger wallet
        //
	var name = "STIFTUNG Dfinity FDC"; 
        var masterAddr = "0x651D3FA1fC80459D235b233Fa8356b265883E073";

        deployer.deploy(FDC, masterAddr, name);
    }
};
