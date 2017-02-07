module.exports = {
  build: {
    "index.html": "index.html",
    "app.js": [
      "javascripts/util.js",
      "javascripts/accounts.js",
      "javascripts/btc.js",
      "javascripts/ui.js",
      "javascripts/ethConnPolling.js",
      "javascripts/app.js"
    ],
    "app.css": [
      "stylesheets/app.css"
    ],
    "images/": "images/",
    "deps/": "deps/"
  },
  
  networks: {
  "live": {
    network_id: "default", // Ethereum public network
    host: "54.201.221.105",
    port: 8545,
      gas: 3000000,
      gasPrice: 20000000000,
      from: "cf49327643ac9ee9188f6c74d08f35bf91bce055"
  },
  "morden": {
    network_id: 2,        // Official Ethereum test network
    host: "178.25.19.88", // Random IP for example purposes (do not use)
    port: 80
  },
    "ropsten": {
      network_id:3,
      host:"127.0.0.1",
      gas: 4000000,
      from: "0x882ED121Ea15230251af7d84C595A4864b3BBCCc",
      port:18545
    },
  "staging": {
    network_id: 1337 // custom private network
    // use default rpc settings
  },
  "development": {
    network_id: "dev",
    host: "localhost",
    port: 8585
  }
}
};
