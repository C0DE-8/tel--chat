const bcrypt = require("bcryptjs");
const db = require("./db");

function telegramProfile(message) {
  const from = message?.from || {};

  return {
    telegramUserId: from.id || message?.chat?.id,
    firstName: from.first_name || null,
    lastName: from.last_name || null,
    telegramUsername: from.username || null,
  };
}

async function setPendingAction(telegramUserId, action, conversationId = null) {
  await db.execute(
    `INSERT INTO bot_user_sessions (telegram_user_id, action, conversation_id)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE action = VALUES(action), conversation_id = VALUES(conversation_id)`,
    [telegramUserId, action, conversationId]
  );
}

async function getPendingSession(telegramUserId) {
  const rows = await db.query("SELECT action, conversation_id FROM bot_user_sessions WHERE telegram_user_id = ? LIMIT 1", [
    telegramUserId,
  ]);

  return rows[0] || null;
}

async function getPendingAction(telegramUserId) {
  const session = await getPendingSession(telegramUserId);
  return session?.action || null;
}

async function clearPendingAction(telegramUserId) {
  await db.execute("DELETE FROM bot_user_sessions WHERE telegram_user_id = ?", [telegramUserId]);
}

async function getUiMessageIds(telegramUserId) {
  const rows = await db.query("SELECT message_ids FROM bot_ui_messages WHERE telegram_user_id = ? LIMIT 1", [
    telegramUserId,
  ]);
  if (!rows[0]?.message_ids) return [];

  try {
    const ids = JSON.parse(rows[0].message_ids);
    return Array.isArray(ids) ? ids.filter((id) => Number.isInteger(Number(id))).map(Number) : [];
  } catch {
    return [];
  }
}

async function setUiMessageIds(telegramUserId, messageIds) {
  await db.execute(
    `INSERT INTO bot_ui_messages (telegram_user_id, message_ids)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE message_ids = VALUES(message_ids)`,
    [telegramUserId, JSON.stringify(messageIds)]
  );
}

async function requireOwner(telegramUserId) {
  const owner = await findByTelegramUserId(telegramUserId);
  return Boolean(owner && owner.role === "owner");
}

async function findByUsername(username) {
  const rows = await db.query("SELECT * FROM bot_users WHERE username = ? LIMIT 1", [username]);
  return rows[0] || null;
}

async function findByTelegramUserId(telegramUserId) {
  const rows = await db.query("SELECT * FROM bot_users WHERE telegram_user_id = ? LIMIT 1", [telegramUserId]);
  return rows[0] || null;
}

async function findById(userId) {
  const rows = await db.query("SELECT * FROM bot_users WHERE id = ? LIMIT 1", [userId]);
  return rows[0] || null;
}

async function getCurrentUser(telegramUserId) {
  return findByTelegramUserId(telegramUserId);
}

function publicKeyForUsername(username) {
  return normalizePublicKey(username);
}

function normalizePublicKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function ensureChatOwner({ username, passwordHash, role, telegramUserId }) {
  const publicKey = publicKeyForUsername(username);
  const ownerRole = role === "owner" ? "admin" : "user";
  const chatId = String(telegramUserId);

  await db.execute("UPDATE chat_owners SET telegram_chat_id = NULL WHERE telegram_chat_id = ? AND username <> ?", [
    chatId,
    username,
  ]);

  await db.execute(
    `INSERT INTO chat_owners (username, password_hash, public_key, role, telegram_chat_id)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       role = VALUES(role),
       telegram_chat_id = VALUES(telegram_chat_id)`,
    [username, passwordHash, publicKey, ownerRole, chatId]
  );

  return publicKey;
}

async function setUserPublicKey({ adminTelegramUserId, userId, publicKey }) {
  if (!(await requireOwner(adminTelegramUserId))) {
    return { ok: false, message: "Only the owner can manage users." };
  }

  const user = await findById(userId);
  if (!user) {
    return { ok: false, message: "User not found." };
  }

  const normalizedKey = normalizePublicKey(publicKey);
  if (!normalizedKey) {
    return { ok: false, message: "Send a valid widget key." };
  }

  await db.execute(
    `INSERT INTO chat_owners (username, password_hash, public_key, role, telegram_chat_id)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       public_key = VALUES(public_key),
       role = VALUES(role)`,
    [
      user.username,
      user.password_hash,
      normalizedKey,
      user.role === "owner" ? "admin" : "user",
      user.telegram_user_id ? String(user.telegram_user_id) : null,
    ]
  );

  return { ok: true, message: `${user.username} widget key is now: ${normalizedKey}` };
}

async function addMissingPublicKey({ adminTelegramUserId, userId }) {
  if (!(await requireOwner(adminTelegramUserId))) {
    return { ok: false, message: "Only the owner can manage users." };
  }

  const user = await findById(userId);
  if (!user) {
    return { ok: false, message: "User not found." };
  }

  const rows = await db.query("SELECT public_key FROM chat_owners WHERE username = ? LIMIT 1", [user.username]);
  if (rows[0]?.public_key) {
    return { ok: true, message: `${user.username} already has widget key: ${rows[0].public_key}` };
  }

  return setUserPublicKey({
    adminTelegramUserId,
    userId,
    publicKey: publicKeyForUsername(user.username),
  });
}

