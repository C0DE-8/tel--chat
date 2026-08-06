(function () {
  const currentScript = document.currentScript;
  const apiBase = (currentScript?.dataset.apiBase || window.location.origin).replace(/\/+$/, "");
  const publicKey = currentScript?.dataset.publicKey || "habibi";
  const storageKey = `tel_chat_${publicKey}`;

  let visitorToken = window.localStorage.getItem(storageKey);
  let isOpen = false;
  let messagesEl;
  let inputEl;

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

  async function ensureConversation() {
    if (visitorToken) return visitorToken;

    const payload = await api("/widget/conversations", {
      method: "POST",
      body: JSON.stringify({
        publicKey,
        visitorName: "Website visitor",
        visitorEmail: "",
      }),
    });

    visitorToken = payload.conversation.visitorToken;
    window.localStorage.setItem(storageKey, visitorToken);
    return visitorToken;
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

  async function loadMessages() {
    if (!visitorToken) return;
    const payload = await api(`/widget/conversations/${visitorToken}/messages`);
    renderMessages(payload.messages);
  }

  async function sendMessage() {
    const body = inputEl.value.trim();
    if (!body) return;

    inputEl.value = "";
    const token = await ensureConversation();
    await api(`/widget/conversations/${token}/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
    await loadMessages();
  }

  function buildWidget() {
    const style = el("style", {
      text: `
        .tc-button{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border:0;border-radius:50%;background:#172033;color:#fff;font:700 14px Arial;box-shadow:0 12px 30px rgba(0,0,0,.22);cursor:pointer;z-index:99998}
        .tc-panel{position:fixed;right:20px;bottom:88px;width:min(360px,calc(100vw - 40px));height:480px;max-height:calc(100vh - 120px);display:none;grid-template-rows:auto 1fr auto;border:1px solid #d9e0ea;border-radius:8px;background:#fff;box-shadow:0 18px 50px rgba(0,0,0,.2);overflow:hidden;z-index:99999;font-family:Arial,sans-serif}
        .tc-panel.tc-open{display:grid}
        .tc-head{padding:14px 16px;background:#172033;color:#fff;font-weight:700}
        .tc-messages{padding:14px;overflow:auto;background:#f6f8fb;display:flex;flex-direction:column;gap:8px}
        .tc-message{max-width:82%;padding:9px 11px;border-radius:8px;font-size:14px;line-height:1.35;word-break:break-word}
        .tc-visitor{align-self:flex-end;background:#1d6ff2;color:#fff}
        .tc-owner,.tc-system{align-self:flex-start;background:#fff;color:#1f2937;border:1px solid #d9e0ea}
        .tc-form{display:grid;grid-template-columns:1fr auto;gap:8px;padding:10px;border-top:1px solid #d9e0ea}
        .tc-input{min-width:0;border:1px solid #c8d1de;border-radius:6px;padding:10px;font-size:14px}
        .tc-send{border:0;border-radius:6px;background:#172033;color:#fff;padding:0 14px;font-weight:700;cursor:pointer}
      `,
    });

    const panel = el("section", { class: "tc-panel", "aria-label": "Live chat" });
    panel.appendChild(el("div", { class: "tc-head", text: "Live Chat" }));
    messagesEl = el("div", { class: "tc-messages" });
    panel.appendChild(messagesEl);

    const form = el("form", { class: "tc-form" });
    inputEl = el("input", {
      class: "tc-input",
      type: "text",
      placeholder: "Write a message...",
      autocomplete: "off",
    });
    form.appendChild(inputEl);
    form.appendChild(el("button", { class: "tc-send", type: "submit", text: "Send" }));
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      sendMessage().catch((error) => renderMessages([{ sender: "system", body: error.message }]));
    });
    panel.appendChild(form);

    const button = el("button", { class: "tc-button", type: "button", text: "Chat" });
    button.addEventListener("click", function () {
      isOpen = !isOpen;
      panel.classList.toggle("tc-open", isOpen);
      if (isOpen) loadMessages().catch(function () {});
    });

    document.head.appendChild(style);
    document.body.appendChild(panel);
    document.body.appendChild(button);

    window.setInterval(function () {
      if (isOpen) loadMessages().catch(function () {});
    }, 4000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildWidget);
  } else {
    buildWidget();
  }
})();
