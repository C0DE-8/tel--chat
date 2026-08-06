CREATE TABLE IF NOT EXISTS telegram_chat_messages (
  telegram_chat_id VARCHAR(64) NOT NULL,
  message_id BIGINT NOT NULL,
  conversation_id BIGINT NOT NULL,
  direction VARCHAR(32) NOT NULL DEFAULT 'visitor',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_chat_id, message_id),
  INDEX idx_telegram_chat_messages_conversation (conversation_id)
)
