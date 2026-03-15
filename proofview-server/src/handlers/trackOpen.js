const { sendText, sendPng } = require("../lib/http");
const { getLogoBuffer } = require("../lib/logo");
const { verifyToken } = require("../lib/tokens");
const store = require("../lib/store");

function trackOpen(req, res, deps) {
  const v = verifyToken(deps.token, deps.secret);
  if (!v.ok) {
    return sendText(res, 400, `Invalid token: ${v.error}`);
  }

  const openImage = getLogoBuffer(deps.logoFile);
  const at = Date.now();
  const { messageId } = v.payload;
  const openGraceMs = Number.isFinite(Number(deps.openGraceMs))
    ? Number(deps.openGraceMs)
    : 15000;

  // Ignore any opens before message is explicitly marked sent
  if (!store.isSent(messageId)) {
    return sendPng(res, openImage);
  }

  const sentAt = store.getSentAt(messageId);

  // Ignore opens too soon after send
  if (typeof sentAt === "number" && at - sentAt < openGraceMs) {
    return sendPng(res, openImage);
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

  return sendPng(res, openImage);
}

module.exports = { trackOpen };
