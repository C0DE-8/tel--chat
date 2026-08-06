const express = require("express");
const bot = require("../services/bot");

const router = express.Router();

router.post("/webhook", async (req, res) => {
  if (!bot.verifyWebhookSecret(req)) {
    return res.status(401).json({ ok: false, error: "Invalid webhook secret" });
  }

  try {
    await bot.handleUpdate(req.body);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
