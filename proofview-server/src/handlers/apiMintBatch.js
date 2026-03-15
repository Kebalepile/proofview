const crypto = require("crypto");
const { sendJson, sendText } = require("../lib/http");
const { signToken } = require("../lib/tokens");

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 250_000) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function apiMintBatch(req, res, deps) {
  try {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};

    const messageId = body.messageId || `msg-${crypto.randomUUID()}`;
    const links = Array.isArray(body.links) ? body.links : [];
    const now = Date.now();
    const exp = now + 30 * 24 * 60 * 60 * 1000;

    const openToken = signToken(
      { messageId, iat: now, exp },
      deps.secret
    );
    const linkMap = {};
    for (const originalUrl of links) {
      if (typeof originalUrl !== "string") continue;
      const linkToken = signToken(
        { messageId, url: originalUrl, iat: now, exp },
        deps.secret
      );
      linkMap[originalUrl] = `http://localhost:${deps.port}/t/o/${openToken}.png?redirect=${encodeURIComponent(originalUrl)}`;
      linkMap[originalUrl] = `http://localhost:${deps.port}/t/l/${linkToken}`;
    }

    sendJson(res, 200, {
      messageId,
      openUrl: `http://localhost:${deps.port}/t/o/${openToken}.png`,
      linkMap
    });
  } catch (err) {
    sendText(res, 400, `Bad request: ${String(err.message || err)}`);
  }
}
module.exports = { apiMintBatch };
