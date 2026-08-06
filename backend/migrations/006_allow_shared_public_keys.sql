ALTER TABLE chat_owners
  DROP INDEX public_key,
  ADD INDEX idx_chat_owners_public_key (public_key)
