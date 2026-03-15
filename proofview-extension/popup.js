function getStatusMeta(status) {
  if (status === "opened") {
    return { ticks: "✓✓", label: "opened" };
  }

  if (status === "sent") {
    return { ticks: "✓", label: "sent" };
  }

  return { ticks: "✓", label: "tracked" };
}

function renderMessages(statusMap) {
  const container = document.getElementById("messages");
  if (!container) return;

  container.innerHTML = "";

  const entries = Object.entries(statusMap || {}).sort((a, b) => {
    return String(b[0]).localeCompare(String(a[0]));
  });

  if (entries.length === 0) {
    container.textContent = "No tracked emails yet.";
    return;
  }

  for (const [messageId, status] of entries) {
    const row = document.createElement("div");
    row.className = "msg";

    const meta = getStatusMeta(status);
    row.textContent = `${meta.ticks} ${messageId} (${meta.label})`;

    container.appendChild(row);
  }
}

function loadMessages() {
  chrome.storage.local.get(["statusMap"], (data) => {
    const statusMap = data && data.statusMap ? data.statusMap : {};
    renderMessages(statusMap);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadMessages();

  setInterval(() => {
    loadMessages();
  }, 2000);
});
