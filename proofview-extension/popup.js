let currentEntries = [];
let pendingDelete = null;
let isMenuOpen = false;
let lastEntriesSignature = "";

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

function getStatusMeta(status) {
  if (status === "opened") {
    return { ticks: "✓✓", label: "opened" };
  }

  if (status === "sent") {
    return { ticks: "✓", label: "sent" };
  }

  return { ticks: "✓", label: "tracked" };
}

function normalizeMessageMeta(entry) {
  return {
    subject:
      typeof entry?.subject === "string" && entry.subject.trim()
        ? entry.subject.trim()
        : "No subject",
    trackedAt: typeof entry?.trackedAt === "number" ? entry.trackedAt : null,
    sentAt: typeof entry?.sentAt === "number" ? entry.sentAt : null,
    openEvents: Array.isArray(entry?.openEvents)
      ? entry.openEvents.filter((value) => typeof value === "number").sort((a, b) => b - a)
      : []
  };
}

function formatTimestamp(timestamp) {
  if (typeof timestamp !== "number") {
    return "Unknown time";
  }

  return new Date(timestamp).toLocaleString();
}

function getFirstOpenAt(openEvents) {
  if (!Array.isArray(openEvents) || openEvents.length === 0) {
    return null;
  }

  return openEvents[openEvents.length - 1];
}

function getLatestOpenAt(openEvents) {
  if (!Array.isArray(openEvents) || openEvents.length === 0) {
    return null;
  }

  return openEvents[0];
}

function getEntries(statusMap, messageMeta) {
  const ids = new Set([
    ...Object.keys(statusMap || {}),
    ...Object.keys(messageMeta || {})
  ]);

  return Array.from(ids)
    .map((messageId) => {
      const meta = normalizeMessageMeta(messageMeta?.[messageId]);
      const status =
        statusMap?.[messageId] ||
        (meta.openEvents.length > 0 ? "opened" : meta.sentAt ? "sent" : "tracked");

      return {
        messageId,
        status,
        meta,
        lastActivityAt:
          meta.openEvents[0] ||
          meta.sentAt ||
          meta.trackedAt ||
          0
      };
    })
    .sort((a, b) => {
      if (b.lastActivityAt !== a.lastActivityAt) {
        return b.lastActivityAt - a.lastActivityAt;
      }

      return String(b.messageId).localeCompare(String(a.messageId));
    });
}

function buildEntriesSignature(entries) {
  return JSON.stringify(
    entries.map((entry) => ({
      messageId: entry.messageId,
      status: entry.status,
      subject: entry.meta.subject,
      trackedAt: entry.meta.trackedAt,
      sentAt: entry.meta.sentAt,
      openEvents: entry.meta.openEvents
    }))
  );
}

function setStatusNote(text = "") {
  const node = document.getElementById("statusNote");
  if (node) {
    node.textContent = text;
  }
}

function syncMenuState() {
  const menuBtn = document.getElementById("menuBtn");
  const menuPanel = document.getElementById("menuPanel");
  if (!menuBtn || !menuPanel) return;

  menuBtn.setAttribute("aria-expanded", String(isMenuOpen));
  menuPanel.dataset.open = String(isMenuOpen);
}

function openMenu() {
  isMenuOpen = true;
  syncMenuState();
}

function closeMenu() {
  isMenuOpen = false;
  syncMenuState();
}

function toggleMenu() {
  isMenuOpen = !isMenuOpen;
  syncMenuState();
}

function closePopup() {
  closeMenu();
  window.close();
}

function openConfirmDialog(options) {
  closeMenu();
  pendingDelete = options;

  const backdrop = document.getElementById("confirmBackdrop");
  const title = document.getElementById("confirmTitle");
  const copy = document.getElementById("confirmCopy");

  if (!backdrop || !title || !copy) return;

  if (options.mode === "all") {
    title.textContent = "Delete all tracked emails?";
    copy.textContent =
      "This will remove every tracked email from the extension and the server store.";
  } else {
    title.textContent = "Delete tracked email?";
    copy.textContent = `Delete "${options.subject}" from tracked emails?`;
  }

  backdrop.hidden = false;
}

function closeConfirmDialog() {
  pendingDelete = null;
  const backdrop = document.getElementById("confirmBackdrop");
  if (backdrop) {
    backdrop.hidden = true;
  }
}

