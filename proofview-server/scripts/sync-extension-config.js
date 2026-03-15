const fs = require("fs");
const path = require("path");
const { getConfig } = require("../src/lib/config");

const extensionDir = path.join(__dirname, "..", "..", "proofview-extension");
const configFile = path.join(extensionDir, "shared", "config.js");
const manifestFile = path.join(extensionDir, "manifest.json");

function writeExtensionConfig(serverBaseUrl) {
  const content = [
    "globalThis.PROOFVIEW_EXTENSION_CONFIG = Object.freeze({",
    `  serverBaseUrl: ${JSON.stringify(serverBaseUrl)}`,
    "});",
    ""
  ].join("\n");

  fs.writeFileSync(configFile, content, "utf8");
}

function syncManifestHostPermissions(serverBaseUrl) {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const serverOriginPattern = `${new URL(serverBaseUrl).origin}/*`;

  manifest.host_permissions = [
    serverOriginPattern,
    "https://mail.google.com/*"
  ];

  const contentScript = Array.isArray(manifest.content_scripts)
    ? manifest.content_scripts.find((entry) => Array.isArray(entry.matches) && entry.matches.includes("https://mail.google.com/*"))
    : null;

  if (contentScript && Array.isArray(contentScript.js)) {
    const filtered = contentScript.js.filter((scriptPath) => {
      return scriptPath !== "config.js" && scriptPath !== "shared/config.js";
    });

    contentScript.js = ["shared/config.js", ...filtered];
  }

  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function main() {
  const config = getConfig();
  writeExtensionConfig(config.publicBaseUrl);
  syncManifestHostPermissions(config.publicBaseUrl);

  console.log(`ProofView extension synced to ${config.publicBaseUrl}`);
}

main();
