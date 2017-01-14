module.exports = {
  build: {
    "index.html": "index.html",
    "app.js": [
      "javascripts/util.js",
      "javascripts/accounts.js",
      "javascripts/btc.js",
      "javascripts/ui.js",
      "javascripts/app.js"
    ],
    "app.css": [
      "stylesheets/app.css"
    ],
    "images/": "images/",
    "deps/": "deps/"
  },
  networks: {
    "main": {
      network_id: "default",
      host: "parity.dfinity.build",
      port: 80,
      gas: 3000000,
      gasPrice: 20000000000,
      from: "0xcf49327643ac9ee9188f6c74d08f35bf91bce055"
    },
    "test": {
      network_id: 2,
      host: "test.parity.dfinity.build",
      port: 80,
      gas: 3000000,
      gasPrice: 20000000000,
      from: "0x882ED121Ea15230251af7d84C595A4864b3BBCCc"
    },
    "development": {
      network_id: 3,
      host: "localhost",
      port: 7000
    }
  }
};
