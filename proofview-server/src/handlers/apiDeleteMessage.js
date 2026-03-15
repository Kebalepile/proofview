const { sendJson, sendText } = require("../lib/http");
const store = require("../lib/store");

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 50_000) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function apiDeleteMessage(req, res) {
  try {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const messageId = typeof body.messageId === "string" ? body.messageId : "";

    if (!messageId) {
      return sendText(res, 400, "messageId is required");
    }

    store.deleteMessage(messageId);

    return sendJson(res, 200, {
      ok: true,
      messageId
    });
  } catch (err) {
    return sendText(res, 400, `Bad request: ${String(err.message || err)}`);
  }
}

module.exports = { apiDeleteMessage };
