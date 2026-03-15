/**
 * ProofView HTTP server entrypoint (Vanilla Node.js).
 * @module server
 */

const http = require("http");
const { router } = require("./router");

const PORT = 3000;
const SECRET = "proofview-dev-secret-change-me";

const server = http.createServer((req, res) => {
  router(req, res, {
    port: PORT,
    secret: SECRET
  });
});

server.listen(PORT, () => {
  console.log(`ProofView server listening on http://localhost:${PORT}`);
});
