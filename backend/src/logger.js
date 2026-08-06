const db = require("./db");

async function logEvent(event, meta = {}, options = {}) {
  try {
    await db.execute(
      "INSERT INTO chat_logs (level, event, owner_id, conversation_id, meta) VALUES (?, ?, ?, ?, ?)",
      [
        options.level || "info",
        event,
        options.ownerId || null,
        options.conversationId || null,
        JSON.stringify(meta)
      ]
    );
  } catch (error) {
    console.error(`Failed to write chat log '${event}':`, error.message);
  }
}

module.exports = { logEvent };
