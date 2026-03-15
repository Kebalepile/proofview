const fs = require("fs");
const { sendText, sendPng } = require("../lib/http");
const { verifyToken } = require("../lib/tokens");
const store = require("../lib/store");

const FALLBACK_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAwMBAS8p3XQAAAAASUVORK5CYII=",
  "base64"
);

let cachedLogoPath = "";
let cachedLogoBuffer = null;

function getOpenImageBuffer(logoFile) {
  const nextPath = typeof logoFile === "string" ? logoFile.trim() : "";
  if (!nextPath) {
    return FALLBACK_PNG;
  }

  if (cachedLogoBuffer && cachedLogoPath === nextPath) {
    return cachedLogoBuffer;
  }

  try {
    const buffer = fs.readFileSync(nextPath);
    if (buffer.length > 0) {
      cachedLogoPath = nextPath;
      cachedLogoBuffer = buffer;
      return buffer;
    }
  } catch (err) {
    console.warn(`ProofView logo load failed for ${nextPath}:`, err.message);
  }

  return FALLBACK_PNG;
}

function trackOpen(req, res, deps) {
  const v = verifyToken(deps.token, deps.secret);
  if (!v.ok) {
    return sendText(res, 400, `Invalid token: ${v.error}`);
  }

  const openImage = getOpenImageBuffer(deps.logoFile);
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
