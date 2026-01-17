/**
 * Open tracking handler.
 * @module handlers/trackOpen
 */

const fs = require("fs");
const { sendText, sendPng } = require("../lib/http");
const { verifyToken } = require("../lib/tokens");
const store = require("../lib/store");

// 1x1 transparent PNG
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
  "base64"
);

/**
 * @description Handle open tracking image request.
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @param {Object} deps
 * @param {string} deps.token
 * @param {string} deps.secret
 * @param {string} deps.storageFile
 * @param {string} deps.logoFile
 * @returns {void}
 */
function trackOpen(req, res, deps) {
  const v = verifyToken(deps.token, deps.secret);
  if (!v.ok) return sendText(res, 400, `Invalid token: ${v.error}`);

  const { messageId, recipientId = null, mode = "pixel" } = v.payload;

  const at = Date.now();
  store.bump(messageId, "open", at);
  store.appendEvent({
    at,
    type: "open",
    messageId,
    recipientId,
    meta: {
      mode,
      ua: req.headers["user-agent"] || "unknown",
      ip: req.socket.remoteAddress || "unknown"
    }
  }, deps.storageFile);

  if ((mode === "logo" || mode === "signature") && fs.existsSync(deps.logoFile)) {
    return sendPng(res, fs.readFileSync(deps.logoFile));
  }
  return sendPng(res, PIXEL_PNG);
}

module.exports = { trackOpen };
