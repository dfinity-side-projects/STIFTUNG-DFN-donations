// *

// *** User interface wrapper ***
// *
"use strict";


// Constructor
var UI = function () {
    this.wireUpDOM();
    this.tasks = ["task-agree", "task-create-seed", "task-understand-fwd-eth", "task-donate"];
}

// Wire up event handlers of UI.
// This is necessary because Google Chrome extension will not allow inline
// Javascript at highest manifest security setting.
UI.prototype.wireUpDOM = function () {
    // TODO
}

UI.prototype.loggerHandler = function (logs) {
    var log = document.getElementById('console');
    for (var k in logs) {
        var text = logs[k];
        // Format & write user interface log...
        var d = new Date();
        var time = document.createElement("SPAN");
        time.innerHTML = padNumber("00", d.getHours()) + ":" + padNumber("00", d.getMinutes());
        var line = document.createElement("DIV");
        line.appendChild(time);
        line.innerHTML += '&nbsp; ' + text;
        // console.log(line);
        log.insertBefore(line, log.childNodes[0]);
    }
}

// Set status of Etheruem client
UI.prototype.setEthereumClientStatus = function (status) {
    document.getElementById('eth-client-status').innerHTML = status;
}

UI.prototype.locationHandler = function (countryCode) {
    if (countryCode != "US" && countryCode != undefined) {
        enableButton("agree-terms-button");
        hideElement("us-person-error");
    } else if (countryCode == "US") {
        // IMPORTANT TODO: need to change to disable rather than enable. This is only for dev / debugging.
        // disableButton("agree-terms-button");
        enableButton("agree-terms-button");
        showElement("us-person-error");
    }
}

// Set the allocation of Genesis DFN to be recommended for user
UI.prototype.currencyHandler = function (k, n) {
    if (n == undefined)
        n = 0;
    return function (amt) {
        if (amt == undefined)
            setElementText(k,"?");
        else
            setElementText(k, formatCurrency(amt, "", n));
    }
}


// Set the allocation of Genesis DFN to be recommended for user
UI.prototype.currencyHandlers = function (keys, n) {
    return function(amt) {
        for (var v in keys) {
            ui.currencyHandler(keys[v], n)(amt);
        }
    }
}



// Set the forwarding address the user should send ETH donations to
// Set the DFN address the user might want ot communicate to  Dfinity Stiftung
UI.prototype.addressHandler = function (k, v) {
    if (v == undefined)
        v = "?";
    setElementText(k, web3.toChecksumAddress(v));
}

UI.prototype.generateSeed = function () {
    seed = backend.generateSeed();
    this.setUserSeed(seed);
    enableButton("after-create-seed-button");
}

// Set the user seed
UI.prototype.setUserSeed = function (seed) {
    var s = getChildWithClass(document.getElementById("create-dfn-seed"), "seed");
    // if (seed == undefined) {
    // s.innerHTML = "-- <a href='javascript:ui.generateSeed()'>create</a>, or <a href=''>restore from seed</a> --"
    // } else {
    s.innerHTML = seed;
    // }
}

// Set the total amount of donations received so far, in CHF
// -1 indicates "unknown"
UI.prototype.funderReceivedHandler = function (chf) {
    var self = ui;
    console.log ("Funder Received: " + chf);

    if (chf == undefined) {
        self.setFunderProgressBar(0);
        self.setFunderPercProgress(undefined);
        self.setFunderChfReceived(undefined);
    } else {
        var perc = chf / 1000000 * 100;
        self.setFunderProgressBar(perc);
        self.setFunderPercProgress(perc);
        self.setFunderChfReceived(chf);
    }
}
UI.prototype.setFunderProgressBar = function (perc) {
    // Configure progress bar
    var pb = document.getElementById('main-progress-bar');
    console.log ("Progress: " + perc);
    // set LEDs
    var bar = 0;
    var ns = pb.childNodes;
    for (var i = 0; i < ns.length; i++) {
        var cn = ns[i];
        if (cn.nodeType == 1) {
            // clear LED
            cn.className = "";
            // set LED if required
            if (bar * 10 < perc) {
                if ((bar + 1) * 10 <= perc || perc >= 100)
                    cn.className = 'complete';
                else
                    cn.className = 'complete blink';
            }
            bar++;
        }
    }
}
UI.prototype.setFunderPercProgress = function (perc) {
    var e = document.getElementsByClassName("lower")[0];
    if (perc == undefined)
        e.innerHTML = "? %";
    else
        e.innerHTML = Math.round(perc) + "%";
};

// General note: when a value is undefined, this indicates that the extension "doesn't know" the value.
// In fact, once the extension has connected to Ethereum/FDC, it will know how much money has been donated.
// It is possible that some money might have been donated before the official start (for example we could
// report fiat donations that had already been made, although we might choose to do this during the funder).
// The FDC will give the extension a number - 0, or whatever - and this can be displayed. A question mark
// is designed to show that the extension _doesn't_know_ something i.e. that it is uninitialized, not
// connected to Ethereum or whatever
UI.prototype.setFunderChfReceived = function (chf) {
    var e = document.getElementById("total-received");
    if (chf == undefined)
    // e.innerHTML = "0 CHF [ Funder Starting in 1h 23m ]";
    // e.innerHTML = "1,343,232 CHF [ Seed Funder Phase Complete. Thank you ]";
        e.innerHTML = "? CHF";
    else
        e.innerHTML = formatCurrency(chf, "CHF");
};



