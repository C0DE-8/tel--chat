const express = require("express");
const chat = require("../services/chat");

const router = express.Router();

function sendError(res, error) {
  res.status(error.status || 500).json({
    ok: false,
    error: error.message,
  });
}

router.get("/config", (req, res) => {
  res.json({
    ok: true,
    publicKey: req.query.key || null,
  });
});

router.post("/conversations", async (req, res) => {
  try {
    const result = await chat.createConversation({
      publicKey: req.body.publicKey,
      visitorName: req.body.visitorName,
      visitorEmail: req.body.visitorEmail,
    });
    const { conversation, reused } = result;

    res.status(reused ? 200 : 201).json({ ok: true, conversation, reused });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/conversations/:visitorToken/messages", async (req, res) => {
  try {
    const result = await chat.listMessages(req.params.visitorToken);
    res.json({ ok: true, ...result });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/conversations/:visitorToken/messages", async (req, res) => {
  try {
    const body = String(req.body.body || "").trim();
    if (!body) {
      return res.status(400).json({ ok: false, error: "Message body is required" });
    }

    const message = await chat.addVisitorMessage(req.params.visitorToken, body);
    res.status(201).json({ ok: true, message });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/conversations/:visitorToken/close", async (req, res) => {
  try {
    const result = await chat.listMessages(req.params.visitorToken);
    const closed = await chat.closeConversation(result.conversation.id);
    res.json({ ok: closed.ok, message: closed.message });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/conversations/:visitorToken/rating", async (req, res) => {
  try {
    const conversation = await chat.rateConversation(req.params.visitorToken, req.body.rating);
    res.json({ ok: true, conversation });
  } catch (error) {
    sendError(res, error);
  }
});

router.delete("/conversations/:visitorToken", async (req, res) => {
  try {
    const result = await chat.clearConversation(req.params.visitorToken);
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

module.exports = router;
