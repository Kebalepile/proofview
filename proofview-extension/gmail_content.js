/**
 * ProofView Gmail Compose Integration (Vanilla JS)
 *
 * @description
 * Injects a "Track with ProofView" button into Gmail compose windows.
 * On click:
 *  1) Creates/uses a messageId for that compose
 *  2) Collects links inside the email body
 *  3) Calls server POST /api/mint-batch
 *  4) Injects tracking pixel <img> into the body
 *  5) Rewrites links to ProofView tracked redirect URLs
 *
 * @constraints
 * - Gmail DOM changes often. This code uses robust selectors and MutationObserver.
 * - Per-recipient identity requires "send individually" or recipient confirmation later.
 */

/** @type {string} */
const DEFAULT_SERVER_BASE_URL = "http://localhost:3000";

/** @type {WeakMap<HTMLElement, { messageId: string, tracked: boolean }>} */
const composeState = new WeakMap();

/**
 * @description Get ProofView server URL from extension storage.
 * @returns {Promise<string>}
 */
async function getServerBaseUrl() {
  return DEFAULT_SERVER_BASE_URL;
}

/**
 * @description Generate a lightweight messageId (client-side).
 * @returns {string}
 */
function generateMessageId() {
  // Good enough for prototype. Server still signs tokens.
  // Example: pv_1700000000000_ab12cd
  const rand = Math.random().toString(16).slice(2, 8);
  return `pv_${Date.now()}_${rand}`;
}

/**
 * @description Find all Gmail compose dialog roots.
 * @returns {HTMLElement[]}
 */
function findComposeRoots() {
  // Gmail uses dialogs for compose/reply/forward.
  // We look for a dialog that contains a contenteditable message body.
  const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
  return dialogs.filter(d => !!findMessageBody(d));
}

/**
 * @description Find the message body element inside a compose root.
 * @param {HTMLElement} root
 * @returns {HTMLElement|null}
 */
function findMessageBody(root) {
  // Most stable selector: a contenteditable div with role=textbox.
  // Gmail commonly sets aria-label="Message Body".
  const body =
    root.querySelector('div[role="textbox"][contenteditable="true"]') ||
    root.querySelector('div[aria-label="Message Body"][contenteditable="true"]') ||
    null;

  return /** @type {HTMLElement|null} */ (body);
}

/**
 * @description Collect unique http(s) links from the compose body.
 * @param {HTMLElement} body
 * @returns {string[]}
 */
function collectLinks(body) {
  const anchors = Array.from(body.querySelectorAll("a[href]"));
  const urls = anchors
    .map(a => a.getAttribute("href") || "")
    .filter(u => /^https?:\/\//i.test(u));

  // unique
  return Array.from(new Set(urls));
}

/**
 * @description Inject a hidden tracking pixel into the compose body (idempotent).
 * @param {HTMLElement} body
 * @param {string} openUrl
 * @returns {void}
 */
function injectPixel(body, openUrl) {
  // prevent duplicates
  const existing = body.querySelector('img[data-proofview="pixel"]');
  if (existing) return;

  const img = document.createElement("img");
  img.setAttribute("data-proofview", "pixel");
  img.alt = "";
  img.src = openUrl;
  img.width = 1;
  img.height = 1;
  img.style.cssText = "width:1px;height:1px;display:none;";

  // Gmail body is contenteditable; append at end.
  body.appendChild(img);
}

/**
 * @description Rewrite links in the compose body using server-provided mapping.
 * @param {HTMLElement} body
 * @param {Record<string, string>} linkMap
 * @returns {number} countRewritten
 */
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

/**
 * @description Create the ProofView button UI for a compose root.
 * @param {HTMLElement} root
 * @returns {HTMLButtonElement}
 */
function createTrackButton(root) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Track Email";
  btn.setAttribute("data-proofview", "track-btn");

  // Small overlay button inside compose (less fragile than Gmail toolbar hooks)
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

  // Ensure root is positioned
  const computed = window.getComputedStyle(root);
  if (computed.position === "static") {
    root.style.position = "relative";
  }

  root.appendChild(btn);
  return btn;
}

/**
 * @description Set button label to show tracked state.
 * @param {HTMLButtonElement} btn
 * @param {boolean} tracked
 * @param {string} [extra]
 * @returns {void}
 */
function setButtonState(btn, tracked, extra = "") {
  if (tracked) {
    btn.textContent = extra ? `Tracked ✅ (${extra})` : "Tracked ✅";
    btn.style.opacity = "0.85";
  } else {
    btn.textContent = extra ? `Track Email (${extra})` : "Track Email";
    btn.style.opacity = "1";
  }
}

/**
 * @description Call server to mint pixel + link tokens in one request.
 * @param {string} baseUrl
 * @param {{messageId: string, mode: "pixel"|"logo"|"signature", links: string[]}} payload
 * @returns {Promise<{messageId: string, openUrl: string, linkMap: Record<string,string>}>}
 */
async function mintBatch(baseUrl, payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "proofview:mint-batch",
        baseUrl,
        payload
      },
      (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }

        if (!response) {
          reject(new Error("No response from extension service worker"));
          return;
        }

        if (!response.ok) {
          reject(new Error(response.error || "Mint request failed"));
          return;
        }

        resolve({
          messageId: response.data.messageId,
          openUrl: response.data.openUrl,
          linkMap: response.data.linkMap || {}
        });
      }
    );
  });
}

/**
 * @description Ensure ProofView integration exists for a compose root.
 * @param {HTMLElement} root
 * @returns {void}
 */
function ensureComposeIntegration(root) {
  // If button already injected, do nothing
  if (root.querySelector('button[data-proofview="track-btn"]')) return;

  const body = findMessageBody(root);
  if (!body) return;

  // Initialize compose state
  if (!composeState.has(root)) {
    composeState.set(root, { messageId: generateMessageId(), tracked: false });
  }

  const btn = createTrackButton(root);
  setButtonState(btn, false);

  btn.addEventListener("click", async () => {
    try {
      btn.disabled = true;
      setButtonState(btn, false, "working…");

      const state = composeState.get(root);
      const bodyEl = findMessageBody(root);
      if (!state || !bodyEl) {
        setButtonState(btn, false, "no body");
        return;
      }

      const baseUrl = await getServerBaseUrl();
      const links = collectLinks(bodyEl);

      // MVP: aggregate tracking per compose/messageId
      const minted = await mintBatch(baseUrl, {
        messageId: state.messageId,
        mode: "pixel",      // later: user can choose pixel/logo/signature
        links
      });

      injectPixel(bodyEl, minted.openUrl);
      const rewritten = rewriteLinks(bodyEl, minted.linkMap);

      state.tracked = true;
      composeState.set(root, state);

      setButtonState(btn, true, `${rewritten} links`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("ProofView Gmail integration error:", err);
      alert(`ProofView error: ${msg}`);
      setButtonState(btn, false, "error");
    } finally {
      btn.disabled = false;
    }
  });
}

/**
 * @description Scan and attach ProofView to all current compose windows.
 * @returns {void}
 */
function scan() {
  const roots = findComposeRoots();
  for (const r of roots) ensureComposeIntegration(r);
}

/**
 * @description Start a MutationObserver to detect new compose windows.
 * @returns {void}
 */
function startObserver() {
  const obs = new MutationObserver(() => scan());
  obs.observe(document.documentElement, { childList: true, subtree: true });
  scan();
}

// Boot
startObserver();
