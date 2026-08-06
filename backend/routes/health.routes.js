const express = require("express");
const db = require("../services/db");
const bot = require("../services/bot");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const gateway = await db.status();

    res.json({
      ok: true,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      gateway,
      bot: bot.getStatus(),
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: error.message,
      bot: bot.getStatus(),
    });
  }
});

module.exports = router;
