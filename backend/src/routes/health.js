const express = require("express");
const db = require("../db");

function createHealthRouter() {
  const router = express.Router();

  router.get("/", async (_req, res) => {
    try {
      const gateway = await db.status();
      res.json({ ok: true, gateway });
    } catch (error) {
      res.status(503).json({ ok: false, error: error.message });
    }
  });

  return router;
}

module.exports = { createHealthRouter };
