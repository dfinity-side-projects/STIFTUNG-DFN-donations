// TODO: set to exact version before release
pragma solidity >=0.4.1;

contract Parameters {

  //
  // Time Constants
  //

  // TZ="Europe/Zurich" date -d "2016-12-15 00:00" "+%s"
  uint public constant phase0StartTime      = 1481756400; 
  
  uint public constant earlyContribEndTime  = phase0StartTime - 1 days; 
  uint public constant phase0EndTime        = phase0StartTime + 6 weeks;
  uint public constant phase1StartTime      = phase0EndTime + 12 weeks;
  uint public constant phase1EndTime        = phase1StartTime + 6 weeks;
  uint public constant finalizeStartTime    = phase1EndTime   + 1 weeks;
  uint public constant finalizeEndTime      = finalizeStartTime + 1000 years;
  
  uint public constant maxDelay             = 180 days;

  uint public constant gracePeriodAfterCap  = 30 minutes;

  //
  // Token issuance
  //
  // The following configuration parameters completely govern all aspects of the token issuance.
  uint public constant tokensPerCHF = 10; // tokens assigned for the equivalent of 1 CHF in donations
  uint public constant minDonation = 1 ether; // minimal donation amount for a single on-chain donation
  uint public constant phase0Multiplier = 150; // multiplier in % applied to all donations during donation phase 0
  uint public constant phase1Steps = 5;  // number of down-steps for multiplier during donation phase 1
  uint public constant phase1StepSize = 8; // multiplier reduction per step in %
  uint public constant millionInCents = 10**6 * 100;
  uint public constant phase0Cap = 1 * millionInCents; // caps are measured in CHF cents
  uint public constant phase1Cap = 20 * millionInCents;

  uint public constant earlyContribShare = 20; // share of tokens eventually assigned to early contributors in % of all tokens eventually in existence


}
