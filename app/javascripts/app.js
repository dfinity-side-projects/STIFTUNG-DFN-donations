"use strict";

// *
// *** Main ***
// *

var ui;  // user interface wrapper
var backend; // our main application
var state;
var viewBinder;

var defaultBindings = function(binder, backend) {
    var bindings = {
        "ethereum-client-status": "eth-client-status",
        "ethereum-node":"btn-ethereum-node",
        "genesis-dfn": ui.currencyHandler("genesis-dfn"),
        "donated-eth": ui.currencyHandler("donated-eth",2),
        "countryCode": ui.locationHandler,
        "current-task": ui.setCurrentTask,
        "logger": ui.loggerHandler,
        "funder-total-received": ui.funderReceivedHandler,
        "forwarded-eth":"donated-eth",
        "remaining-eth":ui.currencyHandlers(["waiting-eth", "withdraw-waiting-eth"],2),
        "eth-address":["eth-address","eth-forwarding-address-explained"],
        "dfn-address":"dfn-address",
        "seed": "",
    }
    binder.bindAll(bindings);
    binder.watchObjectProp(backend.accs.ETH, "addr", ViewBinder.DEFAULT_ELEMENT_HANDLER("eth-address"));
    binder.watchObjectProp(backend.accs.DFN, "addr", ViewBinder.DEFAULT_ELEMENT_HANDLER("dfn-address"));

}

window.onload = function() {
    console.log("Wiring up HTML DOM...");

    web3.eth.getAccounts(function(err, accs) {
        // First initialize UI wrapper so we can report errors to user
        console.log("Wiring up HTML DOM...");
        ui = new UI();
        console.log("User interface ready.");
        console.log(accs);

        // Initialize constants
        // TODO: dynamic gas price
        GAS_PRICE           = web3.toBigNumber(20000000000); // 20 Shannon
        MIN_DONATION        = web3.toWei('1', 'ether');
        MAX_DONATE_GAS      = 200000; // highest measured gas cost: 138048
        MAX_DONATE_GAS_COST = web3.toBigNumber(MAX_DONATE_GAS).mul(GAS_PRICE);
        MIN_FORWARD_AMOUNT  = web3.toBigNumber(MIN_DONATION).plus(MAX_DONATE_GAS_COST);
        VALUE_TRANSFER_GAS_COST = web3.toBigNumber(VALUE_TRANSFER_GAS).mul(GAS_PRICE);


        //
        // Load current account details from Storage
        //

        //
        // Initialize our Ethereum accounts, and DFN private key
        // (if they exist already)
        //

        // TODO: persistence of accounts. for now, for testing, we generate new accounts on each load.
        // TODO: remember to clear userAccounts.seed after user has backed it up!
        state = new AppState();
        var userAccounts = new Accounts();
        backend = new Backend(userAccounts, state);

        // ui.logger("user accounts created");
        // console.log("userAccounts: " + JSON.stringify(userAccounts));
        state.logger("now starting Backend");
        state.logger("Restoring defaults from storage");

        //
        // Bootstrap our app...
        //

        viewBinder = new ViewBinder(state);
        defaultBindings(viewBinder, backend);
     viewBinder.startUpdate();

        //app = new Backend(account, account, true);
    });
}