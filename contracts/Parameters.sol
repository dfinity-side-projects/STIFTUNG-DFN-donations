// TODO: set to exact version before release
pragma solidity >=0.4.1;

contract Parameters {

  //
  // Time Constants
  //

  /*
  uint public constant phase1StartTime      = 1488322800; // 2017-03-01 00:00:00
  uint public constant phase1EndTime        = phase1StartTime + 6 weeks;
  uint public constant earlyContribEndTime  = 1478386800; // 2016-11-06 00:00:00
  uint public constant phase_0_start_time   = 1478473200; // 2016-11-07 00:00:00
  uint public constant phase0EndTime        = phase_0_start_time + 6 weeks;
  uint public constant phase1StartTime      = 1488322800; // 2017-03-01 00:00:00
  uint public constant phase1EndTime        = phase1StartTime + 6 weeks;
  uint public constant finalizeStartTime = phase1EndTime   + 1 weeks;
  */
  /* TODO: comment in real times after testing & audits */
  // Swiss times (UTC+01:00)

  // We could move all this into the constructor but it is convenient to have as constants for the test code

  uint public constant earlyContribEndTime  = now - 1 hours;
  uint public constant phase0StartTime      = now + 1;
  uint public constant phase0EndTime        = now + 10 hours;
  uint public constant phase1StartTime      = now + 11 hours;
  uint public constant phase1EndTime        = now + 15 hours;
  uint public constant finalizeStartTime    = now + 16 hours;
  uint public constant finalizeEndTime      = now + 1000 years;
  uint public constant maxDelay             = 180 days;

  /* TODO: replace with above after testing & audits
     NOTE: backends.SimulatedBackend genesis timestamp is 0 and non-trivial
           to make working for arbitrary times as it uses the "live"
           blockchain importing code which prohibits blocks in the future

           Since the FDC logic works over any time frames as long as
           the phases are consecutive and non-overlapping this is OK
           for unit tests.
  */

  // The following configuration parameters define the transition times between phases.
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
