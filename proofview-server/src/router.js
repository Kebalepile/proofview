/**
 * Main router for ProofView server.
 * @module router
 */

const { sendText } = require("./lib/http");
const { trackOpen } = require("./handlers/trackOpen");
const { trackLink } = require("./handlers/trackLink");
const { trackDoc } = require("./handlers/trackDoc");
const { apiEvents } = require("./handlers/apiEvents");
const { apiStatus } = require("./handlers/apiStatus");
const { apiMint } = require("./handlers/apiMint");
const { apiMintBatch } = require("./handlers/apiMintBatch");

/**
 * @typedef {Object} RouterDeps
 * @property {number} port
 * @property {string} secret
 * @property {string} storageFile
 * @property {string} logoFile
 * @property {string} sampleDoc
 */

/**
 * @description Route incoming requests to handlers.
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @param {URL} urlObj
 * @param {RouterDeps} deps
 * @returns {void}
 */
function route(req, res, urlObj, deps) {
  const p = urlObj.pathname;

  // API: mint batch (POST)
  if (req.method === "POST" && p === "/api/mint-batch") {
      return apiMintBatch(req, res, { port: deps.port, secret: deps.secret });
    }


  if (req.method === "GET" && p === "/") {
    return sendText(res, 200, [
      "ProofView server running.",
      "",
      "Prototype helper:",
      "  GET /api/mint?messageId=test123&recipientId=alice&mode=pixel|logo|signature&url=https://...&file=sample.pdf",
      "",
      "Tracking:",
      "  GET /t/o/<token>.png  (open tracking image)",
      "  GET /t/l/<token>      (link redirect tracking)",
      "  GET /t/d/<token>      (document download tracking)",
      "",
      "API:",
      "  GET /api/events?since=<ms>",
      "  GET /api/status/<messageId>"
    ].join("\n"));
  }

  // Tracking: open
  if (req.method === "GET" && p.startsWith("/t/o/") && p.endsWith(".png")) {
    const token = p.slice("/t/o/".length, -".png".length);
    return trackOpen(req, res, {
      token,
      secret: deps.secret,
      storageFile: deps.storageFile,
      logoFile: deps.logoFile
    });
  }

  // Tracking: link redirect
  if (req.method === "GET" && p.startsWith("/t/l/")) {
    const token = p.slice("/t/l/".length);
    return trackLink(req, res, {
      token,
      secret: deps.secret,
      storageFile: deps.storageFile
    });
  }

  // Tracking: doc download
  if (req.method === "GET" && p.startsWith("/t/d/")) {
    const token = p.slice("/t/d/".length);
    return trackDoc(req, res, {
      token,
      secret: deps.secret,
      storageFile: deps.storageFile,
      sampleDoc: deps.sampleDoc
    });
  }

  // API: events
  if (req.method === "GET" && p === "/api/events") return apiEvents(res, urlObj);

  // API: status
  if (req.method === "GET" && p.startsWith("/api/status/")) {
    const messageId = p.slice("/api/status/".length);
    return apiStatus(res, messageId);
  }

  // API: mint (prototype)
  if (req.method === "GET" && p === "/api/mint") {
    return apiMint(res, urlObj, { port: deps.port, secret: deps.secret });
  }

  return sendText(res, 404, "Not found");
}

module.exports = { route };
