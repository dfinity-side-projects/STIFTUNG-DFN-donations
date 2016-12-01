module.exports = function(deployer, network) {

  if (network != "live") {
    //
    // Deploy FDC using the standard accounts provided by testRPC for testing
    // purposes. These can be accessed from any test unit :)
    //
    var accounts = web3.eth.accounts;
    deployer.deploy(FDC, accounts[0], accounts[1], accounts[2]).then(function() {
      // deployed OK!
      var fdc = FDC.deployed();
      console.log("FDC deployed at "+fdc.address+"\nUsing controllers:\n"+
        " foundationWalletAddr =    "+accounts[0]+"\n donationRegistrarAddr =   "+
        accounts[1]+"\n exchangeRateUpdaterAddr = "+accounts[2]);
      // configure initial exchange rate necessary for operation

      fdc.setWeiPerCHF(web3.toWei('0.125', 'ether'), {gas:300000, from: accounts[2]}).then(function(txID) {
        console.log("Configured initial exchange rate for new FDC");
      }).catch(function(e) {
        console.log("Exception setting initial exchange rate in FDC: "+e);
        throw e;
      });

    }).catch(function(e) {
      console.log("Error deploying FDC");
    });
  } else {
    //
    // TODO add identities of multi-sig controllers for production!!
    //
    var foundationWalletAddr = "...";
    // Identity of dummy registrar
    var donationRegistrarAddr = "...";
    // Identity of dummy exchange rate updater
    var exchangeRateUpdaterAddr = "...";

    deployer.deploy(FDC, foundationWalletAddr, donationRegistrarAddr, exchangeRateUpdaterAddr);
  }
};
