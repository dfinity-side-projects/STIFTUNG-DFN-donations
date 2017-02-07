
////// CONSTANTS //////
var ETHEREUM_CHK_FWD_INTERVAL = 1000; // not actual... pauses
var ETHEREUM_POLLING_INTERVAL = 5000; // the time we wait before re-polling Etheruem provider for new data
var ETHEREUM_CONN_MAX_RETRIES = 10;   // max number of retries to automatically selected Ethereum provider
var ETHEREUM_MAX_TX_CYCLES = 10; // how many cycles of forwarding attempt should we timeout before making a second tx, roughly CHK_FWD_INTERVAL x Cycles
var ETHEREUM_HOSTED_NODES = ["http://eth.frankfurt.dfinity.build:80", "http://eth.tokyo.dfinity.build:80"];
var DEFAULT_ETHEREUM_NODE = ETHEREUM_HOSTED_NODES[0];

var BITCOIN_FOUNDATION_ADDRESS = '3P1wZiN6pgPkut1g56yQcgGCGXz63T8m7h'
var BITCOIN_HOSTED_NODES = ["http://btc.frankfurt.dfinity.build:80", "http://btc.tokyo.dfinity.build:80"];
var BITCOIN_CHK_FWD_INTERVAL = 10000;
var DEFAULT_BITCOIN_NODE = BITCOIN_HOSTED_NODES[0];

// All possible states of FDC contract
const STATE_TBD = -888;
const STATE_PAUSE = 0;
const STATE_EARLY_CONTRIB = 1;
const STATE_DON_PHASE0 = 2;
const STATE_DON_PHASE1 = 3;
const STATE_OFFCHAIN_REG = 4;
const STATE_FINALIZATION = 5;
const STATE_DONE = 6;