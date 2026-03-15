/**
 * ProofView Gmail integration (Vanilla JS).
 *
 * Compose actions go through the extension service worker so tracked/sent
 * status stays consistent, and local Gmail message views can optionally
 * bridge opens back to a locally configured server during development.
 */

/** @type {WeakMap<HTMLElement, {
 *   messageId: string,
 *   tracked: boolean,
 *   sent: boolean,
 *   sending?: boolean
 * }>} */
const composeState = new WeakMap();
const activeComposeRoots = new Set();
const bridgedOpenUrls = new Set();
const cleanupMessageIds = new Set();
const LOCAL_OPEN_URL_RE = buildLocalOpenUrlPattern(
  globalThis.PROOFVIEW_EXTENSION_CONFIG?.serverBaseUrl || ""
);
const PROOFVIEW_SERVER_BASE_URL = normalizeBaseUrl(
  globalThis.PROOFVIEW_EXTENSION_CONFIG?.serverBaseUrl || ""
);
let trackedMessages = [];
let scanScheduled = false;

function generateMessageId() {
  const rand = Math.random().toString(16).slice(2, 8);
  return `pv_${Date.now()}_${rand}`;
}

function normalizeBaseUrl(baseUrl) {
  return typeof baseUrl === "string" && baseUrl.trim()
    ? baseUrl.trim().replace(/\/+$/, "")
    : "";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildLocalOpenUrlPattern(baseUrl) {
  try {
    const normalized = normalizeBaseUrl(baseUrl);
    if (!normalized) return null;

    const parsed = new URL(normalized);
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname)) {
      return null;
    }

    return new RegExp(`^${escapeRegExp(normalized)}\\/t\\/o\\/.+\\.png(?:\\?.*)?$`, "i");
  } catch {
    return null;
  }
}

function sendExtensionMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }

      resolve(response);
    });
  });
}

