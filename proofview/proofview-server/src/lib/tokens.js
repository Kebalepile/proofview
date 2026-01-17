/**
 * Signed token utilities (HMAC, base64url).
 * @module tokens
 */

const crypto = require("crypto");

/**
 * @description Base64url encode.
 * @param {Buffer|string} input
 * @returns {string}
 */
function b64urlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/**
 * @description Base64url decode into UTF-8 string.
 * @param {string} b64url
 * @returns {string}
 */
function b64urlDecodeToString(b64url) {
  const b64 = b64url.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((b64url.length + 3) % 4);
  return Buffer.from(b64, "base64").toString("utf8");
}

/**
 * @description Sign a token payload.
 * @param {import("./types").TokenPayload} payload
 * @param {string} secret
 * @returns {string} token
 */
function signToken(payload, secret) {
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = b64urlEncode(payloadJson);
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest();
  return `${payloadB64}.${b64urlEncode(sig)}`;
}

/**
 * @description Verify token signature and parse payload.
 * @param {string} token
 * @param {string} secret
 * @returns {{ ok: true, payload: import("./types").TokenPayload } | { ok: false, error: string }}
 */
function verifyToken(token, secret) {
  const [payloadB64, sigB64] = (token || "").split(".");
  if (!payloadB64 || !sigB64) return { ok: false, error: "Malformed token" };

  const expected = crypto.createHmac("sha256", secret).update(payloadB64).digest();
  const expectedB64 = b64urlEncode(expected);

  const a = Buffer.from(sigB64);
  const b = Buffer.from(expectedB64);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, error: "Bad signature" };

  /** @type {import("./types").TokenPayload} */
  let payload;
  try {
    payload = JSON.parse(b64urlDecodeToString(payloadB64));
  } catch {
    return { ok: false, error: "Bad payload JSON" };
  }

  if (!payload.messageId) return { ok: false, error: "Token missing messageId" };
  if (payload.exp && Date.now() > payload.exp) return { ok: false, error: "Token expired" };

  return { ok: true, payload };
}

module.exports = { signToken, verifyToken };