async function deleteUser({ adminTelegramUserId, userId }) {
  if (!(await requireOwner(adminTelegramUserId))) {
    return { ok: false, message: "Only the owner can delete users." };
  }

  const user = await findById(userId);
  if (!user) {
    return { ok: false, message: "User not found." };
  }
  if (user.role === "owner") {
    return { ok: false, message: "The owner account cannot be deleted from Telegram." };
  }

  const ownerRows = await db.query("SELECT id FROM chat_owners WHERE username = ?", [user.username]);
  for (const owner of ownerRows) {
    const conversations = await db.query("SELECT id FROM chat_conversations WHERE owner_id = ?", [owner.id]);
    for (const conversation of conversations) {
      await db.execute("DELETE FROM chat_logs WHERE conversation_id = ?", [conversation.id]);
      await db.execute("DELETE FROM chat_messages WHERE conversation_id = ?", [conversation.id]);
    }
    await db.execute("DELETE FROM chat_conversations WHERE owner_id = ?", [owner.id]);
  }

  await db.execute("DELETE FROM bot_user_sessions WHERE telegram_user_id = ?", [user.telegram_user_id]);
  await db.execute("DELETE FROM chat_owners WHERE username = ?", [user.username]);
  await db.execute("DELETE FROM bot_users WHERE id = ?", [user.id]);

  return { ok: true, message: `${user.username} deleted.` };
}

async function registerUser({ username, password, profile }) {
  const linkedUser = await findByTelegramUserId(profile.telegramUserId);
  if (linkedUser) {
    return { ok: false, message: `You are already registered as ${linkedUser.username}.` };
  }

  const existing = await findByUsername(username);
  if (existing) {
    return { ok: false, message: "That username is already registered. Tap Login instead." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await db.execute(
    `INSERT INTO bot_users
      (telegram_user_id, username, password_hash, role, first_name, last_name, telegram_username, last_seen_at)
     VALUES (?, ?, ?, 'user', ?, ?, ?, NOW())`,
    [
      profile.telegramUserId,
      username,
      passwordHash,
      profile.firstName,
      profile.lastName,
      profile.telegramUsername,
    ]
  );

  const publicKey = await ensureChatOwner({
    username,
    passwordHash,
    role: "user",
    telegramUserId: profile.telegramUserId,
  });

  return { ok: true, publicKey, message: `Registered and logged in as ${username}. Widget key: ${publicKey}` };
}

async function loginUser({ username, password, profile }) {
  const user = await findByUsername(username);
  if (!user) {
    return { ok: false, message: "User not found. Tap Register first." };
  }

  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) {
    return { ok: false, message: "Wrong password." };
  }

  await db.execute(
    `UPDATE bot_users
     SET telegram_user_id = ?, first_name = ?, last_name = ?, telegram_username = ?, last_seen_at = NOW()
     WHERE id = ?`,
    [profile.telegramUserId, profile.firstName, profile.lastName, profile.telegramUsername, user.id]
  );

  const publicKey = await ensureChatOwner({
    username,
    passwordHash: user.password_hash,
    role: user.role,
    telegramUserId: profile.telegramUserId,
  });

  return {
    ok: true,
    user: { ...user, telegram_user_id: profile.telegramUserId },
    publicKey,
    message: `Logged in as ${username}. Widget key: ${publicKey}`,
  };
}

async function logoutUser(telegramUserId) {
  const user = await findByTelegramUserId(telegramUserId);
  if (!user) {
    return { ok: false, message: "You are not logged in." };
  }

  await db.execute("UPDATE bot_users SET telegram_user_id = NULL WHERE id = ?", [user.id]);
  await db.execute("UPDATE chat_owners SET telegram_chat_id = NULL WHERE username = ?", [user.username]);
  await clearPendingAction(telegramUserId);

  return { ok: true, message: "Logged out." };
}

async function listUsersForOwner(telegramUserId) {
  const owner = await findByTelegramUserId(telegramUserId);
  if (!owner || owner.role !== "owner") {
    return { ok: false, message: "Only the owner can see users. Login with the owner account first." };
  }

  const users = await db.query(
    `SELECT
       u.id,
       u.username,
       u.role,
       u.telegram_username,
       u.first_name,
       u.last_name,
       u.created_at,
       u.last_seen_at,
       o.public_key,
       o.telegram_chat_id
     FROM bot_users u
     LEFT JOIN chat_owners o ON o.username = u.username
     ORDER BY u.created_at DESC
     LIMIT 50`
  );

  return { ok: true, users };
}

module.exports = {
  clearPendingAction,
  addMissingPublicKey,
  deleteUser,
  ensureChatOwner,
  getCurrentUser,
  getPendingAction,
  getPendingSession,
  getUiMessageIds,
  listUsersForOwner,
  loginUser,
  logoutUser,
  setUserPublicKey,
  registerUser,
  setPendingAction,
  setUiMessageIds,
  telegramProfile,
};
