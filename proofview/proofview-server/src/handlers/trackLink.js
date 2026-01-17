/**
 * Link click tracking handler.
 * @module handlers/trackLink
 */

const { sendText, redirect } = require("../lib/http");
const { verifyToken } = require("../lib/tokens");
const store = require("../lib/store");

/**
 * @description Handle link tracking redirect.
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @param {Object} deps
 * @param {string} deps.token
 * @param {string} deps.secret
 * @param {string} deps.storageFile
 * @returns {void}
 */
function trackLink(req, res, deps) {
  const v = verifyToken(deps.token, deps.secret);
  if (!v.ok) return sendText(res, 400, `Invalid token: ${v.error}`);

  const { messageId, recipientId = null, url } = v.payload;
  if (!url) return sendText(res, 400, "Token missing url");

  const at = Date.now();
  store.bump(messageId, "click", at);
  store.appendEvent({
    at,
    type: "click",
    messageId,
    recipientId,
    meta: {
      url,
      ua: req.headers["user-agent"] || "unknown",
      ip: req.socket.remoteAddress || "unknown"
    }
  }, deps.storageFile);

  return redirect(res, url, 302);
}

module.exports = { trackLink };
