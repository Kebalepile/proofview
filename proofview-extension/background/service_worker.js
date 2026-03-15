try {
  importScripts("../shared/config.js");
} catch (err) {
  console.warn("ProofView config.js could not be loaded.", err);
}

function normalizeBaseUrl(baseUrl) {
  return typeof baseUrl === "string" && baseUrl.trim()
    ? baseUrl.trim().replace(/\/+$/, "")
    : "";
}

const DEFAULT_SERVER_BASE_URL =
  normalizeBaseUrl(globalThis.PROOFVIEW_EXTENSION_CONFIG?.serverBaseUrl);
const DEFAULT_POLLING_MINUTES = 0.5;
const ALARM_NAME = "proofview-poll";

let statusMap = {};
let notifiedOpens = {};
let messageMeta = {};
let isPolling = false;

chrome.storage.local.get(["statusMap", "notifiedOpens", "messageMeta"], (data) => {
  if (data.statusMap && typeof data.statusMap === "object") {
    statusMap = data.statusMap;
  }

  if (data.notifiedOpens && typeof data.notifiedOpens === "object") {
    notifiedOpens = data.notifiedOpens;
  }

  if (data.messageMeta && typeof data.messageMeta === "object") {
    messageMeta = Object.fromEntries(
      Object.entries(data.messageMeta).map(([messageId, entry]) => {
        return [messageId, normalizeMessageMeta(entry)];
      })
    );
  }
});

function normalizeMessageMeta(entry) {
  const openEvents = Array.isArray(entry?.openEvents)
    ? entry.openEvents.filter((value) => typeof value === "number").sort((a, b) => b - a)
    : [];

  return {
    subject:
      typeof entry?.subject === "string" && entry.subject.trim()
        ? entry.subject.trim()
        : "No subject",
    trackedAt: typeof entry?.trackedAt === "number" ? entry.trackedAt : null,
    sentAt: typeof entry?.sentAt === "number" ? entry.sentAt : null,
    openEvents
  };
}

function ensureMessageMeta(messageId) {
  if (!messageMeta[messageId] || typeof messageMeta[messageId] !== "object") {
    messageMeta[messageId] = normalizeMessageMeta({});
  } else {
    messageMeta[messageId] = normalizeMessageMeta(messageMeta[messageId]);
  }

  return messageMeta[messageId];
}

function updateMessageMeta(messageId, patch = {}) {
  const meta = ensureMessageMeta(messageId);

  if (typeof patch.subject === "string" && patch.subject.trim()) {
    meta.subject = patch.subject.trim();
  }

  if (typeof patch.trackedAt === "number") {
    meta.trackedAt = patch.trackedAt;
  }

  if (typeof patch.sentAt === "number") {
    meta.sentAt = patch.sentAt;
  }

  return meta;
}

function recordOpenEvent(messageId, at) {
  const meta = ensureMessageMeta(messageId);
  if (typeof at !== "number") return meta;

  if (!meta.openEvents.includes(at)) {
    meta.openEvents.push(at);
    meta.openEvents.sort((a, b) => b - a);
  }

  return meta;
}

function saveState() {
  chrome.storage.local.set({ statusMap, notifiedOpens, messageMeta });
}

function deleteLocalMessage(messageId) {
  delete statusMap[messageId];
  delete notifiedOpens[messageId];
  delete messageMeta[messageId];
}

function clearLocalMessages() {
  statusMap = {};
  notifiedOpens = {};
  messageMeta = {};
}

function getServerBaseUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["serverBaseUrl"], (data) => {
      resolve(normalizeBaseUrl(data.serverBaseUrl) || DEFAULT_SERVER_BASE_URL);
    });
  });
}

function setStatus(messageId, status) {
  if (typeof messageId !== "string" || !messageId) return;
  if (typeof status !== "string" || !status) return;

  if (statusMap[messageId] === "opened" && status !== "opened") {
    return;
  }

  statusMap[messageId] = status;
}

function respondError(sendResponse, err) {
  sendResponse({
    ok: false,
    error: err instanceof Error ? err.message : String(err)
  });
}

function respondAsync(sendResponse, work) {
  (async () => {
    try {
      sendResponse(await work());
    } catch (err) {
      respondError(sendResponse, err);
    }
  })();

  return true;
}

function ensureServerBaseUrl(baseUrl) {
  if (!baseUrl) {
    throw new Error("ProofView serverBaseUrl is not configured. Run the extension sync step first.");
  }

  return baseUrl;
}

async function openFocusedEntry(messageId) {
  const safeMessageId = typeof messageId === "string" ? messageId : "";
  if (!safeMessageId) {
    throw new Error("messageId is required");
  }

  await chrome.storage.local.set({
    focusMessageId: safeMessageId,
    focusRequestedAt: Date.now()
  });

  if (chrome.action?.openPopup) {
    try {
      await chrome.action.openPopup();
      return { opened: "popup" };
    } catch (err) {
      console.debug("ProofView popup open fallback:", err);
    }
  }

  const focusUrl = chrome.runtime.getURL(
    `popup/popup.html?focus=${encodeURIComponent(safeMessageId)}`
  );

  if (self.clients?.openWindow) {
    await self.clients.openWindow(focusUrl);
    return { opened: "window" };
  }

  throw new Error("Unable to open ProofView entry");
}

