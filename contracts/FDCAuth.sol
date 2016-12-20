pragma solidity ^0.4.6;

import "Wallet.sol";

contract multiauth is multiowned {
  address public toAddr;
  uint public nProposals;

  mapping (bytes32 => bytes) public proposalData;

  // keep this around for iteration over proposals
  mapping (uint => bytes32) public proposalHash;
  mapping (bytes32 => uint) public proposalNumber;

  function multiauth (address[] _owners, uint _required) multiowned(_owners, _required) { }

  event Proposal(uint n, bytes32 hash);
  event Confirmation(uint n, bytes32 hash);
  event Execution(uint n, bytes32 hash);

  function propose(bytes _data) public onlyowner returns (uint) {
    nProposals++;

    bytes32 hash = sha3(nProposals, _data);

    // record call data
    proposalData[hash] = _data;

    // record enumeratable proposal hash (plus reverse lookup of its index)
    proposalHash[nProposals] = hash;
    proposalNumber[hash] = nProposals;

    Proposal(nProposals, hash);

    // auto-confirm each proposal by msg.sender
    confirm(hash);

    return nProposals;
  }

  function confirm(bytes32 hash) public onlyowner returns (bool) {
    uint n = proposalNumber[hash];
    if (n == 0) { throw; } // no proposal found (we don't allow confirmation before proposal)

    Confirmation(n, hash);

    if (confirmAndCheck(hash)) {
      bytes memory data = new bytes(proposalData[hash].length);
      data = proposalData[hash];

      delete proposalData[hash];
      delete proposalHash[proposalNumber[hash]];
      delete proposalNumber[hash];

      if (!toAddr.call(data)) { throw; }
      Execution(n, hash);
    }

    return true;
  }

  function setToAddr(address _toAddr) public onlyowner {
    if (toAddr != 0) { throw; } // one-time set
    toAddr = _toAddr;
  }
}

contract FDCAuth is multiauth {
  // workaround due to that external function calls cannot return dynamicly sized data.
  bytes tmp;


  function FDCAuth(address[] _owners, uint _required) multiauth(_owners, _required) {
  }

  //
  // FDC-specific shortcuts
  //
  function proposeEarlyContribution(address addr, uint tokenAmount, bytes32 memo) public onlyowner returns (uint) {
    this.registerEarlyContrib(addr, tokenAmount, memo);
    return propose(tmp);
  }

  function proposeOffChainDonation(address addr, uint timestamp, uint tokenAmount, string currency, bytes32 memo) public onlyowner returns (uint) {
    this.registerOffChainDonation(addr, timestamp, tokenAmount, currency, memo);
    return propose(tmp);
  }

  function proposeWeiPerCHF(uint weis) public onlyowner returns (uint) {
    this.setWeiPerCHF(weis);
    return propose(tmp);
  }

  //
  // Used to return ABI encoding for FDC APIs
  //
  function registerEarlyContrib(address addr, uint tokenAmount, bytes32 memo) external returns (bool) {
    tmp = msg.data;
    return true;
  }
  function registerOffChainDonation(address addr, uint timestamp, uint tokenAmount, string currency, bytes32 memo) external returns (bool) {
    tmp = msg.data;
    return true;
  }
  function setWeiPerCHF(uint weis) external returns (bool) {
    tmp = msg.data;
    return true;
  }
}
