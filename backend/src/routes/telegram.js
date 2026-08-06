const express = require("express");

function createTelegramRouter({ bot }) {
  const router = express.Router();

  router.post("/webhook", async (req, res) => {
    try {
      await bot.handleUpdate(req.body);
      res.json({ ok: true });
    } catch (error) {
      console.error("Telegram webhook error:", error.message);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

module.exports = { createTelegramRouter };
