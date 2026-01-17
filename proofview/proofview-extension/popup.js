/**
 * ProofView popup script.
 *
 * @description
 * Allows setting server URL, manual polling, and viewing recent events.
 */

/**
 * @typedef {Object} ProofViewEvent
 * @property {number} at
 * @property {"open"|"click"|"download"|"read_confirm"} type
 * @property {string} messageId
 * @property {string|null} recipientId
 * @property {Object} meta
 */

/**
 * @description Get stored settings.
 * @returns {Promise<{serverBaseUrl: string, lastSince: number}>}
 */
async function getSettings() {
  const data = await chrome.storage.local.get(["serverBaseUrl", "lastSince"]);
  return {
    serverBaseUrl: typeof data.serverBaseUrl === "string" ? data.serverBaseUrl : "http://localhost:3000",
    lastSince: typeof data.lastSince === "number" ? data.lastSince : 0
  };
}

/**
 * @description Render events in the popup.
 * @param {ProofViewEvent[]} events
 * @returns {void}
 */
function renderEvents(events) {
  const root = document.getElementById("events");
  root.innerHTML = "";

  const latest = events.slice(-15).reverse();
  if (latest.length === 0) {
    root.innerHTML = `<div class="small">No events yet.</div>`;
    return;
  }

  for (const evt of latest) {
    const when = new Date(evt.at).toLocaleString();
    const div = document.createElement("div");
    div.className = "evt";
    div.innerHTML = `
      <span class="tag">${evt.type}</span>
      <span class="mono">${evt.messageId}</span><br/>
      <span class="small">${when}${evt.recipientId ? " • " + evt.recipientId : ""}</span>
    `;
    root.appendChild(div);
  }
}

/**
 * @description Fetch events directly (popup view). Cursor does not change here.
 * @param {string} baseUrl
 * @returns {Promise<ProofViewEvent[]>}
 */
async function fetchEvents(baseUrl) {
  const res = await fetch(new URL("/api/events", baseUrl).toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.events) ? data.events : [];
}

/**
 * @description Set status text in UI.
 * @param {string} text
 * @returns {void}
 */
function setStatus(text) {
  document.getElementById("statusText").textContent = text;
}

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await getSettings();
  document.getElementById("serverBaseUrl").value = settings.serverBaseUrl;

  // Load events preview
  try {
    setStatus("Loading…");
    const events = await fetchEvents(settings.serverBaseUrl);
    renderEvents(events);
    setStatus("OK");
  } catch (e) {
    setStatus(`Server not reachable`);
  }

  document.getElementById("save").addEventListener("click", async () => {
    const val = document.getElementById("serverBaseUrl").value.trim();
    await chrome.storage.local.set({ serverBaseUrl: val });
    setStatus("Saved");
  });

  document.getElementById("pollNow").addEventListener("click", async () => {
    setStatus("Polling…");
    chrome.runtime.sendMessage({ type: "PROOFVIEW_POLL_NOW" }, async (resp) => {
      if (!resp || !resp.ok) {
        setStatus(`Poll failed: ${resp?.error || "unknown"}`);
        return;
      }
      // Reload events list
      const { serverBaseUrl } = await getSettings();
      const events = await fetchEvents(serverBaseUrl);
      renderEvents(events);
      setStatus("OK");
    });
  });

  document.getElementById("clearCursor").addEventListener("click", async () => {
    await chrome.storage.local.set({ lastSince: 0 });
    setStatus("Cursor reset");
  });
});
