/**
 * ProofView Gmail integration (Vanilla JS).
 *
 * Compose actions go through the extension service worker so tracked/sent
 * status stays consistent, and local Gmail message views can bridge opens
 * back to a localhost server for development testing.
 */

const LOCAL_OPEN_URL_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/t\/o\/.+\.png(?:\?.*)?$/i;

/** @type {WeakMap<HTMLElement, {
 *   messageId: string,
 *   tracked: boolean,
 *   sent: boolean
 * }>} */
const composeState = new WeakMap();
const bridgedOpenUrls = new Set();

function generateMessageId() {
  const rand = Math.random().toString(16).slice(2, 8);
  return `pv_${Date.now()}_${rand}`;
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

async function markSent(messageId) {
  const response = await sendExtensionMessage({
    type: "proofview:mark-sent",
    messageId
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

  return candidates.find((value) => LOCAL_OPEN_URL_RE.test(value)) || "";
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
        await markSent(state.messageId);

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
        links
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
}

function startObserver() {
  const obs = new MutationObserver(() => scan());
  obs.observe(document.documentElement, { childList: true, subtree: true });
  scan();
}

startObserver();
