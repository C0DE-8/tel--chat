const crypto = require("crypto");
const db = require("./db");

function publicConversation(row) {
  return {
    id: row.id,
    visitorName: row.visitor_name,
    visitorEmail: row.visitor_email,
    chatReason: row.chat_reason,
    visitorToken: row.visitor_token,
    status: row.status,
    rating: row.rating,
    ratedAt: row.rated_at,
    createdAt: row.created_at,
    closedAt: row.closed_at,
  };
}

function publicMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    sender: row.sender,
    body: row.body,
    createdAt: row.created_at,
  };
}

function publicChatSummary(row) {
  return {
    id: row.id,
    publicKey: row.public_key,
    visitorName: row.visitor_name,
    visitorEmail: row.visitor_email,
    chatReason: row.chat_reason,
    lastMessage: row.last_message,
    lastMessageAt: row.last_message_at,
    messageCount: row.message_count,
    createdAt: row.created_at,
  };
}

async function getOwnerByPublicKey(publicKey) {
  const rows = await db.query("SELECT * FROM chat_owners WHERE public_key = ? ORDER BY id ASC LIMIT 1", [publicKey]);
  return rows[0] || null;
}

async function getOwnersByPublicKey(publicKey) {
  return db.query("SELECT * FROM chat_owners WHERE public_key = ? ORDER BY id ASC", [publicKey]);
}

async function getConversationById(conversationId) {
  const rows = await db.query(
    `SELECT c.*, o.username AS owner_username, o.public_key, o.telegram_chat_id
     FROM chat_conversations c
     JOIN chat_owners o ON o.id = c.owner_id
     WHERE c.id = ?
     LIMIT 1`,
    [conversationId]
  );
  return rows[0] || null;
}

async function getConversationByToken(visitorToken) {
  const rows = await db.query(
    `SELECT c.*, o.username AS owner_username, o.public_key, o.telegram_chat_id
     FROM chat_conversations c
     JOIN chat_owners o ON o.id = c.owner_id
     WHERE c.visitor_token = ?
     LIMIT 1`,
    [visitorToken]
  );
  return rows[0] || null;
}

async function canManageConversation(telegramUserId, conversationId) {
  const chatId = String(telegramUserId);
  const rows = await db.query(
    `SELECT c.id
     FROM chat_conversations c
     JOIN chat_owners o ON o.id = c.owner_id
     LEFT JOIN chat_owners mine ON mine.telegram_chat_id = ?
     JOIN bot_users u ON u.telegram_user_id = ?
     WHERE c.id = ?
       AND (u.role = 'owner' OR mine.public_key = o.public_key)
     LIMIT 1`,
    [chatId, chatId, conversationId]
  );

  return Boolean(rows[0]);
}

async function findLatestOpenConversation({ publicKey, visitorName, visitorEmail }) {
  const name = String(visitorName || "").trim().toLowerCase();
  const email = String(visitorEmail || "").trim().toLowerCase();
  const matches = [];
  const params = [publicKey];

  if (email) {
    matches.push("LOWER(visitor_email) = ?");
    params.push(email);
  }

  if (name) {
    matches.push("LOWER(visitor_name) = ?");
    params.push(name);
  }

  if (!matches.length) return null;

  const rows = await db.query(
    `SELECT c.*, o.username AS owner_username, o.public_key, o.telegram_chat_id
     FROM chat_conversations c
     JOIN chat_owners o ON o.id = c.owner_id
     WHERE o.public_key = ?
       AND c.status = 'open'
       AND (${matches.join(" OR ")})
     ORDER BY c.created_at DESC, c.id DESC
     LIMIT 1`,
    params
  );

  return rows[0] || null;
}

async function listOpenConversationsForUser(telegramUserId) {
  const chatId = String(telegramUserId);
  const rows = await db.query(
    `SELECT
       c.id,
       o.public_key,
       c.visitor_name,
       c.visitor_email,
       c.chat_reason,
       c.created_at,
       COUNT(m.id) AS message_count,
       (
         SELECT cm.body
         FROM chat_messages cm
         WHERE cm.conversation_id = c.id
         ORDER BY cm.created_at DESC, cm.id DESC
         LIMIT 1
       ) AS last_message,
       (
         SELECT cm.created_at
         FROM chat_messages cm
         WHERE cm.conversation_id = c.id
         ORDER BY cm.created_at DESC, cm.id DESC
         LIMIT 1
       ) AS last_message_at
     FROM chat_conversations c
     JOIN chat_owners o ON o.id = c.owner_id
     JOIN bot_users u ON u.telegram_user_id = ?
     LEFT JOIN chat_owners mine ON mine.telegram_chat_id = ?
     LEFT JOIN chat_messages m ON m.conversation_id = c.id
     WHERE c.status = 'open'
       AND (u.role = 'owner' OR mine.public_key = o.public_key)
     GROUP BY c.id, o.public_key, c.visitor_name, c.visitor_email, c.chat_reason, c.created_at
     ORDER BY COALESCE(last_message_at, c.created_at) DESC, c.id DESC
     LIMIT 20`,
    [chatId, chatId]
  );

  return rows.map(publicChatSummary);
}

