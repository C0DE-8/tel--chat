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

async function setPendingAction(telegramUserId, action) {
  await db.execute(
    `INSERT INTO bot_user_sessions (telegram_user_id, action)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE action = VALUES(action)`,
    [telegramUserId, action]
  );
}

async function getPendingAction(telegramUserId) {
  const rows = await db.query("SELECT action FROM bot_user_sessions WHERE telegram_user_id = ? LIMIT 1", [
    telegramUserId,
  ]);

  return rows[0]?.action || null;
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

  return { ok: true, message: `Registered and logged in as ${username}.` };
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

  return { ok: true, user: { ...user, telegram_user_id: profile.telegramUserId }, message: `Logged in as ${username}.` };
}

async function logoutUser(telegramUserId) {
  const user = await findByTelegramUserId(telegramUserId);
  if (!user) {
    return { ok: false, message: "You are not logged in." };
  }

  await db.execute("UPDATE bot_users SET telegram_user_id = NULL WHERE id = ?", [user.id]);
  await clearPendingAction(telegramUserId);

  return { ok: true, message: "Logged out." };
}

async function listUsersForOwner(telegramUserId) {
  const owner = await findByTelegramUserId(telegramUserId);
  if (!owner || owner.role !== "owner") {
    return { ok: false, message: "Only the owner can see users. Login with the owner account first." };
  }

  const users = await db.query(
    `SELECT id, username, role, telegram_username, first_name, last_name, created_at, last_seen_at
     FROM bot_users
     ORDER BY created_at DESC
     LIMIT 50`
  );

  return { ok: true, users };
}

module.exports = {
  clearPendingAction,
  getCurrentUser,
  getPendingAction,
  listUsersForOwner,
  loginUser,
  logoutUser,
  registerUser,
  setPendingAction,
  telegramProfile,
};
