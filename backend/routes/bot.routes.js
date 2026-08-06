const express = require("express");
const bot = require("../services/bot");

const router = express.Router();

function normalizeBaseUrl(url) {
  return String(url || "").replace(/\/+$/, "");
}

function webhookPath() {
  const path = process.env.TELEGRAM_WEBHOOK_PATH || "/telegram/webhook";
  return path.startsWith("/") ? path : `/${path}`;
}

router.get("/", (req, res) => {
  res.json({
    message: "botting is runing",
    bot: bot.getStatus(),
  });
});

router.get("/webhook", async (req, res) => {
  try {
    const webhook = await bot.getWebhookInfo();

    res.json({
      ok: true,
      webhook,
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: error.message,
    });
  }
});

router.get("/webhook/set", async (req, res) => {
  try {
    const baseUrl = normalizeBaseUrl(process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`);
    const url = `${baseUrl}${webhookPath()}`;

    await bot.setWebhook(url, {
      secretToken: process.env.TELEGRAM_WEBHOOK_SECRET,
      dropPendingUpdates: process.env.TELEGRAM_DROP_PENDING_UPDATES === "true",
    });

    const webhook = await bot.getWebhookInfo();

    res.json({
      ok: true,
      url,
      webhook,
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: error.message,
    });
  }
});

module.exports = router;
