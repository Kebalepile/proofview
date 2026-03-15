/**
 * Low-level HTTP response helpers.
 * @module http
 */

const fs = require("fs");

/**
 * @description Send JSON response.
 * @param {import("http").ServerResponse} res
 * @param {number} status
 * @param {any} data
 * @returns {void}
 */
function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(data));
}


/**
 * @description Send text response.
 * @param {import("http").ServerResponse} res
 * @param {number} status
 * @param {string} text
 * @returns {void}
 */

function sendText(res, status, text) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(text);
}

/**
 * @description Send PNG bytes with no-cache headers.
 * @param {import("http").ServerResponse} res
 * @param {Buffer} pngBytes
 * @returns {void}
 */
function sendPng(res, buffer) {
  res.writeHead(200, {
    "Content-Type": "image/png",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(buffer);
}

/**
 * @description Redirect to URL.
 * @param {import("http").ServerResponse} res
 * @param {string} url
 * @param {number} [status=302]
 * @returns {void}
 */
function redirect(res, url, status = 302) {
  res.writeHead(status, { Location: url, "Cache-Control": "no-store" });
  res.end();
}

/**
 * @description Stream a file as an attachment download.
 * @param {import("http").ServerResponse} res
 * @param {string} filePath
 * @param {string} downloadName
 * @returns {void}
 */
function streamDownload(res, filePath, downloadName) {
  if (!fs.existsSync(filePath)) {
    sendText(res, 404, "File not found");
    return;
  }

  const stat = fs.statSync(filePath);
  const safeName = (downloadName || "file").replace(/[^a-zA-Z0-9._-]/g, "_");

  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Length": stat.size,
    "Content-Disposition": `attachment; filename="${safeName}"`,
    "Cache-Control": "no-store"
  });

  const s = fs.createReadStream(filePath);
  s.pipe(res);
  s.on("error", () => res.end());
}

module.exports = { sendJson, sendText, sendPng, redirect, streamDownload };
