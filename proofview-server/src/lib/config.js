/**
 * Configuration for ProofView server.
 * @module config
 */

const fs = require("fs");
const path = require("path");

/**
 * @typedef {Object} Config
 * @property {number} port
 * @property {string} secret
 * @property {string} publicBaseUrl
 * @property {number} openGraceMs
 * @property {string} storageFile
 * @property {string} logoFile
 * @property {string} sampleDoc
 */

const ROOT = path.join(__dirname, "..", "..");
const ENV_FILE = path.join(ROOT, ".env");

let envLoaded = false;

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function loadEnvFile() {
  if (envLoaded) return;
  envLoaded = true;

  if (!fs.existsSync(ENV_FILE)) return;

  const raw = fs.readFileSync(ENV_FILE, "utf8");
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;

    const key = trimmed.slice(0, idx).trim();
    const value = stripQuotes(trimmed.slice(idx + 1).trim());

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function resolvePath(value, fallback) {
  const candidate = String(value || fallback || "").trim();
  if (!candidate) return "";
  return path.isAbsolute(candidate) ? candidate : path.resolve(ROOT, candidate);
}

/**
 * @description Load configuration from environment with safe defaults.
 * @returns {Config}
 */
function getConfig() {
  loadEnvFile();

  const port = parseNumber(process.env.PORT || process.env.PROOFVIEW_PORT, 3000);
  const publicBaseUrl = normalizeBaseUrl(
    process.env.PROOFVIEW_PUBLIC_BASE_URL || `http://localhost:${port}`
  );

  return {
    port,
    secret: process.env.PROOFVIEW_SECRET || "change-me-in-env",
    publicBaseUrl,
    openGraceMs: parseNumber(process.env.PROOFVIEW_OPEN_GRACE_MS, 15000),
    storageFile: resolvePath(
      process.env.PROOFVIEW_STORAGE_FILE,
      "./data/proofview_db.json"
    ),
    logoFile: resolvePath(
      process.env.PROOFVIEW_LOGO_FILE,
      "./assets/icon.png"
    ),
    sampleDoc: resolvePath(
      process.env.PROOFVIEW_SAMPLE_DOC,
      "./assets/sample.pdf"
    )
  };
}

module.exports = { getConfig, loadEnvFile };
