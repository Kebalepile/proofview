const { sendSvg } = require("../lib/http");
const { getMascotSvg } = require("../lib/logo");

function serveMascotSvg(res) {
  return sendSvg(res, getMascotSvg());
}

module.exports = { serveMascotSvg };
