const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("./db");

function rows(result) {
  return Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
}

function createBot({ token, publicBaseUrl }) {
  if (!token) {
    return {
      start() {},
      notifyOwner() {}
    };
  }

  let offset = 0;
  let stopped = false;
  const apiBase = `https://api.telegram.org/bot${token}`;

  async function telegram(method, payload) {
    const response = await fetch(`${apiBase}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.description || `Telegram ${method} failed`);
    return data.result;
  }

  async function sendMessage(chatId, text) {
    return telegram("sendMessage", { chat_id: chatId, text });
  }

  async function upsertOwner(chatId, username, password) {
    const passwordHash = await bcrypt.hash(password, 10);
    const publicKey = crypto.randomBytes(16).toString("hex");

    const existing = rows(await db.query(
      "SELECT id, public_key FROM chat_owners WHERE username = ? OR telegram_chat_id = ? LIMIT 1",
      [username, String(chatId)]
    ));

    if (existing.length) {
      await db.execute(
        "UPDATE chat_owners SET username = ?, password_hash = ?, telegram_chat_id = ? WHERE id = ?",
        [username, passwordHash, String(chatId), existing[0].id]
      );
      return existing[0].public_key;
    }

    await db.execute(
      "INSERT INTO chat_owners (username, password_hash, public_key, telegram_chat_id) VALUES (?, ?, ?, ?)",
      [username, passwordHash, publicKey, String(chatId)]
    );
    return publicKey;
  }

  async function handleRegister(chatId, parts) {
    if (parts.length < 3) {
      await sendMessage(chatId, "Use: /register username password");
      return;
    }

    const publicKey = await upsertOwner(chatId, parts[1], parts.slice(2).join(" "));
    const base = publicBaseUrl.replace(/\/+$/, "");
    await sendMessage(
      chatId,
      [
        "Account ready.",
        `Widget URL: ${base}/widget/${publicKey}.js`,
        `Demo chat URL: ${base}/?owner=${publicKey}`,
        "Embed:",
        `<script src=\"${base}/widget/${publicKey}.js\" defer></script>`
      ].join("\n")
    );
  }

  async function handleReply(chatId, parts) {
    if (parts.length < 3) {
      await sendMessage(chatId, "Use: /reply conversationId message");
      return;
    }

    const conversationId = Number(parts[1]);
    const body = parts.slice(2).join(" ").trim();
    const conversations = rows(await db.query(
      `SELECT c.id
       FROM chat_conversations c
       JOIN chat_owners o ON o.id = c.owner_id
       WHERE c.id = ? AND o.telegram_chat_id = ? AND c.status = 'open'
       LIMIT 1`,
      [conversationId, String(chatId)]
    ));

    if (!conversations.length) {
      await sendMessage(chatId, "Open conversation not found.");
      return;
    }

    await db.execute(
      "INSERT INTO chat_messages (conversation_id, sender, body) VALUES (?, 'owner', ?)",
      [conversationId, body]
    );
    await sendMessage(chatId, `Sent to conversation #${conversationId}.`);
  }

  async function handleClose(chatId, parts) {
    const conversationId = Number(parts[1]);
    if (!conversationId) {
      await sendMessage(chatId, "Use: /close conversationId");
      return;
    }

    await db.execute(
      `UPDATE chat_conversations c
       JOIN chat_owners o ON o.id = c.owner_id
       SET c.status = 'closed', c.closed_at = CURRENT_TIMESTAMP
       WHERE c.id = ? AND o.telegram_chat_id = ?`,
      [conversationId, String(chatId)]
    );
    await sendMessage(chatId, `Conversation #${conversationId} closed.`);
  }

  async function handleMessage(message) {
    const chatId = message.chat.id;
    const text = (message.text || "").trim();
    const parts = text.split(/\s+/);

    try {
      if (parts[0] === "/start") {
        await sendMessage(chatId, "Use /register username password to create your chat account.");
      } else if (parts[0] === "/register" || (parts.length >= 2 && !parts[0].startsWith("/"))) {
        await handleRegister(chatId, parts[0] === "/register" ? parts : ["/register", ...parts]);
      } else if (parts[0] === "/reply") {
        await handleReply(chatId, parts);
      } else if (parts[0] === "/close") {
        await handleClose(chatId, parts);
      } else {
        await sendMessage(chatId, "Commands: /register username password, /reply conversationId message, /close conversationId");
      }
    } catch (error) {
      await sendMessage(chatId, `Error: ${error.message}`);
    }
  }

  async function poll() {
    while (!stopped) {
      try {
        const updates = await telegram("getUpdates", {
          offset,
          timeout: 25,
          allowed_updates: ["message"]
        });
        for (const update of updates) {
          offset = update.update_id + 1;
          if (update.message) await handleMessage(update.message);
        }
      } catch (error) {
        console.error("Telegram polling error:", error.message);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }

  async function notifyOwner(ownerId, conversationId, visitorName, body) {
    const owners = rows(await db.query("SELECT telegram_chat_id FROM chat_owners WHERE id = ? LIMIT 1", [ownerId]));
    if (!owners.length) return;

    await sendMessage(
      owners[0].telegram_chat_id,
      [
        `New message in #${conversationId}`,
        `From: ${visitorName}`,
        body,
        "",
        `Reply: /reply ${conversationId} your message`,
        `Close: /close ${conversationId}`
      ].join("\n")
    );
  }

  return {
    start() {
      if (process.env.TELEGRAM_POLLING !== "false") poll();
    },
    notifyOwner
  };
}

module.exports = { createBot };
