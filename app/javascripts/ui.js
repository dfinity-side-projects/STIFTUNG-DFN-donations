// *
// *** User interface wrapper ***
// *


// Constructor
var UI = function() {
  this.wireUpDOM();
}

// Wire up event handlers of UI.
// This is necessary because Google Chrome extension will not allow inline
// Javascript at highest manifest security setting.
UI.prototype.wireUpDOM = function() {
  // TODO
}

// Set Ethereum node client IP
UI.prototype.setEthereumNode = function(fn) {
  document.getElementById('btn-ethereum-node').innerHTML = fn;
}

// Set status of Etheruem client
UI.prototype.setEthereumClientStatus = function(status) {
  document.getElementById('eth-client-status').innerHTML = status;
}


// Set the allocation of Genesis DFN to be recommended for user
UI.prototype.setGenesisDFN = function(dfn) {
  var e = getChildWithClass(document.getElementById("genesis-dfinities"), "amount");	
  if (dfn == undefined)
    e.innerHTML = "? DFN";
  else
    e.innerHTML = formatCurrency(dfn, "DFN");
}

// Set amount of ETH forwarded so far
UI.prototype.setForwardedETH = function(fe) {
  var e = document.getElementById('donated-eth');
  if (fe == undefined) 
    e.innerHTML = "?";
  else
    e.innerHTML = formatCurrency(fe, "ETH", 2);
}

// Set amount of ETH remaining in client
UI.prototype.setRemainingETH = function(re) {
  var e = document.getElementById('waiting-eth');
  if (re == undefined)
    e.innerHTML = "?";
  else
    e.innerHTML = formatCurrency(re, "ETH", 2);
}

// Set the forwarding address the user should send ETH donations to
UI.prototype.setETHForwardingAddress = function(efa) {
  var e = getChildWithClass(document.getElementById("eth-forwarding-address"), "eth-address");
  if (efa == undefined) {
    e.innerHTML = "-- create, or <a href=''>restore from seed</a> --"
  } else {
    e.innerHTML = efa;
  }
}

