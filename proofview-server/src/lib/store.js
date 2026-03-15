const fs = require("fs");
const path = require("path");
const { getConfig } = require("./config");

const { storageFile: STORAGE_FILE } = getConfig();

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

function normalizeCounter(counter) {
  return {
    opens: Number(counter?.opens || 0),
    lastOpenAt: counter?.lastOpenAt ?? null,
    clicks: Number(counter?.clicks || 0),
    lastClickAt: counter?.lastClickAt ?? null,
    downloads: Number(counter?.downloads || 0),
    lastDownloadAt: counter?.lastDownloadAt ?? null
  };
}

function load() {
  try {
    ensureDir(STORAGE_FILE);

    if (fs.existsSync(STORAGE_FILE)) {
      const raw = fs.readFileSync(STORAGE_FILE, "utf8");
      const parsed = JSON.parse(raw);
      const counters = parsed.counters && typeof parsed.counters === "object"
        ? parsed.counters
        : {};

      db = {
        events: Array.isArray(parsed.events) ? parsed.events : [],
        counters: Object.fromEntries(
          Object.entries(counters).map(([messageId, counter]) => {
            return [messageId, normalizeCounter(counter)];
          })
        ),
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
    db.counters[messageId] = normalizeCounter();
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

function bump(messageId, type, at) {
  const c = ensureCounters(messageId);

  if (type === "click") {
    c.clicks += 1;
    c.lastClickAt = at;
  } else if (type === "download") {
    c.downloads += 1;
    c.lastDownloadAt = at;
  } else if (type === "open") {
    c.opens += 1;
    c.lastOpenAt = at;
  }

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
  return db.counters[messageId] || normalizeCounter();
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

function deleteMessage(messageId) {
  db.events = db.events.filter((event) => event?.messageId !== messageId);
  delete db.counters[messageId];
  delete db.sent[messageId];
  persist();
}

function clearAll() {
  db = {
    events: [],
    counters: {},
    sent: {}
  };
  persist();
}

load();

module.exports = {
  bump,
  bumpOpen,
  appendEvent,
  getEventsSince,
  getStatus,
  markSent,
  getSentAt,
  isSent,
  deleteMessage,
  clearAll
};
