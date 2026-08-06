const express = require("express");
const botRoutes = require("./bot.routes");
const healthRoutes = require("./health.routes");
const rootRoutes = require("./root.routes");
const telegramRoutes = require("./telegram.routes");
const widgetRoutes = require("./widget.routes");

const router = express.Router();

router.use("/", rootRoutes);
router.use("/health", healthRoutes);
router.use("/bot", botRoutes);
router.use("/telegram", telegramRoutes);
router.use("/widget", widgetRoutes);

module.exports = router;
