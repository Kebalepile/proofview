/**
 * ProofView HTTP server entrypoint (Vanilla Node.js).
 * @module server
 */

const http = require("http");
const { URL } = require("url");
const { getConfig } = require("./lib/config");
const { route } = require("./router");
const store = require("./lib/store");

const config = getConfig();

// Init store (JSON file DB for prototype)
store.initStore(config.storageFile);

http.createServer((req, res) => {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    route(req, res, urlObj, config);
  } catch (err) {
    console.error("Unhandled error:", err);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Internal server error");
  }
}).listen(config.port, () => {
  console.log(`ProofView listening on http://localhost:${config.port}`);
  // console.log(`Set PROOFVIEW_SECRET env var for real usage.`);
});
