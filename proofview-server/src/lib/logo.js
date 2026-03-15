const fs = require("fs");
const path = require("path");

const FALLBACK_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAwMBAS8p3XQAAAAASUVORK5CYII=",
  "base64"
);

let cachedLogoPath = "";
let cachedLogoBuffer = null;
let cachedLogoStamp = 0;
const MASCOT_SVG_FILE = path.resolve(__dirname, "..", "..", "assets", "mascot.svg");

let cachedMascotSvg = "";
let cachedMascotSvgStamp = 0;

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

function getMascotSvg() {
  try {
    const stat = fs.statSync(MASCOT_SVG_FILE);
    const stamp = Number(stat.mtimeMs || 0);

    if (cachedMascotSvg && cachedMascotSvgStamp === stamp) {
      return cachedMascotSvg;
    }

    const svg = fs.readFileSync(MASCOT_SVG_FILE, "utf8");
    if (svg.trim()) {
      cachedMascotSvg = svg;
      cachedMascotSvgStamp = stamp;
      return svg;
    }
  } catch (err) {
    console.warn(`ProofView mascot svg load failed for ${MASCOT_SVG_FILE}:`, err.message);
  }

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="#17355E"/><circle cx="32" cy="32" r="18" fill="#F7FBFF"/><circle cx="32" cy="32" r="8" fill="#1F5FE0"/></svg>';
}

module.exports = { getLogoBuffer, getMascotSvg };
