// *

// *** User interface wrapper ***
// *


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



// Set the allocation of Genesis DFN to be recommended for user
UI.prototype.setGenesisDFN = function (dfn) {
    var e =document.getElementById("genesis-dfinities-amount");
    var e2 =document.getElementById("genesis-dfinities-amount-2");
    if (dfn == undefined) {
        e.innerHTML = "? DFN";
        e2.innerHTML = "? DFN (unknown as not connected to an Ethereum node)";
        // hideElement("genesis-dfinities-info-icon");

    }
    else {
        e.innerHTML = formatCurrency(dfn, "DFN");
        e2.innerHTML = formatCurrency(dfn, "DFN");
        // showElement("genesis-dfinities-info-icon", "inline-block");
    }
}

// Set amount of ETH forwarded so far
UI.prototype.setForwardedETH = function (fe) {
    var e = document.getElementById('donated-eth');
    if (fe == undefined)
        e.innerHTML = "?";
    else
        e.innerHTML = formatCurrency(fe, "ETH", 2);
}

// Set amount of ETH remaining in client
UI.prototype.setRemainingETH = function (re) {
    var e = document.getElementById('waiting-eth');
    var e2 = document.getElementById('withdraw-waiting-eth');
    console.log("set remaining eth: " + re);
    if (re == undefined) {
        e.innerHTML = "?";
        e2.innerHTML = "?";
    }
    else {
        e.innerHTML = formatCurrency(re, "ETH", 2);
        e2.innerHTML = formatCurrency(re, "ETH", 2);

        // if (re < 1)
        //   e.innerHTML = ""+re+" ETH";
        // else
        //   e.innerHTML = formatCurrency(re, "ETH", 2);
    }
}

// Set the forwarding address the user should send ETH donations to
// Set the DFN address the user might want ot communicate to  Dfinity Stiftung
UI.prototype.setUserAddresses = function (efa, bfa, dfa) {
  console.log(bfa)
  console.trace()
    var ethExt = getChildWithClass(document.getElementById("eth-forwarding-address"), "eth-address");
    var ethFor = document.getElementById("eth-forwarding-address-explained");
    var btcExt = getChildWithClass(document.getElementById("btc-forwarding-address"), "eth-address");
    var btcFor = document.getElementById("btc-forwarding-address-explained");
    var dfn = document.getElementById("dfn-address");
    if (efa == undefined) {
        ethExt.innerHTML = "<not generated>";
        btcExt.innerHTML = "<not generated>";
        hideElement("genesis-dfinities-info-icon");

    } else {
        ethExt.innerHTML = web3.toChecksumAddress(efa);
        ethFor.innerHTML = web3.toChecksumAddress(efa);
        btcExt.innerHTML = bfa;
        btcFor.innerHTML = bfa;
        dfn.innerHTML = dfa;
        showElement("genesis-dfinities-info-icon", "inline-block");
    }
}

UI.prototype.generateSeed = function () {
    seed = app.generateSeed();
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
UI.prototype.setFunderTotalReceived = function (chf) {
    if (chf == undefined) {
        this.setFunderProgressBar(0);
        this.setFunderPercProgress(undefined);
        this.setFunderChfReceived(undefined);
    } else {
        var perc = chf / 1000000 * 100;
        this.setFunderProgressBar(perc);
        this.setFunderPercProgress(perc);
        this.setFunderChfReceived(chf);
    }
}
UI.prototype.setFunderProgressBar = function (perc) {
    // Configure progress bar
    var pb = document.getElementById('main-progress-bar');
    // set LEDs
    var bar = 0;
    var ns = pb.childNodes;
    for (i = 0; i < ns.length; i++) {
        cn = ns[i];
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
}
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
}

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
        _ui.unsetNextTask('task-agree');
        _ui.unsetNextTask('task-create-seed');
        _ui.unsetNextTask('task-understand-fwd-eth');
        _ui.unsetNextTask('task-donate');
        var t = document.getElementById(taskId);
        t.className += 'next-task ';
    };
    setTimeout(f, 100);
}

UI.prototype.unsetNextTask = function (t) {
    document.getElementById(t).className = document.getElementById(t).className.replace('next-task', '');
}

UI.prototype.makeTaskDone = function (t) {
    document.getElementById(t).className += "done-task ";
    this.tickTaskItem(t);
}

UI.prototype.tickTaskItem = function (t) {
    getChildWithClass(document.getElementById(t), "tick").childNodes[0].style.visibility = "visible";
}

