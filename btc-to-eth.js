/**
 * btc_to_eth.js
 *
 * How to use:
 * Simply run the command and leave running:
 * 
 */


var FDC = require("./build/contracts/FDC.sol.js");
var Web3 = require('web3');
var web3 = new Web3();
var config = require('./config.json');
var request = require('request-promise');
var explorers = require('bitcore-explorers');
var Insight = explorers.Insight;
var bitcore = explorers.bitcore;
var crypto = require('crypto');
var currencyConverter = require('ecb-exchange-rates');
var CoinDesk = require("node-coindesk");
var Datastore = require('nedb');



var db = new Datastore({ filename: 'txids.db', autoload: true });
coindesk = new CoinDesk();

var provider = new web3.providers.HttpProvider(config.ethRpcUrl);
web3.setProvider(provider);
FDC.setProvider(provider);
var accounts = web3.eth.accounts;

var network = bitcore.Networks.get(config.btcNetwork);
var insight = new Insight(network);

var fdc = FDC.deployed();
var registrarAuthAddress;

var handleTX = (tx) => {

  var outputs = tx.vout;
  var txid = tx.txid;
  var amount = tx.valueOut;
  var timestamp = tx.blocktime;
  if (tx.confirmations < config.btcConfirmationsRequired) {
    console.log('Ignoring', txid, 'for now. Too early.');
    return;
  }
  if (outputs.length != 2) {
    console.log('Error processing transaction', txid, ': expected 2 outputs found', outputs.length)
    return;
  }
  var o1 = outputs[0];
  var o2 = outputs[1];

  var dataOutput = o2.scriptPubKey.asm;
  if (dataOutput.length != 50 || dataOutput.indexOf('OP_RETURN ') < 0) {
    console.log('Invalid data output for transaction', txid, ': expected OP_RETURN [20 BYTES] and found:',dataOutput);
    return;
  }

  /**
   * Register off-chain donation in the name of the given address
   *
   * Must be called from registrarAuth.
   *
   * Arguments are:
   *  - addr: address to the tokens are assigned
   *  - timestamp: time when the donation came in (determines phase and bonus)
   *  - chfCents: value of the donation in cents of Swiss francs
   *  - currency: the original currency of the donation (three letter string)
   *  - memo: optional 32 bytes of data to appear in the receipt
   *
   * The timestamp must not be in the future. This is because the timestamp 
   * defines the donation phase and the multiplier and future phase times are
   * still subject to change.
   *
   * If called during a donation phase then the timestamp must lie in the same 
   * phase and if called during the extended period for off-chain donations then
   * the timestamp must lie in the immediately preceding donation phase. 
  function registerOffChainDonation(address addr, uint timestamp, uint chfCents, 
                                    string currency, bytes32 memo) 
   */

  var dfnAddress = '0x' + dataOutput.slice('OP_RETURN '.length);
  var checksum = crypto.createHash('sha256').update(dfnAddress).digest('hex')
  var currency = 'BTC';
  var memo = '';

  console.log('Donation for DFN address', dfnAddress);
  console.log('Donation timestamp', timestamp);

  coindesk.currentPrice(function(data){
    var data = JSON.parse(data);
    var btcPrice = data.bpi.USD.rate_float;
    console.log('Current bitcoin price', btcPrice);
    var usdAmount = amount * btcPrice;
    console.log('Donation BTC amount', amount);
    console.log('Donation USD amount', usdAmount);
    var settings = {};
    settings.fromCurrency = "USD";
    settings.toCurrency = "CHF";
    settings.amount = usdAmount;
    settings.accuracy = 10;
    currencyConverter.convert(settings , function(data){
      var chfAmount = data.amount;
      var chfCents = Math.floor(chfAmount * 100);
      console.log('Donation CHF amount', chfAmount);
      console.log('Donation CHF cents', chfCents);
      fdc.registerOffChainDonation(dfnAddress, timestamp, chfCents, currency, memo, {from: registrarAuthAddress})
        .then(() => {
          db.insert({'txid': txid}, (err, inserted) => {
            if (err) throw err;
            console.log('Successfully registered donation ', inserted.txid)
          })  
        })
    });
  });


}

var handleUTXO = (utxo) => {
  var txid = utxo.txId;
  db.find({ 'txid': txid }, function (err, docs) {
    if (err) throw err;
    if (docs.length > 1) {
      throw new Error("Found more than one entry with txid"+txid);
    }
    if (docs.length === 1) {
      // already processed this transaction
      return;
    }


    console.log('Fetching txid', txid);
    insight.getTransaction(txid, (err, tx) => {
      if (err) {
        console.log('Error fetching transaction', txid, ':', err);
        return;
      }
      handleTX(tx);
    })

  })
}


var main = () => {
  insight.getUtxos(config.btcFoundationAddress, (err, utxos) => {
    if (err) {
      console.log('Error getting Foundation Address UTXOs', err);
      return;
    }

    utxos.map(handleUTXO);
    console.log('Processed', utxos.length, 'utxos');

    setTimeout(main, config.intervalDelayMS);

  })


}

if (config.btcConfirmationsRequired === 0) {
  throw "config.btcConfirmationsRequired can't be 0, we need the block timestamp to use as the donation timestamp";
}

fdc.registrarAuth()
  .then((ra) => {
    registrarAuthAddress = ra;

    main();
  
  });
