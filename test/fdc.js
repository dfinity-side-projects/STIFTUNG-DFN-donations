contract('FDC', function(accounts) {
  it("It should initialize the donation count to zero", function() {
     var fdc = FDC.deployed();
     return fdc.donationCount.call().then(function(count) {
         assert.equal(count.valueOf(), 0, "Donation count wasn't initialized to zero");
     });
  });
   
  it("We will set the Wei to CHF exchange rate", function() {
    var fdc = FDC.deployed();
    console.log("Setting exchange rate on FDC at "+fdc.address);
    return fdc.setWeiPerCHF(web3.toWei('0.125', 'ether'), {gas:300000, from: accounts[2]}).then(function(txID) {
      console.log("Successfully set the exchange rate!");
    }).catch(function(e) {
      console.log("Test exception: "+e);
      throw e;        
    });
  });   

  it("We should get some stats back", function() {
     var fdc = FDC.deployed();
     var donationPhase=0;
     var dfnAddr=accounts[0];
     var fwdAddr=accounts[0];
     return fdc.getStatus(donationPhase, dfnAddr, fwdAddr).then(function(res) {
         var currentState = res[0];   // current state (an enum)
         var fxRate = res[1];         // exchange rate of CHF -> ETH (Wei/CHF)
         var donationCount = res[2];  // total individual donations made (a count)
         var totalTokenAmount = res[3];// total DFN planned allocated to donors
         var startTime = res[4];      // expected start time of specified donation phase
         var endTime = res[5];        // expected end time of specified donation phase
         var isCapReached = res[6];   // whether target cap specified phase reached
         var chfCentsDonated = res[7];// total value donated in specified phase as CHF
         var tokenAmount = res[8];    // total DFN planned allocted to donor (user)
         var fwdBalance = res[9];     // total ETH (in Wei) waiting in fowarding address
  
         console.log("Received from getStatus(): "+JSON.stringify(res));
         assert.equal(chfCentsDonated.valueOf(), 0, "Donation count wasn't initialized to zero");
     }).catch(function(e) {
        console.log("Test exception: "+e);
        throw e;
     });
  });

  it("ETH Forwarding from test account", function() {
    FDC.new(accounts[0], accounts[1], accounts[2]).then(function(fdc) {
      console.log("New FDC instance addr: " + fdc.address);

      // setWeiPerCHF equal to 10 CHF per ETH
      fdc.setWeiPerCHF(web3.toWei('0.1', 'ether'), {gas:300000, from: accounts[2]}).then(function(txID) {
        console.log("fdc.setWeiPerCHF tx id: " + txID);

        // calculate gas & amount to forward
        var gasPrice            = web3.toBigNumber(20000000000); // 20 Shannon
        var FDCMinDonation      = web3.toWei('1', 'ether');
        var FDCDonateGasMax     = 200000; // highest measured gas cost: 138048
        var gasCost             = web3.toBigNumber(FDCDonateGasMax).mul(gasPrice);
        var minBalance          = web3.toBigNumber(FDCMinDonation).plus(gasCost);

        var ETHForwardAddr      = accounts[4];
        var DFNAddr             = accounts[5];
        var balance             = web3.eth.getBalance(ETHForwardAddr);

        if (ETHForwardAddr == null || web3.toBigNumber(balance).lt(minBalance)) {
          assert.isOk(false, 'not enough balance to forward');
        } else {
          console.log("enough balance for forwarding: " + web3.fromWei(balance, 'ether') + " ETH");

          var accNonce   = web3.eth.getTransactionCount(ETHForwardAddr);
          var txFee      = web3.toBigNumber(gasPrice).mul(web3.toBigNumber(FDCDonateGasMax));
          var value      = web3.toBigNumber(web3.toWei('2', 'ether')).sub(txFee); // TODO: all ether: balance.sub(txFee);
          console.log("txFee: " + txFee);
          console.log("amount: " + value);
          //var txData     = "0x" + packArg(donateAs, app.DFNAcc.addr);
          fdc.donateAs(DFNAddr,
                       {from: ETHForwardAddr,
                        value: value,
                        gasPrice: gasPrice,
                        gas: FDCDonateGasMax}).then(function(txID) {
              console.log("Forwarding tx id: " + txID);
              // verify donation was registered
              fdc.donationCount.call().then(function(count) {
                assert.equal(count.valueOf(), 1, "Donation count not 1");
              });
            }).catch(function(e) {
              console.log("Error sending ETH forwarding tx: " + e);
            });
        }

      }).catch(function(e) {
        console.log("Error fdc.setWeiPerCHF tx: " + e);
        //throw e;
      });

    }).catch(function(e) {
      console.log("Error deploying new FDC: " + e);
      //throw e;
    });

  });
});
