/*
 * DFINITY Donation Chrome Extension
 * (C) 2016 DFINITY Stiftung (http://dfinity.network)
 *
 * This Chrome extension provides a guided process for user to donate Bitcoin or
 * Ether, in return for DFINITY Network Participation Token (DFN) recommendation from 
 * DFINITY Stiftung, a Swiss non-profit dedicated to DFINITY Network research, 
 * development and promotion. 
 *
 * This client: 
 *   - generates new seed and derive DFN address
 *   - forwards ETH/BTC from a temporary address (which is also derived from the same 
 *     seed) to the Foundation Donation Contract(FDC). The FDC is a set of smart 
 *     contracts running on Ethereum, which registers the donation and 
 *     corresponding DFN token recommendation amount
 *   - requires connecting to a Ethereum node (regardless of Ether or Bitcoin donation)
 *   - requires connecting to a Bitcoin node for Bitcoin donation
 *   - can withdrawal remaining Eth from the temporary withdrawal address 
 *
 * Refer to FDC code for detailed logic on donation.
 *
 * General structure: 
 *
 *  = app/index.html: main app html
 *  = app/javascripts:
 *   - app.js:  all the application logic are stored.
 *   - ui.js: a light wrapper for all HTML interface updates and interactions
 *   - btc.js:: handles bitcoin forwarding
 *   - util.js: utility functions
 *   - accounts.js: generates new seed and derive addresses
 *  = contracts: FDC (Foundation Donation Contract) solidity code
 *  = test
 *   - fdc.js: test suite for various FDC functions
 *  = migrations: truffle deployment code
 *
 */

"use strict";

var KEYCODE_ENTER = 13;
var KEYCODE_ESC = 27;

// TODO: figure out why keyup is not available in ext tab document
// TODO: if using jquery keys can be set individually without overwriting the onkeyup Event:
// $(document).keyup(function(e) { if (e.which == KEYCODE_ESC) { cb(); } });
// adds callbacks for ESC and ENTER key presses
function onKeys(cbESC, cbENTER) {
    document.onkeyup = function(e) {
        e = e || window.event;
        switch (e.which || e.keyCode) {
            case KEYCODE_ENTER:
                cbENTER();
                break;
            case KEYCODE_ESC:
                cbESC();
                break;
        }
    }
}

// In absencde of jQuery, here's a thin wrapper for ajax GET calls 
function ajaxGet(url, successFn, errFn) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.send(null);

    xhr.onreadystatechange = function() {
        var DONE = 4; // readyState 4 means the request is done.
        var OK = 200; // status 200 is a successful return.
        if (xhr.readyState === DONE) {
            if (xhr.status === OK) {
                console.log("AJAX GET call to " + url + " success: " + xhr.responseText);

                successFn(xhr.responseText);
            }
              
        } else {
            console.log("AJAX GET call to " + url + " failed: " + xhr.status);
            if (errFn != null) {
              errFn(xhr.status);
            }
        }
    }
}


// Write the user's keys to storage e.g. Chrome storage
function saveToStorage(values, successFn) {
    if (typeof(chrome.storage) !== "undefined") {
        // We have access to Chrome storage e.g. as does Chrome extension
        // http://stackoverflow.com/questions/3937000/chrome-extension-accessing-localstorage-in-content-script
        ui.logger("Saving values to Chrome storage");
        // Save in the local chrome storage (not sync storage as we don't want sensitive info uploaded to cloud)
        chrome.storage.local.set(values, function () {
            successFn();
        });
    }
    else if (typeof(Storage) !== "undefined") {
        // We have access to browser storage
        // http://www.w3schools.com/html/html5_webstorage.asp
        ui.logger("Saving values to local Web page storage. WARNING this storage not secure");
        for (var k in values) {
            localStorage.setItem(k, values[k]);
        }
        successFn();
    } else {
        ui.logger("WARNING: No storage facility available to save keys to");
        return false;
    }
    return true;
}

// Load the user's keys from storage e.g. Chrome storage. If the operate fails,
// an exception is thrown. If no keys were previously saved, no keys are loaded
// and the key values will be undefined
function loadfromStorage (keys, successFn) {
    if (typeof(chrome.storage) !== "undefined") {
        // We have access to Chrome storage e.g. as does Chrome extension
        // http://stackoverflow.com/questions/3937000/chrome-extension-accessing-localstorage-in-content-script
        ui.logger("Querying Chrome storage for " + keys);
        chrome.storage.local.get(keys, function (s) {
            if (runtime.lastError) {
                ui.logger("Key loading failed: " + runtime.lastError);
            }
            successFn(s);
        });
    }
    else if (typeof(Storage) !== "undefined") {
        // We only have access to browser storage
        // http://www.w3schools.com/html/html5_webstorage.asp
        ui.logger("Querying local Web page storage for " + keys + ".  WARNING this storage not secure");


        var s = {};
        for (var k in keys) {
            ui.logger("Querying local Web page storage for " + keys[k]);
            s[keys[k]] = localStorage.getItem(keys[k]);
        }
        successFn(s);
    } else {
        ui.logger("WARNING: No storage facility that can query for keys");
        return false;
    }
    return true;
}

function addrChecksum(addr) {
    // convert to buffer
    var addrBuf = EthJSUtil.toBuffer(addr);
    // hash the buffer and take first 4 bytes
    var checksumBuf = EthJSUtil.sha256(addrBuf).slice(0, 4);
    return EthJSUtil.bufferToHex(checksumBuf);
}

function addrWithChecksum(addr) {
    return addr + addrChecksum(addr).slice(2);
}

function getParameterByName(name, url) {
    if (!url) {
        url = window.location.href;
    }
    name = name.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, " "));
}