async function confirmDelete() {
  if (!pendingDelete) return;

  try {
    setStatusNote("Updating tracked emails...");

    if (pendingDelete.mode === "all") {
      const response = await sendExtensionMessage({ type: "proofview:delete-all" });
      if (!response?.ok) {
        throw new Error(response?.error || "Delete all failed");
      }
    } else {
      const response = await sendExtensionMessage({
        type: "proofview:delete-message",
        messageId: pendingDelete.messageId
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Delete tracked message failed");
      }
    }

    closeConfirmDialog();
    setStatusNote("");
    loadMessages();
  } catch (err) {
    setStatusNote(err instanceof Error ? err.message : String(err));
  }
}

function renderMessages(entries) {
  const container = document.getElementById("messages");
  const deleteAllBtn = document.getElementById("deleteAllBtn");
  if (!container) return;

  container.innerHTML = "";
  if (deleteAllBtn) {
    deleteAllBtn.disabled = entries.length === 0;
  }

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No tracked emails yet.";
    container.appendChild(empty);
    return;
  }

  for (const entry of entries) {
    const row = document.createElement("section");
    row.className = "msg";

    const head = document.createElement("div");
    head.className = "card-head";

    const subject = document.createElement("div");
    subject.className = "subject";
    subject.textContent = entry.meta.subject;
    head.appendChild(subject);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.type = "button";
    deleteBtn.textContent = "🗑";
    deleteBtn.title = "Delete tracked email";
    deleteBtn.setAttribute("aria-label", `Delete tracked email ${entry.meta.subject}`);
    deleteBtn.addEventListener("click", () => {
      openConfirmDialog({
        mode: "single",
        messageId: entry.messageId,
        subject: entry.meta.subject
      });
    });
    head.appendChild(deleteBtn);

    row.appendChild(head);

    const status = document.createElement("div");
    status.className = "status";
    const statusMeta = getStatusMeta(entry.status);
    status.textContent = `${statusMeta.ticks} ${statusMeta.label}`;
    row.appendChild(status);

    const count = document.createElement("div");
    count.className = "detail";
    count.textContent = `Open count: ${entry.meta.openEvents.length}`;
    row.appendChild(count);

    if (entry.meta.openEvents.length > 0) {
      const firstOpen = document.createElement("div");
      firstOpen.className = "detail";
      firstOpen.textContent = `First open: ${formatTimestamp(getFirstOpenAt(entry.meta.openEvents))}`;
      row.appendChild(firstOpen);

      const latestOpen = document.createElement("div");
      latestOpen.className = "detail";
      latestOpen.textContent = `Latest open: ${formatTimestamp(getLatestOpenAt(entry.meta.openEvents))}`;
      row.appendChild(latestOpen);
    }

    const messageId = document.createElement("div");
    messageId.className = "message-id";
    messageId.textContent = `ID: ${entry.messageId}`;
    row.appendChild(messageId);

    container.appendChild(row);
  }
}

function loadMessages(options = {}) {
  chrome.storage.local.get(["statusMap", "messageMeta"], (data) => {
    const statusMap = data && data.statusMap ? data.statusMap : {};
    const messageMeta = data && data.messageMeta ? data.messageMeta : {};
    const nextEntries = getEntries(statusMap, messageMeta);
    const nextSignature = buildEntriesSignature(nextEntries);
    currentEntries = nextEntries;

    if (!options.force && nextSignature === lastEntriesSignature) {
      return;
    }

    lastEntriesSignature = nextSignature;
    renderMessages(currentEntries);
  });
}

function handleStorageChange(changes, areaName) {
  if (areaName !== "local") {
    return;
  }

  if (!changes.statusMap && !changes.messageMeta) {
    return;
  }

  loadMessages();
}

document.addEventListener("DOMContentLoaded", () => {
  const closePopupBtn = document.getElementById("closePopupBtn");
  const deleteAllBtn = document.getElementById("deleteAllBtn");
  const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
  const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
  const backdrop = document.getElementById("confirmBackdrop");
  const menuBtn = document.getElementById("menuBtn");
  const menuPanel = document.getElementById("menuPanel");

  if (closePopupBtn) {
    closePopupBtn.addEventListener("click", () => {
      closePopup();
    });
  }

  if (deleteAllBtn) {
    deleteAllBtn.addEventListener("click", () => {
      if (currentEntries.length === 0) return;
      openConfirmDialog({ mode: "all" });
    });
  }

  if (cancelDeleteBtn) {
    cancelDeleteBtn.addEventListener("click", () => {
      closeConfirmDialog();
    });
  }

  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener("click", () => {
      confirmDelete();
    });
  }

  if (backdrop) {
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        closeConfirmDialog();
      }
    });
  }

  if (menuBtn) {
    menuBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleMenu();
    });
  }

  if (menuPanel) {
    menuPanel.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  }

  document.addEventListener("click", () => {
    closeMenu();
  });

  syncMenuState();

  chrome.storage.onChanged.addListener(handleStorageChange);
  window.addEventListener("unload", () => {
    chrome.storage.onChanged.removeListener(handleStorageChange);
  });

  loadMessages({ force: true });
});
