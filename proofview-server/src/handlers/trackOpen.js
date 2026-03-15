const { sendText, sendPng } = require("../lib/http");
const { verifyToken } = require("../lib/tokens");
const store = require("../lib/store");

const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAwMBAS8p3XQAAAAASUVORK5CYII=",
  "base64"
);

const OPEN_GRACE_MS = 15000;

function trackOpen(req, res, deps) {
  const v = verifyToken(deps.token, deps.secret);
  if (!v.ok) {
    return sendText(res, 400, `Invalid token: ${v.error}`);
  }

  const at = Date.now();
  const { messageId } = v.payload;

  // Ignore any opens before message is explicitly marked sent
  if (!store.isSent(messageId)) {
    return sendPng(res, PIXEL_PNG);
  }

  const sentAt = store.getSentAt(messageId);

  // Ignore opens too soon after send
  if (typeof sentAt === "number" && at - sentAt < OPEN_GRACE_MS) {
    return sendPng(res, PIXEL_PNG);
  }

  store.bumpOpen(messageId, at);
  store.appendEvent({
    at,
    type: "open",
    messageId,
    meta: {
      ua: req.headers["user-agent"] || "unknown",
      ip: req.socket.remoteAddress || "unknown"
    }
  });

  return sendPng(res, PIXEL_PNG);
}

module.exports = { trackOpen };
