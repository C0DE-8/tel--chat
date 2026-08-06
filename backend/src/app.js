require("./env");

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { initializeSchema } = require("./schema");
const { createBot } = require("./bot");
const { createHealthRouter } = require("./routes/health");
const { createConfigRouter } = require("./routes/config");
const { createConversationRouter } = require("./routes/conversations");
const { createTelegramRouter } = require("./routes/telegram");
const { createWidgetRouter } = require("./routes/widget");
const { logEvent } = require("./logger");

const app = express();
const port = Number(process.env.PORT || 3000);
const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
const bot = createBot({
  token: process.env.TELEGRAM_BOT_TOKEN,
  publicBaseUrl
});

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.resolve(__dirname, "../../frontend")));

app.use("/health", createHealthRouter());
app.use("/api/config", createConfigRouter());
app.use("/api/conversations", createConversationRouter({ bot }));
app.use("/api/telegram", createTelegramRouter({ bot }));
app.use("/widget", createWidgetRouter({ publicBaseUrl }));

async function startServices(options = {}) {
  await initializeSchema();
  const shouldStartBot = options.startBot !== false && process.env.VERCEL !== "1";
  await logEvent("server_services_started", {
    telegramPolling: shouldStartBot && process.env.TELEGRAM_POLLING !== "false"
  });
  if (shouldStartBot) bot.start();
}

module.exports = { app, startServices };