UI.prototype.makeTaskDone = function (t) {
    document.getElementById(t).className += "done-task ";
    this.tickTaskItem(t);
};

UI.prototype.tickTaskItem = function (t) {
    getChildWithClass(document.getElementById(t), "tick").childNodes[0].style.visibility = "visible";
};

resetNextTask = function (t) {
    document.getElementById(t).className = document.getElementById(t).className.replace('next-task', '');
};


// Set the current task.
// Tasks:
//	'task-agree'
//	'task-create-seed'
//	'task-understand-fwd-eth'
//	'task-donate'
UI.prototype.setCurrentTask = function (taskId) {
    // Make interface changes after a delay that allows the user to "observe" the transition
    // TODO disable clicks until interface updated
    var _ui = this;
    var f = function () {
        resetNextTask('task-agree');
        resetNextTask('task-create-seed');
        resetNextTask('task-understand-fwd-eth');
        resetNextTask('task-donate');
        var t = document.getElementById(taskId);
        t.className += 'next-task ';
    };
    setTimeout(f, 100);
}

// Tasks can only move forward if previous tasks completed.
UI.prototype.isTaskReady = function (taskId) {
    var k = this.tasks.indexOf(taskId);
    console.log("taskId " + taskId + ": index " + k)
    // Look for all previous steps to see if any one not completed
    for (var i = 0; i < k; i++) {
        if (document.getElementById(this.tasks[i]).className.indexOf("done-task") == -1)
            return false;
    }
    return true;
}

UI.prototype.cancelCreateSeed = function () {
    setElementText("seed", "");
    hideElement('create-dfn-seed');
}

UI.prototype.hideCreateSeed = function () {
    // this.markSeedGenerated();
    hideElement('create-dfn-seed');
}

UI.prototype.doImportSeed = function () {
    seed = document.getElementById('imported-seed').value;
    try {
        backend.doImportSeed(seed);
    }
    catch (e) {
        this.showImportSeedError("Error in importing seed: " + e);
        return;
    }

    state.logger("Imported new seed successfully. ETH forwarding address and DFN address have been updated.");

    // finish the dialog, clean up errors and move on
    hideElement("import-dfn-seed");
    hideElement("import-seed-error");
    this.finishCreateSeed();
}


UI.prototype.finishCreateSeed = function () {
    // Make sure we completely wipe the seed.
    this.markSeedGenerated();
    this.setCurrentTask('task-understand-fwd-eth');
    this.makeTaskDone('task-create-seed');
}

UI.prototype.showImportSeed = function () {
    document.getElementById('create-dfn-seed').style.display = 'none';
    document.getElementById('import-dfn-seed').style.display = 'block';
}

UI.prototype.hideImportSeed = function () {
    document.getElementById('import-dfn-seed').style.display = 'none';
}

UI.prototype.showCreateSeed = function () {
    if (!this.isTaskReady("task-create-seed")) {
        return;
    }
    var s = getChildWithClass(document.getElementById("create-dfn-seed"), "seed").innerHTML;
    // if (seed == undefined) {
    // s.innerHTML = "-- <a href='javascript:ui.generateSeed()'>create</a>, or <a href=''>restore from seed</a> --"
    // } else {
    if (s == "undefined" || s.trim() === "" || s=="?") {
        console.log("Seed doesn't exist ... generating a new seed.")
        this.generateSeed();
    }
    // backend.generateSeed();
    document.getElementById('create-dfn-seed').style.display = 'block';
}

UI.prototype.afterCreateSeed = function () {
    document.getElementById('create-dfn-seed').style.display = 'none';
    this.hideCreateSeed();
    this.showValidateSeed();
}

UI.prototype.showValidateSeed = function () {
    this.hideValidateSeedError();
    document.getElementById('verify-dfn-seed').style.display = 'block';
}

UI.prototype.beforeValidateSeed = function () {
    this.hideValidateSeed();
    this.showCreateSeed();
}

UI.prototype.showImportSeedError = function (e) {
    showAndSetElement("import-seed-error", "Error in importing seed: " + e);
}

UI.prototype.showValidateSeedError = function () {
    document.getElementById('verify-seed-error').style.display = 'block';
}
UI.prototype.hideValidateSeedError = function () {
    document.getElementById('verify-seed-error').style.display = 'none';
}

UI.prototype.doValidateSeed = function () {
    document.getElementById('verify-dfn-seed').style.display = 'block';

    var typedSeed = document.getElementById("typed-seed");
    var s = getChildWithClass(document.getElementById("create-dfn-seed"), "seed").innerText;
    if (s == undefined || typedSeed === undefined) {
        this.showValidateSeedError();
        return;
    }
    typedSeed = typedSeed.value.trim();
    s = s.trim();
    if (typedSeed != s && typedSeed != s) {
        this.showValidateSeedError();
        return;
    }

    // Validation passed
    backend.doImportSeed(s);

    this.hideValidateSeed();
    // Make sure we completely wipe the seed.
    this.markSeedGenerated();
    this.setCurrentTask('task-understand-fwd-eth');
    this.makeTaskDone('task-create-seed');
}