UI.prototype.logger = function (text) {
    // Place in debug log
    console.log(text);
    // Write user interface log...
    d = new Date();
    var time = document.createElement("SPAN");
    time.innerHTML = padNumber("00", d.getHours()) + ":" + padNumber("00", d.getMinutes());
    var line = document.createElement("DIV");
    line.appendChild(time);
    line.innerHTML += '&nbsp; ' + text;
    var log = document.getElementById('console');
    log.insertBefore(line, log.childNodes[0]);
}


// Tasks can only move forward if previous tasks completed. 
UI.prototype.isTaskReady = function (taskId) {
    k = this.tasks.indexOf(taskId);
    console.log("taskId " + taskId + ": index " + k)
    // Look for all previous steps to see if any one not completed
    for (var i = 0; i < k; i++) {
        if (document.getElementById(this.tasks[i]).className.indexOf("done-task") == -1)
            return false;
    }
    return true;
}

UI.prototype.cancelCreateSeed = function () {
    if (app.accs.ETH.addr == undefined || app.accs.DFN.addr == undefined) {
        setElementText("seed", "");
    }
    document.getElementById('create-dfn-seed').style.display = 'none';
}

UI.prototype.hideCreateSeed = function () {
    // this.markSeedGenerated();
    document.getElementById('create-dfn-seed').style.display = 'none';
}

UI.prototype.doImportSeed = function () {
    seed = document.getElementById('imported-seed').value;

    try {
        app.doImportSeed(seed);
    }
    catch (e) {
        this.showImportSeedError("Error in importing seed: " + e);
        return;
    }
//    this.setUserAddresses(app.accs.ETH.addr, app.accs.DFN.addr);

    ui.logger("Imported new seed successfully. ETH forwarding address and DFN address have been updated.")

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
    if (app.accs.ETH.addr == undefined || app.accs.DFN.addr == undefined) {
        console.log("Seed doesn't exist ... generating a new seed.")
        this.generateSeed();
    }
    // app.generateSeed();
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
    typedSeed = typedSeed.value;
    if (typedSeed != s && typedSeed.trim() != s.trim()) {
        this.showValidateSeedError();
        return;
    }

    // Validation passed
    app.doImportSeed(s.trim());
//    this.setUserAddresses(app.accs.ETH.addr, app.accs.DFN.addr);

    this.hideValidateSeed();
    // Make sure we completely wipe the seed.
    this.markSeedGenerated();
    this.setCurrentTask('task-understand-fwd-eth');
    this.makeTaskDone('task-create-seed');
}

UI.prototype.markSeedGenerated = function () {
    seedText = "Seed has already been generated and you should have safely copied it somewhere. Click Cancel button to proceed with the donation.";
    // seedText += "<a href='javascript:ui.generateSeed()'>generate new seed</a>, but all previous information will be lost.";
    this.setUserSeed(seedText);
    showAndSetElement("typed-seed", "");
    disableButton("after-create-seed-button");
}

UI.prototype.hideValidateSeed = function () {
    document.getElementById('verify-dfn-seed').style.display = 'none';
}

function removeClass(element, className) {
    document.getElementById(element).className.replace(className, '');
}
function showDialog(dialogId) {
    showElement(dialogId);
    document.body.className += " modal-open";
}

function closeDialog(dialogId) {
    hideElement(dialogId);
    document.body.className.replace("modal-open", '');
}

UI.prototype.showTerms = function () {
    showDialog("terms");
}

UI.prototype.hideTerms = function () {
    closeDialog("terms");
}


UI.prototype.readTerms = function () {
    // Once agreed, it should be disabled to prevent confusion
    disableButton("agree-terms-button");
    document.getElementById('agree-terms-button').innerText = "You have already accepted the terms";
    closeDialog("terms");
    this.setCurrentTask('task-create-seed');
    this.makeTaskDone('task-agree');

}

// BTC node config
// Set Bitcoin node client host
UI.prototype.setBitcoinNode = function (fn) {
    document.getElementById('btn-bitcoin-node').innerHTML = fn;
}

// Set status of Etheruem client
UI.prototype.setBitcoinClientStatus = function (status) {
    document.getElementById('btc-client-status').innerHTML = status;
}

UI.prototype.showSelectBitcoinNode = function () {
    document.getElementById('select-full-node-btc').style.display = 'block';
    onKeys(ui.hideSelectBitcoinNode, function () {
        ui.onSelectEthereumNode(document.getElementById('custom-full-node-address-btc').value);
    });
}

UI.prototype.hideSelectBitcoinNode = function (en) {
    document.getElementById('select-full-node-btc').style.display = 'none';
}

