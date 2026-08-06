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
  let titleEl;
  let noticeEl;
  let closeButtonMode = "close";

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

  function renderSystem(text) {
    if (noticeEl) {
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
    closeButtonEl.textContent = "Close chat";
    closeButtonMode = "close";
    inputEl.disabled = false;
    inputEl.placeholder = "Write a message...";
    titleEl.textContent = `Live Chat - ${publicKey}`;
  }

  function showStartMode() {
    startFormEl.style.display = "grid";
    messagesEl.style.display = "none";
    chatFormEl.style.display = "none";
    closeButtonEl.style.display = "none";
    titleEl.textContent = "Start a Chat";
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
  }

  async function loadMessages() {
    if (!visitorToken) {
      showStartMode();
      return;
    }

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
  }

  async function sendMessage() {
    const body = inputEl.value.trim();
    if (!body || !visitorToken) return;

    inputEl.value = "";
    await api(`/widget/conversations/${visitorToken}/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
    await loadMessages();
  }

  async function closeChat() {
    if (!visitorToken) return;

    await api(`/widget/conversations/${visitorToken}/close`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    await loadMessages();
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
        .tc-button{position:fixed!important;right:20px;bottom:20px;width:64px;height:64px;border:0;border-radius:50%;background:#0f172a;color:#fff;font:700 13px Arial,sans-serif;box-shadow:0 16px 40px rgba(0,0,0,.28);cursor:pointer;z-index:2147483646;display:flex;align-items:center;justify-content:center}
        .tc-panel{position:fixed;right:20px;bottom:96px;width:min(380px,calc(100vw - 40px));height:520px;max-height:calc(100vh - 128px);display:none;grid-template-rows:auto 1fr auto;border:1px solid #d9e0ea;border-radius:8px;background:#fff;box-shadow:0 20px 60px rgba(0,0,0,.24);overflow:hidden;z-index:2147483647;font-family:Arial,sans-serif}
        .tc-panel.tc-open{display:grid}
        .tc-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;background:#0f172a;color:#fff;font-weight:700}
        .tc-close-chat{display:none;border:1px solid rgba(255,255,255,.28);background:transparent;color:#fff;border-radius:6px;padding:6px 8px;font-size:12px;cursor:pointer}
        .tc-messages{padding:14px;overflow:auto;background:#f6f8fb;display:flex;flex-direction:column;gap:8px}
        .tc-message{max-width:82%;padding:9px 11px;border-radius:8px;font-size:14px;line-height:1.35;word-break:break-word}
        .tc-visitor{align-self:flex-end;background:#1d6ff2;color:#fff}
        .tc-owner,.tc-system{align-self:flex-start;background:#fff;color:#1f2937;border:1px solid #d9e0ea}
        .tc-form{display:none;grid-template-columns:1fr auto;gap:8px;padding:10px;border-top:1px solid #d9e0ea}
        .tc-input,.tc-start input,.tc-start textarea{min-width:0;border:1px solid #c8d1de;border-radius:6px;padding:10px;font:14px Arial,sans-serif}
        .tc-send,.tc-start button{border:0;border-radius:6px;background:#0f172a;color:#fff;padding:0 14px;font-weight:700;cursor:pointer}
        .tc-start{display:grid;align-content:start;gap:8px;padding:16px;background:#fff}
        .tc-start label{font-size:13px;font-weight:700;color:#334155}
        .tc-start button{height:40px;margin-top:4px}
        .tc-notice{display:none;border:1px solid #f2c4c4;background:#fff2f2;color:#8a1f1f;border-radius:6px;padding:9px 10px;font-size:13px;line-height:1.35}
      `,
    });

    const panel = el("section", { class: "tc-panel", "aria-label": "Live chat" });
    const header = el("div", { class: "tc-head" });
    titleEl = el("span", { text: "Start a Chat" });
    closeButtonEl = el("button", { class: "tc-close-chat", type: "button", text: "Close chat" });
    closeButtonEl.addEventListener("click", function () {
      if (closeButtonMode === "new") {
        resetConversation();
        return;
      }

      closeChat().catch((error) => renderSystem(error.message));
    });
    header.appendChild(titleEl);
    header.appendChild(closeButtonEl);
    panel.appendChild(header);

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
    chatFormEl.addEventListener("submit", function (event) {
      event.preventDefault();
      sendMessage().catch((error) => renderSystem(error.message));
    });
    panel.appendChild(chatFormEl);

    const button = el("button", { class: "tc-button", type: "button", text: "Chat" });
    button.addEventListener("click", function () {
      isOpen = !isOpen;
      panel.classList.toggle("tc-open", isOpen);
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
