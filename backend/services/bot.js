const telegramApiBase = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

let isRunning = false;
let lastUpdateId = 0;
let pollTimer = null;
let botInfo = null;
let lastError = null;
let webhookUrl = null;

const PLANFAM_BUTTON_TEXT = "PlanFam";

function mainMenuMarkup() {
  return {
    keyboard: [[{ text: PLANFAM_BUTTON_TEXT }]],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
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

  const text = String(message.text || "").trim().toLowerCase();

  if (text === "planfam" || text === "/planfam") {
    await sendMessage(message.chat.id, "PlanFam is running.", {
      reply_markup: mainMenuMarkup(),
    });
    return;
  }

  await sendMessage(message.chat.id, "botting is runing", {
    reply_markup: mainMenuMarkup(),
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
