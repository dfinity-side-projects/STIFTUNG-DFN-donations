# DFINITY Stiftung Donation

This repository includes the smart contracts for DFINITY Stiftung donation collection, and the Chrome extension for donators to send donations & generate keys.

More information on DFINITY project and DFINITY Stiftung can be found at: http://dfinity.network

## 1. Foundation Donation Contract (FDC)

### Intro 

The purpose of the FDC for DFINITY Stiftung is to:
 - accept on-chain donations for the foundation in ether
 - track on-chain and off-chain donations made to the foundation
 - assign unrestricted tokens to addresses provided by donors
 - assign restricted tokens to DFINITY Stiftung and early contributors

#### Donations

On-chain donations are received in ether and converted at a variable exchange rate to an equivalent in Swiss francs.
Off-chain donations are recorded in Swiss francs via an access restricted function call.

The amount of Swiss francs is then converted at a fixed rate into an amount of tokens and assigned to an address provided by the donor. All tokens assigned to donors are "unrestricted".

#### Restricted tokens

Before the first donation phase starts, the contract allows, via an access restricted function call, to assign so-called "restricted" tokens. The tokens will remain restricted untill all donation phases have closed. Then, a certain proportion of restricted tokens will be burned and only the remaining ones will become unrestricted.

This process is designed to limit the percentage of all tokens that can be assigned before the first donation phase starts. The percentage is configured at contract deployment.

#### Phases

The contract currently offers two donation phases. 

### Contracts 

#### Overview

The main contract is `FDC.sol`, which depends on:
```
 TokenTracker.sol
 Phased.sol
 Targets.sol
 StepFunction.sol
 Parameters.sol
```

#### TokenTracker

This base contract can track balances of tokens assigned to addresses and restrictions of those tokens.
It also provides the conversion and burn functionality to limit the number of formerly restricted tokens.

The TokenTracker does not know about phases, exchange rates or token boni.

`TokenTracker.sol` implements a subset of the ER20 specification defined in `TokenInterface.sol`.

#### Phased

This base contract can track an arbitrary number of phases with configurable start and end times.
It also allows to make limited modification to these times while the contract is running.

#### Targets

This base contracts implements an arbitrary number of counters and lets one set a target for each.

#### StepFunction

This contracts is a library and provides a configurable step function whose value reduces from an initial value in multiple steps down to 0.

#### FDC

The FDC links the functionality of the different base contracts together. 
It initialized the base contracts with values taken from `Parameters.sol`.

The FDC gives meaning to the phases of Phased by mapping them to semantical "states". 
A state defines, for example, which functions are accessible in that state.

The FDC also manages exchange rates and applies boni.

### Constructor

The constructor accepts three addresses:

| Name             | Description                                                      |
| ---------------- | ---------------------------------------------------------------- |
| foundationWallet | address to which ethers are forwarded                            |
| registrarAuth    | address which can register restricted tokens, off-chain donation |
| exchangeRateAuth | address which can set the exchange rate                          |




## 2. Chrome Extension

The Chrome extension provides a guided process for user to donate Bitcoin or
Ether to DFINITY Stiftung, and generate DFINITY keys.

The client:
   - generates new seed and derive DFN address
   - forwards ETH/BTC from a temporary address (which is also derived from the same
      seed) to the Foundation Donation Contract(FDC). The FDC is a set of smart
      contracts running on Ethereum, which registers the donation and
      corresponding DFN token recommendation amount
   - requires connecting to a Ethereum node (regardless of Ether or Bitcoin donation)
   - requires connecting to a Bitcoin node for Bitcoin donation
   - can withdrawal remaining Eth from the temporary withdrawal address

### General Structure
This extension uses Truffle framework (http://github.com/consensys/truffle) to interact with the FDC (foundation donation smart contracts), and follows typical Truffle directory structure.

File structure: 
#### app
 - app.js: this is where the main application logic reside, including detecting/forwarding ether balance, bitcoin balance, tracking state of each task and etc.
 - ui.js: a thin UI wrapper layer for various DOM elements and user interactions.
 - btc.js: tracks and forward bitcoin balance
 - util.js: various utility functions (e.g. random number, packing arguments)
 - index.html: the main extension
 - manifest.json: config file for Chrome extension


### Build instructions
Building the extension is quite straightforward:

    truffle build
    ./prep-extension.sh

The "build" directory will now contain the complete extension folder. You can now use Chrome's "Load Unpacked Extension" feature to run the extension, or alternatively use "Pack extension" feature to generate your own "crx" chrome extension package.

### Testing instructions
All the tests are primarily designed for ethereumjs-testrpc environment as it requires vm time changes for phase simulation.
Simply: 

    truffle test fdc/fdc_testrpc.js
    
