/*
   A simple View Binder that allows UI to reflect underlying state changes
   This allows cleaner separation of view and underlying model.
 */
"use strict";
var UI_UPDATE_INTERVAL = 1500;

var ViewBinder = function(appState) {
    this.appState = appState;
    this.bindings = {};
    this.watchList = [];
};

ViewBinder.prototype.startUpdate = function() {
    if (this.uiRunner)
        clearTimeout(this.uiRunner);
    this.uiRunner = this.scheduleRunner();
};

ViewBinder.prototype.scheduleRunner = function() {
    var t = this;
    return setTimeout(function() { t.updateDirtyObjects(); }, UI_UPDATE_INTERVAL);
};

ViewBinder.prototype.bindAll = function(objects) {
    for (var key in objects) {
        if (!objects.hasOwnProperty(key)) {
            continue;
        }
        var target = objects[key];
        if (typeof target == 'function') {
            this.bindFunction(key, target);
        } else if (target == "") {
            this.bindFunction(key, ViewBinder.DEFAULT_ELEMENT_HANDLER(key));
        } else {
            this.bindElement(key, target);
        }
    }
};

ViewBinder.CUSTOM_ELEMENT_HANDLER = function(k, f) {
    return function (v) {
        f(k,v);
    };
};
ViewBinder.DEFAULT_ELEMENT_HANDLER = function(k) {
    return function (v) {
        console.log("element handler triggered for " + k + " / " + v);
        if (v == undefined) {
            setElementText(k, "?");
        } else {
            setElementText(k, v);
        }

    };
};

/*
 * This binds a UI element (by element id) to a state variable and refresh the UI whenever the underlying state
 * variable is updated.
 */
ViewBinder.prototype.bindElement = function(state, target) {
    this.bindings[state] = target;
};

ViewBinder.prototype.bindFunction = function(state, fn) {
    this.bindings[state] = fn;
};

ViewBinder.prototype.bindLogHander = function(fn) {
    this.bindings["logger"] = fn;
};


ViewBinder.prototype.watchObjectProp = function(object, prop, fn) {


    // Push to the watch list. Multiple listener for same object is allowed.
    this.watchList.push({"object":object,"property": prop, "fn": fn, "last": object[prop]});
};


ViewBinder.prototype.updateDirtyObjects = function() {
    var objects = this.appState.getDirtyObjects();
    var bindings = this.bindings;

    /* Update all binded objects flagged as "dirty" */
    for (var key in objects) {
        if (!objects.hasOwnProperty(key) || !bindings.hasOwnProperty(key)) {
            continue;
        }
        var val = this.appState.get(key);
        var binding = this.bindings[key];
        if (typeof binding == 'function') {
            console.log("Running function handler for: " + key)
            binding(val);
        } else if (binding == "") {
            setElementText(key, val);
        } else if (binding instanceof Array) {
            for (var item in binding) {
                setElementText(binding[item], val);
            }
        } else {
            setElementText(this.bindings[key], val);
        }
        this.appState.unsetDirty(key);
    }

    /* Watch for changes of these objects */
    for (var w in this.watchList) {
        var i = this.watchList[w];
        var object = i["object"];
        var prop = i["property"];
        val = object[prop];
        // Check if the property value is still the same
        if (val != i["last"]) {
            i["fn"](val);
            this.watchList[w]["last"] = val;
        }
    }

    // Schedule next update
    this.scheduleRunner();
}
