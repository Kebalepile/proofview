/**
 * ProofView HTTP server entrypoint (Vanilla Node.js).
 * @module server
 */

const http = require("http");
const { router } = require("./router");
const { getConfig } = require("./lib/config");

const config = getConfig();

const server = http.createServer((req, res) => {
  router(req, res, config);
});

server.listen(config.port, () => {
  console.log(`ProofView server listening on port ${config.port}`);
  console.log(`ProofView public base URL: ${config.publicBaseUrl}`);
});
