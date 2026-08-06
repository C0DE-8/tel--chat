const botUsers = require("./bot-users");
const chat = require("./chat");

const telegramApiBase = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

let isRunning = false;
let lastUpdateId = 0;
let pollTimer = null;
let botInfo = null;
let lastError = null;
let webhookUrl = null;

const CHAT_BUTTON_TEXT = "Chat";
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
        [{ text: USERS_BUTTON_TEXT }, { text: CHAT_BUTTON_TEXT }],
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
        [{ text: CHAT_BUTTON_TEXT }],
        [{ text: LOGOUT_BUTTON_TEXT }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    };
  }

  return {
    keyboard: [
      [{ text: LOGIN_BUTTON_TEXT }, { text: REGISTER_BUTTON_TEXT }],
      [{ text: CHAT_BUTTON_TEXT }],
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
      const publicKey = user.public_key || "missing";
      const linked = user.telegram_chat_id ? "linked" : "not linked";
      return `${user.id}. ${user.username} (${user.role})\nTelegram: ${telegramName} (${linked})\nWidget key: ${publicKey}`;
    })
    .join("\n\n");
}

function formatUser(user) {
  const telegramName = user.telegram_username ? `@${user.telegram_username}` : "no Telegram username";
  const publicKey = user.public_key || "missing";
  const linked = user.telegram_chat_id ? "linked" : "not linked";
  return `${user.id}. ${user.username} (${user.role})\nTelegram: ${telegramName} (${linked})\nWidget key: ${publicKey}`;
}

function userActionMarkup(user) {
  const rows = [
    [
      { text: "Set key", callback_data: `user:setkey:${user.id}` },
      { text: "Add missing key", callback_data: `user:addkey:${user.id}` },
    ],
  ];

  if (user.role !== "owner") {
    rows.push([{ text: "Delete user", callback_data: `user:delete:${user.id}` }]);
  }

  return { inline_keyboard: rows };
}

function chatActionMarkup(conversationId) {
  return {
    inline_keyboard: [
      [
        { text: "View history", callback_data: `chat:view:${conversationId}` },
      ],
      [
        { text: "Reply again", callback_data: `chat:reply:${conversationId}` },
        { text: "Close", callback_data: `chat:close:${conversationId}` },
      ],
    ],
  };
}

function chatListActionMarkup(conversation) {
  const rows = [[{ text: "View history", callback_data: `chat:view:${conversation.id}` }]];

  if (conversation.status === "open") {
    rows.push([
      { text: "Reply", callback_data: `chat:reply:${conversation.id}` },
      { text: "Close", callback_data: `chat:close:${conversation.id}` },
    ]);
  }

  return { inline_keyboard: rows };
}

