const telegramApiBase = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

let isRunning = false;
let lastUpdateId = 0;
let pollTimer = null;
let botInfo = null;
let lastError = null;

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

async function sendMessage(chatId, text) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
  });
}

async function handleMessage(message) {
  if (!message?.chat?.id) return;

  const text = String(message.text || "").trim();
  const reply =
    text === "/start" || text === "/health"
      ? "botting is runing"
      : "botting is runing";

  await sendMessage(message.chat.id, reply);
}

async function pollOnce() {
  const updates = await telegram("getUpdates", {
    offset: lastUpdateId + 1,
    timeout: 25,
    allowed_updates: ["message"],
  });

  for (const update of updates) {
    lastUpdateId = Math.max(lastUpdateId, update.update_id || 0);
    await handleMessage(update.message);
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
    lastUpdateId,
    lastError,
  };
}

module.exports = {
  getStatus,
  sendMessage,
  startBot,
  stopBot,
};
