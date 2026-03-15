const DEFAULT_SERVER_BASE_URL = "http://localhost:3000";
const DEFAULT_POLLING_SECONDS = 15;
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

function getServerBaseUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["serverBaseUrl"], (data) => {
      const baseUrl =
        typeof data.serverBaseUrl === "string" && data.serverBaseUrl.trim()
          ? data.serverBaseUrl.trim().replace(/\/+$/, "")
          : DEFAULT_SERVER_BASE_URL;
      resolve(baseUrl);
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "proofview:mint-batch") {
    (async () => {
      try {
        const baseUrl =
          typeof message.baseUrl === "string" && message.baseUrl.trim()
            ? message.baseUrl.trim().replace(/\/+$/, "")
            : await getServerBaseUrl();

        const url = new URL("/api/mint-batch", baseUrl).toString();

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(message.payload || {})
        });

        if (!res.ok) {
          sendResponse({ ok: false, error: `Mint failed: HTTP ${res.status}` });
          return;
        }

        const data = await res.json();
        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    })();
    return true;
  }

  if (message?.type === "proofview:mark-sent") {
    (async () => {
      try {
        const baseUrl = await getServerBaseUrl();
        const url = new URL("/api/mark-sent", baseUrl).toString();

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId: message.messageId })
        });

        if (!res.ok) {
          sendResponse({ ok: false, error: `Mark-sent failed: HTTP ${res.status}` });
          return;
        }

        const data = await res.json();
        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    })();
    return true;
  }

  if (message?.type === "proofview:update-status") {
    const { messageId, status } = message;
    if (typeof messageId === "string" && typeof status === "string") {
      statusMap[messageId] = status;
      saveState();
    }
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
  const events = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.events)
      ? raw.events
      : [];

  return events;
}

async function startPolling() {
  if (isPolling) return;
  isPolling = true;

  try {
    const baseUrl = await getServerBaseUrl();

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
            statusMap[ev.messageId] = "opened";

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

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    startPolling();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.clear(ALARM_NAME, () => {
    chrome.alarms.create(ALARM_NAME, {
      periodInMinutes: DEFAULT_POLLING_SECONDS / 60
    });
    startPolling();
  });
});

chrome.runtime.onStartup.addListener(() => {
  startPolling();
});

startPolling();