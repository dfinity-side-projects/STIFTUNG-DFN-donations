"use strict";

/**
 * AppState maintains simple model for all public consumable state objects and simpler logger.
 * e.g. DFN Forwarded, ETH forwarding address, Client status, and etc.
 *
 * It maintains a "dirty" object list so that a View could selective refresh.
 */
var AppState = function() {
    this.currentTask = undefined;

    // Store temp logs that haven't been retrieved
    this.lastLogs = [];

    /* All general state variables */
    this.values = {};
    /* Dirty state variable that are recently updated and haven't been read */
    this.dirtyObjects = {};
}


/* Unset the dirty state of the variable */
AppState.prototype.unsetDirty = function(key) {
    delete this.dirtyObjects[key];
}

AppState.prototype.get = function(key) {
    return this.values[key];
}
AppState.prototype.set = function(key, value) {
    var values = this.values;
    values[key] = value;
    this.dirtyObjects[key] = "";
    console.log("[State] Set " + key + "=" + value);
}


AppState.prototype.getDirtyObjects = function() {
    return this.dirtyObjects;
}

AppState.prototype.logger = function(text) {
    // Place in debug log
    console.log(text);
    this.lastLogs.push(text);

    this.values["logger"] = this.lastLogs;
    this.dirtyObjects["logger"] = true;
}

AppState.prototype.setCurrentTask = function(tId) {
    this.currentTask = tId;
}


