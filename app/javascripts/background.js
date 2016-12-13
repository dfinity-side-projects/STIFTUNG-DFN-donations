'use strict';

// create extension tab and keep track of it's tabId
var extTabId = null;
// when user clicks extension icon
chrome.browserAction.onClicked.addListener(function(currentTab) {
    if (extTabId == null || chrome.extension.getViews({tabId: extTabId}).length == 0) {
        chrome.tabs.create({'url': chrome.extension.getURL('index.html')}, function(newTab) {
            extTabId = newTab.id;
        });
    } else {
        chrome.tabs.update(extTabId, {"active": true, "highlighted": true}, function (tab) {
        });
    }
});

chrome.tabs.onRemoved.addListener(function(tabId, removeInfo) {
    if (tabId == extTabId) {
        extTabId == null;
    }
});

