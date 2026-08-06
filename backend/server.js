const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const dotenv = require("dotenv");

dotenv.config();

const router = require("./routes");
const bot = require("./services/bot");

const app = express();
const port = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use("/", router);

app.listen(port, () => {
  console.log(`Backend running on port ${port}`);

  if (process.env.TELEGRAM_POLLING === "true") {
    bot.startBot().catch((error) => {
      console.error("Telegram bot failed to start:", error.message);
    });
  }
});
