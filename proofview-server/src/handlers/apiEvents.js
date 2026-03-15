/**
 * Events API handler.
 * @module handlers/apiEvents
 */

const { sendJson } = require("../lib/http");
const store = require("../lib/store");

/**
 * @description Return events after a given timestamp (ms).
 * @param {import("http").ServerResponse} res
 * @param {URL} urlObj
 * @returns {void}
 */
function apiEvents(res, urlObj) {
  const since = Number(urlObj.searchParams.get("since") || 0);
  const events = store.getEventsSince(Number.isFinite(since) ? since : 0);
  sendJson(res, 200, { events });
}

module.exports = { apiEvents };
