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
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;

  const openToken = signToken({ messageId, recipientId, mode, exp }, deps.secret);
  const linkToken = signToken({ messageId, recipientId, url, exp }, deps.secret);
  const docToken  = signToken({ messageId, recipientId, file, exp }, deps.secret);

  sendJson(res, 200, {
    messageId,
    recipientId,
    openUrl: `http://localhost:${deps.port}/t/o/${openToken}.png`,
    linkUrl: `http://localhost:${deps.port}/t/l/${linkToken}`,
    docUrl:  `http://localhost:${deps.port}/t/d/${docToken}`
  });
}

module.exports = { apiMint };