function decodeBase64UrlJson(value) {
  try {
    const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function parseProofViewUrl(rawUrl, kind) {
  try {
    const parsed = new URL(rawUrl || "", window.location.href);
    if (!PROOFVIEW_SERVER_BASE_URL) {
      return null;
    }

    const base = new URL(PROOFVIEW_SERVER_BASE_URL);
    if (parsed.origin !== base.origin) {
      return null;
    }

    const prefix = `/t/${kind}/`;
    if (!parsed.pathname.startsWith(prefix)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function isProofViewOpenUrl(rawUrl) {
  const parsed = parseProofViewUrl(rawUrl, "o");
  return !!parsed && /\.png$/i.test(parsed.pathname);
}

function decodeTrackedLinkTarget(rawUrl) {
  const parsed = parseProofViewUrl(rawUrl, "l");
  if (!parsed) {
    return "";
  }

  const token = parsed.pathname.replace(/^\/t\/l\//, "");
  const payloadB64 = token.split(".")[0] || "";
  const payload = decodeBase64UrlJson(payloadB64);
  return typeof payload?.url === "string" ? payload.url : "";
}

async function deleteTrackedMessage(messageId) {
  if (!messageId || cleanupMessageIds.has(messageId)) {
    return;
  }

  cleanupMessageIds.add(messageId);

  try {
    const response = await sendExtensionMessage({
      type: "proofview:delete-message",
      messageId
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Delete tracked message failed");
    }
  } catch (err) {
    console.debug("ProofView unsent cleanup skipped:", err);
  } finally {
    cleanupMessageIds.delete(messageId);
  }
}

function normalizeText(value) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().toLowerCase()
    : "";
}

function getTrackedEntries(statusMap, messageMeta) {
  const ids = new Set([
    ...Object.keys(statusMap || {}),
    ...Object.keys(messageMeta || {})
  ]);

  return Array.from(ids)
    .map((messageId) => {
      const entry = messageMeta?.[messageId];
      const subject =
        typeof entry?.subject === "string" && entry.subject.trim()
          ? entry.subject.trim()
          : "No subject";
      const status =
        statusMap?.[messageId] ||
        (Array.isArray(entry?.openEvents) && entry.openEvents.length > 0
          ? "opened"
          : entry?.sentAt
            ? "sent"
            : "tracked");

      return {
        messageId,
        status,
        subject,
        subjectNormalized: normalizeText(subject),
        lastActivityAt:
          (Array.isArray(entry?.openEvents) && entry.openEvents[0]) ||
          entry?.sentAt ||
          entry?.trackedAt ||
          0
      };
    })
    .filter((entry) => entry.subjectNormalized && entry.subjectNormalized !== "no subject")
    .sort((a, b) => {
      if (b.lastActivityAt !== a.lastActivityAt) {
        return b.lastActivityAt - a.lastActivityAt;
      }

      if (b.subjectNormalized.length !== a.subjectNormalized.length) {
        return b.subjectNormalized.length - a.subjectNormalized.length;
      }

      return String(b.messageId).localeCompare(String(a.messageId));
    });
}

function loadTrackedMessages() {
  chrome.storage.local.get(["statusMap", "messageMeta"], (data) => {
    trackedMessages = getTrackedEntries(data?.statusMap, data?.messageMeta);
    scheduleScan();
  });
}

function findMessageListRows() {
  return Array.from(document.querySelectorAll('tr[role="row"]')).filter((row) => {
    return !!row.querySelector("td") && !row.closest('div[role="dialog"]');
  });
}

function getRowBadgeHost(row) {
  const subject = row.querySelector("span.bog");
  if (subject?.parentElement) {
    return subject.parentElement;
  }

  return (
    row.querySelector("td:nth-last-child(2) .y6") ||
    row.querySelector("td:nth-last-child(2)") ||
    null
  );
}

function findTrackedEntryForRow(row) {
  const rowText = normalizeText(row.innerText || row.textContent || "");
  if (!rowText || !rowText.includes("to:")) {
    return null;
  }

  for (const entry of trackedMessages) {
    if (rowText.includes(entry.subjectNormalized)) {
      return entry;
    }
  }

  return null;
}

async function openTrackedEntry(messageId) {
  const response = await sendExtensionMessage({
    type: "proofview:open-entry",
    messageId
  });

  if (response?.ok) {
    return response;
  }

  const focusUrl = chrome.runtime.getURL(
    `popup/popup.html?focus=${encodeURIComponent(messageId)}`
  );
  window.open(focusUrl, "_blank", "noopener");
  return response;
}

function upsertRowBadge(row, entry) {
  const existing = row.querySelector('button[data-proofview="row-badge"]');
  if (!entry) {
    if (existing) {
      existing.remove();
    }
    return;
  }

  const host = getRowBadgeHost(row);
  if (!host) {
    return;
  }

  const badge = existing || document.createElement("button");
  if (!existing) {
    const haltEvent = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    badge.type = "button";
    badge.setAttribute("data-proofview", "row-badge");
    badge.className = "proofview-row-badge";
    badge.addEventListener("mousedown", haltEvent);
    badge.addEventListener("mouseup", haltEvent);
    badge.addEventListener("pointerdown", haltEvent);
    badge.addEventListener("click", async (event) => {
      haltEvent(event);

      const messageId = badge.dataset.messageId || "";
      if (!messageId) {
        return;
      }

      try {
        badge.disabled = true;
        await openTrackedEntry(messageId);
      } catch (err) {
        console.error("ProofView row badge open failed:", err);
      } finally {
        badge.disabled = false;
      }
    });
  }

  badge.dataset.messageId = entry.messageId;
  badge.dataset.state = entry.status;
  badge.textContent = entry.status === "opened" ? "✓✓" : "✓";
  badge.title =
    entry.status === "opened"
      ? `${entry.subject} was opened`
      : `${entry.subject} is being tracked`;
  badge.setAttribute(
    "aria-label",
    entry.status === "opened"
      ? `Opened tracked email ${entry.subject}`
      : `Tracked email ${entry.subject}`
  );

  if (badge.parentElement !== host) {
    host.appendChild(badge);
  }
}

function findComposeRoots() {
  const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
  return dialogs.filter((d) => !!findMessageBody(d));
}

function findMessageBody(root) {
  return (
    root.querySelector('div[role="textbox"][contenteditable="true"]') ||
    root.querySelector('div[aria-label="Message Body"][contenteditable="true"]') ||
    null
  );
}

function collectLinks(body) {
  const anchors = Array.from(body.querySelectorAll("a[href]"));
  const urls = anchors
    .map((a) => a.getAttribute("href") || "")
    .filter((u) => /^https?:\/\//i.test(u));

  return Array.from(new Set(urls));
}

function findSubjectInput(root) {
  return (
    root.querySelector('input[name="subjectbox"]') ||
    root.querySelector('input[placeholder="Subject"]') ||
    root.querySelector('input[aria-label*="Subject"]') ||
    null
  );
}

function getDraftSubject(root) {
  const input = findSubjectInput(root);
  const value = input && typeof input.value === "string" ? input.value.trim() : "";
  return value || "No subject";
}

function injectPixel(body, openUrl) {
  const existing = body.querySelector('img[data-proofview="pixel"]');
  if (existing) {
    existing.src = openUrl;
    existing.alt = "ProofView logo";
    existing.title = "ProofView logo";
    existing.width = 38;
    existing.height = 38;
    existing.setAttribute(
      "style",
      "display:block;width:38px;height:38px;margin:12px 0 0 auto;border-radius:10px;object-fit:contain;"
    );
    return;
  }

  const img = document.createElement("img");
  img.setAttribute("data-proofview", "pixel");
  img.alt = "ProofView logo";
  img.title = "ProofView logo";
  img.className = "proofview-pixel";
  img.src = openUrl;
  img.width = 38;
  img.height = 38;
  img.setAttribute(
    "style",
    "display:block;width:38px;height:38px;margin:12px 0 0 auto;border-radius:10px;object-fit:contain;"
  );

  body.appendChild(img);
}

function rewriteLinks(body, linkMap) {
  let count = 0;
  const anchors = Array.from(body.querySelectorAll("a[href]"));

  for (const a of anchors) {
    const href = a.getAttribute("href") || "";
    const tracked = linkMap[href];
    if (tracked && tracked !== href) {
      if (!a.hasAttribute("data-proofview-original-href")) {
        a.setAttribute("data-proofview-original-href", href);
      }

      a.setAttribute("href", tracked);
      count += 1;
    }
  }

  return count;
}

function removeTrackedImages(body) {
  const trackedImages = Array.from(body.querySelectorAll("img")).filter((img) => {
    return (
      img.getAttribute("data-proofview") === "pixel" ||
      isProofViewOpenUrl(img.getAttribute("src")) ||
      isProofViewOpenUrl(img.getAttribute("data-canonical-src"))
    );
  });

  for (const img of trackedImages) {
    img.remove();
  }
}

function restoreTrackedLinks(body) {
  const anchors = Array.from(body.querySelectorAll("a[href]"));
  for (const anchor of anchors) {
    const href = anchor.getAttribute("href") || "";
    const originalUrl =
      anchor.getAttribute("data-proofview-original-href") ||
      decodeTrackedLinkTarget(href);

    if (originalUrl) {
      anchor.setAttribute("href", originalUrl);
    }

    anchor.removeAttribute("data-proofview-original-href");
  }
}

function cleanupStaleTrackedMarkup(root) {
  const body = findMessageBody(root);
  if (!body) {
    return;
  }

  removeTrackedImages(body);
  restoreTrackedLinks(body);
}

function createComposeControls(root) {
  const actions = document.createElement("div");
  actions.className = "proofview-compose-actions";
  actions.setAttribute("data-proofview", "compose-actions");
  actions.dataset.layout = "single";

  const trackBtn = document.createElement("button");
  trackBtn.type = "button";
  trackBtn.textContent = "Track Email";
  trackBtn.setAttribute("data-proofview", "track-btn");
  trackBtn.className = "proofview-track-btn";
  trackBtn.dataset.proofviewState = "idle";

  const untrackBtn = document.createElement("button");
  untrackBtn.type = "button";
  untrackBtn.textContent = "Untrack";
  untrackBtn.setAttribute("data-proofview", "untrack-btn");
  untrackBtn.className = "proofview-untrack-btn";
  untrackBtn.dataset.proofviewState = "idle";
  untrackBtn.hidden = true;

  const computed = window.getComputedStyle(root);
  if (computed.position === "static") {
    root.classList.add("proofview-compose-root");
  }

  actions.appendChild(trackBtn);
  actions.appendChild(untrackBtn);
  root.appendChild(actions);

  return { trackBtn, untrackBtn };
}

function setButtonState(btn, tracked, extra = "") {
  if (extra === "error") {
    btn.dataset.proofviewState = "error";
  } else if (extra === "working...") {
    btn.dataset.proofviewState = "working";
  } else if (tracked) {
    btn.dataset.proofviewState = "tracked";
  } else {
    btn.dataset.proofviewState = "idle";
  }

  if (tracked) {
    btn.textContent = extra ? `Tracked ✅ (${extra})` : "Tracked ✅";
  } else {
    btn.textContent = extra ? `Track Email (${extra})` : "Track Email";
  }
}

function setComposeActionState(trackBtn, untrackBtn, mode, label = "") {
  const nextMode = typeof mode === "string" ? mode : "idle";
  const actions = trackBtn.parentElement;
  const trackLabel =
    label ||
    (
      {
        idle: "Track Email",
        working: "Working...",
        tracked: "Tracked",
        sent: "Sent",
        error: "Try Again"
      }[nextMode] || "Track Email"
    );

  trackBtn.dataset.proofviewState = nextMode;
  untrackBtn.dataset.proofviewState = nextMode;
  trackBtn.textContent = trackLabel;
  untrackBtn.textContent = "Untrack";

  if (actions) {
    actions.dataset.layout = nextMode === "tracked" ? "split" : "single";
  }

  trackBtn.disabled =
    nextMode === "working" || nextMode === "tracked" || nextMode === "sent";
  untrackBtn.hidden = nextMode !== "tracked";
  untrackBtn.disabled = nextMode === "working";
}

function resetComposeTracking(root) {
  composeState.set(root, {
    messageId: generateMessageId(),
    tracked: false,
    sent: false,
    sending: false
  });
}

async function untrackDraft(root) {
  const state = composeState.get(root);
  if (!state?.tracked || state.sent) {
    return;
  }

  cleanupStaleTrackedMarkup(root);
  await deleteTrackedMessage(state.messageId);
  resetComposeTracking(root);
}

async function mintBatch(payload) {
  const response = await sendExtensionMessage({
    type: "proofview:mint-batch",
    payload
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Mint failed");
  }

  return response.data;
}

async function markSent(messageId, subject) {
  const response = await sendExtensionMessage({
    type: "proofview:mark-sent",
    messageId,
    subject
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Mark sent failed");
  }

  return response.data;
}

function getOpenUrlFromImage(img) {
  const candidates = [
    img.getAttribute("data-canonical-src") || "",
    img.getAttribute("src") || ""
  ];

  return candidates.find((value) => LOCAL_OPEN_URL_RE?.test(value)) || "";
}

function bridgeVisibleTrackedOpens() {
  const images = Array.from(
    document.querySelectorAll('img[data-canonical-src], img[src*="/t/o/"]')
  );

  for (const img of images) {
    if (img.getAttribute("data-proofview") === "pixel") continue;
    if (img.closest('div[role="dialog"]')) continue;

    const openUrl = getOpenUrlFromImage(img);
    if (!openUrl || bridgedOpenUrls.has(openUrl)) continue;

    bridgedOpenUrls.add(openUrl);

    fetch(openUrl, { cache: "no-store" })
      .then(() => sendExtensionMessage({ type: "proofview:poll-now" }))
      .catch((err) => {
        console.debug("ProofView local-open bridge skipped:", err);
        bridgedOpenUrls.delete(openUrl);
      });
  }
}

function updateVisibleRowBadges() {
  const rows = findMessageListRows();
  for (const row of rows) {
    upsertRowBadge(row, findTrackedEntryForRow(row));
  }
}

function findSendButton(root) {
  return (
    root.querySelector('div[role="button"][data-tooltip^="Send"]') ||
    root.querySelector('div[role="button"][aria-label^="Send"]') ||
    null
  );
}

function attachSendInterceptor(root, trackBtn, untrackBtn) {
  if (root.dataset.proofviewSendHook === "1") return;
  root.dataset.proofviewSendHook = "1";

  root.addEventListener(
    "click",
    async (ev) => {
      const sendBtn = findSendButton(root);
      if (!sendBtn) return;
      if (!(ev.target instanceof Node)) return;
      if (!sendBtn.contains(ev.target)) return;

      const state = composeState.get(root);
      if (!state?.tracked || state.sent) return;

      try {
        state.sending = true;
        composeState.set(root, state);
        await markSent(state.messageId, getDraftSubject(root));

        state.sending = false;
        state.sent = true;
        composeState.set(root, state);

        setComposeActionState(trackBtn, untrackBtn, "sent");
      } catch (err) {
        state.sending = false;
        composeState.set(root, state);
        const msg = err instanceof Error ? err.message : String(err);
        alert(`ProofView send-state error: ${msg}`);
      }
    },
    true
  );
}

function handleRemovedComposeRoot(root) {
  activeComposeRoots.delete(root);

  const state = composeState.get(root);
  composeState.delete(root);

  if (!state?.tracked || state.sent || state.sending) {
    return;
  }

  deleteTrackedMessage(state.messageId);
}

function reconcileComposeRoots(currentRoots) {
  const currentSet = new Set(currentRoots);

  for (const root of Array.from(activeComposeRoots)) {
    if (!currentSet.has(root)) {
      handleRemovedComposeRoot(root);
    }
  }
}

function ensureComposeIntegration(root) {
  if (root.querySelector('[data-proofview="compose-actions"]')) return;

  const body = findMessageBody(root);
  if (!body) return;

  if (!composeState.has(root)) {
    cleanupStaleTrackedMarkup(root);
    resetComposeTracking(root);
    activeComposeRoots.add(root);
  }

  const { trackBtn, untrackBtn } = createComposeControls(root);
  setComposeActionState(trackBtn, untrackBtn, "idle");
  attachSendInterceptor(root, trackBtn, untrackBtn);

  trackBtn.addEventListener("click", async () => {
    try {
      setComposeActionState(trackBtn, untrackBtn, "working", "Tracking...");

      const state = composeState.get(root);
      const bodyEl = findMessageBody(root);

      if (!state || !bodyEl) {
        setComposeActionState(trackBtn, untrackBtn, "error", "No message body");
        return;
      }

      if (state.tracked) {
        return;
      }

      const links = collectLinks(bodyEl);

      const minted = await mintBatch({
        messageId: state.messageId,
        links,
        subject: getDraftSubject(root)
      });

      if (!root.isConnected) {
        deleteTrackedMessage(state.messageId);
        return;
      }

      injectPixel(bodyEl, minted.openUrl);
      rewriteLinks(bodyEl, minted.linkMap || {});

      state.tracked = true;
      composeState.set(root, state);

      setComposeActionState(trackBtn, untrackBtn, "tracked");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`ProofView error: ${msg}`);
      setComposeActionState(trackBtn, untrackBtn, "error");
    }
  });

  untrackBtn.addEventListener("click", async () => {
    try {
      setComposeActionState(trackBtn, untrackBtn, "working", "Untracking...");
      await untrackDraft(root);
      setComposeActionState(trackBtn, untrackBtn, "idle");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`ProofView untrack error: ${msg}`);

      const state = composeState.get(root);
      setComposeActionState(
        trackBtn,
        untrackBtn,
        state?.tracked ? "tracked" : "error"
      );
    }
  });
}

function scan() {
  const roots = findComposeRoots();
  reconcileComposeRoots(roots);
  for (const r of roots) ensureComposeIntegration(r);

  bridgeVisibleTrackedOpens();
  updateVisibleRowBadges();
}

function scheduleScan() {
  if (scanScheduled) {
    return;
  }

  scanScheduled = true;
  window.requestAnimationFrame(() => {
    scanScheduled = false;
    scan();
  });
}

function startObserver() {
  const obs = new MutationObserver(() => scheduleScan());
  obs.observe(document.documentElement, { childList: true, subtree: true });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (!changes.statusMap && !changes.messageMeta) {
      return;
    }

    loadTrackedMessages();
  });

  loadTrackedMessages();
  scheduleScan();
}

startObserver();
