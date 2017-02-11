////// CONSTANTS //////

const constants = {
    // ETH constants
    ETHEREUM_CHK_FWD_INTERVAL: 3000, // not actual... pauses
    ETHEREUM_CONN_POLLING_INTERVAL: 1000, // the time we wait before re-polling Etheruem provider for new data
    ETHEREUM_POLLING_INTERVAL: 5000, // the time we wait before re-polling Etheruem provider for new data
    ETHEREUM_CONN_MAX_RETRIES: 10, // max number of retries to automatically selected Ethereum provider
    ETHEREUM_MAX_TX_CYCLES: 10, // how many cycles of forwarding attempt should we timeout before making a second tx, roughly CHK_FWD_INTERVAL x Cycles
    ETHEREUM_TX_TIMEOUT: 240000, // how many ms delay before timeout / fail a ETH tx
    ETHEREUM_HOSTED_NODES: ["https://eth.frankfurt.dfinity.build", "https://eth.tokyo.dfinity.build"],
    VALUE_TRANSFER_GAS: 30000,

    // These ETH constants will be initialized upon window load because of dependency on web3
    GAS_PRICE: undefined, // estimate price of gas
    MIN_DONATION: undefined, // minimum donation allowed
    MAX_DONATE_GAS: undefined, // maximum gas used making donation
    MAX_DONATE_GAS_COST: undefined, // estimate maximum cost of gas used
    MIN_FORWARD_AMOUNT: undefined, // minimum amount we will try to forward
    VALUE_TRANSFER_GAS_COST: undefined,

    // BTC CONSTANTS
    BITCOIN_FOUNDATION_ADDRESS: '3JqsZhBnPbUvaEcTz6opfSFwddYu1YqBvt',
    BITCOIN_HOSTED_NODES: ["https://btc.frankfurt.dfinity.build", "https://btc.tokyo.dfinity.build"],
    BITCOIN_CHK_FWD_INTERVAL: 5000,

    // All possible states of FDC contract
    STATE_TBD: -888,
    STATE_PAUSE: 0,
    STATE_EARLY_CONTRIB: 1,
    STATE_DON_PHASE0: 2,
    STATE_DON_PHASE1: 3,
    STATE_OFFCHAIN_REG: 4,
    STATE_FINALIZATION: 5,
    STATE_DONE: 6,

    // SHOW_XPUB
    SHOW_XPUB: false,
    DEV_MODE: false,

    // FDC PRODUCTION ADDR
    FDC_PRODUCTION_ADDR: "0x1Be116204bb55CB61c821a1C7866fA6f94b561a5",

    // FDC ABI signatures
    donateAsWithChecksum: "ceadd9c8",

    default: () => {
        constants.DEFAULT_ETHEREUM_NODE = "hosted";
        constants.DEFAULT_BITCOIN_NODE = "hosted";
    }
}

console.log(JSON.stringify(constants));
constants.default();

module.exports = constants;
