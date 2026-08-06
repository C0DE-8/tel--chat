const crypto = require("crypto");
const express = require("express");
const db = require("../db");
const { logEvent } = require("../logger");
const { rows, publicConversation, publicMessage } = require("../utils/result");

function createConversationRouter({ bot }) {
  const router = express.Router();

  router.post("/", async (req, res) => {
    const ownerKey = String(req.body.ownerKey || "").trim();
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
    await logEvent(
      "conversation_opened",
      { visitorName, visitorEmail },
      { ownerId: owners[0].id, conversationId: conversations[0].id }
    );

    res.status(201).json({ conversation: publicConversation(conversations[0]) });
  });

  router.get("/:id/messages", async (req, res) => {
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

  router.post("/:id/messages", async (req, res) => {
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
    await logEvent(
      "visitor_message",
      { visitorName: conversations[0].visitor_name },
      { ownerId: conversations[0].owner_id, conversationId }
    );
    await bot.notifyOwner(conversations[0].owner_id, conversationId, conversations[0].visitor_name, body);

    res.status(201).json({ ok: true });
  });

  router.post("/:id/close", async (req, res) => {
    const conversationId = Number(req.params.id);
    const visitorToken = String(req.body.token || "");

    await db.execute(
      "UPDATE chat_conversations SET status = 'closed', closed_at = CURRENT_TIMESTAMP WHERE id = ? AND visitor_token = ?",
      [conversationId, visitorToken]
    );
    await logEvent("conversation_closed_by_visitor", {}, { conversationId });

    res.json({ ok: true });
  });

  return router;
}

module.exports = { createConversationRouter };
