/*
The MIT License (MIT)

Copyright (c) 2016 DFINITY Stiftung 

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

/*
 * @title:  Configuration parameters for the FDC
 * @author: Timo Hanke <timo.t.hanke@gmail.com> 
 */
 
pragma solidity ^0.4.6;

contract Parameters {

  /*
   * Time Constants
   *
   * Phases are, in this order: 
   *  earlyContribution: defined by end time
   *  pause
   *  donation phase0: defined by start and end time
   *  pause
   *  donation phase1: defined by start and end time
   *  pause
   *  finalization: defined by start time, ends manually
   *  done
   */

  // The start of phase 0 is set to 2016-12-19 19:00 of timezone Europe/Zurich
  // TZ="Europe/Zurich" date -d "2016-12-15 00:00" "+%s"
  uint public constant phase0StartTime      = 1481756400; 
  
  // The other phase transitions are defined by offsets from the start of phase 0
  uint public constant earlyContribEndTime  = phase0StartTime - 1 days; 
  uint public constant phase0EndTime        = phase0StartTime + 6 weeks;
  uint public constant phase1StartTime      = phase0EndTime + 12 weeks;
  uint public constant phase1EndTime        = phase1StartTime + 6 weeks;
  uint public constant finalizeStartTime    = phase1EndTime   + 1 weeks;
  
  // The finalization phase has a dummy end time because it is ended manually
  uint public constant finalizeEndTime      = finalizeStartTime + 1000 years;
  
  // The maximum time by which donation phase 1 can be delayed from the start time defined above
  uint public constant donPhase1MaxDelay    = 180 days;

  // The time for which donation phases remain open after they reach their respective targets   
  uint public constant gracePeriodAfterTarget  = 30 minutes;

  /*
   * Token issuance
   * 
   * The following configuration parameters completely govern all aspects of the token issuance.
   */
  
  // Tokens assigned for the equivalent of 1 CHF in donations
  uint public constant tokensPerCHF = 10; 
  
  // Minimal donation amount for a single on-chain donation
  uint public constant minDonation = 1 ether; 
 
  // Bonus in percent applied to phase 0 donations 
  uint public constant phase0Bonus = 50; // multiplier in % applied to all donations during donation phase 0
  
  // Bonus in percent at beginning of donation phase 1  
  uint public constant phase1InitialBonus = 40;
  
  // Number of down-steps for the bonus during donation phase 1
  uint public constant phase1BonusSteps = 5;
 
  // The CHF targets for each of the donation phases, measured in cents of CHF 
  uint public constant millionInCents = 10**6 * 100;
  uint public constant phase0Target = 1 * millionInCents; 
  uint public constant phase1Target = 20 * millionInCents;

  // Share of tokens eventually assigned to early contributors in % of all tokens eventually in existence
  uint public constant earlyContribShare = 20; 
}
