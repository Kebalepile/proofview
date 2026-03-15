/**
 * Prototype token minting handler.
 * @module handlers/apiMint
 */

const crypto = require("crypto");
const { sendJson } = require("../lib/http");
const { signToken } = require("../lib/tokens");

/**
 * @description Mint test tokens/URLs (prototype helper).
 * @param {import("http").ServerResponse} res
 * @param {URL} urlObj
 * @param {Object} deps
 * @param {number} deps.port
 * @param {string} deps.secret
 * @returns {void}
 */
function apiMint(res, urlObj, deps) {
  const messageId = urlObj.searchParams.get("messageId") || `msg-${crypto.randomUUID()}`;
  const recipientId = urlObj.searchParams.get("recipientId") || null;
  const mode = urlObj.searchParams.get("mode") || "pixel";
  const url = urlObj.searchParams.get("url") || "https://example.com";
  const file = urlObj.searchParams.get("file") || "sample.pdf";
  const baseUrl = deps.publicBaseUrl;

  const now = Date.now();
  const exp = now + 30 * 24 * 60 * 60 * 1000; // expire in 30 days

  const openToken = signToken({ messageId, recipientId, mode, iat: now, exp }, deps.secret);
  const linkToken = signToken({ messageId, recipientId, url, iat: now, exp }, deps.secret);
  const docToken  = signToken({ messageId, recipientId, file, iat: now, exp }, deps.secret);

  sendJson(res, 200, {
    messageId,
    recipientId,
    openUrl: `${baseUrl}/t/o/${openToken}.png`,
    linkUrl: `${baseUrl}/t/l/${linkToken}`,
    docUrl: `${baseUrl}/t/d/${docToken}`
  });
}

module.exports = { apiMint };
