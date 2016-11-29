contract('FDC', function(accounts) {
   it("It should initialize the donation count to zero", function() {
       var fdc = FDC.deployed();
       return fdc.donationCount.call().then(function(count) {
           assert.equal(count.valueOf(), 0, "Donation count wasn't initialized to zero");
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
   
});