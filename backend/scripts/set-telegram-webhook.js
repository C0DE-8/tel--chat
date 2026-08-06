require("dotenv").config();

const bot = require("../services/bot");

function normalizeUrl(url) {
  return String(url || "").replace(/\/+$/, "");
}

async function main() {
  const baseUrl = normalizeUrl(process.env.PUBLIC_BASE_URL || process.argv[2]);
  const webhookPath = process.env.TELEGRAM_WEBHOOK_PATH || "/telegram/webhook";

  if (!baseUrl) {
    throw new Error("PUBLIC_BASE_URL or a URL argument is required");
  }

  const webhookUrl = `${baseUrl}${webhookPath.startsWith("/") ? webhookPath : `/${webhookPath}`}`;

  await bot.setWebhook(webhookUrl, {
    secretToken: process.env.TELEGRAM_WEBHOOK_SECRET,
    dropPendingUpdates: process.env.TELEGRAM_DROP_PENDING_UPDATES === "true",
  });

  const info = await bot.getWebhookInfo();
  console.log(
    JSON.stringify(
      {
        ok: true,
        url: info.url,
        pending_update_count: info.pending_update_count,
        last_error_message: info.last_error_message || null,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