UI.prototype.onSelectBitcoinNode = function (en) {
    this.hideSelectBitcoinNode();
    app.setBitcoinNode(en);
}

// ETH node config
// Set Ethereum node client host
UI.prototype.setEthereumNode = function (fn) {
    document.getElementById('btn-ethereum-node').innerHTML = fn;
}

// Set status of Etheruem client
UI.prototype.setEthereumClientStatus = function (status) {
    document.getElementById('eth-client-status').innerHTML = status;
}

UI.prototype.showSelectEthereumNode = function () {
    document.getElementById('select-full-node-eth').style.display = 'block';
    onKeys(ui.hideSelectEthereumNode, function () {
        ui.onSelectEthereumNode(document.getElementById('custom-full-node-address-eth').value);
    });
}

UI.prototype.hideSelectEthereumNode = function (en) {
    document.getElementById('select-full-node-eth').style.display = 'none';
}

UI.prototype.onSelectEthereumNode = function (en) {
    this.hideSelectEthereumNode();
    app.setEthereumNode(en);
}

UI.prototype.showExplainForwarding = function () {
    if (!this.isTaskReady("task-understand-fwd-eth")) {
        return;
    }
    showDialog("explain-eth-forwarding");
    // document.getElementById('explain-eth-forwarding').style.display = 'block';
}

UI.prototype.doneExplainForwarding = function () {
    closeDialog("explain-eth-forwarding");
    this.makeTaskDone('task-understand-fwd-eth');
    this.setCurrentTask('task-donate');
}

UI.prototype.showWithdrawEth = function () {
    showDialog("withdraw-eth");
}

UI.prototype.hideWithdrawEth = function () {
    closeDialog("withdraw-eth");

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
        app.withdrawETH(addr);
        this.hideErrorEthForwarding();
    } else {
        // TODO: UI error feedback in withdraw popup
        ui.logger("Invalid ETH withdraw address, the checksum may be incorrect.");

    }
    this.hideWithdrawEth();
}

UI.prototype.showErrorEthForwarding = function () {
    document.getElementById('error-eth-forwarding').style.display = 'block';
}

UI.prototype.hideErrorEthForwarding = function () {
    document.getElementById('error-eth-forwarding').style.display = 'none';
}

UI.prototype.updateLocationBlocker = function () {
    usBlocker = document.getElementById("us-person-error");
    agreeButton = document.getElementById("agree-terms-button");
    ajaxGet("http://ip-api.com/json/", function (data) {
        countryCode = JSON.parse(data)["countryCode"];
        if (countryCode != "US") {
            enableButton("agree-terms-button");
            usBlocker.style.display = 'none';
        } else if (countryCode == "US") {
            // IMPORTANT TODO: need to change to disable rather than enable. This is only for dev / debugging.
            // disableButton("agree-terms-button");
            enableButton("agree-terms-button");
            usBlocker.style.display = 'block';
        }
    }, function (err) {
        // Fallback in case of IP service is unaccessible
        enableButton("agree-terms-button");
        usBlocker.style.display = 'none';
    });
}

/** Common UI functions */

function disableButton(buttonId) {
    button = document.getElementById(buttonId);
    button.className += " disabled";
}

function setElementText(element, s) {
    document.getElementById(element).innerHTML = s;
}
function showAndSetElement(element, s) {
    document.getElementById(element).innerHTML = s;
    document.getElementById(element).style.display = 'block';
}

function showElement(element, style) {
    if (!style)
        style="block";
    document.getElementById(element).style.display = style;
}
function hideElement(element) {
    document.getElementById(element).style.display = 'none';
}

function enableButton(buttonId) {
    button = document.getElementById(buttonId);
    button.className.replace('disabled', '');
}

/** UI utility functions */

function formatCurrency(n, symbol, d) {
  // round it
  if (d > 0) { 
    n = Math.round(n*Math.pow(10, d)) / Math.pow(10, d);		
  }

  // cut off and/or pad
  var s = n.toFixed(d);

  // insert comma separators into the whole part
  var parts = s.split("."); 
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  // re-combine parts
  return parts.join(".") + " " + symbol;
}

// pad is e.g. "000", 29 => "029"
function padNumber(pad, n) {
    str = "" + n;
    return pad.substring(0, pad.length - str.length) + str;
}

function getChildWithClass(e, c) {
    for (var i = 0; i < e.childNodes.length; i++) {
        var n = e.childNodes[i];
        if (n.nodeType == 1 && n.className.indexOf(c) >= 0) // TODO use regex catch word not substring
            return n
    }
}

