/**
 * Document download tracking handler.
 * @module handlers/trackDoc
 */

const path = require("path");
const fs = require("fs");
const { sendText, streamDownload } = require("../lib/http");
const { verifyToken } = require("../lib/tokens");
const store = require("../lib/store");

/**
 * @description Handle document download tracking.
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @param {Object} deps
 * @param {string} deps.token
 * @param {string} deps.secret
 * @param {string} deps.storageFile
 * @param {string} deps.sampleDoc
 * @returns {void}
 */
function trackDoc(req, res, deps) {
  const v = verifyToken(deps.token, deps.secret);
  if (!v.ok) return sendText(res, 400, `Invalid token: ${v.error}`);

  const { messageId, recipientId = null, file = "sample.pdf" } = v.payload;

  const at = Date.now();
  store.bump(messageId, "download", at);
  store.appendEvent({
    at,
    type: "download",
    messageId,
    recipientId,
    meta: {
      file,
      ua: req.headers["user-agent"] || "unknown",
      ip: req.socket.remoteAddress || "unknown"
    }
  }, deps.storageFile);

  const candidate = fs.existsSync(deps.sampleDoc)
    ? deps.sampleDoc
    : path.join(__dirname, "..", "..", "assets", file);

  return streamDownload(res, candidate, file);
}

module.exports = { trackDoc };
