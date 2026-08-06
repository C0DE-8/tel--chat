const botUsers = require("./bot-users");

const telegramApiBase = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

let isRunning = false;
let lastUpdateId = 0;
let pollTimer = null;
let botInfo = null;
let lastError = null;
let webhookUrl = null;

const PLANFAM_BUTTON_TEXT = "PlanFam";
const LOGIN_BUTTON_TEXT = "Login";
const REGISTER_BUTTON_TEXT = "Register";
const USERS_BUTTON_TEXT = "Users";
const ADMIN_DASHBOARD_BUTTON_TEXT = "Admin Dashboard";
const USER_DASHBOARD_BUTTON_TEXT = "Dashboard";
const LOGOUT_BUTTON_TEXT = "Logout";

function menuMarkup(user) {
  if (user?.role === "owner") {
    return {
      keyboard: [
        [{ text: ADMIN_DASHBOARD_BUTTON_TEXT }],
        [{ text: USERS_BUTTON_TEXT }, { text: PLANFAM_BUTTON_TEXT }],
        [{ text: LOGOUT_BUTTON_TEXT }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    };
  }

  if (user) {
    return {
      keyboard: [
        [{ text: USER_DASHBOARD_BUTTON_TEXT }],
        [{ text: PLANFAM_BUTTON_TEXT }],
        [{ text: LOGOUT_BUTTON_TEXT }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    };
  }

  return {
    keyboard: [
      [{ text: LOGIN_BUTTON_TEXT }, { text: REGISTER_BUTTON_TEXT }],
      [{ text: PLANFAM_BUTTON_TEXT }],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

function parseCredentials(text) {
  const parts = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length < 2) return null;

  return {
    username: parts[0],
    password: parts.slice(1).join(" "),
  };
}

function formatUsers(users) {
  if (!users.length) return "No users yet.";

  return users
    .map((user) => {
      const telegramName = user.telegram_username ? `@${user.telegram_username}` : "no Telegram username";
      return `${user.id}. ${user.username} (${user.role}) - ${telegramName}`;
    })
    .join("\n");
}

function isConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

async function telegram(method, payload = {}) {
  const response = await fetch(`${telegramApiBase()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.ok === false) {
    throw new Error(data.description || `Telegram ${method} failed`);
  }

  return data.result;
}

async function sendMessage(chatId, text, options = {}) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    ...options,
  });
}

async function handleMessage(message) {
  if (!message?.chat?.id) return;

  const rawText = String(message.text || "").trim();
  const text = rawText.toLowerCase();
  const profile = botUsers.telegramProfile(message);
  const currentUser = await botUsers.getCurrentUser(profile.telegramUserId);

  if (!rawText || text === "/start") {
    await sendMessage(message.chat.id, "Choose an option.", {
      reply_markup: menuMarkup(currentUser),
    });
    return;
  }

  if (text === LOGIN_BUTTON_TEXT.toLowerCase()) {
    await botUsers.setPendingAction(profile.telegramUserId, "login");
    await sendMessage(message.chat.id, "Send your username and password like: username password", {
      reply_markup: menuMarkup(currentUser),
    });
    return;
  }

  if (text === REGISTER_BUTTON_TEXT.toLowerCase()) {
    await botUsers.setPendingAction(profile.telegramUserId, "register");
    await sendMessage(message.chat.id, "Send a username and password like: username password", {
      reply_markup: menuMarkup(currentUser),
    });
    return;
  }

  if (text === ADMIN_DASHBOARD_BUTTON_TEXT.toLowerCase()) {
    if (currentUser?.role !== "owner") {
      await sendMessage(message.chat.id, "Login with the owner account to open the admin dashboard.", {
        reply_markup: menuMarkup(currentUser),
      });
      return;
    }

    await sendMessage(message.chat.id, "Admin dashboard", {
      reply_markup: menuMarkup(currentUser),
    });
    return;
  }

  if (text === USER_DASHBOARD_BUTTON_TEXT.toLowerCase()) {
    if (!currentUser) {
      await sendMessage(message.chat.id, "Login or register first.", {
        reply_markup: menuMarkup(currentUser),
      });
      return;
    }

    await sendMessage(message.chat.id, `Dashboard for ${currentUser.username}`, {
      reply_markup: menuMarkup(currentUser),
    });
    return;
  }

  if (text === USERS_BUTTON_TEXT.toLowerCase()) {
    const result = await botUsers.listUsersForOwner(profile.telegramUserId);
    await sendMessage(message.chat.id, result.ok ? formatUsers(result.users) : result.message, {
      reply_markup: menuMarkup(currentUser),
    });
    return;
  }

  if (text === LOGOUT_BUTTON_TEXT.toLowerCase()) {
    const result = await botUsers.logoutUser(profile.telegramUserId);
    await sendMessage(message.chat.id, result.message, {
      reply_markup: menuMarkup(null),
    });
    return;
  }

  if (text === "planfam" || text === "/planfam") {
    await sendMessage(message.chat.id, "PlanFam is running.", {
      reply_markup: menuMarkup(currentUser),
    });
    return;
  }

  const directLoginText = text.startsWith("login ") ? rawText.slice(6) : null;
  const directRegisterText = text.startsWith("register ") ? rawText.slice(9) : null;
  const pendingAction = await botUsers.getPendingAction(profile.telegramUserId);
  const action = directLoginText ? "login" : directRegisterText ? "register" : pendingAction;

  if (action === "login" || action === "register") {
    const credentials = parseCredentials(directLoginText || directRegisterText || rawText);

    if (!credentials) {
      await sendMessage(message.chat.id, "Send it like: username password", {
        reply_markup: menuMarkup(currentUser),
      });
      return;
    }

    const result =
      action === "login"
        ? await botUsers.loginUser({ ...credentials, profile })
        : await botUsers.registerUser({ ...credentials, profile });

    await botUsers.clearPendingAction(profile.telegramUserId);
    await sendMessage(message.chat.id, result.message, {
      reply_markup: menuMarkup(result.user || (result.ok ? await botUsers.getCurrentUser(profile.telegramUserId) : currentUser)),
    });
    return;
  }

  await sendMessage(message.chat.id, "Choose an option.", {
    reply_markup: menuMarkup(currentUser),
  });
}

async function handleUpdate(update) {
  try {
    lastUpdateId = Math.max(lastUpdateId, update?.update_id || 0);
    await handleMessage(update?.message);
    lastError = null;
  } catch (error) {
    lastError = error.message;
    throw error;
  }
}

async function pollOnce() {
  const updates = await telegram("getUpdates", {
    offset: lastUpdateId + 1,
    timeout: 25,
    allowed_updates: ["message"],
  });

  for (const update of updates) {
    await handleUpdate(update);
  }
}

async function pollLoop() {
  if (!isRunning) return;

  try {
    await pollOnce();
    lastError = null;
  } catch (error) {
    lastError = error.message;
    console.error("Telegram bot polling failed:", error.message);
  } finally {
    if (isRunning) {
      pollTimer = setTimeout(pollLoop, 1000);
    }
  }
}

async function startBot() {
  if (!isConfigured()) {
    console.warn("Telegram bot not started: TELEGRAM_BOT_TOKEN is missing");
    return getStatus();
  }

  if (isRunning) return getStatus();

  botInfo = await telegram("getMe");
  isRunning = true;
  pollLoop();
  console.log(`Telegram bot connected as @${botInfo.username}`);

  return getStatus();
}

async function setWebhook(url, options = {}) {
  if (!isConfigured()) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }
  if (!url) {
    throw new Error("webhook URL is required");
  }

  const payload = {
    url,
    allowed_updates: ["message"],
    drop_pending_updates: Boolean(options.dropPendingUpdates),
  };

  if (options.secretToken) {
    payload.secret_token = options.secretToken;
  }

  const result = await telegram("setWebhook", payload);
  webhookUrl = url;
  return result;
}

async function getWebhookInfo() {
  if (!isConfigured()) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }

  return telegram("getWebhookInfo");
}

function verifyWebhookSecret(req) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return true;

  return req.header("x-telegram-bot-api-secret-token") === expected;
}

function stopBot() {
  isRunning = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function getStatus() {
  return {
    configured: isConfigured(),
    running: isRunning,
    username: botInfo?.username || null,
    webhookUrl,
    lastUpdateId,
    lastError,
  };
}

module.exports = {
  getStatus,
  getWebhookInfo,
  handleUpdate,
  sendMessage,
  setWebhook,
  startBot,
  stopBot,
  verifyWebhookSecret,
};
