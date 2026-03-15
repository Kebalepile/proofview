const { sendJson } = require("../lib/http");
const store = require("../lib/store");

function apiDeleteAll(res) {
  store.clearAll();

  return sendJson(res, 200, {
    ok: true
  });
}

module.exports = { apiDeleteAll };
