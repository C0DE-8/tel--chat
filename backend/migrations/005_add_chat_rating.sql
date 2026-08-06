ALTER TABLE chat_conversations
  ADD COLUMN rating TINYINT NULL AFTER status,
  ADD COLUMN rated_at TIMESTAMP NULL AFTER rating
