let app;
let startServices;
let ready;

module.exports = async function handler(req, res) {
  try {
    if (!app || !startServices) {
      ({ app, startServices } = require("../backend/src/app"));
    }

    if (!ready) {
      ready = startServices({ startBot: false });
    }

    await ready;
    return app(req, res);
  } catch (error) {
    console.error("Vercel API startup failed:", error);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      ok: false,
      error: error.message,
      hint: "Check Vercel env vars: SITE_ID, API_KEY, DBMS_URL, PUBLIC_BASE_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_POLLING=false"
    }));
  }
};
