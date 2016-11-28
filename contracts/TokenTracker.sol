// TODO: set to exact version before release
pragma solidity >=0.4.1;

import "TokenInterface.sol";

contract TokenTracker is TokenInterface {
  uint public restrictedShare; // share of tokens eventually assigned to early contributors in % of all tokens eventually in existence

  uint public constant expandFraction = 100;

  mapping(address => uint) public tokens;
    // A mapping which tracks how many tokens are assigned to each address

  mapping(address => uint) public restrictions;
    // A mapping which tracks how many of the tokens assigned by the mapping above are subject to restriction due to stemming from early contributions
    // Restricted tokens can be burned in the finalization phase.
    // Tokens stemming from donations are never restricted and cannot be burned.

  uint public totalRestrictedTokens; // total number of restricted tokens currently in existence
  uint public totalUnrestrictedTokens; // total number of unrestricted tokens currently in existence
  uint public totalRestrictedAssignments; // total number of restricted token assignment calls
  uint public totalUnrestrictedAssignments; // total number of unrestricted tokens assignment calls

  bool public assignmentsClosed = false;
  uint public burnMultDen;
  uint public burnMultNom;

  function TokenTracker(uint _restrictedShare) {
    restrictedShare = _restrictedShare;
  }
  
  function assign(address addr, uint tokenAmount, bool restricted) internal {
    // no more assignments after we started calling unrestrict()
    if (assignmentsClosed) { throw; }

    // assign tokens
    tokens[addr] += tokenAmount;

    // record restrictions and update total counters
    if (restricted) {
      totalRestrictedTokens += tokenAmount;
      totalRestrictedAssignments += 1;
      restrictions[addr] += tokenAmount;
    } else {
      totalUnrestrictedTokens += tokenAmount;
      totalUnrestrictedAssignments += 1;
    }
  }

  function closeAssignments() internal {
    // Flag that the static variables have been set and should not be recalculated ever again
    assignmentsClosed = true;

    // Calculate the total number of tokens that should exist after the finalization phase.
    // This is based on the total number of tokens assigned for donations (equal to the total
    // unrestricted tokens at the beginning of the finalization phase) and the percentage in
    // tokens targeted for early contributor tokens.
    uint totalTokensTarget = (totalUnrestrictedTokens * 100 * expandFraction) / ((100 - restrictedShare) * expandFraction);
    // Given 0 <= earlyContribShare <= 100, we have totalTokensTarget >= totalUnrestrictedTokens.

    // Calculate the total number of tokens in existence at the beginning of the finalization
    // phase.
    uint totalTokensExisting = totalRestrictedTokens + totalUnrestrictedTokens;
    // We have totalTokensExisting <= totalRestrictedTokens + totalTokensTarget
      
    // Calculate the total number of tokens that need to be burned to bring the existing
    // number down to the target number. If the existing number is lower than the target
    // then we won't burn anything.
    uint totalBurn = 0; 
    if (totalTokensExisting > totalTokensTarget) {
      totalBurn = totalTokensExisting - totalTokensTarget; 
    }
    // We have totalBurn <= totalRestrictedTokens

    // The tokens to burn will be taken entirely from the restricted tokens in existence.
    // Define the fraction of restricted tokens to be burned by it nominator and denominator.
    burnMultNom = totalBurn;
    burnMultDen = totalRestrictedTokens;
    // We have burnMultNom <= burnMultDen. If burnMultDen = 0 then necessarily also burnMultNom = 0.

  }

  // Returns the ceiling of (x*a)/b
  // Rounding up is the same as adding 1-epsilon and rounding down.
  // 1-epsilon is modeled as (b-1)/b below.
  // b = 0 leads to an error unless a = 0 in which case the return value is 0.
  // If a=0 then zero is returned (even if b=0).
  function fractionalMultCeiling(uint x, uint a, uint b) returns (uint) {
    if (a == 0) { return 0; }
    
    return (x * a + (b - 1)) / b; 
  }
    
  // "Unrestrict" all restricted tokens assigned to the given address.
  // This is only possible during the finalization phase, for otherwise we wouldn't know how many restricted tokens to burn.
  // Note: unrestrict and assign must not be called out of order
  // TODO: find better name for inFinalization (firstCallOfUnrestict)
  function unrestrict(address addr) internal returns (uint) {
    if (!assignmentsClosed) { throw; }

    // The number of tokens assigned to the given address that are subject to restrictions
    // Only proceed if there are any with restrictions
    uint restrictionsForAddr = restrictions[addr];
    if (restrictionsForAddr == 0) { throw; }

    // Apply the burn multiplier to the balance of restricted tokens.
    // The intended value is the ceiling of the value: (earlyContribRestrictions[addr] * burnMultNom) / burnMultDen
    // If the denominator is zero then the nominator is also necessarily zero and the intended result is zero.
    // TODO look at the rounding again
    uint burn = fractionalMultCeiling(restrictionsForAddr, burnMultNom, burnMultDen);

    // Update state variables
    // Remove the tokens to be burned from the address's balance
    tokens[addr] -= burn;
    // Delete record of restrictions 
    delete restrictions[addr];
    
    // Update the state tracking variables accordingly
    // All restricted tokens from this address have been either burned or are no longer restricted
    totalRestrictedTokens   -= restrictionsForAddr;
    // The non-burned tokens from this address are now unrestricted
    totalUnrestrictedTokens += restrictionsForAddr - burn;
      
    return burn;
  }

  function isUnrestricted() constant returns (bool) {
    return (totalRestrictedTokens == 0);
  }

  //
  // TokenInterface callbacks
  //
  // The totalSupply() function returns the total number of unrestricted tokens, which is equal to
  //   before finalization: the number of token assigned for donations
  //   after finalization: the number of all tokens
  function totalSupply() constant returns (uint256 balance) { return totalUnrestrictedTokens; }

  // returns dfinity tokens allocation
  function balanceOf(address owner) constant returns (uint256 balance) { return tokens[owner]; }

  // empty interface
  function transfer(address to, uint256 amount) returns (bool success)                    { throw; }
  function transferFrom(address from, address to, uint256 amount ) returns (bool success) { throw; }
  function approve(address spender, uint256 amount) returns (bool success)                { throw; }
  function allowance(address owner, address spender) constant returns (uint256 remaining) { throw; }
}
