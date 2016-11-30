contract('FDC', function(accounts) {   
  it("We will set the Wei to CHF exchange rate", function() {
    var fdc = FDC.deployed();
    return fdc.setWeiPerCHF(web3.toWei('0.125', 'ether'), {gas:300000, from: accounts[2]}).then(function(txID) {
      console.log("Successfully set the exchange rate!");
    }).catch(function(e) {
      console.log("Test exception: "+e);
      throw e;        
    });
  });
});