const crypto = require("crypto");

function b64urlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecodeToString(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  return Buffer.from(b64, "base64").toString("utf8");
}

function signToken(payload, secret) {
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = b64urlEncode(payloadJson);
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest();
  return `${payloadB64}.${b64urlEncode(sig)}`;
}


function verifyToken(token, secret) {
  const [payloadB64, sigB64] = String(token || "").split(".");
  if (!payloadB64 || !sigB64) {
    return { ok: false, error: "Malformed token" };
  }

  const expected = crypto.createHmac("sha256", secret).update(payloadB64).digest();
  const expectedB64 = b64urlEncode(expected);

  const a = Buffer.from(sigB64);
  const b = Buffer.from(expectedB64);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: "Bad signature" };
  }

  let payload;
  try {
    payload = JSON.parse(b64urlDecodeToString(payloadB64));
  } catch {
    return { ok: false, error: "Bad payload JSON" };
  }

  if (!payload.messageId) {
    return { ok: false, error: "Token missing messageId" };
  }

  if (payload.exp && Date.now() > payload.exp) {
    return { ok: false, error: "Token expired" };
  }

  return { ok: true, payload };
}

module.exports = { signToken, verifyToken };