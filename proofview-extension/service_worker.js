try {
  importScripts("config.js");
} catch (err) {
  console.warn("ProofView config.js could not be loaded.", err);
}

const DEFAULT_SERVER_BASE_URL =
  normalizeBaseUrl(globalThis.PROOFVIEW_EXTENSION_CONFIG?.serverBaseUrl);
const DEFAULT_POLLING_MINUTES = 0.5;
const ALARM_NAME = "proofview-poll";

let statusMap = {};
let notifiedOpens = {};
let isPolling = false;

chrome.storage.local.get(["statusMap", "notifiedOpens"], (data) => {
  if (data.statusMap && typeof data.statusMap === "object") {
    statusMap = data.statusMap;
  }
  if (data.notifiedOpens && typeof data.notifiedOpens === "object") {
    notifiedOpens = data.notifiedOpens;
  }
});

function saveState() {
  chrome.storage.local.set({ statusMap, notifiedOpens });
}

function normalizeBaseUrl(baseUrl) {
  return typeof baseUrl === "string" && baseUrl.trim()
    ? baseUrl.trim().replace(/\/+$/, "")
    : "";
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "proofview:mint-batch") {
    return respondAsync(sendResponse, async () => {
      const baseUrl = ensureServerBaseUrl(
        normalizeBaseUrl(message.baseUrl) || await getServerBaseUrl()
      );
      const url = new URL("/api/mint-batch", baseUrl).toString();

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message.payload || {})
      });

      if (!res.ok) {
        return { ok: false, error: `Mint failed: HTTP ${res.status}` };
      }

      const data = await res.json();
      if (typeof data?.messageId === "string") {
        setStatus(data.messageId, "tracked");
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
      const url = new URL("/api/mark-sent", baseUrl).toString();

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: message.messageId })
      });

      if (!res.ok) {
        return { ok: false, error: `Mark-sent failed: HTTP ${res.status}` };
      }

      const data = await res.json();
      if (typeof data?.messageId === "string") {
        setStatus(data.messageId, "sent");
        saveState();
      }

      return { ok: true, data };
    });
  }

  if (message?.type === "proofview:update-status") {
    setStatus(message.messageId, message.status);
    saveState();
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "proofview:poll-now") {
    startPolling();
    sendResponse({ ok: true });
    return true;
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

            if (!notifiedOpens[ev.messageId]) {
              notifiedOpens[ev.messageId] = true;
              chrome.notifications.create({
                type: "basic",
                iconUrl: "icons/icon48.png",
                title: "Email opened",
                message: `Email ${ev.messageId} was opened`
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
