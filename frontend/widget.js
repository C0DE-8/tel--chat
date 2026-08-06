(function () {
  const currentScript = document.currentScript;
  const scriptOrigin = currentScript?.src ? new URL(currentScript.src).origin : window.location.origin;
  const apiBase = (currentScript?.dataset.apiBase || scriptOrigin).replace(/\/+$/, "");
  const publicKey = currentScript?.dataset.publicKey || "habibi";
  const storageKey = `tel_chat_${publicKey}`;

  let visitorToken = window.localStorage.getItem(storageKey);
  let isOpen = false;
  let messagesEl;
  let inputEl;
  let startFormEl;
  let chatFormEl;
  let closeButtonEl;
  let minimizeButtonEl;
  let titleEl;
  let noticeEl;
  let statusEl;
  let statusTextEl;
  let closeButtonMode = "close";
  let isLoading = false;

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else node.setAttribute(key, value);
    }
    for (const child of children) node.appendChild(child);
    return node;
  }

  async function api(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "Chat request failed");
    }
    return payload;
  }

  function setLoading(loading, text) {
    isLoading = loading;
    if (statusEl) {
      if (statusTextEl) statusTextEl.textContent = text || "Loading...";
      statusEl.style.display = loading ? "flex" : "none";
    }
  }

  function renderSystem(text) {
    const startVisible = startFormEl?.style.display !== "none";
    if (noticeEl && startVisible) {
      noticeEl.textContent = text;
      noticeEl.style.display = "block";
      return;
    }

    renderMessages([{ sender: "system", body: text }]);
  }

  function showChatMode() {
    startFormEl.style.display = "none";
    messagesEl.style.display = "flex";
    chatFormEl.style.display = "grid";
    closeButtonEl.style.display = "inline-block";
    closeButtonEl.textContent = "End chat";
    closeButtonMode = "close";
    inputEl.disabled = false;
    inputEl.placeholder = "Write a message...";
    titleEl.textContent = "Live Chat";
  }

  function showStartMode() {
    startFormEl.style.display = "grid";
    messagesEl.style.display = "none";
    chatFormEl.style.display = "none";
    closeButtonEl.style.display = "none";
    titleEl.textContent = "Start a Chat";
  }

  function setOpen(open) {
    isOpen = open;
    document.querySelector(".tc-panel")?.classList.toggle("tc-open", isOpen);
    document.querySelector(".tc-button")?.classList.toggle("tc-hidden", isOpen);
  }

  function resetConversation() {
    visitorToken = null;
    window.localStorage.removeItem(storageKey);
    renderMessages([]);
    showStartMode();
  }

  function renderMessages(messages) {
    messagesEl.innerHTML = "";

    for (const message of messages) {
      const bubble = el("div", {
        class: `tc-message tc-${message.sender}`,
        text: message.body,
      });
      messagesEl.appendChild(bubble);
    }

    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function startConversation(form) {
    const formData = new FormData(form);
    if (noticeEl) noticeEl.style.display = "none";
    const visitorName = String(formData.get("visitorName") || "").trim();
    const visitorEmail = String(formData.get("visitorEmail") || "").trim();
    const chatReason = String(formData.get("chatReason") || "").trim();

    if (!visitorName || !visitorEmail) {
      renderSystem("Name and email are required.");
      return;
    }

    setLoading(true, "Starting chat...");
    try {
      const payload = await api("/widget/conversations", {
        method: "POST",
        body: JSON.stringify({
          publicKey,
          visitorName,
          visitorEmail,
          chatReason,
        }),
      });

      visitorToken = payload.conversation.visitorToken;
      window.localStorage.setItem(storageKey, visitorToken);
      showChatMode();
      await loadMessages();
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages() {
    if (!visitorToken) {
      showStartMode();
      return;
    }

    if (!messagesEl.children.length) setLoading(true, "Loading messages...");
    try {
      const payload = await api(`/widget/conversations/${visitorToken}/messages`);
      showChatMode();
      renderMessages(payload.messages);

      if (payload.conversation.status === "closed") {
        inputEl.disabled = true;
        inputEl.placeholder = "This chat is closed";
        closeButtonEl.textContent = "New chat";
        closeButtonMode = "new";
        closeButtonEl.style.display = "inline-block";
      }
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage() {
    const body = inputEl.value.trim();
    if (!body || !visitorToken || isLoading) return;

    inputEl.value = "";
    setLoading(true, "Sending...");
    try {
      await api(`/widget/conversations/${visitorToken}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      await loadMessages();
    } finally {
      setLoading(false);
    }
  }

  async function closeChat() {
    if (!visitorToken) return;

    setLoading(true, "Closing chat...");
    try {
      await api(`/widget/conversations/${visitorToken}/close`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await loadMessages();
    } finally {
      setLoading(false);
    }
  }

  function buildStartForm() {
    const form = el("form", { class: "tc-start" });
    noticeEl = el("div", { class: "tc-notice", role: "alert" });
    form.appendChild(noticeEl);
    form.appendChild(el("label", { text: "Name" }));
    form.appendChild(el("input", { name: "visitorName", type: "text", placeholder: "Your name", required: "required" }));
    form.appendChild(el("label", { text: "Email" }));
    form.appendChild(el("input", { name: "visitorEmail", type: "email", placeholder: "you@example.com", required: "required" }));
    form.appendChild(el("label", { text: "Reason for chat (optional)" }));
    form.appendChild(el("textarea", { name: "chatReason", rows: "4", placeholder: "What can we help with?" }));
    form.appendChild(el("button", { type: "submit", text: "Start chat" }));
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      startConversation(form).catch((error) => renderSystem(error.message));
    });
    return form;
  }

  function buildWidget() {
    const style = el("style", {
      text: `
        .tc-button{position:fixed!important;right:20px;bottom:20px;width:64px;height:64px;border:0;border-radius:50%;background:#0f172a;color:#fff;font:700 13px Arial,sans-serif;box-shadow:0 16px 40px rgba(0,0,0,.28);cursor:pointer;z-index:2147483646;display:flex;align-items:center;justify-content:center;transition:transform .18s ease,opacity .18s ease}
        .tc-button.tc-hidden{opacity:0;pointer-events:none;transform:translateY(10px) scale(.96)}
        .tc-panel{position:fixed;right:20px;bottom:20px;width:min(380px,calc(100vw - 40px));height:560px;max-height:calc(100vh - 40px);display:none;grid-template-rows:auto auto minmax(0,1fr) auto;border:1px solid #d9e0ea;border-radius:8px;background:#fff;box-shadow:0 20px 60px rgba(0,0,0,.24);overflow:hidden;z-index:2147483647;font-family:Arial,sans-serif}
        .tc-panel.tc-open{display:grid}
        .tc-head{grid-row:1;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 14px;background:#0f172a;color:#fff;font-weight:700}
        .tc-head-title{display:flex;align-items:center;gap:9px}
        .tc-dot{width:9px;height:9px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.18)}
        .tc-minimize{width:30px;height:30px;border:0;border-radius:6px;background:rgba(255,255,255,.12);color:#fff;font:700 18px Arial,sans-serif;line-height:1;cursor:pointer}
        .tc-status{grid-row:2;display:none;align-items:center;gap:8px;padding:9px 14px;border-bottom:1px solid #e2e8f0;background:#f8fafc;color:#475569;font:13px Arial,sans-serif}
        .tc-spinner{width:14px;height:14px;border:2px solid #cbd5e1;border-top-color:#0f172a;border-radius:50%;animation:tc-spin .8s linear infinite}
        @keyframes tc-spin{to{transform:rotate(360deg)}}
        .tc-close-chat{display:none;height:40px;border:0;background:#eef2f7;color:#0f172a;border-radius:6px;padding:0 10px;font-size:13px;font-weight:700;white-space:nowrap;cursor:pointer}
        .tc-messages{grid-row:3;min-height:0;padding:14px;overflow:auto;background:#f6f8fb;display:flex;flex-direction:column;gap:8px}
        .tc-message{max-width:82%;padding:9px 11px;border-radius:8px;font-size:14px;line-height:1.35;word-break:break-word}
        .tc-visitor{align-self:flex-end;background:#1d6ff2;color:#fff}
        .tc-owner,.tc-system{align-self:flex-start;background:#fff;color:#1f2937;border:1px solid #d9e0ea}
        .tc-form{grid-row:4;display:none;grid-template-columns:minmax(0,1fr) 62px 82px;align-items:center;gap:8px;padding:10px;border-top:1px solid #d9e0ea;background:#fff}
        .tc-input,.tc-start input,.tc-start textarea{min-width:0;box-sizing:border-box;border:1px solid #c8d1de;border-radius:6px;padding:10px;font:14px Arial,sans-serif}
        .tc-input{height:40px}
        .tc-send,.tc-start button{height:40px;border:0;border-radius:6px;background:#0f172a;color:#fff;padding:0 14px;font-weight:700;white-space:nowrap;cursor:pointer}
        .tc-start{grid-row:3;min-height:0;overflow:auto;display:grid;align-content:start;gap:8px;padding:16px;background:#fff}
        .tc-start label{font-size:13px;font-weight:700;color:#334155}
        .tc-start button{height:40px;margin-top:4px}
        .tc-notice{display:none;border:1px solid #f2c4c4;background:#fff2f2;color:#8a1f1f;border-radius:6px;padding:9px 10px;font-size:13px;line-height:1.35}
        @media (max-width:420px){.tc-panel{right:10px;bottom:10px;width:calc(100vw - 20px);height:calc(100vh - 20px);max-height:none}.tc-form{grid-template-columns:minmax(0,1fr) 56px 74px;gap:6px;padding:8px}.tc-send,.tc-close-chat{font-size:12px;padding:0 8px}}
      `,
    });

    const panel = el("section", { class: "tc-panel", "aria-label": "Live chat" });
    const header = el("div", { class: "tc-head" });
    const titleWrap = el("div", { class: "tc-head-title" });
    titleWrap.appendChild(el("span", { class: "tc-dot" }));
    titleEl = el("span", { text: "Start a Chat" });
    titleWrap.appendChild(titleEl);
    minimizeButtonEl = el("button", { class: "tc-minimize", type: "button", text: "x", "aria-label": "Minimize chat" });
    minimizeButtonEl.addEventListener("click", function () {
      setOpen(false);
    });
    header.appendChild(titleWrap);
    header.appendChild(minimizeButtonEl);
    panel.appendChild(header);

    statusEl = el("div", { class: "tc-status" });
    statusEl.appendChild(el("span", { class: "tc-spinner" }));
    statusTextEl = el("span", { text: "Loading..." });
    statusEl.appendChild(statusTextEl);
    panel.appendChild(statusEl);

    closeButtonEl = el("button", { class: "tc-close-chat", type: "button", text: "End chat" });
    closeButtonEl.addEventListener("click", function () {
      if (closeButtonMode === "new") {
        resetConversation();
        return;
      }

      closeChat().catch((error) => renderSystem(error.message));
    });

    startFormEl = buildStartForm();
    panel.appendChild(startFormEl);

    messagesEl = el("div", { class: "tc-messages" });
    panel.appendChild(messagesEl);

    chatFormEl = el("form", { class: "tc-form" });
    inputEl = el("input", {
      class: "tc-input",
      type: "text",
      placeholder: "Write a message...",
      autocomplete: "off",
    });
    chatFormEl.appendChild(inputEl);
    chatFormEl.appendChild(el("button", { class: "tc-send", type: "submit", text: "Send" }));
    chatFormEl.appendChild(closeButtonEl);
    chatFormEl.addEventListener("submit", function (event) {
      event.preventDefault();
      sendMessage().catch((error) => renderSystem(error.message));
    });
    panel.appendChild(chatFormEl);

    const button = el("button", { class: "tc-button", type: "button", text: "Chat" });
    button.addEventListener("click", function () {
      setOpen(!isOpen);
      if (isOpen) loadMessages().catch((error) => renderSystem(error.message));
    });

    document.head.appendChild(style);
    document.body.appendChild(panel);
    document.body.appendChild(button);
    if (visitorToken) showChatMode();
    else showStartMode();

    window.setInterval(function () {
      if (isOpen && visitorToken) loadMessages().catch(function () {});
    }, 4000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildWidget);
  } else {
    buildWidget();
  }
})();
