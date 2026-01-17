/**
 * Storage layer (prototype JSON file store).
 * This module is the primary scalability seam:
 * swap implementation to SQLite/Postgres later without touching handlers.
 * @module store
 */

const fs = require("fs");
const path = require("path");

/** @type {import("./types").Db} */
let db = { events: [], counters: {} };

/**
 * @description Initialize store (loads from disk or creates empty).
 * @param {string} storageFile
 * @returns {void}
 */
function initStore(storageFile) {
  try {
    ensureDir(path.dirname(storageFile));
    if (fs.existsSync(storageFile)) {
      const raw = fs.readFileSync(storageFile, "utf8");
      const parsed = JSON.parse(raw);
      db = {
        events: Array.isArray(parsed.events) ? parsed.events : [],
        counters: parsed.counters && typeof parsed.counters === "object" ? parsed.counters : {}
      };
    } else {
      persist(storageFile);
    }
  } catch {
    db = { events: [], counters: {} };
    ensureDir(path.dirname(storageFile));
    persist(storageFile);
  }
}

/**
 * @description Ensure directory exists.
 * @param {string} dir
 * @returns {void}
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * @description Persist DB to disk.
 * @param {string} storageFile
 * @returns {void}
 */
function persist(storageFile) {
  fs.writeFileSync(storageFile, JSON.stringify(db, null, 2), "utf8");
}

/**
 * @description Ensure counters exist for a messageId.
 * @param {string} messageId
 * @returns {import("./types").MessageCounters}
 */
function ensureCounters(messageId) {
  if (!db.counters[messageId]) {
    db.counters[messageId] = {
      opens: 0,
      clicks: 0,
      downloads: 0,
      lastOpenAt: null,
      lastClickAt: null,
      lastDownloadAt: null
    };
  }
  return db.counters[messageId];
}

/**
 * @description Increment counters for a message.
 * @param {string} messageId
 * @param {"open"|"click"|"download"} kind
 * @param {number} at
 * @returns {import("./types").MessageCounters}
 */
function bump(messageId, kind, at) {
  const c = ensureCounters(messageId);
  if (kind === "open") { c.opens += 1; c.lastOpenAt = at; }
  if (kind === "click") { c.clicks += 1; c.lastClickAt = at; }
  if (kind === "download") { c.downloads += 1; c.lastDownloadAt = at; }
  return c;
}

/**
 * @description Append an event and persist.
 * @param {import("./types").ProofViewEvent} event
 * @param {string} storageFile
 * @returns {void}
 */
function appendEvent(event, storageFile) {
  db.events.push(event);
  if (db.events.length > 50000) db.events = db.events.slice(-50000);
  persist(storageFile);
}

/**
 * @description Return events since timestamp (ms).
 * @param {number} since
 * @returns {import("./types").ProofViewEvent[]}
 */
function getEventsSince(since) {
  return since ? db.events.filter(e => e.at > since) : db.events;
}

/**
 * @description Get counters for a messageId.
 * @param {string} messageId
 * @returns {import("./types").MessageCounters}
 */
function getStatus(messageId) {
  return db.counters[messageId] || {
    opens: 0, clicks: 0, downloads: 0,
    lastOpenAt: null, lastClickAt: null, lastDownloadAt: null
  };
}

module.exports = {
  initStore,
  bump,
  appendEvent,
  getEventsSince,
  getStatus
};
