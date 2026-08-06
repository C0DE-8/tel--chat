const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("./db");
const { logEvent } = require("./logger");

const sessions = new Map();

function rows(result) {
  return Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
}

function mainKeyboard() {
  return {
    keyboard: [
      [{ text: "Login" }, { text: "Register" }],
      [{ text: "My links" }, { text: "Reply" }, { text: "Close chat" }]
    ],
    resize_keyboard: true
  };
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

  async function sendMessage(chatId, text, extra = {}) {
    return telegram("sendMessage", {
      chat_id: chatId,
      text,
      reply_markup: mainKeyboard(),
      ...extra
    });
  }

  function setStep(chatId, name, data = {}) {
    sessions.set(String(chatId), { name, data });
  }

  function clearStep(chatId) {
    sessions.delete(String(chatId));
  }

  async function ownerByTelegram(chatId) {
    return rows(await db.query("SELECT * FROM chat_owners WHERE telegram_chat_id = ? LIMIT 1", [String(chatId)]))[0];
  }

  async function ownerByUsername(username) {
    return rows(await db.query("SELECT * FROM chat_owners WHERE username = ? LIMIT 1", [username]))[0];
  }

  async function showLinks(chatId) {
    const owner = await ownerByTelegram(chatId);
    if (!owner) {
      await sendMessage(chatId, "Please click Login first.");
      return;
    }

    const base = publicBaseUrl.replace(/\/+$/, "");
    await sendMessage(
      chatId,
      [
        "Your chat links:",
        `Widget URL: ${base}/widget/${owner.public_key}.js`,
        `Demo chat URL: ${base}/?owner=${owner.public_key}`,
        "Embed:",
        `<script src=\"${base}/widget/${owner.public_key}.js\" defer></script>`
      ].join("\n")
    );
  }

  async function loginOwner(chatId, username, password) {
    const owner = await ownerByUsername(username);
    if (!owner || !(await bcrypt.compare(password, owner.password_hash))) {
      await sendMessage(chatId, "Wrong username or password.");
      return;
    }

    await db.execute("UPDATE chat_owners SET telegram_chat_id = ? WHERE id = ?", [String(chatId), owner.id]);
    await logEvent("owner_logged_in", { username }, { ownerId: owner.id });
    await sendMessage(chatId, `Logged in as ${username}.`);
    await showLinks(chatId);
  }

  async function registerOwner(chatId, username, password) {
    const existing = await ownerByUsername(username);
    if (existing && existing.telegram_chat_id && existing.telegram_chat_id !== String(chatId)) {
      await sendMessage(chatId, "That username is already connected to another Telegram account.");
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const publicKey = existing ? existing.public_key : crypto.randomBytes(16).toString("hex");

    if (existing) {
      await db.execute(
        "UPDATE chat_owners SET password_hash = ?, telegram_chat_id = ? WHERE id = ?",
        [passwordHash, String(chatId), existing.id]
      );
      await logEvent("owner_registered_existing", { username }, { ownerId: existing.id });
    } else {
      await db.execute(
        "INSERT INTO chat_owners (username, password_hash, public_key, telegram_chat_id) VALUES (?, ?, ?, ?)",
        [username, passwordHash, publicKey, String(chatId)]
      );
      const owner = await ownerByUsername(username);
      await logEvent("owner_registered", { username }, { ownerId: owner && owner.id });
    }

    await sendMessage(chatId, `Account ready for ${username}.`);
    await showLinks(chatId);
  }

  async function replyToConversation(chatId, conversationId, body) {
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
    await logEvent("owner_reply", { telegramChatId: String(chatId) }, { conversationId });
    await sendMessage(chatId, `Sent to conversation #${conversationId}.`);
  }

  async function closeConversation(chatId, conversationId) {
    await db.execute(
      `UPDATE chat_conversations c
       JOIN chat_owners o ON o.id = c.owner_id
       SET c.status = 'closed', c.closed_at = CURRENT_TIMESTAMP
       WHERE c.id = ? AND o.telegram_chat_id = ?`,
      [conversationId, String(chatId)]
    );
    await logEvent("conversation_closed_by_owner", { telegramChatId: String(chatId) }, { conversationId });
    await sendMessage(chatId, `Conversation #${conversationId} closed.`);
  }

  async function handleStep(chatId, text, session) {
    if (session.name === "login") {
      const [username, ...passwordParts] = text.split(/\s+/);
      await loginOwner(chatId, username, passwordParts.join(" "));
      clearStep(chatId);
      return true;
    }

    if (session.name === "register") {
      const [username, ...passwordParts] = text.split(/\s+/);
      await registerOwner(chatId, username, passwordParts.join(" "));
      clearStep(chatId);
      return true;
    }

    if (session.name === "reply_id") {
      const conversationId = Number(text);
      if (!conversationId) {
        await sendMessage(chatId, "Send only the conversation number.");
        return true;
      }
      setStep(chatId, "reply_body", { conversationId });
      await sendMessage(chatId, "Now send the reply message.");
      return true;
    }

    if (session.name === "reply_body") {
      await replyToConversation(chatId, session.data.conversationId, text);
      clearStep(chatId);
      return true;
    }

    if (session.name === "close") {
      const conversationId = Number(text);
      if (!conversationId) {
        await sendMessage(chatId, "Send only the conversation number.");
        return true;
      }
      await closeConversation(chatId, conversationId);
      clearStep(chatId);
      return true;
    }

    return false;
  }

  async function handleMessage(message) {
    const chatId = message.chat.id;
    const text = (message.text || "").trim();
    const session = sessions.get(String(chatId));

    try {
      if (session && await handleStep(chatId, text, session)) return;

      if (text === "/start" || text === "Menu") {
        await sendMessage(chatId, "Choose an action.");
      } else if (text === "Login") {
        setStep(chatId, "login");
        await sendMessage(chatId, "Send username and password, example: habibi 123456");
      } else if (text === "Register") {
        setStep(chatId, "register");
        await sendMessage(chatId, "Send new username and password, example: myname 123456");
      } else if (text === "My links") {
        await showLinks(chatId);
      } else if (text === "Reply") {
        setStep(chatId, "reply_id");
        await sendMessage(chatId, "Send the conversation number.");
      } else if (text === "Close chat") {
        setStep(chatId, "close");
        await sendMessage(chatId, "Send the conversation number to close.");
      } else {
        await sendMessage(chatId, "Use the buttons below.");
      }
    } catch (error) {
      clearStep(chatId);
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
    if (!owners.length || !owners[0].telegram_chat_id) return;

    await sendMessage(
      owners[0].telegram_chat_id,
      [
        `New message in #${conversationId}`,
        `From: ${visitorName}`,
        body,
        "",
        "Click Reply, then send this conversation number:",
        String(conversationId)
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
