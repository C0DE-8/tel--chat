const db = require("./db");

async function initializeSchema() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS chat_owners (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(120) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      public_key VARCHAR(64) NOT NULL UNIQUE,
      telegram_chat_id VARCHAR(64) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      owner_id BIGINT NOT NULL,
      visitor_name VARCHAR(160) NOT NULL,
      visitor_email VARCHAR(220) NOT NULL,
      visitor_token VARCHAR(80) NOT NULL UNIQUE,
      status ENUM('open', 'closed') NOT NULL DEFAULT 'open',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      closed_at TIMESTAMP NULL,
      INDEX idx_owner_status (owner_id, status),
      CONSTRAINT fk_chat_conversations_owner
        FOREIGN KEY (owner_id) REFERENCES chat_owners(id)
        ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      conversation_id BIGINT NOT NULL,
      sender ENUM('visitor', 'owner', 'system') NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_conversation_created (conversation_id, created_at),
      CONSTRAINT fk_chat_messages_conversation
        FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id)
        ON DELETE CASCADE
    )
  `);
}

module.exports = { initializeSchema };
