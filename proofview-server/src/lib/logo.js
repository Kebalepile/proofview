const fs = require("fs");

const FALLBACK_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAwMBAS8p3XQAAAAASUVORK5CYII=",
  "base64"
);

let cachedLogoPath = "";
let cachedLogoBuffer = null;
let cachedLogoStamp = 0;

function getLogoBuffer(logoFile) {
  const nextPath = typeof logoFile === "string" ? logoFile.trim() : "";
  if (!nextPath) {
    return FALLBACK_PNG;
  }

  try {
    const stat = fs.statSync(nextPath);
    const stamp = Number(stat.mtimeMs || 0);

    if (cachedLogoBuffer && cachedLogoPath === nextPath && cachedLogoStamp === stamp) {
      return cachedLogoBuffer;
    }

    const buffer = fs.readFileSync(nextPath);
    if (buffer.length > 0) {
      cachedLogoPath = nextPath;
      cachedLogoBuffer = buffer;
      cachedLogoStamp = stamp;
      return buffer;
    }
  } catch (err) {
    console.warn(`ProofView logo load failed for ${nextPath}:`, err.message);
  }

  return FALLBACK_PNG;
}

module.exports = { getLogoBuffer };