async function postJson(baseUrl, pathname, body) {
  const url = new URL(pathname, baseUrl).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(`${pathname} failed: HTTP ${res.status}`);
  }

  return res.json();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "proofview:mint-batch") {
    return respondAsync(sendResponse, async () => {
      const baseUrl = ensureServerBaseUrl(
        normalizeBaseUrl(message.baseUrl) || await getServerBaseUrl()
      );
      const data = await postJson(baseUrl, "/api/mint-batch", message.payload || {});

      if (typeof data?.messageId === "string") {
        setStatus(data.messageId, "tracked");
        updateMessageMeta(data.messageId, {
          subject: message?.payload?.subject,
          trackedAt: Date.now()
        });
        saveState();
      }

      return { ok: true, data };
    });
  }

  if (message?.type === "proofview:mark-sent") {
    return respondAsync(sendResponse, async () => {
      const baseUrl = ensureServerBaseUrl(
        normalizeBaseUrl(message.baseUrl) || await getServerBaseUrl()
      );
      const data = await postJson(baseUrl, "/api/mark-sent", {
        messageId: message.messageId
      });

      if (typeof data?.messageId === "string") {
        setStatus(data.messageId, "sent");
        updateMessageMeta(data.messageId, {
          subject: message.subject,
          sentAt: typeof data.sentAt === "number" ? data.sentAt : Date.now()
        });
        saveState();
      }

      return { ok: true, data };
    });
  }

  if (message?.type === "proofview:delete-message") {
    return respondAsync(sendResponse, async () => {
      const baseUrl = ensureServerBaseUrl(await getServerBaseUrl());
      const messageId = typeof message.messageId === "string" ? message.messageId : "";

      if (!messageId) {
        throw new Error("messageId is required");
      }

      await postJson(baseUrl, "/api/delete-message", { messageId });
      deleteLocalMessage(messageId);
      saveState();

      return { ok: true };
    });
  }

  if (message?.type === "proofview:delete-all") {
    return respondAsync(sendResponse, async () => {
      const baseUrl = ensureServerBaseUrl(await getServerBaseUrl());

      await postJson(baseUrl, "/api/delete-all", {});
      clearLocalMessages();
      chrome.storage.local.remove(["lastSince"]);
      saveState();

      return { ok: true };
    });
  }

  if (message?.type === "proofview:update-status") {
    setStatus(message.messageId, message.status);
    updateMessageMeta(message.messageId, {
      subject: message.subject
    });
    saveState();
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "proofview:poll-now") {
    startPolling();
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "proofview:open-entry") {
    return respondAsync(sendResponse, async () => {
      const result = await openFocusedEntry(message.messageId);
      return { ok: true, ...result };
    });
  }
});

async function fetchEvents(baseUrl, since) {
  const url = new URL("/api/events", baseUrl);
  if (since) url.searchParams.set("since", String(since));

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Events fetch failed: HTTP ${res.status}`);
  }

  const raw = await res.json();
  return Array.isArray(raw?.events) ? raw.events : Array.isArray(raw) ? raw : [];
}

async function startPolling() {
  if (isPolling) return;
  isPolling = true;

  try {
    const baseUrl = ensureServerBaseUrl(await getServerBaseUrl());

    chrome.storage.local.get(["lastSince"], async (data) => {
      try {
        const since = typeof data.lastSince === "number" ? data.lastSince : 0;
        const events = await fetchEvents(baseUrl, since);
        let maxAt = since;

        for (const ev of events) {
          if (!ev || typeof ev !== "object") continue;

          if (typeof ev.at === "number" && ev.at > maxAt) {
            maxAt = ev.at;
          }

          if (ev.type === "open" && typeof ev.messageId === "string") {
            setStatus(ev.messageId, "opened");
            recordOpenEvent(ev.messageId, ev.at);

            if (!notifiedOpens[ev.messageId]) {
              notifiedOpens[ev.messageId] = true;
              const meta = ensureMessageMeta(ev.messageId);
              chrome.notifications.create({
                type: "basic",
                iconUrl: chrome.runtime.getURL("assets/icons/icon48.png"),
                title: "Email opened",
                message: `${meta.subject} was opened`
              });
            }
          }
        }

        saveState();
        chrome.storage.local.set({ lastSince: maxAt });
      } catch (err) {
        console.error("ProofView polling error:", err);
      } finally {
        isPolling = false;
      }
    });
  } catch (err) {
    console.error("ProofView polling setup error:", err);
    isPolling = false;
  }
}

function schedulePolling() {
  chrome.alarms.clear(ALARM_NAME, () => {
    chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: DEFAULT_POLLING_MINUTES,
      periodInMinutes: DEFAULT_POLLING_MINUTES
    });
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    startPolling();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  schedulePolling();
  startPolling();
});

chrome.runtime.onStartup.addListener(() => {
  schedulePolling();
  startPolling();
});

schedulePolling();
startPolling();
