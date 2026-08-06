require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const db = require("./db");
const { initializeSchema } = require("./schema");
const { createBot } = require("./bot");

const app = express();
const port = Number(process.env.PORT || 3000);
const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
const bot = createBot({
  token: process.env.TELEGRAM_BOT_TOKEN,
  publicBaseUrl
});

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(`${__dirname}/../../`));

function rows(result) {
  return Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
}

function publicConversation(conversation) {
  return {
    id: conversation.id,
    status: conversation.status,
    visitorName: conversation.visitor_name,
    visitorEmail: conversation.visitor_email,
    visitorToken: conversation.visitor_token,
    createdAt: conversation.created_at,
    closedAt: conversation.closed_at
  };
}

function publicMessage(message) {
  return {
    id: message.id,
    conversationId: message.conversation_id,
    sender: message.sender,
    body: message.body,
    createdAt: message.created_at
  };
}

app.get("/health", async (_req, res) => {
  try {
    const gateway = await db.status();
    res.json({ ok: true, gateway });
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message });
  }
});

app.get("/api/config", (req, res) => {
  res.json({ ownerKey: req.query.owner || process.env.DEFAULT_OWNER_KEY || "" });
});

app.post("/api/conversations", async (req, res) => {
  const ownerKey = String(req.body.ownerKey || process.env.DEFAULT_OWNER_KEY || "").trim();
  const visitorName = String(req.body.name || "").trim();
  const visitorEmail = String(req.body.email || "").trim().toLowerCase();

  if (!ownerKey || !visitorName || !visitorEmail) {
    res.status(400).json({ error: "ownerKey, name, and email are required" });
    return;
  }

  const owners = rows(await db.query("SELECT id FROM chat_owners WHERE public_key = ? LIMIT 1", [ownerKey]));
  if (!owners.length) {
    res.status(404).json({ error: "Chat owner not found" });
    return;
  }

  const visitorToken = crypto.randomBytes(24).toString("hex");
  await db.execute(
    "INSERT INTO chat_conversations (owner_id, visitor_name, visitor_email, visitor_token) VALUES (?, ?, ?, ?)",
    [owners[0].id, visitorName, visitorEmail, visitorToken]
  );

  const conversations = rows(await db.query(
    "SELECT * FROM chat_conversations WHERE visitor_token = ? LIMIT 1",
    [visitorToken]
  ));
  await db.execute(
    "INSERT INTO chat_messages (conversation_id, sender, body) VALUES (?, 'system', ?)",
    [conversations[0].id, `${visitorName} opened the chat.`]
  );

  res.status(201).json({ conversation: publicConversation(conversations[0]) });
});

app.get("/api/conversations/:id/messages", async (req, res) => {
  const conversationId = Number(req.params.id);
  const visitorToken = String(req.query.token || "");

  const conversations = rows(await db.query(
    "SELECT id, status FROM chat_conversations WHERE id = ? AND visitor_token = ? LIMIT 1",
    [conversationId, visitorToken]
  ));

  if (!conversations.length) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const messages = rows(await db.query(
    "SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC",
    [conversationId]
  ));

  res.json({ status: conversations[0].status, messages: messages.map(publicMessage) });
});

app.post("/api/conversations/:id/messages", async (req, res) => {
  const conversationId = Number(req.params.id);
  const visitorToken = String(req.body.token || "");
  const body = String(req.body.body || "").trim();

  if (!body) {
    res.status(400).json({ error: "Message body is required" });
    return;
  }

  const conversations = rows(await db.query(
    "SELECT id, owner_id, visitor_name, status FROM chat_conversations WHERE id = ? AND visitor_token = ? LIMIT 1",
    [conversationId, visitorToken]
  ));

  if (!conversations.length) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  if (conversations[0].status === "closed") {
    res.status(409).json({ error: "Conversation is closed" });
    return;
  }

  await db.execute(
    "INSERT INTO chat_messages (conversation_id, sender, body) VALUES (?, 'visitor', ?)",
    [conversationId, body]
  );
  await bot.notifyOwner(conversations[0].owner_id, conversationId, conversations[0].visitor_name, body);

  res.status(201).json({ ok: true });
});

app.post("/api/conversations/:id/close", async (req, res) => {
  const conversationId = Number(req.params.id);
  const visitorToken = String(req.body.token || "");

  await db.execute(
    "UPDATE chat_conversations SET status = 'closed', closed_at = CURRENT_TIMESTAMP WHERE id = ? AND visitor_token = ?",
    [conversationId, visitorToken]
  );

  res.json({ ok: true });
});

app.get("/widget/:ownerKey.js", (req, res) => {
  const ownerKey = JSON.stringify(req.params.ownerKey);
  const baseUrl = JSON.stringify(publicBaseUrl.replace(/\/+$/, ""));
  res.type("application/javascript").send(`
(() => {
  const ownerKey = ${ownerKey};
  const baseUrl = ${baseUrl};
  if (document.querySelector("[data-telegram-chat-widget]")) return;
  const script = document.createElement("script");
  script.dataset.telegramChatWidget = "true";
  script.src = baseUrl + "/frontend-widget.js";
  script.defer = true;
  script.onload = () => window.TelegramChatWidget && window.TelegramChatWidget.mount({ ownerKey, baseUrl });
  document.head.appendChild(script);
})();
`);
});

initializeSchema()
  .then(() => {
    app.listen(port, () => {
      console.log(`Chat backend listening on http://localhost:${port}`);
    });
    bot.start();
  })
  .catch((error) => {
    console.error("Failed to start chat backend:", error);
    process.exit(1);
  });
