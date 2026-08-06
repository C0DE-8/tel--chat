const express = require("express");

function createConfigRouter() {
  const router = express.Router();

  router.get("/", (req, res) => {
    res.json({ ownerKey: req.query.owner || "" });
  });

  return router;
}

module.exports = { createConfigRouter };
