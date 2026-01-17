/**
 * Configuration for ProofView server.
 * @module config
 */

const path = require("path");

/**
 * @typedef {Object} Config
 * @property {number} port
 * @property {string} secret
 * @property {string} storageFile
 * @property {string} logoFile
 * @property {string} sampleDoc
 */

const ROOT = path.join(__dirname, "..", "..");

/**
 * @description Load configuration from environment with safe defaults for prototype.
 * @returns {Config}
 */
function getConfig() {
  return {
    port: Number(process.env.PROOFVIEW_PORT || "3000"),
    secret: process.env.PROOFVIEW_SECRET || "change-me-in-env",
    storageFile: process.env.PROOFVIEW_STORAGE_FILE || path.join(ROOT, "data", "proofview_db.json"),
    logoFile: process.env.PROOFVIEW_LOGO_FILE || path.join(ROOT, "assets", "logo.png"),
    sampleDoc: process.env.PROOFVIEW_SAMPLE_DOC || path.join(ROOT, "assets", "sample.pdf")
  };
}

module.exports = { getConfig };
