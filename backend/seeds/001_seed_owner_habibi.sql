INSERT INTO bot_users (username, password_hash, role)
VALUES ('habibi', '$2a$10$KpnKzl2WL0gvvhqDRY3pD.pRfEN5W/dpBk66E5Tu3LHUcC3/zZAky', 'owner')
ON DUPLICATE KEY UPDATE
  password_hash = VALUES(password_hash),
  role = VALUES(role)
