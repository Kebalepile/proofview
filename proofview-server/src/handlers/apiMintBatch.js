/**
 * Batch minting handler for ProofView.
 * @module handlers/apiMintBatch
 */

const crypto = require("crypto");
const { sendJson, sendText } = require("../lib/http");
const { signToken } = require("../lib/tokens");

/**
 * @typedef {Object} MintBatchRequest
 * @property {string} [messageId]
 * @property {string|null} [recipientId]
 * @property {"pixel"|"logo"|"signature"} [mode]
 * @property {string[]} [links]
 * @property {string} [file]
 */

/**
 * @description Read the raw request body (small JSON).
 * @param {import("http").IncomingMessage} req
 * @returns {Promise<string>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      // protection: refuse huge bodies in this prototype
      if (data.length > 250_000) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/**
 * @description Batch mint tokens for:
 * - open tracking (pixel/logo/signature)
 * - many links (redirect tracking)
 * - optional document tracking
 *
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @param {Object} deps
 * @param {number} deps.port
 * @param {string} deps.secret
 * @returns {Promise<void>}
 */
async function apiMintBatch(req, res, deps) {
  try {
    const raw = await readBody(req);
    /** @type {MintBatchRequest} */
    const body = raw ? JSON.parse(raw) : {};

    const messageId = body.messageId || `msg-${crypto.randomUUID()}`;
    const recipientId = typeof body.recipientId === "string" ? body.recipientId : null;
    const mode = body.mode || "pixel";
    const links = Array.isArray(body.links) ? body.links : [];
    const file = body.file || "sample.pdf";

    // token expires in 30 days for prototype
    const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;

    const openToken = signToken({ messageId, recipientId, mode, exp }, deps.secret);
    const docToken = signToken({ messageId, recipientId, file, exp }, deps.secret);

    /** @type {Record<string, string>} */
    const linkMap = {};
    for (const originalUrl of links) {
      if (typeof originalUrl !== "string") continue;
      // mint redirect token per link
      const linkToken = signToken({ messageId, recipientId, url: originalUrl, exp }, deps.secret);
      linkMap[originalUrl] = `http://localhost:${deps.port}/t/l/${linkToken}`;
    }

    sendJson(res, 200, {
      messageId,
      recipientId,
      openUrl: `http://localhost:${deps.port}/t/o/${openToken}.png`,
      docUrl: `http://localhost:${deps.port}/t/d/${docToken}`,
      linkMap
    });
  } catch (err) {
    sendText(res, 400, `Bad request: ${String(err.message || err)}`);
  }
}

module.exports = { apiMintBatch };
