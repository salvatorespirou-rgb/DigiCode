/* ============================================================
   DigiCode — live chat widget for site visitors.

   The visitor is never signed in, so the whole thing runs through
   the token-scoped RPCs in supabase/017_visitor_chat.sql. The token
   lives in localStorage; it is the only handle on the conversation,
   which is why clearing site data starts a fresh one.

   Nothing here touches the chats/projects tables the portal uses.
   ============================================================ */
(function () {
  "use strict";

  // The portal is where we answer these from — no point offering it there.
  if (/portal\.html$/i.test(location.pathname)) return;

  // Talks to the four RPCs over plain REST rather than pulling the Supabase
  // SDK onto every page of the site — that would be ~120KB on pages that
  // otherwise need no JS at all. These two values mirror js/supabase-client.js;
  // the anon key is public by design and is already served on the sign-in page.
  var SB_URL = "https://phlmnlildwkkichlbtoy.supabase.co";
  var SB_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBobG1ubGlsZHdra2ljaGxidG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1NzQ1ODksImV4cCI6MjEwMzE1MDU4OX0.5butaPl8qJGNT4eenhE7pFRAVw83i0g4xbeITIzUjW4";

  async function rpc(name, args) {
    var res = await fetch(SB_URL + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: "Bearer " + SB_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    var payload = null;
    try { payload = await res.json(); } catch (e) { payload = null; }
    if (!res.ok) {
      throw new Error((payload && (payload.message || payload.hint)) || "request failed");
    }
    return payload;
  }

  var TOKEN_KEY = "digicodeChatToken";
  var SEEN_KEY = "digicodeChatSeen";
  var OPEN_POLL = 4000;      // actively chatting
  var SLOW_POLL = 12000;     // open but quiet for a while
  var IDLE_POLL = 25000;     // minimised
  var QUIET_AFTER = 120000;  // how long counts as "quiet"

  var token = null;
  var lastId = 0;
  var isOpen = false;
  var pollTimer = null;
  var messages = [];
  var sending = false;
  var lastActivity = Date.now();

  try { token = localStorage.getItem(TOKEN_KEY); } catch (e) { token = null; }

  /* ---------- markup ---------- */

  var root = document.createElement("div");
  root.className = "dc-chat";
  root.innerHTML =
    '<button type="button" class="dc-chat-launcher" id="dcChatLauncher" aria-expanded="false" aria-label="Chat with a DigiCode developer">' +
      '<svg viewBox="0 0 24 24" class="dc-chat-icon-open" aria-hidden="true">' +
        '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.3 9.3 0 0 1-2.8-.4L4 21l1.4-4.1A8.2 8.2 0 0 1 3.6 11.5 8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z" ' +
              'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>' +
        '<circle cx="8.5" cy="11.5" r="1.1" fill="currentColor"/>' +
        '<circle cx="12" cy="11.5" r="1.1" fill="currentColor"/>' +
        '<circle cx="15.5" cy="11.5" r="1.1" fill="currentColor"/>' +
      "</svg>" +
      '<svg viewBox="0 0 24 24" class="dc-chat-icon-close" aria-hidden="true">' +
        '<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
      "</svg>" +
      '<span class="dc-chat-dot" id="dcChatDot" hidden></span>' +
    "</button>" +
    '<section class="dc-chat-panel" id="dcChatPanel" hidden aria-label="Chat with a DigiCode developer">' +
      '<header class="dc-chat-head">' +
        '<div class="dc-chat-head-mark" aria-hidden="true">' +
          '<img src="assets/images/digicode-logo-transparent.png" alt="" />' +
        "</div>" +
        "<div>" +
          "<strong>Chat with a DigiCode Developer</strong>" +
          '<span id="dcChatStatus">We reply within minutes</span>' +
        "</div>" +
        '<button type="button" class="dc-chat-min" id="dcChatMin" aria-label="Minimise chat">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>' +
        "</button>" +
      "</header>" +
      '<div class="dc-chat-log" id="dcChatLog" role="log" aria-live="polite"></div>' +
      '<form class="dc-chat-form" id="dcChatForm">' +
        '<div class="dc-chat-identity" id="dcChatIdentity">' +
          '<input type="text" id="dcChatName" placeholder="Your name" autocomplete="name" maxlength="80" />' +
          '<input type="email" id="dcChatEmail" placeholder="Email (so we can reply)" autocomplete="email" maxlength="160" />' +
        "</div>" +
        '<div class="dc-chat-send-row">' +
          '<textarea id="dcChatInput" placeholder="Type your message…" rows="1" maxlength="2000"></textarea>' +
          '<button type="submit" class="dc-chat-send" id="dcChatSend" aria-label="Send message">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12 4 4l3 8-3 8z" fill="currentColor"/></svg>' +
          "</button>" +
        "</div>" +
        '<p class="dc-chat-note" id="dcChatNote">Leave an email and we\'ll reply there too if you\'ve gone.</p>' +
      "</form>" +
    "</section>";
  document.body.appendChild(root);

  var launcher = root.querySelector("#dcChatLauncher");
  var panel = root.querySelector("#dcChatPanel");
  var logEl = root.querySelector("#dcChatLog");
  var form = root.querySelector("#dcChatForm");
  var input = root.querySelector("#dcChatInput");
  var nameEl = root.querySelector("#dcChatName");
  var emailEl = root.querySelector("#dcChatEmail");
  var identityEl = root.querySelector("#dcChatIdentity");
  var dot = root.querySelector("#dcChatDot");
  var noteEl = root.querySelector("#dcChatNote");

  // Nested pages (services/*.html, Portfolio/**) have to climb back to the root
  // for the logo. On GitHub Pages the first path segment is the repo name.
  var dirDepth = location.pathname.replace(/\/[^/]*$/, "/").split("/").filter(Boolean).length;
  var repoBase = location.hostname.indexOf("github.io") !== -1 ? 1 : 0;
  var up = Math.max(0, dirDepth - repoBase);
  root.querySelector(".dc-chat-head-mark img").src =
    new Array(up + 1).join("../") + "assets/images/digicode-logo-transparent.png";

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function timeLabel(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  /* ---------- rendering ---------- */

  function render() {
    if (!messages.length) {
      logEl.innerHTML =
        '<div class="dc-chat-intro">' +
          "<p><strong>Hi — thanks for stopping by.</strong></p>" +
          "<p>Ask us anything about a build, a price, or a project you've already got running. " +
          "A real person answers these, so leave an email and we'll come back to you either way.</p>" +
        "</div>";
      return;
    }
    logEl.innerHTML = messages
      .map(function (m) {
        var mine = m.sender === "visitor";
        return (
          '<div class="dc-msg ' + (mine ? "dc-msg-mine" : "dc-msg-them") + '">' +
            '<div class="dc-msg-bubble">' + escapeHtml(m.body) + "</div>" +
            '<span class="dc-msg-meta">' +
              escapeHtml(mine ? "You" : m.sender_name || "DigiCode") + " · " + timeLabel(m.created_at) +
            "</span>" +
          "</div>"
        );
      })
      .join("");
    logEl.scrollTop = logEl.scrollHeight;
  }

  function markSeen() {
    try { localStorage.setItem(SEEN_KEY, String(lastId)); } catch (e) { /* private mode */ }
    dot.hidden = true;
  }

  function refreshUnread() {
    var seen = 0;
    try { seen = parseInt(localStorage.getItem(SEEN_KEY) || "0", 10) || 0; } catch (e) { seen = 0; }
    var unread = messages.some(function (m) { return m.sender === "dev" && m.id > seen; });
    dot.hidden = !unread || isOpen;
  }

  /* ---------- data ---------- */

  function resetConversation() {
    token = null;
    lastId = 0;
    messages = [];
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(SEEN_KEY);
    } catch (e) { /* private mode */ }
    identityEl.hidden = false;
    render();
  }

  async function poll() {
    if (!token) return;
    try {
      var rows = (await rpc("visitor_chat_poll", { p_token: token, p_after: lastId })) || [];
      if (rows.length) {
        messages = messages.concat(rows);
        lastId = rows[rows.length - 1].id;
        lastActivity = Date.now();
        if (isOpen) { render(); markSeen(); } else { refreshUnread(); }
      }
    } catch (e) {
      // A token that no longer resolves shouldn't wedge the widget — drop it
      // and let the next message open a fresh conversation.
      if (/unknown conversation/i.test(e.message || "")) resetConversation();
    }
  }

  function schedulePoll() {
    clearTimeout(pollTimer);
    if (!token) return;
    var wait = !isOpen
      ? IDLE_POLL
      : Date.now() - lastActivity < QUIET_AFTER
      ? OPEN_POLL
      : SLOW_POLL;
    pollTimer = setTimeout(async function () {
      if (!document.hidden) await poll();
      schedulePoll();
    }, wait);
  }

  async function ensureConversation() {
    if (token) return token;
    token = await rpc("visitor_chat_start", {
      p_name: nameEl.value.trim() || null,
      p_email: emailEl.value.trim() || null,
      p_page: location.pathname.replace(/^.*\//, "") || "home",
    });
    try { localStorage.setItem(TOKEN_KEY, token); } catch (e) { /* private mode */ }
    return token;
  }

  async function send(text) {
    sending = true;
    lastActivity = Date.now();
    // Show it straight away; the poll reconciles against the stored rows.
    messages.push({ id: -Date.now(), sender: "visitor", body: text, created_at: new Date().toISOString() });
    render();

    try {
      await ensureConversation();
      if (nameEl.value.trim() || emailEl.value.trim()) {
        await rpc("visitor_chat_identify", {
          p_token: token,
          p_name: nameEl.value.trim() || null,
          p_email: emailEl.value.trim() || null,
        });
        identityEl.hidden = true;
      }
      await rpc("visitor_chat_send", { p_token: token, p_body: text });

      messages = messages.filter(function (m) { return m.id > 0; });
      await poll();
      render();
      schedulePoll();
      noteEl.textContent = "Leave an email and we'll reply there too if you've gone.";
      noteEl.classList.remove("is-error");
    } catch (e) {
      messages = messages.filter(function (m) { return m.id > 0; });
      render();
      noteEl.textContent = /slow down/i.test(e.message || "")
        ? "That's a lot of messages at once — give it a second."
        : "That didn't send. Check your connection and try again.";
      noteEl.classList.add("is-error");
    } finally {
      sending = false;
    }
  }

  /* ---------- wiring ---------- */

  function setOpen(open) {
    isOpen = open;
    root.classList.toggle("is-open", open);
    if (open) {
      panel.classList.remove("is-closing");
      panel.hidden = false;
    } else {
      // Let it visibly collapse back into the bubble rather than vanish.
      panel.classList.add("is-closing");
      setTimeout(function () {
        if (!isOpen) {
          panel.hidden = true;
          panel.classList.remove("is-closing");
        }
      }, 200);
    }
    launcher.setAttribute("aria-expanded", String(open));
    if (open) {
      markSeen();
      render();
      poll();
      setTimeout(function () { input.focus(); }, 220);
    }
    schedulePoll();
  }

  launcher.addEventListener("click", function () { setOpen(!isOpen); });
  root.querySelector("#dcChatMin").addEventListener("click", function () { setOpen(false); });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isOpen) setOpen(false);
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || sending) return;
    input.value = "";
    input.style.height = "auto";
    send(text);
  });

  // Enter sends, Shift+Enter is a new line — what people expect from a chat.
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (form.requestSubmit) form.requestSubmit();
      else form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    }
  });

  input.addEventListener("input", function () {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });

  // Returning visitor: pull the thread so the unread dot is right before they open it.
  if (token) {
    identityEl.hidden = true;
    poll().then(function () { refreshUnread(); schedulePoll(); });
  } else {
    render();
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && token) poll();
  });
})();
