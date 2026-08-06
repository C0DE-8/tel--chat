const express = require("express");
const path = require("path");

const router = express.Router();

router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../../frontend/index.html"));
});

router.get("/status", (req, res) => {
  res.json({ message: "botting is runing" });
});

module.exports = router;
