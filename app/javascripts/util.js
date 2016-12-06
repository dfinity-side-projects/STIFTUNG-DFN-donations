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
