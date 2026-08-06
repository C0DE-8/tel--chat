const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const dotenv = require("dotenv");
const router = require("./routes");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use("/", router);

app.listen(port, () => {
  console.log(`Backend running on port ${port}`);
});
