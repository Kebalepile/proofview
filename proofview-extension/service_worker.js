/**
 * ProofView Service Worker (Manifest V3)
 *
 * @description
 * Polls ProofView server for new events and shows Chrome notifications.
 * Stores state in chrome.storage.local:
 * - serverBaseUrl: string
 * - lastSince: number (ms)
 * - pollingSeconds: number
 *
 * @notes
 * MV3 service workers sleep; alarms are the correct way to keep periodic polling.
 */

/** @type {string} */
const DEFAULT_SERVER_BASE_URL = "http://localhost:3000";
/** @type {number} */
const DEFAULT_POLLING_SECONDS = 15;
/** @type {string} */
const ALARM_NAME = "proofview_poll";

/**
 * @typedef {Object} ProofViewEvent
 * @property {number} at
 * @property {"open"|"click"|"download"|"read_confirm"} type
 * @property {string} messageId
 * @property {string|null} recipientId
 * @property {Object} meta
 */

/**
 * @typedef {Object} EventsResponse
 * @property {number} since
 * @property {number} now
 * @property {ProofViewEvent[]} events
 */

/**
 * @description Get extension settings from storage with defaults.
 * @returns {Promise<{serverBaseUrl: string, lastSince: number, pollingSeconds: number}>}
 */
async function getSettings() {
  const data = await chrome.storage.local.get(["serverBaseUrl", "lastSince", "pollingSeconds"]);
  return {
    serverBaseUrl: typeof data.serverBaseUrl === "string" ? data.serverBaseUrl : DEFAULT_SERVER_BASE_URL,
    lastSince: typeof data.lastSince === "number" ? data.lastSince : 0,
    pollingSeconds: typeof data.pollingSeconds === "number" ? data.pollingSeconds : DEFAULT_POLLING_SECONDS
  };
}

/**
 * @description Save the polling cursor.
 * @param {number} lastSince
 * @returns {Promise<void>}
 */
async function setLastSince(lastSince) {
  await chrome.storage.local.set({ lastSince });
}

/**
 * @description Create/refresh the polling alarm.
 * @param {number} pollingSeconds
 * @returns {Promise<void>}
 */
async function ensureAlarm(pollingSeconds) {
  // clear then recreate for consistent interval updates
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: Math.max(0.25, pollingSeconds / 60) }); // min ~15s
}

/**
 * @description Safely build a URL for /api/events.
 * @param {string} baseUrl
 * @param {number} since
 * @returns {string}
 */
function buildEventsUrl(baseUrl, since) {
  const u = new URL("/api/events", baseUrl);
  if (since > 0) u.searchParams.set("since", String(since));
  return u.toString();
}

/**
 * @description Fetch JSON from a URL.
 * @template T
 * @param {string} url
 * @returns {Promise<T>}
 */
async function fetchJson(url) {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return /** @type {Promise<T>} */ (res.json());
}

/**
 * @description Format an event into a notification body line.
 * @param {ProofViewEvent} evt
 * @returns {string}
 */
function formatEventLine(evt) {
  const when = new Date(evt.at).toLocaleString();
  if (evt.type === "open") return `Opened • ${evt.messageId} • ${when}`;
  if (evt.type === "click") return `Link clicked • ${evt.messageId} • ${when}`;
  if (evt.type === "download") return `Doc downloaded • ${evt.messageId} • ${when}`;
  if (evt.type === "read_confirm") return `Read confirmed • ${evt.messageId} • ${when}`;
  return `Event • ${evt.messageId} • ${when}`;
}

/**
 * @description Show a Chrome notification for a ProofView event.
 * @param {ProofViewEvent} evt
 * @returns {Promise<void>}
 */
async function notify(evt) {
  const title =
    evt.type === "open" ? "ProofView: Email opened" :
    evt.type === "click" ? "ProofView: Link clicked" :
    evt.type === "download" ? "ProofView: Document downloaded" :
    "ProofView: Activity";

  const message = formatEventLine(evt);

  // Use event timestamp in notification id to avoid collisions
  const notificationId = `proofview_${evt.type}_${evt.messageId}_${evt.at}`;

  await chrome.notifications.create(notificationId, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message
  });
}

/**
 * @description Poll the server for new events and notify the user.
 * @returns {Promise<void>}
 */
async function pollOnce() {
  const { serverBaseUrl, lastSince } = await getSettings();
  const url = buildEventsUrl(serverBaseUrl, lastSince);

  try {
    console.log("[ProofView] polling", { url });

    /** @type {EventsResponse} */
    const data = await fetchJson(url);

    // Move cursor forward only after successful fetch
    await setLastSince(data.now);

    for (const evt of data.events) {
      await notify(evt);
    }
  } catch (err) {
    console.error("[ProofView] pollOnce failed", {
      serverBaseUrl,
      url,
      lastSince,
      message: String(err?.message || err)
    });
    // Don’t throw; alarms will keep trying
  }
}


/**
 * @description Initialize extension defaults on install/update.
 * @returns {Promise<void>}
 */
async function init() {
  const { pollingSeconds } = await getSettings();
  await ensureAlarm(pollingSeconds);

  // Set defaults if missing
  const current = await chrome.storage.local.get(["serverBaseUrl", "pollingSeconds", "lastSince"]);
  const patch = {};
  if (typeof current.serverBaseUrl !== "string") patch.serverBaseUrl = DEFAULT_SERVER_BASE_URL;
  if (typeof current.pollingSeconds !== "number") patch.pollingSeconds = DEFAULT_POLLING_SECONDS;
  if (typeof current.lastSince !== "number") patch.lastSince = 0;
  if (Object.keys(patch).length > 0) await chrome.storage.local.set(patch);
}

// ---- Events ----
chrome.runtime.onInstalled.addListener(() => {
  init().catch(err => console.error("init failed:", err));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  pollOnce().catch(err => console.error("poll failed:", err));
});


// Optional: allow popup to trigger a manual poll
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "PROOFVIEW_POLL_NOW") {
    pollOnce()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true; // async response
  }
  return false;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "proofview:mint-batch") {
    (async () => {
      try {
        const { baseUrl, payload } = message;
        const url = new URL("/api/mint-batch", baseUrl).toString();

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          sendResponse({
            ok: false,
            error: `Mint failed: HTTP ${res.status}`
          });
          return;
        }

        const data = await res.json();

        sendResponse({
          ok: true,
          data
        });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    })();

    return true; // keeps sendResponse alive for async work
  }
});