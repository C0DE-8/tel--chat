const express = require("express");

function createConfigRouter() {
  const router = express.Router();

  router.get("/", (req, res) => {
    res.json({ ownerKey: req.query.owner || process.env.DEFAULT_OWNER_KEY || "" });
  });

  return router;
}

module.exports = { createConfigRouter };
