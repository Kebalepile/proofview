const fs = require("fs");
const path = require("path");

const STORAGE_FILE = path.join(__dirname, "..", "..", "data.json");

let db = {
  events: [],
  counters: {},
  sent: {}
};

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function load() {
  try {
    ensureDir(STORAGE_FILE);

    if (fs.existsSync(STORAGE_FILE)) {
      const raw = fs.readFileSync(STORAGE_FILE, "utf8");
      const parsed = JSON.parse(raw);

      db = {
        events: Array.isArray(parsed.events) ? parsed.events : [],
        counters: parsed.counters && typeof parsed.counters === "object" ? parsed.counters : {},
        sent: parsed.sent && typeof parsed.sent === "object" ? parsed.sent : {}
      };
    } else {
      persist();
    }
  } catch {
    db = {
      events: [],
      counters: {},
      sent: {}
    };
    persist();
  }
}

function persist() {
  ensureDir(STORAGE_FILE);
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(db, null, 2), "utf8");
}

function ensureCounters(messageId) {
  if (!db.counters[messageId]) {
    db.counters[messageId] = {
      opens: 0,
      lastOpenAt: null
    };
  }
  return db.counters[messageId];
}

function bumpOpen(messageId, at) {
  const c = ensureCounters(messageId);
  c.opens += 1;
  c.lastOpenAt = at;
  persist();
  return c;
}

function appendEvent(event) {
  db.events.push(event);
  if (db.events.length > 10000) {
    db.events = db.events.slice(-10000);
  }
  persist();
}

function getEventsSince(since) {
  return since ? db.events.filter((e) => e.at > since) : db.events;
}

function getStatus(messageId) {
  return db.counters[messageId] || { opens: 0, lastOpenAt: null };
}

function markSent(messageId, at) {
  db.sent[messageId] = at;
  persist();
}

function getSentAt(messageId) {
  return typeof db.sent[messageId] === "number" ? db.sent[messageId] : null;
}

function isSent(messageId) {
  return typeof db.sent[messageId] === "number";
}

load();

module.exports = {
  bumpOpen,
  appendEvent,
  getEventsSince,
  getStatus,
  markSent,
  getSentAt,
  isSent
};