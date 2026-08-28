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
    titan:   { name: "Galaxy Titan",   price: 150, symbol: "giftTitan",   rarity: "mythic" },
    // Cosmic tier: these two play a full cinematic over the stage instead
    // of the small corner alert.
    lion:    { name: "Royal Lion",     price: 250, symbol: "giftLion",    rarity: "cosmic", cine: true },
    moon:    { name: "Blood Moon",     price: 500, symbol: "giftMoon",    rarity: "cosmic", cine: true }
  };

  // What the simulated crowd is allowed to send on its own.
  var AMBIENT_KEYS = ["pup", "bee", "moth", "cat", "wolf", "phoenix", "kraken", "titan"];
  var COSMIC_KEYS = ["lion", "moon"];

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
    el.className = "nk-msg nk-msg-gift" + (gift.rarity === "mythic" || gift.rarity === "cosmic" ? " is-mythic" : "");
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
  // withSound is false for gifts the simulated crowd sends — a page that
  // makes noise on its own would be hostile.
  function sendGift(key, from, withSound) {
    var gift = GIFTS[key];
    if (!gift) return;
    var played = false;
    if (gift.cine) { played = playCinematic(key, from, withSound !== false); }
    if (!played) { showAlert(from, gift); }
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
          if (Math.random() < 0.08) {
            // Every couple of minutes the room gets a cosmic one. Silent —
            // only a gift you send yourself is allowed to make noise.
            sendGift(pick(COSMIC_KEYS), pick(GIFTERS), false);
          } else {
            // Weight toward the cheap end, the way real gifting skews.
            var idx = Math.floor(Math.pow(Math.random(), 2.1) * AMBIENT_KEYS.length);
            sendGift(AMBIENT_KEYS[idx], pick(GIFTERS));
          }
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

  /* ============================================================
     COSMIC TIER
     Two gifts that take over the stage. The scenes live as
     <template> markup in index.html; everything repetitive (mane
     tufts, god rays, starfields, nebula, embers) is generated
     here so the markup stays readable. Sound is synthesised with
     the Web Audio API — nothing is downloaded and nothing is
     sampled from a copyrighted track.
     ============================================================ */

  var SVGNS = "http://www.w3.org/2000/svg";
  var cineLayer = document.getElementById("nkCine");
  var stageEl = document.getElementById("nkStage");
  var cineBusy = false;

  function el(name, attrs) {
    var n = document.createElementNS(SVGNS, name);
    for (var k in attrs) { if (attrs[k] != null) n.setAttribute(k, attrs[k]); }
    return n;
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* ---------- procedural art ---------- */

  // Sun rays: thin triangles fanning out from a point, on a slow spin.
  function fillRays(g, c) {
    var spin = el("g", { "class": "lk-rays-spin" });
    for (var i = 0; i < c.count; i++) {
      var a = (i / c.count) * Math.PI * 2;
      var sa = Math.sin(a), ca = Math.cos(a);
      var w = c.w * rnd(0.5, 1.4);
      var len = c.len * rnd(0.75, 1);
      spin.appendChild(el("path", {
        d: "M" + c.cx + " " + c.cy +
           " L" + (c.cx + len * sa - w * ca) + " " + (c.cy - len * ca - w * sa) +
           " L" + (c.cx + len * sa + w * ca) + " " + (c.cy - len * ca + w * sa) + " Z",
        fill: c.fill, opacity: rnd(0.06, 0.2)
      }));
    }
    g.appendChild(spin);
  }

  // One ring of the mane. Each tuft is a teardrop drawn pointing up at
  // the origin, then rotated out around the head and pushed to radius r.
  function fillTufts(g, c) {
    for (var i = 0; i < c.count; i++) {
      var a = (i / c.count) * 360 + rnd(-3, 3);
      var w = c.w * rnd(0.78, 1.18);
      var len = c.len * rnd(0.72, 1.25);
      g.appendChild(el("path", {
        d: "M" + (-w) + " 0 C " + (-w) + " " + (-len * 0.5) + ", " +
           (-w * 0.34) + " " + (-len * 0.86) + ", 0 " + (-len) +
           " C " + (w * 0.34) + " " + (-len * 0.86) + ", " + w + " " + (-len * 0.5) + ", " + w + " 0 Z",
        transform: "rotate(" + a.toFixed(2) + " " + c.cx + " " + c.cy + ") translate(" + c.cx + " " + (c.cy - c.r) + ")",
        fill: c.fill
      }));
    }
  }

  function fillStars(g, c) {
    for (var i = 0; i < c.count; i++) {
      var s = el("circle", {
        cx: rnd(0, 1600).toFixed(0), cy: rnd(0, 780).toFixed(0),
        r: rnd(0.7, 2.6).toFixed(2),
        fill: Math.random() < 0.75 ? "#ffe6e0" : "#ff9aa8",
        "class": "bm-star"
      });
      s.style.animationDelay = rnd(0, 2.6).toFixed(2) + "s";
      s.style.animationDuration = rnd(1.8, 4).toFixed(2) + "s";
      g.appendChild(s);
    }
  }

  function fillNebula(g, c) {
    var hues = ["#ff2d4d", "#a5104a", "#5c0f6b", "#ff5f3c", "#7a0730"];
    for (var i = 0; i < c.count; i++) {
      g.appendChild(el("ellipse", {
        cx: rnd(180, 1420).toFixed(0), cy: rnd(120, 660).toFixed(0),
        rx: rnd(180, 420).toFixed(0), ry: rnd(120, 300).toFixed(0),
        fill: hues[i % hues.length], opacity: rnd(0.16, 0.42).toFixed(2),
        transform: "rotate(" + rnd(0, 180).toFixed(0) + " 800 400)"
      }));
    }
  }

  // Debris: circles that fly outward (lion) or drift upward (moon).
  function fillEmbers(g, c, cls) {
    for (var i = 0; i < c.count; i++) {
      var a = c.rise ? rnd(-Math.PI * 0.75, -Math.PI * 0.25) : rnd(0, Math.PI * 2);
      var dist = rnd(c.spread * 0.3, c.spread);
      var p = el("circle", {
        cx: (c.x + rnd(-c.spread * 0.2, c.spread * 0.2)).toFixed(0),
        cy: (c.y + rnd(-40, 40)).toFixed(0),
        r: rnd(2, 8).toFixed(1),
        fill: c.fill, "class": cls
      });
      p.style.setProperty("--dx", (Math.cos(a) * dist).toFixed(0) + "px");
      p.style.setProperty("--dy", (Math.sin(a) * dist * (c.rise ? 1 : 0.72)).toFixed(0) + "px");
      p.style.animationDelay = ((c.delay || 0) + rnd(0, c.rise ? 2.2 : 0.5)).toFixed(2) + "s";
      g.appendChild(p);
    }
  }

  /* ---------- synthesised audio ---------- */

  var AudioCtx = window.AudioContext || window.webkitAudioContext;
  var snd = { ctx: null, master: null, analyser: null, muted: false };

  function ac() {
    if (!AudioCtx) return null;
    if (!snd.ctx) {
      try { snd.ctx = new AudioCtx(); } catch (e) { return null; }
      snd.master = snd.ctx.createGain();
      snd.master.gain.value = snd.muted ? 0 : 0.6;
      snd.master.connect(snd.ctx.destination);
    }
    if (snd.ctx.state === "suspended") { snd.ctx.resume(); }
    return snd.ctx;
  }

  function noiseBuffer(ctx, secs, brown) {
    var len = Math.floor(ctx.sampleRate * secs);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0), last = 0;
    for (var i = 0; i < len; i++) {
      var w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
      else { d[i] = w; }
    }
    return buf;
  }

  function distortion(ctx, amount) {
    var n = 1024, curve = new Float32Array(n), k = amount;
    for (var i = 0; i < n; i++) {
      var x = (i * 2) / n - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    var ws = ctx.createWaveShaper();
    ws.curve = curve; ws.oversample = "2x";
    return ws;
  }

  function kick(ctx, at, out, level) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(148, at);
    o.frequency.exponentialRampToValueAtTime(44, at + 0.11);
    g.gain.setValueAtTime(level, at);
    g.gain.exponentialRampToValueAtTime(0.0008, at + 0.26);
    o.connect(g); g.connect(out);
    o.start(at); o.stop(at + 0.3);
  }

  function snare(ctx, at, out, level) {
    var s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx, 0.25, false);
    var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1400;
    var g = ctx.createGain();
    g.gain.setValueAtTime(level, at);
    g.gain.exponentialRampToValueAtTime(0.0008, at + 0.19);
    s.connect(hp); hp.connect(g); g.connect(out);
    s.start(at); s.stop(at + 0.25);
  }

  function hat(ctx, at, out, level) {
    var s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx, 0.06, false);
    var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7200;
    var g = ctx.createGain();
    g.gain.setValueAtTime(level, at);
    g.gain.exponentialRampToValueAtTime(0.0006, at + 0.05);
    s.connect(hp); hp.connect(g); g.connect(out);
    s.start(at); s.stop(at + 0.07);
  }

  // One description of the track, shared by the sound and the visuals. The
  // moon pulses off this rather than off an analyser: a drop this dense
  // reads as a flat wall of level, and this way the pulse is identical
  // whether the viewer has the sound on or muted.
  var DUB = { bpm: 140, dropAt: 1.08, rates: [2, 4, 8, 4, 2, 8, 16, 6, 3, 12, 8, 4] };
  DUB.beat = 60 / DUB.bpm;

  // Where the wobble is at t seconds into the cinematic, 0..1.
  function dubEnvelope(t) {
    if (t < DUB.dropAt) { return Math.max(0, t / DUB.dropAt) * 0.5; }
    var d = t - DUB.dropAt;
    var phase = 0, rem = d, i = 0;
    while (rem > 0 && i < DUB.rates.length) {
      var seg = Math.min(rem, DUB.beat);
      phase += DUB.rates[i] * seg;
      rem -= seg; i++;
    }
    if (rem > 0) { phase += DUB.rates[DUB.rates.length - 1] * rem; }
    var wobble = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
    var intoBeat = (d / DUB.beat) % 1;
    var punch = Math.exp(-intoBeat * 7) * 0.42;
    return Math.min(1, 0.22 + wobble * 0.58 + punch);
  }

  // 6 seconds: ~1.1s riser, then the drop — sub, wobble bass and drums.
  function playDubstep(dur) {
    var ctx = ac(); if (!ctx) return;
    var t0 = ctx.currentTime + 0.03;
    var drop = t0 + 1.08;
    var end = t0 + dur;

    var bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, t0);
    bus.gain.linearRampToValueAtTime(1, t0 + 0.1);
    bus.gain.setValueAtTime(1, end - 0.5);
    bus.gain.linearRampToValueAtTime(0.0001, end);
    bus.connect(snd.master);

    // riser
    var rn = ctx.createBufferSource(); rn.buffer = noiseBuffer(ctx, 1.3, false);
    var rbp = ctx.createBiquadFilter(); rbp.type = "bandpass"; rbp.Q.value = 3;
    rbp.frequency.setValueAtTime(320, t0);
    rbp.frequency.exponentialRampToValueAtTime(7000, drop);
    var rg = ctx.createGain();
    rg.gain.setValueAtTime(0.0001, t0);
    rg.gain.exponentialRampToValueAtTime(0.34, drop - 0.05);
    rg.gain.exponentialRampToValueAtTime(0.0001, drop + 0.08);
    rn.connect(rbp); rbp.connect(rg); rg.connect(bus);
    rn.start(t0); rn.stop(drop + 0.12);

    var rs = ctx.createOscillator(), rsg = ctx.createGain();
    rs.type = "sawtooth";
    rs.frequency.setValueAtTime(180, t0);
    rs.frequency.exponentialRampToValueAtTime(880, drop);
    rsg.gain.setValueAtTime(0.0001, t0);
    rsg.gain.exponentialRampToValueAtTime(0.12, drop - 0.05);
    rsg.gain.exponentialRampToValueAtTime(0.0001, drop + 0.06);
    rs.connect(rsg); rsg.connect(bus);
    rs.start(t0); rs.stop(drop + 0.1);

    // impact
    kick(ctx, drop, bus, 1.1);
    var imp = ctx.createBufferSource(); imp.buffer = noiseBuffer(ctx, 0.8, true);
    var impg = ctx.createGain();
    impg.gain.setValueAtTime(0.5, drop);
    impg.gain.exponentialRampToValueAtTime(0.0008, drop + 0.7);
    imp.connect(impg); impg.connect(bus);
    imp.start(drop); imp.stop(drop + 0.8);

    // sub
    var sub = ctx.createOscillator(), subg = ctx.createGain();
    sub.type = "sine"; sub.frequency.setValueAtTime(46, drop);
    subg.gain.setValueAtTime(0.0001, drop);
    subg.gain.linearRampToValueAtTime(0.5, drop + 0.04);
    subg.gain.setValueAtTime(0.5, end - 0.4);
    subg.gain.linearRampToValueAtTime(0.0001, end - 0.05);
    sub.connect(subg); subg.connect(bus);
    sub.start(drop); sub.stop(end);

    // wobble bass — a lowpass whose cutoff is swept by an LFO whose own
    // rate changes bar to bar. That rate pattern is the dubstep sound.
    var filt = ctx.createBiquadFilter();
    filt.type = "lowpass"; filt.Q.value = 13;
    filt.frequency.setValueAtTime(760, drop);

    var lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    lfo.type = "sine"; lfoGain.gain.value = 700;
    lfo.connect(lfoGain); lfoGain.connect(filt.frequency);
    var beat = DUB.beat;
    for (var i = 0; i < DUB.rates.length; i++) {
      var t = drop + i * beat;
      if (t < end) lfo.frequency.setValueAtTime(DUB.rates[i], t);
    }
    lfo.start(drop); lfo.stop(end);

    var shaper = distortion(ctx, 26);
    var wg = ctx.createGain();
    wg.gain.setValueAtTime(0.0001, drop);
    wg.gain.linearRampToValueAtTime(0.34, drop + 0.05);
    wg.gain.setValueAtTime(0.34, end - 0.4);
    wg.gain.linearRampToValueAtTime(0.0001, end - 0.05);

    [55, 55.4, 110].forEach(function (f, idx) {
      var o = ctx.createOscillator();
      o.type = idx === 2 ? "square" : "sawtooth";
      o.frequency.value = f;
      var og = ctx.createGain(); og.gain.value = idx === 2 ? 0.22 : 1;
      o.connect(og); og.connect(filt);
      o.start(drop); o.stop(end);
    });
    filt.connect(shaper); shaper.connect(wg); wg.connect(bus);

    // drums
    for (var b = 0; drop + b * beat < end - 0.1; b++) {
      var t2 = drop + b * beat;
      if (b % 4 === 0 || b % 4 === 3) kick(ctx, t2, bus, 0.85);
      if (b % 4 === 1 || b % 4 === 3) snare(ctx, t2, bus, 0.32);
      hat(ctx, t2 + beat / 2, bus, 0.07);
    }
  }

  // A roar: brown noise through a sweeping bandpass over a growling
  // sawtooth, with a short feedback delay standing in for the canyon.
  function playRoar() {
    var ctx = ac(); if (!ctx) return;
    var t0 = ctx.currentTime + 0.02;
    var dur = 1.75;

    var bus = ctx.createGain(); bus.gain.value = 0.9; bus.connect(snd.master);
    var dly = ctx.createDelay(0.5); dly.delayTime.value = 0.13;
    var fb = ctx.createGain(); fb.gain.value = 0.34;
    var dwet = ctx.createGain(); dwet.gain.value = 0.4;
    dly.connect(fb); fb.connect(dly); dly.connect(dwet); dwet.connect(snd.master);
    bus.connect(dly);

    var n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx, dur + 0.2, true);
    var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(240, t0);
    bp.frequency.exponentialRampToValueAtTime(1150, t0 + 0.35);
    bp.frequency.exponentialRampToValueAtTime(300, t0 + dur);
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t0);
    ng.gain.linearRampToValueAtTime(0.75, t0 + 0.09);
    ng.gain.setValueAtTime(0.7, t0 + 0.9);
    ng.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    n.connect(bp); bp.connect(ng); ng.connect(bus);
    n.start(t0); n.stop(t0 + dur + 0.1);

    var o = ctx.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(105, t0);
    o.frequency.exponentialRampToValueAtTime(62, t0 + 0.45);
    o.frequency.exponentialRampToValueAtTime(48, t0 + dur);
    var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 6;
    lp.frequency.setValueAtTime(1500, t0);
    lp.frequency.exponentialRampToValueAtTime(420, t0 + dur);
    var og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t0);
    og.gain.linearRampToValueAtTime(0.5, t0 + 0.07);
    og.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);

    // growl: fast tremolo on the sawtooth
    var trem = ctx.createOscillator(), tremG = ctx.createGain();
    trem.type = "sine"; trem.frequency.value = 26; tremG.gain.value = 0.18;
    trem.connect(tremG); tremG.connect(og.gain);
    trem.start(t0); trem.stop(t0 + dur);

    o.connect(lp); lp.connect(og); og.connect(bus);
    o.start(t0); o.stop(t0 + dur + 0.05);

    kick(ctx, t0 + 0.02, bus, 1.0);
  }

  // Slow swell under the lion's walk-on, landing right on the roar.
  function playFanfare(untilRoar) {
    var ctx = ac(); if (!ctx) return;
    var t0 = ctx.currentTime + 0.02;
    var peak = t0 + untilRoar;
    var bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, t0);
    bus.gain.exponentialRampToValueAtTime(0.3, peak);
    bus.gain.exponentialRampToValueAtTime(0.0008, peak + 1.6);
    bus.connect(snd.master);

    var lp = ctx.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(400, t0);
    lp.frequency.exponentialRampToValueAtTime(2600, peak);
    lp.connect(bus);

    [82.41, 110, 164.81, 123.47].forEach(function (f, i) {
      var o = ctx.createOscillator();
      o.type = "sawtooth"; o.frequency.value = f; o.detune.value = i * 4 - 6;
      var g = ctx.createGain(); g.gain.value = 0.25;
      o.connect(g); g.connect(lp);
      o.start(t0); o.stop(peak + 1.7);
    });

    var tim = ctx.createBufferSource(); tim.buffer = noiseBuffer(ctx, 0.5, true);
    var tg = ctx.createGain();
    tg.gain.setValueAtTime(0.22, peak - 0.35);
    tg.gain.exponentialRampToValueAtTime(0.0008, peak);
    tim.connect(tg); tg.connect(bus);
    tim.start(peak - 0.35); tim.stop(peak + 0.05);
  }

  /* ---------- the orchestrator ---------- */

  var CINE = {
    lion: { template: "cineLion", duration: 7400 },
    moon: { template: "cineMoon", duration: 6000 }
  };

  function playCinematic(key, user, withSound) {
    var spec = CINE[key];
    var tpl = document.getElementById(spec.template);
    if (!tpl || !("content" in tpl) || cineBusy) return false;

    var node = tpl.content.firstElementChild.cloneNode(true);
    node.querySelectorAll("[data-user]").forEach(function (n) { n.textContent = user; });
    node.querySelectorAll("[data-rays]").forEach(function (g) { fillRays(g, JSON.parse(g.dataset.rays)); });
    node.querySelectorAll("[data-tufts]").forEach(function (g) { fillTufts(g, JSON.parse(g.dataset.tufts)); });
    node.querySelectorAll("[data-stars]").forEach(function (g) { fillStars(g, JSON.parse(g.dataset.stars)); });
    node.querySelectorAll("[data-nebula]").forEach(function (g) { fillNebula(g, JSON.parse(g.dataset.nebula)); });
    node.querySelectorAll("[data-embers]").forEach(function (g) {
      var c = JSON.parse(g.dataset.embers);
      fillEmbers(g, c, c.rise ? "bm-mote" : "lk-ember");
    });

    cineLayer.innerHTML = "";
    cineLayer.appendChild(node);
    cineBusy = true;

    var timers = [];
    if (key === "lion") {
      if (withSound) {
        playFanfare(3.3);
        timers.push(setTimeout(playRoar, 3300));
      }
      timers.push(setTimeout(function () {
        if (reduced) return;
        stageEl.classList.add("is-shaking");
        setTimeout(function () { stageEl.classList.remove("is-shaking"); }, 720);
      }, 3540));
    } else {
      if (withSound) playDubstep(6);
      driveMoon(node);
    }

    timers.push(setTimeout(function () { node.classList.add("is-ending"); }, spec.duration - 500));
    timers.push(setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
      cineBusy = false;
    }, spec.duration));

    return true;
  }

  // Pulse the moon off the same wobble the synth is playing, and fire a
  // shockwave ring on every beat of the drop.
  function driveMoon(node) {
    var rings = node.querySelector(".bm-rings");
    var start = performance.now();
    var raf;

    function spawnRing() {
      if (!rings) return;
      var c = el("circle", { cx: 800, cy: 392, r: 262, "class": "bm-ring" });
      rings.appendChild(c);
      setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 1000);
      node.classList.add("is-hit");
      setTimeout(function () { node.classList.remove("is-hit"); }, 170);
    }

    var lastBeat = -1;

    function frame(now) {
      var t = (now - start) / 1000;
      if (t > 6 || !node.parentNode) { cancelAnimationFrame(raf); return; }
      node.style.setProperty("--amp", dubEnvelope(t).toFixed(3));
      if (t > DUB.dropAt) {
        var beatIndex = Math.floor((t - DUB.dropAt) / DUB.beat);
        if (beatIndex !== lastBeat) { lastBeat = beatIndex; spawnRing(); }
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }

  /* ---------- sound toggle ---------- */
  var soundBtn = document.getElementById("nkSound");
  soundBtn.addEventListener("click", function () {
    snd.muted = !snd.muted;
    if (snd.master) snd.master.gain.value = snd.muted ? 0 : 0.6;
    soundBtn.setAttribute("aria-pressed", String(snd.muted));
    soundBtn.title = snd.muted ? "Unmute cinematic sound" : "Mute cinematic sound";
    soundBtn.querySelector(".nk-sound-on").hidden = snd.muted;
    soundBtn.querySelector(".nk-sound-off").hidden = !snd.muted;
  });

  // Small hook so the cinematics can be driven and inspected from the console.
  window.__jeffosCine = {
    play: playCinematic,
    busy: function () { return cineBusy; },
    audio: function () { return { state: snd.ctx ? snd.ctx.state : "none", muted: snd.muted }; }
  };
})();
