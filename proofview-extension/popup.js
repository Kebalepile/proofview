function renderMessages(statusMap) {
  const container = document.getElementById("messages");
  if (!container) return;

  container.innerHTML = "";

  const entries = Object.entries(statusMap || {});

  if (entries.length === 0) {
    container.textContent = "No tracked emails yet.";
    return;
  }

  for (const [messageId, status] of entries) {
    const row = document.createElement("div");
    row.className = "msg";

    const ticks = status === "opened" ? "✓✓" : "✓";
    row.textContent = `${ticks} ${messageId}`;

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