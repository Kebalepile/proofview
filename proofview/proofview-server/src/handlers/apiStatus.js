/**
 * Status API handler.
 * @module handlers/apiStatus
 */

const { sendJson } = require("../lib/http");
const store = require("../lib/store");

/**
 * @description Return counters for a messageId.
 * @param {import("http").ServerResponse} res
 * @param {string} messageId
 * @returns {void}
 */
function apiStatus(res, messageId) {
  const status = store.getStatus(messageId);
  sendJson(res, 200, { messageId, ...status });
}

module.exports = { apiStatus };
