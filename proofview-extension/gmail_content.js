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
 *   sent: boolean
 * }>} */
const composeState = new WeakMap();
const bridgedOpenUrls = new Set();
const ROW_BADGE_STYLE_ID = "proofview-row-badge-style";
const LOCAL_OPEN_URL_RE = buildLocalOpenUrlPattern(
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

function ensureRowBadgeStyles() {
  if (document.getElementById(ROW_BADGE_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = ROW_BADGE_STYLE_ID;
  style.textContent = `
    .proofview-row-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 26px;
      height: 20px;
      margin-left: 8px;
      padding: 0 7px;
      border: 1px solid rgba(122, 135, 153, 0.34);
      border-radius: 999px;
      background: rgba(235, 239, 244, 0.88);
      color: #59677a;
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
      cursor: pointer;
      transition:
        transform 160ms ease,
        box-shadow 160ms ease,
        border-color 160ms ease,
        background 160ms ease,
        color 160ms ease;
    }

    .proofview-row-badge:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 18px rgba(17, 24, 39, 0.12);
    }

    .proofview-row-badge[data-state="opened"] {
      border-color: rgba(37, 99, 235, 0.28);
      background: rgba(219, 234, 254, 0.96);
      color: #1d4ed8;
      box-shadow: 0 8px 16px rgba(37, 99, 235, 0.14);
    }
  `;

  document.head.appendChild(style);
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
    `popup.html?focus=${encodeURIComponent(messageId)}`
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
    return;
  }

  const img = document.createElement("img");
  img.setAttribute("data-proofview", "pixel");
  img.alt = "ProofView tracking pixel";
  img.title = "ProofView tracking pixel";
  img.src = openUrl;
  img.width = 12;
  img.height = 12;
  img.style.cssText = [
    "width:12px",
    "height:12px",
    "display:inline-block",
    "vertical-align:middle",
    "margin-left:6px",
    "border:1px solid #111",
    "border-radius:2px"
  ].join(";");

  body.appendChild(img);
}

function rewriteLinks(body, linkMap) {
  let count = 0;
  const anchors = Array.from(body.querySelectorAll("a[href]"));

  for (const a of anchors) {
    const href = a.getAttribute("href") || "";
    const tracked = linkMap[href];
    if (tracked && tracked !== href) {
      a.setAttribute("href", tracked);
      count += 1;
    }
  }

  return count;
}

function createTrackButton(root) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Track Email";
  btn.setAttribute("data-proofview", "track-btn");

  btn.style.cssText = [
    "position:absolute",
    "top:10px",
    "right:14px",
    "z-index:999999",
    "padding:6px 10px",
    "border:1px solid #ddd",
    "border-radius:999px",
    "background:#fff",
    "font-size:12px",
    "cursor:pointer"
  ].join(";");

  const computed = window.getComputedStyle(root);
  if (computed.position === "static") {
    root.style.position = "relative";
  }

  root.appendChild(btn);
  return btn;
}

function setButtonState(btn, tracked, extra = "") {
  if (tracked) {
    btn.textContent = extra ? `Tracked ✅ (${extra})` : "Tracked ✅";
    btn.style.opacity = "0.85";
  } else {
    btn.textContent = extra ? `Track Email (${extra})` : "Track Email";
    btn.style.opacity = "1";
  }
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
  ensureRowBadgeStyles();

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

function attachSendInterceptor(root, trackBtn) {
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
        await markSent(state.messageId, getDraftSubject(root));

        state.sent = true;
        composeState.set(root, state);

        setButtonState(trackBtn, true, "sent");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        alert(`ProofView send-state error: ${msg}`);
      }
    },
    true
  );
}

function ensureComposeIntegration(root) {
  if (root.querySelector('button[data-proofview="track-btn"]')) return;

  const body = findMessageBody(root);
  if (!body) return;

  if (!composeState.has(root)) {
    composeState.set(root, {
      messageId: generateMessageId(),
      tracked: false,
      sent: false
    });
  }

  const btn = createTrackButton(root);
  setButtonState(btn, false);
  attachSendInterceptor(root, btn);

  btn.addEventListener("click", async () => {
    try {
      btn.disabled = true;
      setButtonState(btn, false, "working...");

      const state = composeState.get(root);
      const bodyEl = findMessageBody(root);

      if (!state || !bodyEl) {
        setButtonState(btn, false, "no body");
        return;
      }

      if (state.tracked) {
        setButtonState(btn, true, state.sent ? "sent" : "ready");
        return;
      }

      const links = collectLinks(bodyEl);

      const minted = await mintBatch({
        messageId: state.messageId,
        links,
        subject: getDraftSubject(root)
      });

      injectPixel(bodyEl, minted.openUrl);
      const rewritten = rewriteLinks(bodyEl, minted.linkMap || {});

      state.tracked = true;
      composeState.set(root, state);

      setButtonState(btn, true, `${rewritten} links`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`ProofView error: ${msg}`);
      setButtonState(btn, false, "error");
    } finally {
      btn.disabled = false;
    }
  });
}

function scan() {
  const roots = findComposeRoots();
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
