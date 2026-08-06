(function () {
  function mount(options) {
    if (document.getElementById("tg-chat-root")) return;

    const state = {
      ownerKey: options.ownerKey,
      baseUrl: options.baseUrl || "",
      conversation: null,
      poller: null
    };

    const root = document.createElement("div");
    root.id = "tg-chat-root";
    root.innerHTML = `
      <button class="tg-chat-launch" aria-label="Open chat">Chat</button>
      <section class="tg-chat-panel" aria-live="polite">
        <header>
          <strong>Live chat</strong>
          <button class="tg-chat-close" aria-label="Close chat">x</button>
        </header>
        <form class="tg-chat-start">
          <input name="name" placeholder="Name" autocomplete="name" required />
          <input name="email" type="email" placeholder="Email" autocomplete="email" required />
          <button type="submit">Start chat</button>
        </form>
        <div class="tg-chat-thread" hidden></div>
        <form class="tg-chat-send" hidden>
          <input name="body" placeholder="Write a message" autocomplete="off" required />
          <button type="submit">Send</button>
        </form>
        <button class="tg-chat-end" hidden>End chat</button>
      </section>
    `;

    const style = document.createElement("style");
    style.textContent = `
      #tg-chat-root{position:fixed;right:20px;bottom:20px;z-index:2147483647;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172026}
      .tg-chat-launch{width:64px;height:64px;border:0;border-radius:999px;background:#0b7cff;color:#fff;font-weight:700;box-shadow:0 14px 34px rgba(11,124,255,.3);cursor:pointer}
      .tg-chat-panel{display:none;width:min(360px,calc(100vw - 32px));height:520px;max-height:calc(100vh - 112px);background:#fff;border:1px solid #d7dee7;border-radius:8px;box-shadow:0 20px 55px rgba(15,23,42,.2);overflow:hidden}
      .tg-chat-panel[data-open=true]{display:flex;flex-direction:column}
      .tg-chat-panel header{height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;background:#172026;color:#fff}
      .tg-chat-close{border:0;background:transparent;color:#fff;font-size:20px;cursor:pointer}
      .tg-chat-start,.tg-chat-send{display:grid;gap:10px;padding:14px;border-top:1px solid #e6ebf0}
      .tg-chat-start{border-top:0}
      .tg-chat-start input,.tg-chat-send input{height:42px;border:1px solid #cfd8e3;border-radius:6px;padding:0 12px;font:inherit}
      .tg-chat-start button,.tg-chat-send button,.tg-chat-end{height:42px;border:0;border-radius:6px;background:#0b7cff;color:#fff;font-weight:700;cursor:pointer}
      .tg-chat-thread{flex:1;overflow:auto;padding:14px;background:#f5f7fb;display:flex;flex-direction:column;gap:8px}
      .tg-chat-msg{max-width:82%;padding:9px 11px;border-radius:8px;background:#fff;border:1px solid #e2e8f0;font-size:14px;line-height:1.35;overflow-wrap:anywhere}
      .tg-chat-msg[data-sender=visitor]{align-self:flex-end;background:#0b7cff;color:#fff;border-color:#0b7cff}
      .tg-chat-msg[data-sender=owner]{align-self:flex-start}
      .tg-chat-msg[data-sender=system]{align-self:center;background:transparent;border:0;color:#627084;font-size:12px}
      .tg-chat-end{margin:0 14px 14px;background:#172026}
      @media (max-width:480px){#tg-chat-root{right:12px;bottom:12px}.tg-chat-panel{height:calc(100vh - 92px)}}
    `;
    document.head.appendChild(style);
    document.body.appendChild(root);

    const panel = root.querySelector(".tg-chat-panel");
    const launch = root.querySelector(".tg-chat-launch");
    const closeButton = root.querySelector(".tg-chat-close");
    const startForm = root.querySelector(".tg-chat-start");
    const sendForm = root.querySelector(".tg-chat-send");
    const thread = root.querySelector(".tg-chat-thread");
    const endButton = root.querySelector(".tg-chat-end");

    function request(path, init) {
      return fetch(state.baseUrl + path, {
        headers: { "content-type": "application/json" },
        ...init
      }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Request failed");
        return data;
      });
    }

    function renderMessages(messages) {
      thread.innerHTML = messages.map((message) => (
        `<div class="tg-chat-msg" data-sender="${message.sender}">${escapeHtml(message.body)}</div>`
      )).join("");
      thread.scrollTop = thread.scrollHeight;
    }

    async function refresh() {
      if (!state.conversation) return;
      const data = await request(`/api/conversations/${state.conversation.id}/messages?token=${state.conversation.visitorToken}`);
      renderMessages(data.messages);
      if (data.status === "closed") {
        sendForm.hidden = true;
        endButton.hidden = true;
        clearInterval(state.poller);
      }
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[char]));
    }

    launch.addEventListener("click", () => {
      panel.dataset.open = "true";
      launch.hidden = true;
    });

    closeButton.addEventListener("click", () => {
      panel.dataset.open = "false";
      launch.hidden = false;
    });

    startForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(startForm);
      const data = await request("/api/conversations", {
        method: "POST",
        body: JSON.stringify({
          ownerKey: state.ownerKey,
          name: form.get("name"),
          email: form.get("email")
        })
      });
      state.conversation = data.conversation;
      startForm.hidden = true;
      thread.hidden = false;
      sendForm.hidden = false;
      endButton.hidden = false;
      await refresh();
      state.poller = setInterval(refresh, 2500);
    });

    sendForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = sendForm.elements.body;
      const body = input.value.trim();
      if (!body || !state.conversation) return;
      input.value = "";
      await request(`/api/conversations/${state.conversation.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ token: state.conversation.visitorToken, body })
      });
      await refresh();
    });

    endButton.addEventListener("click", async () => {
      if (!state.conversation) return;
      await request(`/api/conversations/${state.conversation.id}/close`, {
        method: "POST",
        body: JSON.stringify({ token: state.conversation.visitorToken })
      });
      await refresh();
    });
  }

  window.TelegramChatWidget = { mount };
})();
