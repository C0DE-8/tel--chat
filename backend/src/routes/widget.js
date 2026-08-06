const express = require("express");

function createWidgetRouter({ publicBaseUrl }) {
  const router = express.Router();

  router.get("/:ownerKey.js", (req, res) => {
    const ownerKey = JSON.stringify(req.params.ownerKey);
    const baseUrl = JSON.stringify(publicBaseUrl.replace(/\/+$/, ""));

    res.type("application/javascript").send(`
(() => {
  const ownerKey = ${ownerKey};
  const baseUrl = ${baseUrl};
  if (document.querySelector("[data-telegram-chat-widget]")) return;
  const script = document.createElement("script");
  script.dataset.telegramChatWidget = "true";
  script.src = baseUrl + "/frontend-widget.js";
  script.defer = true;
  script.onload = () => window.TelegramChatWidget && window.TelegramChatWidget.mount({ ownerKey, baseUrl });
  document.head.appendChild(script);
})();
`);
  });

  return router;
}

module.exports = { createWidgetRouter };
