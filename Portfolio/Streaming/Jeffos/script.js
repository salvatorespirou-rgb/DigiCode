/* ============================================================
   JEFFOS concept — simulated stream activity.
   Everything here is fake by design: the chat, the gifts and the
   counters exist to show what an independent streaming page feels
   like when it's running. No network calls, no storage.
   ============================================================ */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Gift catalogue (mirrors the shop markup) ---------- */
  var GIFTS = {
    pup:     { name: "Pixel Pup",      price: 0.5, symbol: "giftPup",     rarity: "common" },
    bee:     { name: "Bitbee",         price: 1,   symbol: "giftBee",     rarity: "common" },
    moth:    { name: "Neon Moth",      price: 3,   symbol: "giftMoth",    rarity: "rare" },
    cat:     { name: "Glitch Cat",     price: 7,   symbol: "giftCat",     rarity: "rare" },
    wolf:    { name: "Void Wolf",      price: 15,  symbol: "giftWolf",    rarity: "epic" },
    phoenix: { name: "Chrome Phoenix", price: 35,  symbol: "giftPhoenix", rarity: "epic" },
    kraken:  { name: "Star Kraken",    price: 75,  symbol: "giftKraken",  rarity: "legendary" },
    titan:   { name: "Galaxy Titan",   price: 150, symbol: "giftTitan",   rarity: "mythic" }
  };

  /* ---------- Chat crowd ---------- */
  var NAME_COLORS = ["#7df0ff", "#a06bff", "#ff5ea8", "#5ff2c4", "#ffd36e", "#ff9b5e", "#8ab4ff", "#c4f26b"];

  var CHATTERS = [
    { n: "ZEROFRAME",   b: "top" }, { n: "mochi_wav",   b: "sub" },
    { n: "Halcyon_TV",  b: "mod" }, { n: "bitrot",      b: "vip" },
    { n: "sundown.exe", b: "sub" }, { n: "Kestrel",     b: null },
    { n: "nullpointer", b: "sub" }, { n: "Vex",         b: "mod" },
    { n: "papercrane",  b: null },  { n: "OrbitDecay",  b: "vip" },
    { n: "lowpoly_lu",  b: "sub" }, { n: "grimwave",    b: null },
    { n: "Saffron",     b: null },  { n: "hexbloom",    b: "sub" },
    { n: "quietstatic", b: null },  { n: "AceOfVoid",   b: "vip" }
  ];

  var LINES = [
    "that rotation was clean", "JEFFOS ACTUALLY COOKED", "how is he still alive",
    "chat we're so back", "sens settings pls", "third clutch this stream",
    "the aim is unreal today", "no way that landed", "up 40 points already",
    "first time here, this is sick", "the site is so much smoother than twitch ngl",
    "W stream", "one more game one more game", "GG", "he's not even sweating",
    "that peek was criminal", "queue up duos after?", "audio is perfect btw",
    "top 500 tonight, calling it", "brb making coffee, don't clutch without me",
    "the overlay goes hard", "goal is almost there!!", "who else is here from the discord",
    "5 hours in and still cooking", "did anyone clip that", "chat behave",
    "new sub! finally", "my man deserves the rig upgrade"
  ];

  var GIFTERS = ["ZEROFRAME", "mochi_wav", "bitrot", "OrbitDecay", "Halcyon_TV",
                 "hexbloom", "AceOfVoid", "lowpoly_lu", "sundown.exe", "Vex"];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function colorFor(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) { h = (h * 31 + name.charCodeAt(i)) >>> 0; }
    return NAME_COLORS[h % NAME_COLORS.length];
  }

  var log = document.getElementById("nkChatLog");

  function atBottom() {
    return log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  }

  function push(node) {
    var stick = atBottom();
    log.appendChild(node);
    // Keep the DOM from growing forever on a long-lived page.
    while (log.children.length > 90) { log.removeChild(log.firstChild); }
    if (stick) { log.scrollTop = log.scrollHeight; }
  }

  function badgeHtml(kind) {
    if (!kind) return "";
    var labels = { mod: "MOD", sub: "SUB", vip: "VIP", top: "TOP 1" };
    return '<span class="nk-badge b-' + kind + '">' + labels[kind] + "</span>";
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function addMessage(user, badge, text) {
    var el = document.createElement("div");
    el.className = "nk-msg";
    el.innerHTML = badgeHtml(badge) +
      '<span class="nk-msg-user" style="color:' + colorFor(user) + '">' + escapeHtml(user) + "</span>" +
      '<span class="nk-msg-body">: ' + escapeHtml(text) + "</span>";
    push(el);
  }

  function addGiftMessage(user, gift) {
    var el = document.createElement("div");
    el.className = "nk-msg nk-msg-gift" + (gift.rarity === "mythic" ? " is-mythic" : "");
    el.innerHTML =
      '<svg aria-hidden="true"><use href="#' + gift.symbol + '"/></svg>' +
      "<div><b style=\"color:" + colorFor(user) + '">' + escapeHtml(user) + "</b> " +
      "sent <b>" + gift.name + "</b><br><span class=\"nk-msg-body\">$" + gift.price.toFixed(2) + " · 100% to JEFFOS</span></div>";
    push(el);
  }

  /* ---------- Gift alert over the video ---------- */
  var slot = document.getElementById("nkAlertSlot");

  function showAlert(user, gift) {
    var el = document.createElement("div");
    el.className = "nk-alert" + (gift.rarity === "mythic" ? " is-mythic" : "");
    el.innerHTML =
      '<svg aria-hidden="true" viewBox="0 0 64 64"><use href="#' + gift.symbol + '"/></svg>' +
      '<div class="nk-alert-text"><b>' + escapeHtml(user) + " sent " + gift.name + "!</b>" +
      "<span>$" + gift.price.toFixed(2) + " · thank you 💜</span></div>";
    slot.appendChild(el);
    while (slot.children.length > 2) { slot.removeChild(slot.firstChild); }
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 4300);
  }

  /* ---------- Sub goal ---------- */
  var goalNow = 1840;
  var GOAL_TARGET = 3000;
  var goalFill = document.getElementById("nkGoalFill");
  var goalLabel = document.getElementById("nkGoalNow");

  function addToGoal(amount) {
    goalNow = Math.min(GOAL_TARGET, goalNow + amount);
    goalFill.style.width = ((goalNow / GOAL_TARGET) * 100).toFixed(1) + "%";
    goalLabel.textContent = "$" + Math.round(goalNow).toLocaleString();
  }
  addToGoal(0);

  /* ---------- Sending a gift (shop tiles + quick buttons) ---------- */
  function sendGift(key, from) {
    var gift = GIFTS[key];
    if (!gift) return;
    showAlert(from, gift);
    addGiftMessage(from, gift);
    addToGoal(gift.price);
  }

  document.querySelectorAll(".nk-gift, .nk-quick").forEach(function (btn) {
    btn.addEventListener("click", function () {
      sendGift(btn.dataset.gift, "You");
    });
  });

  /* ---------- Viewer's own chat messages ---------- */
  var form = document.getElementById("nkChatForm");
  var input = document.getElementById("nkChatInput");

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    addMessage("You", "sub", text);
    input.value = "";
    // Someone in chat reacts, the way a busy room does.
    setTimeout(function () {
      var who = pick(CHATTERS);
      addMessage(who.n, who.b, pick(["^ this", "facts", "agreed", "LMAO", "chat is right", "🔥🔥"]));
    }, 900 + Math.random() * 1400);
  });

  /* ---------- Follow button ---------- */
  var followBtn = document.getElementById("nkFollow");
  var followerEl = document.querySelector(".nk-followers");
  var followers = 184206;
  var following = false;

  followBtn.addEventListener("click", function () {
    following = !following;
    followers += following ? 1 : -1;
    followerEl.textContent = followers.toLocaleString();
    followBtn.textContent = following ? "✓ Following" : "＋ Follow";
    followBtn.classList.toggle("is-following", following);
    if (following) {
      addMessage("JEFFOS_BOT", "mod", "Welcome in — thanks for the follow!");
    }
  });

  /* ---------- Smooth scroll for the CTA ---------- */
  document.querySelectorAll("[data-scroll]").forEach(function (el) {
    el.addEventListener("click", function () {
      var target = document.querySelector(el.dataset.scroll);
      if (target) target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    });
  });

  /* ---------- Ambient life: chat, viewers, uptime, vitals ---------- */
  function seed() {
    for (var i = 0; i < 14; i++) {
      var who = pick(CHATTERS);
      addMessage(who.n, who.b, pick(LINES));
    }
    log.scrollTop = log.scrollHeight;
  }
  seed();

  var chatTimer;
  function scheduleChat() {
    chatTimer = setTimeout(function () {
      if (!document.hidden) {
        if (Math.random() < 0.12) {
          var keys = Object.keys(GIFTS);
          // Weight toward the cheap end, the way real gifting skews.
          var idx = Math.floor(Math.pow(Math.random(), 2.1) * keys.length);
          sendGift(keys[idx], pick(GIFTERS));
        } else {
          var who = pick(CHATTERS);
          addMessage(who.n, who.b, pick(LINES));
        }
      }
      scheduleChat();
    }, 1100 + Math.random() * 2300);
  }
  scheduleChat();

  var viewersEl = document.getElementById("nkViewers");
  var chattersEl = document.getElementById("nkChatters");
  var viewers = 12481;
  var chatters = 3204;

  setInterval(function () {
    if (document.hidden) return;
    viewers += Math.floor(Math.random() * 61) - 26;
    chatters += Math.floor(Math.random() * 15) - 6;
    viewersEl.textContent = Math.max(0, viewers).toLocaleString();
    chattersEl.textContent = Math.max(0, chatters).toLocaleString();
  }, 3400);

  var uptimeEl = document.getElementById("nkUptime");
  var seconds = 3 * 3600 + 12 * 60 + 44;
  setInterval(function () {
    seconds++;
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    uptimeEl.textContent = h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }, 1000);

  var hp = document.getElementById("nkHp");
  var sh = document.getElementById("nkSh");
  setInterval(function () {
    if (document.hidden) return;
    hp.style.width = (35 + Math.random() * 65).toFixed(0) + "%";
    sh.style.width = (10 + Math.random() * 90).toFixed(0) + "%";
  }, 2600);

  /* ---------- Nav highlight while scrolling ---------- */
  var links = Array.prototype.slice.call(document.querySelectorAll(".nk-nav-link"));
  var sections = links
    .map(function (l) { return document.querySelector(l.getAttribute("href")); })
    .filter(Boolean);

  if ("IntersectionObserver" in window && sections.length) {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (l) {
          l.classList.toggle("active", l.getAttribute("href") === "#" + entry.target.id);
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach(function (s) { obs.observe(s); });
  }
})();