async function createConversation({ publicKey, visitorName, visitorEmail, chatReason }) {
  const owner = await getOwnerByPublicKey(publicKey);
  if (!owner) {
    const error = new Error("Invalid widget key");
    error.status = 404;
    throw error;
  }

  const existingConversation = await findLatestOpenConversation({
    publicKey,
    visitorName,
    visitorEmail,
  });
  if (existingConversation) {
    return {
      conversation: publicConversation(existingConversation),
      reused: true,
    };
  }

  const token = crypto.randomUUID();
  const result = await db.execute(
    `INSERT INTO chat_conversations (owner_id, visitor_name, visitor_email, chat_reason, visitor_token)
     VALUES (?, ?, ?, ?, ?)`,
    [owner.id, visitorName || "Visitor", visitorEmail || "", chatReason || null, token]
  );

  const conversation = await getConversationById(result.insertId);
  return {
    conversation: publicConversation(conversation),
    reused: false,
  };
}

async function listMessages(visitorToken) {
  const conversation = await getConversationByToken(visitorToken);
  if (!conversation) {
    const error = new Error("Conversation not found");
    error.status = 404;
    throw error;
  }

  const rows = await db.query(
    `SELECT id, conversation_id, sender, body, created_at
     FROM chat_messages
     WHERE conversation_id = ?
     ORDER BY created_at ASC, id ASC`,
    [conversation.id]
  );

  return {
    conversation: publicConversation(conversation),
    messages: rows.map(publicMessage),
  };
}

async function addMessage(conversationId, sender, body) {
  const result = await db.execute(
    "INSERT INTO chat_messages (conversation_id, sender, body) VALUES (?, ?, ?)",
    [conversationId, sender, body]
  );

  const rows = await db.query("SELECT * FROM chat_messages WHERE id = ? LIMIT 1", [result.insertId]);
  return publicMessage(rows[0]);
}

async function addVisitorMessage(visitorToken, body) {
  const conversation = await getConversationByToken(visitorToken);
  if (!conversation) {
    const error = new Error("Conversation not found");
    error.status = 404;
    throw error;
  }
  if (conversation.status === "closed") {
    const error = new Error("Conversation is closed");
    error.status = 409;
    throw error;
  }

  const message = await addMessage(conversation.id, "visitor", body);
  await notifyOwner(conversation, message);
  return message;
}

async function addOwnerReply(conversationId, body) {
  const conversation = await getConversationById(conversationId);
  if (!conversation) {
    return { ok: false, message: "Chat not found." };
  }
  if (conversation.status === "closed") {
    return { ok: false, message: "This chat is already closed." };
  }

  await addMessage(conversation.id, "owner", body);
  return { ok: true, message: `Reply sent to chat #${conversation.id}.` };
}

async function closeConversation(conversationId) {
  const conversation = await getConversationById(conversationId);
  if (!conversation) {
    return { ok: false, message: "Chat not found." };
  }

  await db.execute("UPDATE chat_conversations SET status = 'closed', closed_at = NOW() WHERE id = ?", [
    conversation.id,
  ]);
  await addMessage(conversation.id, "system", "Chat ended.");

  return { ok: true, message: `Chat #${conversation.id} ended.` };
}

async function clearConversation(visitorToken) {
  const conversation = await getConversationByToken(visitorToken);
  if (!conversation) {
    return { ok: true, message: "Chat already cleared." };
  }

  await db.execute("DELETE FROM chat_logs WHERE conversation_id = ?", [conversation.id]);
  await db.execute("DELETE FROM chat_messages WHERE conversation_id = ?", [conversation.id]);
  await db.execute("DELETE FROM chat_conversations WHERE id = ?", [conversation.id]);

  return { ok: true, message: "Chat cleared." };
}

async function rateConversation(visitorToken, rating) {
  const conversation = await getConversationByToken(visitorToken);
  if (!conversation) {
    const error = new Error("Conversation not found");
    error.status = 404;
    throw error;
  }

  const normalizedRating = Number(rating);
  if (!Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
    const error = new Error("Rating must be between 1 and 5");
    error.status = 400;
    throw error;
  }

  if (conversation.status !== "closed") {
    const error = new Error("Only ended chats can be rated");
    error.status = 409;
    throw error;
  }

  await db.execute("UPDATE chat_conversations SET rating = ?, rated_at = NOW() WHERE id = ?", [
    normalizedRating,
    conversation.id,
  ]);

  const updated = await getConversationById(conversation.id);
  return publicConversation(updated);
}

async function notifyOwner(conversation, message) {
  const owners = await getOwnersByPublicKey(conversation.public_key);
  const linkedOwners = owners.filter((owner) => owner.telegram_chat_id);

  if (!linkedOwners.length) {
    await db.execute(
      "INSERT INTO chat_logs (level, event, owner_id, conversation_id, meta) VALUES (?, ?, ?, ?, ?)",
      [
        "warn",
        "telegram_owner_not_linked",
        conversation.owner_id,
        conversation.id,
        JSON.stringify({ messageId: message.id }),
      ]
    );
    return;
  }

  const bot = require("./bot");
  const reasonLine = conversation.chat_reason ? `\nReason: ${conversation.chat_reason}` : "";
  const bodyLine = conversation.chat_reason === message.body ? "" : `\n\n${message.body}`;

  for (const owner of linkedOwners) {
    await bot.sendMessage(
      owner.telegram_chat_id,
      `Chat #${conversation.id}\n${conversation.visitor_name}${reasonLine}${bodyLine}`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Reply", callback_data: `chat:reply:${conversation.id}` },
              { text: "Close", callback_data: `chat:close:${conversation.id}` },
            ],
          ],
        },
      }
    );
  }
}

module.exports = {
  addOwnerReply,
  addVisitorMessage,
  canManageConversation,
  clearConversation,
  closeConversation,
  createConversation,
  getConversationById,
  listOpenConversationsForUser,
  listMessages,
  rateConversation,
};
