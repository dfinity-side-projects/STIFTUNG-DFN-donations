module.exports = {
  build: {
    "index.html": "index.html",
    "app.js": [
      "javascripts/ui.js",
      "javascripts/app.js"
    ],
    "app.css": [
      "stylesheets/app.css"
    ],
    "images/": "images/",
    "deps/": "deps/"
  },
  rpc: {
    host: "localhost",
    port: 8545
  }
};