function formatDateTime(value) {
  if (!value) return "unknown";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function clipText(value, maxLength = 260) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function formatOpenChat(conversation) {
  const lastSender = conversation.lastSender
    ? conversation.lastSender.charAt(0).toUpperCase() + conversation.lastSender.slice(1)
    : "None";
  const lines = [
    `Live chat #${conversation.id}`,
    "",
    "Visitor",
    `Name: ${conversation.visitorName || "Visitor"}`,
    `Email: ${conversation.visitorEmail || "not provided"}`,
    "",
    "Chat details",
    `Status: ${conversation.status || "open"}`,
    `Widget key: ${conversation.publicKey}`,
    `Assigned to: ${conversation.ownerUsername}`,
    `Started: ${formatDateTime(conversation.createdAt)}`,
    conversation.closedAt ? `Ended: ${formatDateTime(conversation.closedAt)}` : null,
    conversation.rating ? `Rating: ${conversation.rating}/5` : null,
    `Messages: ${conversation.messageCount || 0}`,
  ].filter(Boolean);

  if (conversation.chatReason) {
    lines.push("", "Reason", clipText(conversation.chatReason));
  }

  if (conversation.lastMessage) {
    lines.push("", "Latest message", `${lastSender}: ${clipText(conversation.lastMessage)}`);
    lines.push(`At: ${formatDateTime(conversation.lastMessageAt)}`);
  }

  return lines.join("\n");
}

function formatConversationHistory(result) {
  const { conversation, messages } = result;
  const lines = [
    `Conversation history #${conversation.id}`,
    "",
    "Visitor",
    `Name: ${conversation.visitorName || "Visitor"}`,
    `Email: ${conversation.visitorEmail || "not provided"}`,
    "",
    "Details",
    `Status: ${conversation.status}`,
    `Widget key: ${conversation.publicKey}`,
    `Assigned to: ${conversation.ownerUsername}`,
    `Started: ${formatDateTime(conversation.createdAt)}`,
    conversation.closedAt ? `Ended: ${formatDateTime(conversation.closedAt)}` : null,
    conversation.rating ? `Rating: ${conversation.rating}/5` : null,
  ].filter(Boolean);

  if (conversation.chatReason) {
    lines.push("", "Reason", clipText(conversation.chatReason, 180));
  }

  lines.push("", `Messages (${messages.length})`);

  if (!messages.length) {
    lines.push("No messages yet.");
  } else {
    for (const message of messages) {
      const sender = message.sender === "owner" ? "Agent" : message.sender === "visitor" ? "Client" : "System";
      lines.push(`${formatDateTime(message.createdAt)} - ${sender}: ${clipText(message.body, 180)}`);
    }
  }

  return clipText(lines.join("\n"), 3900);
}

async function sendUsersDashboard(chatId, telegramUserId, currentUser) {
  const result = await botUsers.listUsersForOwner(telegramUserId);
  if (!result.ok) {
    await sendUiMessage(chatId, telegramUserId, result.message, {
      reply_markup: menuMarkup(currentUser),
    });
    return;
  }

  const items = [
    {
      text: result.users.length ? "Manage users below." : "No users yet.",
      options: { reply_markup: menuMarkup(currentUser) },
    },
  ];

  for (const user of result.users) {
    items.push({
      text: formatUser(user),
      options: { reply_markup: userActionMarkup(user) },
    });
  }

  await sendUiMessages(chatId, telegramUserId, items);
}

async function sendChatDashboard(chatId, telegramUserId, currentUser, introText = null) {
  if (!currentUser) {
    await sendUiMessage(chatId, telegramUserId, "Login or register first.", {
      reply_markup: menuMarkup(currentUser),
    });
    return;
  }

  const conversations = await chat.listConversationsForUser(telegramUserId);
  const items = [];
  if (introText) {
    items.push({
      text: introText,
      options: { reply_markup: menuMarkup(currentUser) },
    });
  }

  if (!conversations.length) {
    items.push({
      text: "No open chats. New website chats will appear here.",
      options: { reply_markup: menuMarkup(currentUser) },
    });
    await sendUiMessages(chatId, telegramUserId, items);
    return;
  }

  items.push({
    text: `Chats: ${conversations.length}`,
    options: { reply_markup: menuMarkup(currentUser) },
  });

  for (const conversation of conversations) {
    items.push({
      text: formatOpenChat(conversation),
      options: { reply_markup: chatListActionMarkup(conversation) },
    });
  }

  await sendUiMessages(chatId, telegramUserId, items);
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

async function deleteMessage(chatId, messageId) {
  return telegram("deleteMessage", {
    chat_id: chatId,
    message_id: messageId,
  });
}

async function clearUiMessages(chatId, telegramUserId) {
  const messageIds = await botUsers.getUiMessageIds(telegramUserId);
  if (!messageIds.length) return;

  for (const messageId of messageIds) {
    try {
      await deleteMessage(chatId, messageId);
    } catch {
      // Telegram rejects deletes for messages that are too old or already gone.
    }
  }

  await botUsers.setUiMessageIds(telegramUserId, []);
}

async function sendUiMessage(chatId, telegramUserId, text, options = {}) {
  await clearUiMessages(chatId, telegramUserId);
  const sent = await sendMessage(chatId, text, options);
  await botUsers.setUiMessageIds(telegramUserId, [sent.message_id]);
  return sent;
}

async function sendUiMessages(chatId, telegramUserId, items) {
  await clearUiMessages(chatId, telegramUserId);
  const sentIds = [];

  for (const item of items) {
    const sent = await sendMessage(chatId, item.text, item.options || {});
    if (sent?.message_id) sentIds.push(sent.message_id);
  }

  await botUsers.setUiMessageIds(telegramUserId, sentIds);
  return sentIds;
}

async function answerCallbackQuery(callbackQueryId, text) {
  return telegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}

async function handleMessage(message) {
  if (!message?.chat?.id) return;

  const rawText = String(message.text || "").trim();
  const text = rawText.toLowerCase();
  const profile = botUsers.telegramProfile(message);
  const currentUser = await botUsers.getCurrentUser(profile.telegramUserId);

  if (rawText && message.reply_to_message?.message_id) {
    const conversation = await chat.findConversationByTelegramMessage({
      telegramChatId: message.chat.id,
      messageId: message.reply_to_message.message_id,
    });

    if (conversation) {
      if (!currentUser) {
        await sendUiMessage(message.chat.id, profile.telegramUserId, "Login before replying to website chats.", {
          reply_markup: menuMarkup(currentUser),
        });
        return;
      }

      const canManage = await chat.canManageConversation(profile.telegramUserId, conversation.id);
      if (!canManage) {
        await sendUiMessage(message.chat.id, profile.telegramUserId, "This chat belongs to another widget key.", {
          reply_markup: menuMarkup(currentUser),
        });
        return;
      }

      const result = await chat.addOwnerReply(conversation.id, rawText);
      if (result.ok) {
        await chat.rememberTelegramMessage({
          telegramChatId: message.chat.id,
          messageId: message.message_id,
          conversationId: conversation.id,
          direction: "owner",
        });
      }

      await sendUiMessage(message.chat.id, profile.telegramUserId, result.ok ? "Delivered to client." : result.message, {
        reply_markup: result.ok ? chatActionMarkup(conversation.id) : menuMarkup(currentUser),
      });
      return;
    }
  }

  if (message.message_id && text !== "/start") {
    try {
      await deleteMessage(message.chat.id, message.message_id);
    } catch {
      // Best effort: private-chat user messages may already be gone or not deletable.
    }
  }

  if (!rawText || text === "/start") {
    await sendUiMessage(message.chat.id, profile.telegramUserId, "Choose an option.", {
      reply_markup: menuMarkup(currentUser),
    });
    return;
  }

  if (text === LOGIN_BUTTON_TEXT.toLowerCase()) {
    await botUsers.setPendingAction(profile.telegramUserId, "login");
    await sendUiMessage(message.chat.id, profile.telegramUserId, "Send your username and password like: username password", {
      reply_markup: menuMarkup(currentUser),
    });
    return;
  }

  if (text === REGISTER_BUTTON_TEXT.toLowerCase()) {
    await botUsers.setPendingAction(profile.telegramUserId, "register");
    await sendUiMessage(message.chat.id, profile.telegramUserId, "Send a username and password like: username password", {
      reply_markup: menuMarkup(currentUser),
    });
    return;
  }

  if (text === ADMIN_DASHBOARD_BUTTON_TEXT.toLowerCase()) {
    if (currentUser?.role !== "owner") {
      await sendUiMessage(message.chat.id, profile.telegramUserId, "Login with the owner account to open the admin dashboard.", {
        reply_markup: menuMarkup(currentUser),
      });
      return;
    }

    await sendUiMessage(message.chat.id, profile.telegramUserId, "Admin dashboard", {
      reply_markup: menuMarkup(currentUser),
    });
    return;
  }

  if (text === USER_DASHBOARD_BUTTON_TEXT.toLowerCase()) {
    if (!currentUser) {
      await sendUiMessage(message.chat.id, profile.telegramUserId, "Login or register first.", {
        reply_markup: menuMarkup(currentUser),
      });
      return;
    }

    await sendUiMessage(message.chat.id, profile.telegramUserId, `Dashboard for ${currentUser.username}`, {
      reply_markup: menuMarkup(currentUser),
    });
    return;
  }

  if (text === USERS_BUTTON_TEXT.toLowerCase()) {
    await sendUsersDashboard(message.chat.id, profile.telegramUserId, currentUser);
    return;
  }

  if (text === LOGOUT_BUTTON_TEXT.toLowerCase()) {
    const result = await botUsers.logoutUser(profile.telegramUserId);
    await sendUiMessage(message.chat.id, profile.telegramUserId, result.message, {
      reply_markup: menuMarkup(null),
    });
    return;
  }

  if (text === "chat" || text === "/chat") {
    await sendChatDashboard(message.chat.id, profile.telegramUserId, currentUser);
    return;
  }

  const directLoginText = text.startsWith("login ") ? rawText.slice(6) : null;
  const directRegisterText = text.startsWith("register ") ? rawText.slice(9) : null;
  const pendingSession = await botUsers.getPendingSession(profile.telegramUserId);
  const action = directLoginText ? "login" : directRegisterText ? "register" : pendingSession?.action;

  if (action === "login" || action === "register") {
    const credentials = parseCredentials(directLoginText || directRegisterText || rawText);

    if (!credentials) {
      await sendUiMessage(message.chat.id, profile.telegramUserId, "Send it like: username password", {
        reply_markup: menuMarkup(currentUser),
      });
      return;
    }

    const result =
      action === "login"
        ? await botUsers.loginUser({ ...credentials, profile })
        : await botUsers.registerUser({ ...credentials, profile });

    await botUsers.clearPendingAction(profile.telegramUserId);
    const resolvedUser = result.user || (result.ok ? await botUsers.getCurrentUser(profile.telegramUserId) : currentUser);
    if (result.ok) {
      await sendChatDashboard(message.chat.id, profile.telegramUserId, resolvedUser, result.message);
    } else {
      await sendUiMessage(message.chat.id, profile.telegramUserId, result.message, {
        reply_markup: menuMarkup(resolvedUser),
      });
    }
    return;
  }

  if (action === "reply_chat") {
    const result = await chat.addOwnerReply(pendingSession.conversation_id, rawText);
    await botUsers.clearPendingAction(profile.telegramUserId);
    const options = result.ok
      ? { reply_markup: chatActionMarkup(pendingSession.conversation_id) }
      : { reply_markup: menuMarkup(currentUser) };

    await sendUiMessage(message.chat.id, profile.telegramUserId, result.message, options);
    return;
  }

  if (action === "set_user_key") {
    const result = await botUsers.setUserPublicKey({
      adminTelegramUserId: profile.telegramUserId,
      userId: pendingSession.conversation_id,
      publicKey: rawText,
    });
    await botUsers.clearPendingAction(profile.telegramUserId);
    await sendUiMessage(message.chat.id, profile.telegramUserId, result.message, {
      reply_markup: menuMarkup(currentUser),
    });
    return;
  }

  await sendUiMessage(message.chat.id, profile.telegramUserId, "Choose an option.", {
    reply_markup: menuMarkup(currentUser),
  });
}

async function handleCallbackQuery(callbackQuery) {
  const data = String(callbackQuery?.data || "");
  const telegramUserId = callbackQuery?.from?.id;
  const chatId = callbackQuery?.message?.chat?.id || telegramUserId;

  if ((!data.startsWith("chat:") && !data.startsWith("user:")) || !telegramUserId) return;

  const currentUser = await botUsers.getCurrentUser(telegramUserId);
  if (!currentUser) {
    await answerCallbackQuery(callbackQuery.id, "Login required.");
    await sendUiMessage(chatId, telegramUserId, "Login to manage chats.", {
      reply_markup: menuMarkup(currentUser),
    });
    return;
  }

  if (data.startsWith("user:")) {
    if (currentUser.role !== "owner") {
      await answerCallbackQuery(callbackQuery.id, "Owner login required.");
      return;
    }

    const [, action, userIdText] = data.split(":");
    const userId = Number(userIdText);
    if (!Number.isInteger(userId) || userId <= 0) {
      await answerCallbackQuery(callbackQuery.id, "Invalid user.");
      return;
    }

    if (action === "setkey") {
      await botUsers.setPendingAction(telegramUserId, "set_user_key", userId);
      await answerCallbackQuery(callbackQuery.id, "Send the widget key.");
      await sendUiMessage(chatId, telegramUserId, "Send the widget key to assign. You can reuse an existing key for multiple users.", {
        reply_markup: menuMarkup(currentUser),
      });
      return;
    }

    if (action === "addkey") {
      const result = await botUsers.addMissingPublicKey({ adminTelegramUserId: telegramUserId, userId });
      await answerCallbackQuery(callbackQuery.id, result.message);
      await sendUiMessage(chatId, telegramUserId, result.message, {
        reply_markup: menuMarkup(currentUser),
      });
      return;
    }

    if (action === "delete") {
      const result = await botUsers.deleteUser({ adminTelegramUserId: telegramUserId, userId });
      await answerCallbackQuery(callbackQuery.id, result.message);
      await sendUiMessage(chatId, telegramUserId, result.message, {
        reply_markup: menuMarkup(currentUser),
      });
      return;
    }

    await answerCallbackQuery(callbackQuery.id, "Unknown user action.");
    return;
  }

  const [, action, conversationIdText] = data.split(":");
  const conversationId = Number(conversationIdText);

  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    await answerCallbackQuery(callbackQuery.id, "Invalid chat.");
    return;
  }

  const existingConversation = await chat.getConversationById(conversationId);
  if (!existingConversation) {
    await answerCallbackQuery(callbackQuery.id, "Chat was cleared.");
    await sendUiMessage(chatId, telegramUserId, `Chat #${conversationId} was cleared from the database. It can no longer be viewed, replied to, or closed.`, {
      reply_markup: menuMarkup(currentUser),
    });
    return;
  }

  const canManage = await chat.canManageConversation(telegramUserId, conversationId);
  if (!canManage) {
    await answerCallbackQuery(callbackQuery.id, "You cannot manage this chat.");
    await sendUiMessage(chatId, telegramUserId, "This chat belongs to another widget key.", {
      reply_markup: menuMarkup(currentUser),
    });
    return;
  }

  if (action === "reply") {
    await botUsers.setPendingAction(telegramUserId, "reply_chat", conversationId);
    await answerCallbackQuery(callbackQuery.id, `Replying to chat #${conversationId}`);
    await sendUiMessage(chatId, telegramUserId, `Send your reply for chat #${conversationId}.`, {
      reply_markup: menuMarkup(currentUser),
    });
    return;
  }

  if (action === "view") {
    const result = await chat.listConversationHistory(conversationId);
    await answerCallbackQuery(callbackQuery.id, `Chat #${conversationId}`);
    await sendUiMessage(chatId, telegramUserId, formatConversationHistory(result), {
      reply_markup: chatListActionMarkup(result.conversation),
    });
    return;
  }

  if (action === "close") {
    const result = await chat.closeConversation(conversationId);
    await answerCallbackQuery(callbackQuery.id, result.message);
    await sendUiMessage(chatId, telegramUserId, result.message, {
      reply_markup: menuMarkup(currentUser),
    });
  }
}

async function handleUpdate(update) {
  try {
    lastUpdateId = Math.max(lastUpdateId, update?.update_id || 0);
    if (update?.callback_query) {
      await handleCallbackQuery(update.callback_query);
    } else {
      await handleMessage(update?.message);
    }
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
    allowed_updates: ["message", "callback_query"],
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
    allowed_updates: ["message", "callback_query"],
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
