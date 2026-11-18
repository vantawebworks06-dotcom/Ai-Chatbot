/*!
 * Velora chat widget
 * Install: <script src="https://YOUR-DOMAIN/widget.js" data-client-id="BUSINESS_ID" defer></script>
 * Renders inside a Shadow DOM so it never inherits or leaks styles on the host page.
 */
(function () {
  "use strict";
  if (window.__veloraWidgetLoaded) return;
  window.__veloraWidgetLoaded = true;

  var script =
    document.currentScript ||
    (function () {
      var all = document.querySelectorAll("script[data-client-id]");
      return all[all.length - 1];
    })();
  if (!script) return;

  var CLIENT_ID = script.getAttribute("data-client-id");
  var API = new URL(script.src, location.href).origin + "/api/widget";
  var STORAGE_KEY = "velora:" + CLIENT_ID;
  if (!CLIENT_ID) {
    console.warn("[Velora] Missing data-client-id on the widget script tag.");
    return;
  }

  // ---------- state ----------
  var state = {
    config: null,
    token: null,
    conversation: null, // { id, status, mode, agent_typing }
    messages: [],
    lastId: 0,
    open: false,
    sending: false,
    unread: 0,
    pollTimer: null,
    lastTypingSent: 0,
  };

  function storageGet() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }
  function storageSet(value) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch (e) {
      /* private mode: session still works until reload */
    }
  }

  function api(method, path, body) {
    var url = API + path;
    var opts = { method: method, headers: {} };
    if (state.token) opts.headers.Authorization = "Bearer " + state.token;
    if (body) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          if (!res.ok) {
            var err = new Error(data.error || "Request failed");
            err.status = res.status;
            throw err;
          }
          return data;
        });
    });
  }

  // ---------- DOM ----------
  var host = document.createElement("div");
  host.setAttribute("data-velora-widget", "");
  host.style.cssText = "position:fixed;z-index:2147483000;bottom:0;right:0;width:0;height:0;";
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function contrastText(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return "#ffffff";
    var n = parseInt(m[1], 16);
    var r = (n >> 16) & 255,
      g = (n >> 8) & 255,
      b = n & 255;
    return 0.299 * r + 0.587 * g + 0.114 * b > 170 ? "#0f172a" : "#ffffff";
  }

  var CSS =
    ":host{all:initial}" +
    "*{box-sizing:border-box;margin:0;padding:0;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}" +
    ".wrap{position:fixed;bottom:20px;display:flex;flex-direction:column;align-items:flex-end;gap:12px}" +
    ".wrap.left{align-items:flex-start}" +
    ".launcher{width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;background:var(--p);color:var(--pt);display:grid;place-items:center;box-shadow:0 8px 24px rgba(15,23,42,.18),0 2px 6px rgba(15,23,42,.12);transition:transform .15s ease,box-shadow .15s ease;position:relative}" +
    ".launcher:hover{transform:translateY(-1px);box-shadow:0 12px 28px rgba(15,23,42,.22)}" +
    ".launcher:focus-visible,.btn:focus-visible,.send:focus-visible,.icon:focus-visible{outline:2px solid var(--p);outline-offset:2px}" +
    ".launcher svg{width:26px;height:26px}" +
    ".badge{position:absolute;top:-2px;right:-2px;min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:#ef4444;color:#fff;font-size:11px;font-weight:600;display:grid;place-items:center;border:2px solid #fff}" +
    ".panel{width:380px;height:min(620px,calc(100vh - 110px));background:#fff;border-radius:16px;box-shadow:0 24px 60px rgba(15,23,42,.18),0 4px 12px rgba(15,23,42,.08);border:1px solid #e5e7eb;display:flex;flex-direction:column;overflow:hidden;opacity:0;transform:translateY(8px) scale(.98);pointer-events:none;transition:opacity .18s ease,transform .18s ease}" +
    ".panel.open{opacity:1;transform:none;pointer-events:auto}" +
    ".head{padding:16px 16px 14px;background:var(--p);color:var(--pt);display:flex;align-items:center;gap:12px}" +
    ".avatar{width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,.18);display:grid;place-items:center;font-weight:600;font-size:15px;flex:none}" +
    ".titles{flex:1;min-width:0}" +
    ".title{font-size:15px;font-weight:600;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".sub{font-size:12px;opacity:.85;display:flex;align-items:center;gap:6px;margin-top:2px}" +
    ".dot{width:7px;height:7px;border-radius:50%;background:#22c55e;flex:none}" +
    ".dot.wait{background:#f59e0b}" +
    ".icon{background:transparent;border:0;color:inherit;cursor:pointer;width:32px;height:32px;border-radius:8px;display:grid;place-items:center;opacity:.9}" +
    ".icon:hover{background:rgba(255,255,255,.15)}" +
    ".icon svg{width:18px;height:18px}" +
    ".body{flex:1;overflow-y:auto;padding:16px;background:#f8fafc;display:flex;flex-direction:column;gap:8px;scroll-behavior:smooth}" +
    ".row{display:flex;flex-direction:column;max-width:85%}" +
    ".row.me{align-self:flex-end;align-items:flex-end}" +
    ".who{font-size:11px;color:#64748b;margin:0 4px 3px;font-weight:500}" +
    ".bubble{padding:10px 13px;border-radius:14px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}" +
    ".them .bubble{background:#fff;color:#0f172a;border:1px solid #e5e7eb;border-top-left-radius:4px}" +
    ".me .bubble{background:var(--p);color:var(--pt);border-top-right-radius:4px}" +
    ".sys{align-self:center;font-size:12px;color:#64748b;background:#eef2f7;padding:5px 10px;border-radius:999px;text-align:center;max-width:90%}" +
    ".typing{display:inline-flex;gap:4px;padding:12px 14px}" +
    ".typing i{width:6px;height:6px;border-radius:50%;background:#94a3b8;animation:vb 1.2s infinite ease-in-out}" +
    ".typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}" +
    "@keyframes vb{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-4px);opacity:1}}" +
    ".actions{padding:8px 12px 0;background:#fff;display:flex;justify-content:center}" +
    ".btn{font-size:12.5px;font-weight:500;color:#334155;background:#fff;border:1px solid #e2e8f0;border-radius:999px;padding:6px 12px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}" +
    ".btn:hover{background:#f8fafc;border-color:#cbd5e1}" +
    ".btn svg{width:14px;height:14px}" +
    ".foot{padding:10px 12px 12px;background:#fff;border-top:1px solid #f1f5f9}" +
    ".composer{display:flex;align-items:flex-end;gap:8px;border:1px solid #e2e8f0;border-radius:12px;padding:6px 6px 6px 12px;transition:border-color .15s,box-shadow .15s}" +
    ".composer:focus-within{border-color:var(--p);box-shadow:0 0 0 3px var(--pr)}" +
    "textarea{flex:1;border:0;outline:0;resize:none;font-size:14px;line-height:1.45;max-height:120px;min-height:22px;padding:6px 0;color:#0f172a;background:transparent}" +
    "textarea::placeholder{color:#94a3b8}" +
    ".send{width:34px;height:34px;border-radius:9px;border:0;background:var(--p);color:var(--pt);cursor:pointer;display:grid;place-items:center;flex:none;transition:opacity .15s}" +
    ".send:disabled{opacity:.4;cursor:default}" +
    ".send svg{width:16px;height:16px}" +
    ".brand{text-align:center;font-size:11px;color:#94a3b8;margin-top:8px}" +
    ".err{font-size:12px;color:#b91c1c;padding:0 4px 6px}" +
    "@media (max-width:480px){.wrap{bottom:16px}.panel{position:fixed;inset:0;width:100vw;height:100%;border-radius:0;border:0}.panel.open~.launcher{display:none}}" +
    "@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}";

  var ICON_CHAT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';
  var ICON_CLOSE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var ICON_DOWN =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  var ICON_SEND =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var ICON_PERSON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';

  var ui = {};

  function build() {
    var c = state.config;
    var style = el("style");
    style.textContent = CSS;
    root.appendChild(style);

    var wrap = el("div", "wrap" + (c.position === "left" ? " left" : ""));
    wrap.style.setProperty("--p", c.primary_color);
    wrap.style.setProperty("--pt", contrastText(c.primary_color));
    wrap.style.setProperty("--pr", c.primary_color + "33");
    if (c.position === "left") {
      host.style.right = "auto";
      host.style.left = "0";
      wrap.style.left = "20px";
    } else {
      wrap.style.right = "20px";
    }

    var panel = el("div", "panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", c.business_name + " chat");

    var head = el("div", "head");
    var avatar = el("div", "avatar", (c.business_name || "?").trim().charAt(0).toUpperCase());
    var titles = el("div", "titles");
    var title = el("div", "title", c.business_name);
    var sub = el("div", "sub");
    var dot = el("span", "dot");
    var subText = el("span", null, "");
    sub.appendChild(dot);
    sub.appendChild(subText);
    titles.appendChild(title);
    titles.appendChild(sub);
    var minimize = el("button", "icon");
    minimize.setAttribute("aria-label", "Minimize chat");
    minimize.innerHTML = ICON_DOWN;
    minimize.onclick = toggle;
    head.appendChild(avatar);
    head.appendChild(titles);
    head.appendChild(minimize);

    var body = el("div", "body");
    body.setAttribute("aria-live", "polite");

    var actions = el("div", "actions");
    var humanBtn = el("button", "btn");
    humanBtn.innerHTML = ICON_PERSON;
    humanBtn.appendChild(document.createTextNode("Talk to a person"));
    humanBtn.onclick = askForHuman;
    actions.appendChild(humanBtn);

    var foot = el("div", "foot");
    var err = el("div", "err");
    err.style.display = "none";
    var composer = el("div", "composer");
    var input = el("textarea");
    input.rows = 1;
    input.placeholder = "Write a message…";
    input.setAttribute("aria-label", "Message");
    input.maxLength = 2000;
    var send = el("button", "send");
    send.setAttribute("aria-label", "Send message");
    send.innerHTML = ICON_SEND;
    send.disabled = true;
    composer.appendChild(input);
    composer.appendChild(send);
    var brand = el("div", "brand", "Powered by Velora");
    foot.appendChild(err);
    foot.appendChild(composer);
    foot.appendChild(brand);

    panel.appendChild(head);
    panel.appendChild(body);
    panel.appendChild(actions);
    panel.appendChild(foot);

    var launcher = el("button", "launcher");
    launcher.setAttribute("aria-label", "Open chat");
    launcher.innerHTML = ICON_CHAT;
    var badge = el("span", "badge");
    badge.style.display = "none";
    launcher.appendChild(badge);
    launcher.onclick = toggle;

    wrap.appendChild(panel);
    wrap.appendChild(launcher);
    root.appendChild(wrap);

    input.addEventListener("input", function () {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
      send.disabled = !input.value.trim() || state.sending;
      notifyTyping();
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    });
    send.onclick = submit;
    panel.addEventListener("keydown", function (e) {
      if (e.key === "Escape") toggle();
    });

    ui = {
      panel: panel,
      body: body,
      input: input,
      send: send,
      launcher: launcher,
      badge: badge,
      subText: subText,
      dot: dot,
      actions: actions,
      humanBtn: humanBtn,
      err: err,
    };
    document.body.appendChild(host);
    render();
  }

  function statusLine() {
    var conv = state.conversation;
    if (conv && conv.status === "closed") return { text: "Conversation ended", wait: false };
    if (conv && conv.mode === "waiting") return { text: "Connecting you to the team…", wait: true };
    if (conv && conv.mode === "human") return { text: "Chatting with the team", wait: false };
    return { text: state.config.bot_name + " · AI assistant", wait: false };
  }

  function senderLabel(m) {
    if (m.sender === "ai") return state.config.bot_name;
    if (m.sender === "agent") return state.config.business_name + " team";
    return null;
  }

  function render() {
    var s = statusLine();
    ui.subText.textContent = s.text;
    ui.dot.className = "dot" + (s.wait ? " wait" : "");

    var conv = state.conversation;
    var showHuman = !conv || (conv.status === "open" && conv.mode === "ai");
    ui.actions.style.display = showHuman ? "flex" : "none";

    var body = ui.body;
    body.textContent = "";

    var welcome = el("div", "row them");
    welcome.appendChild(el("div", "who", state.config.bot_name));
    welcome.appendChild(el("div", "bubble", state.config.welcome_message));
    body.appendChild(welcome);

    var prevSender = null;
    state.messages.forEach(function (m) {
      if (m.sender === "system") {
        body.appendChild(el("div", "sys", m.content));
        prevSender = null;
        return;
      }
      var mine = m.sender === "visitor";
      var row = el("div", "row " + (mine ? "me" : "them"));
      var label = senderLabel(m);
      if (label && prevSender !== m.sender) row.appendChild(el("div", "who", label));
      row.appendChild(el("div", "bubble", m.content));
      body.appendChild(row);
      prevSender = m.sender;
    });

    if (conv && conv.status === "closed") {
      body.appendChild(el("div", "sys", "Send a message to start a new conversation."));
    }

    var typing = state.sending || (conv && conv.agent_typing);
    if (typing) {
      var trow = el("div", "row them");
      var t = el("div", "bubble typing");
      t.appendChild(el("i"));
      t.appendChild(el("i"));
      t.appendChild(el("i"));
      trow.appendChild(t);
      body.appendChild(trow);
    }

    body.scrollTop = body.scrollHeight;
    ui.send.disabled = !ui.input.value.trim() || state.sending;
    ui.badge.style.display = !state.open && state.unread > 0 ? "grid" : "none";
    ui.badge.textContent = String(state.unread);
  }

  function showError(text) {
    ui.err.textContent = text || "";
    ui.err.style.display = text ? "block" : "none";
  }

  function addMessages(list) {
    var added = 0;
    (list || []).forEach(function (m) {
      if (m.id > state.lastId) {
        state.messages.push(m);
        state.lastId = m.id;
        if (m.sender !== "visitor") added++;
      }
    });
    if (added && !state.open) state.unread += added;
    return added;
  }

  function toggle() {
    state.open = !state.open;
    ui.panel.classList.toggle("open", state.open);
    ui.launcher.setAttribute("aria-label", state.open ? "Close chat" : "Open chat");
    ui.launcher.innerHTML = state.open ? ICON_CLOSE : ICON_CHAT;
    ui.launcher.appendChild(ui.badge);
    if (state.open) {
      state.unread = 0;
      setTimeout(function () {
        ui.input.focus();
      }, 50);
    }
    render();
    schedulePoll(0);
  }

  function submit() {
    var text = ui.input.value.trim();
    if (!text || state.sending) return;
    showError("");
    state.sending = true;
    // Optimistic bubble; replaced by the server copy below.
    var temp = { id: Number.MAX_SAFE_INTEGER, sender: "visitor", content: text, temp: true };
    state.messages.push(temp);
    ui.input.value = "";
    ui.input.style.height = "auto";
    render();

    var conv = state.conversation;
    api("POST", "/messages", {
      client_id: CLIENT_ID,
      conversation_id: conv && conv.status === "open" ? conv.id : null,
      content: text,
      page_url: location.href,
    })
      .then(function (data) {
        state.messages = state.messages.filter(function (m) {
          return !m.temp;
        });
        if (!conv || conv.id !== data.conversation.id) {
          state.messages = [];
          state.lastId = 0;
        }
        state.conversation = data.conversation;
        addMessages(data.messages);
      })
      .catch(function (e) {
        state.messages = state.messages.filter(function (m) {
          return !m.temp;
        });
        ui.input.value = text;
        showError(e.message || "Couldn't send. Please try again.");
      })
      .then(function () {
        state.sending = false;
        render();
        schedulePoll();
      });
  }

  function askForHuman() {
    var conv = state.conversation;
    if (!conv || conv.status !== "open") {
      // No conversation yet: start one with an explicit request.
      ui.input.value = "I'd like to talk to a person, please.";
      submit();
      return;
    }
    ui.humanBtn.disabled = true;
    api("POST", "/handoff", { client_id: CLIENT_ID, conversation_id: conv.id })
      .then(function (data) {
        state.conversation = data.conversation;
        addMessages(data.messages);
      })
      .catch(function (e) {
        showError(e.message);
      })
      .then(function () {
        ui.humanBtn.disabled = false;
        render();
        schedulePoll();
      });
  }

  function notifyTyping() {
    var conv = state.conversation;
    if (!conv || conv.mode === "ai" || conv.status !== "open") return;
    var now = Date.now();
    if (now - state.lastTypingSent < 3000) return;
    state.lastTypingSent = now;
    api("POST", "/typing", { client_id: CLIENT_ID, conversation_id: conv.id }).catch(function () {});
  }

  // Poll faster while a person is involved, slower when the panel is closed.
  function pollDelay() {
    var conv = state.conversation;
    if (!conv) return null;
    if (document.hidden) return 15000;
    if (!state.open) return conv.mode === "ai" ? 15000 : 6000;
    if (conv.mode !== "ai") return 2000;
    return 5000;
  }

  function schedulePoll(delay) {
    clearTimeout(state.pollTimer);
    var d = delay != null ? delay : pollDelay();
    if (d == null || !state.conversation) return;
    state.pollTimer = setTimeout(poll, d);
  }

  function poll() {
    var conv = state.conversation;
    if (!conv || state.sending) return schedulePoll();
    api(
      "GET",
      "/messages?client_id=" +
        encodeURIComponent(CLIENT_ID) +
        "&conversation_id=" +
        encodeURIComponent(conv.id) +
        "&after=" +
        state.lastId,
    )
      .then(function (data) {
        var changed =
          addMessages(data.messages) ||
          data.conversation.mode !== conv.mode ||
          data.conversation.status !== conv.status ||
          data.conversation.agent_typing !== conv.agent_typing;
        state.conversation = data.conversation;
        if (changed) render();
      })
      .catch(function () {
        /* transient network error: try again later */
      })
      .then(function () {
        schedulePoll();
      });
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) schedulePoll(0);
  });

  function start() {
    var saved = storageGet();
    state.token = saved.token || null;
    api("POST", "/session", { client_id: CLIENT_ID, visitor_token: state.token })
      .then(function (data) {
        if (!data.enabled) return;
        state.config = data.config;
        state.token = data.visitor_token;
        storageSet({ token: data.visitor_token });
        state.conversation = data.conversation;
        addMessages(data.messages);
        state.unread = 0;
        build();
        schedulePoll();
      })
      .catch(function (e) {
        console.warn("[Velora] Chat widget could not start:", e.message);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
