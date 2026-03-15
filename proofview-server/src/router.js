const { sendText } = require("./lib/http");
const { homePage } = require("./handlers/homePage");
const { apiMintBatch } = require("./handlers/apiMintBatch");
const { apiEvents } = require("./handlers/apiEvents");
const { apiMarkSent } = require("./handlers/apiMarkSent");
const { apiDeleteMessage } = require("./handlers/apiDeleteMessage");
const { apiDeleteAll } = require("./handlers/apiDeleteAll");
const { apiStatus } = require("./handlers/apiStatus");
const { trackOpen } = require("./handlers/trackOpen");
const { trackLink } = require("./handlers/trackLink");
const { trackDoc } = require("./handlers/trackDoc");
const { serveLogo } = require("./handlers/serveLogo");
const { serveMascotSvg } = require("./handlers/serveMascotSvg");

function router(req, res, deps) {
  const urlObj = new URL(req.url, deps.publicBaseUrl);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }

  if (req.method === "GET" && urlObj.pathname === "/") {
    return homePage(res);
  }

  if (req.method === "GET" && urlObj.pathname === "/brand/mascot.png") {
    return serveLogo(res, deps);
  }

  if (req.method === "GET" && urlObj.pathname === "/brand/mascot.svg") {
    return serveMascotSvg(res);
  }

  if (req.method === "POST" && urlObj.pathname === "/api/mint-batch") {
    return apiMintBatch(req, res, deps);
  }

  if (req.method === "POST" && urlObj.pathname === "/api/mark-sent") {
    return apiMarkSent(req, res);
  }

  if (req.method === "POST" && urlObj.pathname === "/api/delete-message") {
    return apiDeleteMessage(req, res);
  }

  if (req.method === "POST" && urlObj.pathname === "/api/delete-all") {
    return apiDeleteAll(res);
  }

  if (req.method === "GET" && urlObj.pathname === "/api/events") {
    return apiEvents(res, urlObj);
  }

  if (req.method === "GET" && urlObj.pathname === "/api/status") {
    const messageId = urlObj.searchParams.get("messageId") || "";
    if (!messageId) {
      return sendText(res, 400, "messageId is required");
    }

    return apiStatus(res, messageId);
  }

  if (req.method === "GET" && /^\/t\/o\/.+\.png$/.test(urlObj.pathname)) {
    const token = urlObj.pathname.replace(/^\/t\/o\//, "").replace(/\.png$/, "");
    return trackOpen(req, res, { ...deps, token });
  }

  if (req.method === "GET" && /^\/t\/l\/.+$/.test(urlObj.pathname)) {
    const token = urlObj.pathname.replace(/^\/t\/l\//, "");
    return trackLink(req, res, { ...deps, token });
  }

  if (req.method === "GET" && /^\/t\/d\/.+$/.test(urlObj.pathname)) {
    const token = urlObj.pathname.replace(/^\/t\/d\//, "");
    return trackDoc(req, res, { ...deps, token });
  }

  return sendText(res, 404, "Not found");
}

module.exports = { router };