UI.prototype.markSeedGenerated = function () {
    var seedText = "Seed has already been generated and you should have safely copied it somewhere. Click Cancel button to proceed with the donation.";
    // seedText += "<a href='javascript:ui.generateSeed()'>generate new seed</a>, but all previous information will be lost.";
    this.setUserSeed(seedText);
    showAndSetElement("typed-seed", "");
    disableButton("after-create-seed-button");
}

UI.prototype.hideValidateSeed = function () {
    document.getElementById('verify-dfn-seed').style.display = 'none';
}

UI.prototype.showTerms = function () {
    document.getElementById('terms').style.display = 'block';
}

UI.prototype.hideTerms = function () {
    document.getElementById('terms').style.display = 'none';
}


UI.prototype.readTerms = function () {
    // Once agreed, it should be disabled to prevent confusion
    disableButton("agree-terms-button");
    setElementText("agree-terms-button", "You have already accepted the terms");

    document.getElementById('terms').style.display = 'none';
    this.setCurrentTask('task-create-seed');
    this.makeTaskDone('task-agree');
}

UI.prototype.showSelectEthereumNode = function () {
    document.getElementById('select-full-node').style.display = 'block';
    onKeys(ui.hideSelectEthereumNode, function () {
        ui.onSelectEthereumNode(document.getElementById('custom-full-node-address').value);
    });
}

UI.prototype.hideSelectEthereumNode = function (en) {
    document.getElementById('select-full-node').style.display = 'none';
}

UI.prototype.onSelectEthereumNode = function (en) {
    this.hideSelectEthereumNode();
    backend.setEthereumNode(en);
}

UI.prototype.showExplainForwarding = function () {
    if (!this.isTaskReady("task-understand-fwd-eth")) {
        return;
    }
    document.getElementById('explain-eth-forwarding').style.display = 'block';
}

UI.prototype.doneExplainForwarding = function () {
    document.getElementById('explain-eth-forwarding').style.display = 'none';
    this.makeTaskDone('task-understand-fwd-eth');
    this.setCurrentTask('task-donate');

}

UI.prototype.showWithdrawEth = function () {
    document.getElementById('withdraw-eth').style.display = 'block';
}

UI.prototype.hideWithdrawEth = function () {
    document.getElementById('withdraw-eth').style.display = 'none';
}

UI.prototype.withdrawETH = function () {
    var addr = document.getElementById('withdraw-eth-addr').value;
    console.log("addr", addr);
    console.log("lower", addr.toLowerCase());
    console.log("addr", addr.toUpperCase());
    // We accept either all lower case or all upper case except the 'x' in '0x' or a valid checksum
    if ((addr.length == 42) &&
        (addr == addr.toLowerCase() || addr.slice(2) == addr.toUpperCase().slice(2) || EthJSUtil.isValidChecksumAddress(addr))
    ) {
        backend.withdrawETH(addr);
        this.hideErrorEthForwarding();
    } else {
        // TODO: UI error feedback in withdraw popup
        // ui.logger("Invalid ETH withdraw address, the checksum may be incorrect.");

    }
    this.hideWithdrawEth();
}

UI.prototype.showErrorEthForwarding = function () {
    document.getElementById('error-eth-forwarding').style.display = 'block';
}

UI.prototype.hideErrorEthForwarding = function () {
    document.getElementById('error-eth-forwarding').style.display = 'none';
}


/** Common UI functions */
function disableButton(buttonId) {
    var button = document.getElementById(buttonId);
    button.className += " disabled";
}

function setElementText(element, s) {
    document.getElementById(element).innerHTML = s;
}
function showAndSetElement(element, s) {
    document.getElementById(element).innerHTML = s;
    document.getElementById(element).style.display = 'block';
}

function showElement(element) {
    document.getElementById(element).style.display = 'block';
}
function hideElement(element) {
    document.getElementById(element).style.display = 'none';
}

function enableButton(buttonId) {
    var button = document.getElementById(buttonId);
    button.className.replace('disabled', '');
}

/** UI utility functions */

function formatCurrency(n, symbol, d) {
    // source for the regexp: http://stackoverflow.com/questions/149055/how-can-i-format-numbers-as-money-in-javascript
    return n.toFixed(d).replace(/(\d)(?=(\d{3})+(?:\.\d+)?$)/g, "$1,") + " " + symbol;
}

// pad is e.g. "000", 29 => "029"
function padNumber(pad, n) {
    var str = "" + n;
    return pad.substring(0, pad.length - str.length) + str;
}

function getChildWithClass(e, c) {
    for (var i = 0; i < e.childNodes.length; i++) {
        var n = e.childNodes[i];
        if (n.nodeType == 1 && n.className.indexOf(c) >= 0) // TODO use regex catch word not substring
            return n
    }
}

