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

async function findByUsername(username) {
  const rows = await db.query("SELECT * FROM bot_users WHERE username = ? LIMIT 1", [username]);
  return rows[0] || null;
}

async function findByTelegramUserId(telegramUserId) {
  const rows = await db.query("SELECT * FROM bot_users WHERE telegram_user_id = ? LIMIT 1", [telegramUserId]);
  return rows[0] || null;
}

async function getCurrentUser(telegramUserId) {
  return findByTelegramUserId(telegramUserId);
}

function publicKeyForUsername(username) {
  return String(username || "")
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
  ensureChatOwner,
  getCurrentUser,
  getPendingAction,
  getPendingSession,
  listUsersForOwner,
  loginUser,
  logoutUser,
  registerUser,
  setPendingAction,
  telegramProfile,
};