// Set the total amount of donations received so far, in CHF
// -1 indicates "unknown"
UI.prototype.setFunderTotalReceived = function(chf) {
  if (chf == undefined) {
    this.setFunderProgressBar(0);
    this.setFunderPercProgress(undefined);
    this.setFunderChfReceived(undefined);
  } else {
    var perc = chf/1000000*100;
    this.setFunderProgressBar(perc);
    this.setFunderPercProgress(perc);
    this.setFunderChfReceived(chf);
  }
}
UI.prototype.setFunderProgressBar = function(perc) {
  // Configure progress bar
  var pb = document.getElementById('main-progress-bar');
  // set LEDs
  var bar = 0;
  var ns = pb.childNodes;
  for (i=0; i<ns.length; i++) {
    cn = ns[i];
    if (cn.nodeType == 1) {
      // clear LED
      cn.className = "";
      // set LED if required
      if (bar*10 < perc) {
        if ((bar+1)*10 <= perc || perc >= 100)
          cn.className = 'complete';
        else
          cn.className = 'complete blink';	
      }
      bar++;
    }
  }
}
UI.prototype.setFunderPercProgress = function(perc) {
  var e = document.getElementsByClassName("lower")[0];
  if (perc == undefined)
    e.innerHTML = "? %";
  else
    e.innerHTML = Math.round(perc)+"%";	
}
// General note: when a value is undefined, this indicates that the extension "doesn't know" the value.
// In fact, once the extension has connected to Ethereum/FDC, it will know how much money has been donated.
// It is possible that some money might have been donated before the official start (for example we could
// report fiat donations that had already been made, although we might choose to do this during the funder).
// The FDC will give the extension a number - 0, or whatever - and this can be displayed. A question mark
// is designed to show that the extension _doesn't_know_ something i.e. that it is uninitialized, not 
// connected to Ethereum or whatever
UI.prototype.setFunderChfReceived = function(chf) {
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
UI.prototype.setCurrentTask = function(taskId) {
  // Make interface changes after a delay that allows the user to "observe" the transition
  // TODO disable clicks until interface updated	
  var _ui = this;
  var f = function() {
    _ui.unsetNextTask('task-agree');
    _ui.unsetNextTask('task-create-seed');
    _ui.unsetNextTask('task-understand-fwd-eth');
    _ui.unsetNextTask('task-donate');
    var t = document.getElementById(taskId);
    t.className += 'next-task';
  };
  setTimeout(f , 100);
}

UI.prototype.unsetNextTask = function(t) {
  document.getElementById(t).className = document.getElementById(t).className.replace('next-task','');
}

UI.prototype.makeTaskDone = function(t) {
  document.getElementById(t).className += "done-task";
  this.tickTaskItem(t);
}

UI.prototype.tickTaskItem = function(t) {
  getChildWithClass(document.getElementById(t), "tick").childNodes[0].style.visibility = "visible";
}

UI.prototype.logger = function(text) {
  // Place in debug log
  console.log(text);
  // Write user interface log...
  d = new Date();
  var time = document.createElement("SPAN");
  time.innerHTML = padNumber("00", d.getHours()) + ":" + padNumber("00", d.getMinutes());
  var line = document.createElement("DIV");
  line.appendChild(time);
  line.innerHTML += '&nbsp; '+text;
  var log = document.getElementById('console');
  log.insertBefore(line, log.childNodes[0]);
}

UI.prototype.showCreateSeed = function() {
  document.getElementById('create-dfn-seed').style.display = 'block';
}

UI.prototype.afterCreateSeed = function() {
  document.getElementById('create-dfn-seed').style.display = 'none';
  this.showValidateSeed();
}

UI.prototype.showValidateSeed = function() {
  document.getElementById('verify-dfn-seed').style.display = 'block';
}

UI.prototype.beforeValidateSeed = function() {
  this.hideValidateSeed();
  this.showCreateSeed();
}

UI.prototype.doValidateSeed = function() {
  this.hideValidateSeed();
  this.setCurrentTask('task-understand-fwd-eth');
  this.makeTaskDone('task-create-seed');
}

UI.prototype.hideValidateSeed = function() {
  document.getElementById('verify-dfn-seed').style.display = 'none';
}

UI.prototype.showTerms = function() {
  document.getElementById('terms').style.display = 'block';
}

UI.prototype.readTerms = function() {
  document.getElementById('terms').style.display = 'none';
  this.setCurrentTask('task-create-seed');
  this.makeTaskDone('task-agree');
}

UI.prototype.showSelectEthereumNode = function() {
  document.getElementById('select-full-node').style.display = 'block';
}

UI.prototype.onSelectEthereumNode = function(en) {
  document.getElementById('select-full-node').style.display = 'none';
  app.setEthereumNode(en);	
}

UI.prototype.showExplainForwarding = function() {
  document.getElementById('explain-eth-forwarding').style.display = 'block';
}

UI.prototype.doneExplainForwarding = function() {
  document.getElementById('explain-eth-forwarding').style.display = 'none';
  this.setCurrentTask('task-donate');
  this.makeTaskDone('task-understand-fwd-eth');
}

UI.prototype.showWithdrawEth = function() {
  document.getElementById('withdraw-eth').style.display = 'block';
}

UI.prototype.hideWithdrawEth = function() {
  document.getElementById('withdraw-eth').style.display = 'none';
}

UI.prototype.showErrorEthForwarding = function() {
  document.getElementById('error-eth-forwarding').style.display = 'block';
}

UI.prototype.hideErrorEthForwarding = function() {
  document.getElementById('error-eth-forwarding').style.display = 'none';
}

function formatCurrency(n, symbol, d) {
  if (d == undefined || d <= 0)
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + 
      " " + symbol

  var whole = Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  var pad = "";
  for (var i=0; i<d; i++) pad += "0";
  var decs  = padNumber(pad, Math.round(n*Math.pow(10, d)) % Math.pow(10, d));
    
  return whole + "." + decs + " " + symbol;
}

// pad is e.g. "000", 29 => "029"
function padNumber(pad, n) {
  str = ""+n;
  return pad.substring(0, pad.length - str.length) + str;
}

function getChildWithClass(e, c) {
  for (var i = 0; i < e.childNodes.length; i++) {
    var n = e.childNodes[i];
    if (n.nodeType == 1 && n.className.indexOf(c) >= 0) // TODO use regex catch word not substring
      return n
  }
}