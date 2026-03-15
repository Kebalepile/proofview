const { sendText } = require("./lib/http");
const { apiMintBatch } = require("./handlers/apiMintBatch");
const { apiEvents } = require("./handlers/apiEvents");
const { apiMarkSent } = require("./handlers/apiMarkSent");
const { trackOpen } = require("./handlers/trackOpen");

function router(req, res, deps) {
  const urlObj = new URL(req.url, `http://localhost:${deps.port}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }

  if (req.method === "GET" && urlObj.pathname === "/") {
    return sendText(res, 200, "ProofView server running");
  }

  if (req.method === "POST" && urlObj.pathname === "/api/mint-batch") {
    return apiMintBatch(req, res, deps);
  }

  if (req.method === "POST" && urlObj.pathname === "/api/mark-sent") {
    return apiMarkSent(req, res);
  }

  if (req.method === "GET" && urlObj.pathname === "/api/events") {
    return apiEvents(res, urlObj);
  }

  if (req.method === "GET" && /^\/t\/o\/.+\.png$/.test(urlObj.pathname)) {
    const token = urlObj.pathname.replace(/^\/t\/o\//, "").replace(/\.png$/, "");
    return trackOpen(req, res, { ...deps, token });
  }

  return sendText(res, 404, "Not found");
}

module.exports = { router };