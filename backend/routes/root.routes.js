const express = require("express");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({ message: "botting is runing" });
});

module.exports = router;
