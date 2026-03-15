const { sendPng } = require("../lib/http");
const { getLogoBuffer } = require("../lib/logo");

function serveLogo(res, deps) {
  return sendPng(res, getLogoBuffer(deps.logoFile));
}

module.exports = { serveLogo };
