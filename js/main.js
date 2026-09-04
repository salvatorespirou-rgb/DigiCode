const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");

navToggle.addEventListener("click", () => {
  const isOpen = navLinks.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", isOpen);
});

navLinks.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    navLinks.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  });
});

document.getElementById("year").textContent = new Date().getFullYear();

// The Flappy Dragon game-card thumbnail uses native SVG SMIL animation (not
// CSS), which doesn't respect prefers-reduced-motion on its own — pause it
// manually for anyone who's asked for less motion.
const gameThumbSvg = document.querySelector(".game-thumb-svg");
if (gameThumbSvg && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  gameThumbSvg.pauseAnimations();
}

// Custom cursor — a marketing-facing touch for desktop mouse users only.
// Skipped on touch devices, when the user prefers reduced motion, and on the
// Dev portal (a working tool, not something visitors see).
//
// The native cursor is never hidden until a real mousemove confirms where the
// dot actually is, and it comes straight back the moment the mouse leaves the
// page or window. That's what a plain "hide native, show custom on load"
// approach gets wrong: navigating back/forward or reloading doesn't fire a
// mousemove on its own, so if the native cursor was already hidden, nothing
// is visible until the mouse happens to move again — reads as "the cursor
// disappeared." Here there's always a real cursor on screen, native or custom.
(function initCustomCursor() {
  const supportsCursor =
    window.matchMedia("(pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!supportsCursor || document.querySelector(".dev-tabs")) return;

  const dot = document.createElement("div");
  dot.className = "custom-cursor-dot";
  document.body.append(dot);

  const hoverSelector = "a, button, input, textarea, select, .service-row, .tier-card";

  document.addEventListener("mousemove", (e) => {
    document.body.classList.add("custom-cursor-active");
    dot.classList.add("is-visible");
    dot.style.setProperty("--cx", `${e.clientX - 4}px`);
    dot.style.setProperty("--cy", `${e.clientY - 4}px`);
    dot.classList.toggle("is-hovering", !!e.target.closest?.(hoverSelector));
  });

  document.addEventListener("mouseleave", () => {
    document.body.classList.remove("custom-cursor-active");
    dot.classList.remove("is-visible");
  });
})();

// Matrix-style code trail — a DigiCode signature touch. Two independent
// pieces share one canvas/particle system: a cursor-following trail
// (desktop/mouse only — there's no cursor to follow on a touch device),
// and an ambient rain on the homepage's quick-link tabs and service rows
// that isn't cursor-driven at all and so runs on every device, phones
// included. Only `prefers-reduced-motion` and the dev portal skip both.
(function initMatrixTrail() {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion || document.querySelector(".dev-tabs")) return;

  const canvas = document.createElement("canvas");
  canvas.className = "matrix-trail-canvas";
  document.body.append(canvas);
  const ctx = canvas.getContext("2d");

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  const GLYPHS = ["0", "1", "0", "1", "0", "1", "{", "}", "<", ">", "/", "01"];
  const COLORS = ["109, 78, 232", "46, 159, 230"];
  const MAX_PARTICLES = 160;
  let particles = [];

  const supportsCursor = window.matchMedia("(pointer: fine)").matches;
  if (supportsCursor) {
    let lastSpawnAt = 0;
    let lastX = null;
    let lastY = null;

    document.addEventListener("mousemove", (e) => {
      const now = performance.now();
      const moved = lastX === null || Math.hypot(e.clientX - lastX, e.clientY - lastY) > 10;
      if (moved && now - lastSpawnAt > 45 && particles.length < MAX_PARTICLES) {
        lastSpawnAt = now;
        lastX = e.clientX;
        lastY = e.clientY;
        particles.push({
          x: e.clientX + (Math.random() - 0.5) * 14,
          y: e.clientY + (Math.random() - 0.5) * 14,
          vy: 18 + Math.random() * 22,
          char: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          life: 0,
          maxLife: 0.7 + Math.random() * 0.5,
          size: 11 + Math.random() * 6,
        });
      }
    });

    // Only the cursor-following particles clear when the mouse leaves the
    // page — the ambient rain below is tagged `ambient: true` specifically
    // so it keeps going on its own, independent of the cursor entirely.
    document.addEventListener("mouseleave", () => {
      particles = particles.filter((p) => p.ambient);
    });
  }

  // The homepage's quick-link tabs and service rows drip a little code from
  // their bottom edge. This is deliberately sparse and short-lived: the
  // panels themselves now carry proper code rain in CSS, masked so it never
  // crosses the copy, and that does the heavy lifting. These particles are
  // drawn on a position:fixed canvas, so they have no such mask — anything
  // long-lived here drifts down over whatever text happens to be at that
  // point on screen. Kept as the odd spark falling off an edge, not a
  // curtain over the page.
  function attachCodeRain(el, intervalMs) {
    const spawnDrip = () => {
      if (particles.length >= MAX_PARTICLES) return;
      const rect = el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return; // off-screen, skip
      particles.push({
        x: rect.left + Math.random() * rect.width,
        y: rect.bottom - 2,
        vy: 24 + Math.random() * 22,
        char: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        life: 0,
        // Short life keeps each glyph close to the edge it fell from.
        maxLife: 0.4 + Math.random() * 0.28,
        size: 10 + Math.random() * 4,
        ambient: true,
      });
    };
    setInterval(spawnDrip, intervalMs);
    setTimeout(spawnDrip, Math.random() * intervalMs); // stagger so tabs don't all drip in lockstep
  }

  document.querySelectorAll(".quick-link-tab, .service-row").forEach((el) => {
    attachCodeRain(el, 1500 + Math.random() * 1100);
  });

  let lastT = null;
  function tick(t) {
    if (lastT === null) lastT = t;
    const dt = Math.min((t - lastT) / 1000, 0.05);
    lastT = t;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles = particles.filter((p) => p.life < p.maxLife);
    for (const p of particles) {
      p.life += dt;
      p.y += p.vy * dt;
      const fade = 1 - p.life / p.maxLife;
      // Ambient drips sit back further than the cursor trail — they're
      // scenery, and they're the ones that can end up over body copy.
      const alpha = fade * (p.ambient ? 0.45 : 0.85);
      ctx.font = `700 ${p.size}px "Space Grotesk", monospace`;
      ctx.fillStyle = `rgba(${p.color}, ${alpha})`;
      ctx.shadowColor = `rgba(${p.color}, ${alpha})`;
      ctx.shadowBlur = 6;
      ctx.fillText(p.char, p.x, p.y);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();

// Background videos: skip entirely on slow/data-saver connections, and only
// fetch the below-the-fold one once it's about to scroll into view.
function isConstrainedConnection() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return false;
  if (conn.saveData) return true;
  if (conn.effectiveType && ["slow-2g", "2g"].includes(conn.effectiveType)) return true;
  return false;
}

function loadBackgroundVideo(video) {
  if (!video || video.dataset.loaded) return;
  video.dataset.loaded = "true";
  const source = document.createElement("source");
  source.src = video.dataset.src;
  source.type = "video/mp4";
  video.appendChild(source);
  video.load();
  video.play().catch(() => {});
}

if (!isConstrainedConnection()) {
  const heroBgVideo = document.getElementById("heroBgVideo");
  if (heroBgVideo) loadBackgroundVideo(heroBgVideo);

  const workBgVideo = document.getElementById("workBgVideo");
  if (workBgVideo && "IntersectionObserver" in window) {
    const workVideoObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            loadBackgroundVideo(workBgVideo);
            workVideoObserver.disconnect();
          }
        });
      },
      { rootMargin: "300px" }
    );
    workVideoObserver.observe(workBgVideo);
  } else if (workBgVideo) {
    loadBackgroundVideo(workBgVideo);
  }
}

// One-time carry-over from the pre-rebrand key names. Renaming the storage
// keys is otherwise a silent data loss: a visitor mid-purchase loses their
// cart, and the saved PageSpeed key has to be pasted in again. Runs once —
// the old key is removed after it's copied.
(function carryOverLegacyKeys() {
  const renamed = [
    ["veloraCart", "digicodeCart"],
    ["veloraCustomerInfo", "digicodeCustomerInfo"],
    ["veloraPageSpeedKey", "digicodePageSpeedKey"],
  ];
  try {
    renamed.forEach(([from, to]) => {
      const value = localStorage.getItem(from);
      if (value === null) return;
      if (localStorage.getItem(to) === null) localStorage.setItem(to, value);
      localStorage.removeItem(from);
    });
  } catch (e) { /* private mode — nothing to carry over anyway */ }
})();

const CART_KEY = "digicodeCart";
const CUSTOMER_KEY = "digicodeCustomerInfo";

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCartItems(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

function addToCart(item) {
  const cart = getCart();
  const existingIndex = cart.findIndex((c) => c.key === item.key);
  if (existingIndex > -1) cart[existingIndex] = item;
  else cart.push(item);
  saveCartItems(cart);
}

function removeFromCart(key) {
  const cart = getCart().filter((c) => c.key !== key);
  saveCartItems(cart);
  return cart;
}

function updateCartBadge() {
  const count = getCart().length;
  document.querySelectorAll(".cart-badge").forEach((badge) => {
    badge.textContent = count;
    badge.hidden = count === 0;
  });
}

updateCartBadge();

// Dev pipeline data — backed by Supabase (projects/chats/developers tables,
// row-level security scopes what each signed-in user can see/write).
// getProjects()/getTeam()/getChats() stay synchronous, returning whatever was
// last loaded, so the render functions below don't need to be async-aware.
// loadProjects()/loadTeam()/loadChats() refresh that snapshot from the database.
let projectsCache = [];
let teamCache = [];
let chatsCache = {};

function mapProjectRow(row) {
  return {
    id: row.id,
    status: row.status,
    service: row.service,
    buildTier: row.build_tier,
    managementTier: row.management_tier,
    clientName: row.client_name,
    clientEmail: row.client_email,
    clientDiscord: row.client_discord,
    clientMobile: row.client_mobile,
    details: row.details,
    createdAt: row.created_at,
    assignedDev: row.assigned_dev,
    assignedAt: row.assigned_at,
    progressNotes: row.progress_notes || [],
    finishedAt: row.finished_at,
    review: row.review,
    domain: row.domain,
    health: row.health,
    orderKind: row.order_kind || "enquiry",
    amountCents: row.amount_cents,
    cancelledAt: row.cancelled_at,
    cancelledReason: row.cancelled_reason,
  };
}

async function loadProjects() {
  const { data, error } = await digicodeSupabase.from("projects").select("*").order("created_at", { ascending: false });
  if (!error) projectsCache = (data || []).map(mapProjectRow);
  return projectsCache;
}

function getProjects() {
  return projectsCache;
}

async function pushPendingProjectFromOrder(cart, customer) {
  if (!cart.length) return;
  const buildItem = cart.find((i) => i.type === "Build");
  const mgmtItem = cart.find((i) => i.type === "Management");
  const serviceName = customer?.service || cart[0].service || "Website";

  const getLine = (label) => {
    const line = customer?.lines?.find((l) => l.startsWith(label + ":"));
    return line ? line.slice(label.length + 1).trim() : "";
  };

  const existing = getLine("Existing website");
  const domain =
    !existing || /^not yet$/i.test(existing.trim())
      ? null
      : /^https?:\/\//i.test(existing)
      ? existing
      : "https://" + existing;

  await digicodeSupabase.from("projects").insert({
    status: "pending",
    service: serviceName,
    build_tier: buildItem ? `${buildItem.name} (${buildItem.price})` : null,
    management_tier: mgmtItem ? `${mgmtItem.name} (${mgmtItem.price}${mgmtItem.period ? " " + mgmtItem.period : ""})` : null,
    client_name: getLine("Name"),
    client_email: getLine("Email"),
    client_discord: getLine("Discord"),
    client_mobile: getLine("Mobile"),
    details:
      customer?.lines?.filter((l) => !/^Name:|^Email:|^Discord:|^Mobile:/.test(l)).join(" · ") ||
      "No additional project details provided.",
    domain,
  });
}

function mapDeveloperRow(row) {
  return {
    id: String(row.id),
    name: row.name,
    email: row.email,
    username: row.username,
    rank: row.rank,
    permissions: row.permissions || [],
  };
}

async function loadTeam() {
  const { data, error } = await digicodeSupabase.from("developers").select("*").order("created_at", { ascending: true });
  if (!error) teamCache = (data || []).map(mapDeveloperRow);
  return teamCache;
}

function getTeam() {
  return teamCache;
}

async function loadChats() {
  const { data, error } = await digicodeSupabase.from("chats").select("*").order("created_at", { ascending: true });
  if (error) return chatsCache;
  const grouped = {};
  (data || []).forEach((row) => {
    if (!grouped[row.chat_id]) grouped[row.chat_id] = [];
    grouped[row.chat_id].push({ from: row.from_name, text: row.message, at: row.created_at });
  });
  chatsCache = grouped;
  return chatsCache;
}

function getChats() {
  return chatsCache;
}

// ---------------------------------------------------------------------------
// Live chat from site visitors. Separate tables from the client/dev `chats`
// above, because a visitor has no account and is addressed by a token rather
// than by an email — see supabase/017_visitor_chat.sql.
// ---------------------------------------------------------------------------
let visitorChatsCache = [];
let visitorMsgsCache = {};

async function loadVisitorChats() {
  const [convos, msgs] = await Promise.all([
    digicodeSupabase.from("visitor_chats").select("*").order("last_message_at", { ascending: false }).limit(100),
    digicodeSupabase.from("visitor_messages").select("*").order("id", { ascending: true }).limit(2000),
  ]);
  if (!convos.error) visitorChatsCache = convos.data || [];
  if (!msgs.error) {
    const grouped = {};
    (msgs.data || []).forEach((row) => {
      if (!grouped[row.conversation_id]) grouped[row.conversation_id] = [];
      grouped[row.conversation_id].push(row);
    });
    visitorMsgsCache = grouped;
  }
  return visitorChatsCache;
}

function getVisitorChats() {
  return visitorChatsCache;
}

function getVisitorMessages(id) {
  return visitorMsgsCache[id] || [];
}

// Which visitor messages this dev has already looked at. Local to the browser
// on purpose — it's a read marker, not shared state worth a table.
const VISITOR_SEEN_KEY = "digicodeVisitorSeen";

function getVisitorSeen() {
  try { return JSON.parse(localStorage.getItem(VISITOR_SEEN_KEY) || "{}"); } catch (e) { return {}; }
}

function markVisitorSeen(convoId) {
  const msgs = getVisitorMessages(convoId);
  const last = msgs[msgs.length - 1];
  if (!last) return;
  const seen = getVisitorSeen();
  seen[convoId] = last.id;
  try { localStorage.setItem(VISITOR_SEEN_KEY, JSON.stringify(seen)); } catch (e) { /* private mode */ }
}

function visitorUnreadCount(convoId) {
  const seenId = getVisitorSeen()[convoId] || 0;
  return getVisitorMessages(convoId).filter((m) => m.sender === "visitor" && m.id > seenId).length;
}

const PSI_KEY_STORAGE = "digicodePageSpeedKey";

function getPsiKey() {
  return localStorage.getItem(PSI_KEY_STORAGE) || "";
}

function savePsiKey(key) {
  localStorage.setItem(PSI_KEY_STORAGE, key);
}

function formatDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) +
    " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// Same, but date only - for the dashboard stamps, where the time of day adds
// nothing and the separator in formatDate reads like the sentence has ended.
function formatDay(ts) {
  if (!ts) return "-";
  return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Any text a visitor typed into a form (name, project details, chat messages, etc.)
// gets rendered back into the dev dashboard via innerHTML — escape it so someone
// typing HTML/script into a request form can't run script in the dashboard viewer.
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

const heroLogo = document.getElementById("heroLogo");
const maxMove = 22;
const maxTilt = 14;

const isMobileViewport = () => window.matchMedia("(max-width: 860px)").matches;

if (heroLogo) {
  heroLogo.addEventListener("mousemove", (e) => {
    if (isMobileViewport()) return;
    const rect = heroLogo.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width - 0.5;
    const relY = (e.clientY - rect.top) / rect.height - 0.5;

    const moveX = relX * maxMove;
    const moveY = relY * maxMove;
    const tiltX = -relY * maxTilt;
    const tiltY = relX * maxTilt;

    heroLogo.style.transform = `translate(${moveX}px, ${moveY}px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
  });

  heroLogo.addEventListener("mouseleave", () => {
    heroLogo.style.transform = "translate(0, 0) rotateX(0deg) rotateY(0deg)";
  });
}

let audioCtx;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

["pointerdown", "keydown", "touchstart"].forEach((evt) => {
  document.addEventListener(
    evt,
    () => {
      const ctx = getAudioCtx();
      if (ctx.state === "suspended") ctx.resume();
    },
    { once: true, passive: true }
  );
});

function playHoverClick() {
  const ctx = getAudioCtx();
  if (ctx.state === "suspended") ctx.resume();

  const duration = 0.055;
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 2400;
  filter.Q.value = 1.1;

  const gain = ctx.createGain();
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.3, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start(now);
  noise.stop(now + duration);
}

document.querySelectorAll(".service-row").forEach((row) => {
  row.addEventListener("mouseenter", playHoverClick);
});

const requestForm = document.querySelector(".request-form");

if (requestForm) {
  function wireReveal(radioName, triggerValue, targetId) {
    const radios = requestForm.querySelectorAll(`input[name="${radioName}"]`);
    const target = document.getElementById(targetId);
    if (!radios.length || !target) return;
    radios.forEach((radio) => {
      radio.addEventListener("change", () => {
        const match = requestForm.querySelector(`input[name="${radioName}"]:checked`)?.value === triggerValue;
        target.hidden = !match;
      });
    });
  }

  wireReveal("hasDomain", "no", "domainFollowup");
  wireReveal("wantsSubscription", "yes", "tierGrid");

  requestForm.querySelectorAll(".tier-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".tier-purchase-btn")) return;
      const radio = card.querySelector(".tier-radio");
      if (radio) radio.checked = true;
    });
  });

  requestForm.querySelectorAll(".tier-purchase-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = btn.closest(".tier-card");
      const radio = card?.querySelector(".tier-radio");
      if (!radio) return;
      radio.checked = true;

      const serviceName = requestForm.dataset.service || "Website";
      const name = card.querySelector(".tier-name")?.textContent.trim() || radio.value;
      const price = card.querySelector(".price-amount")?.textContent.trim() || "";
      const period = card.querySelector(".price-period")?.textContent.trim() || "";

      addToCart({
        key: `${serviceName}::${radio.name}`,
        service: serviceName,
        type: radio.name === "buildTier" ? "Build" : "Management",
        name,
        price,
        period,
      });
      updateCartBadge();

      // TODO: once Stripe is connected, this can redirect straight to Checkout instead of just adding to cart.
      const originalText = btn.textContent;
      btn.textContent = "Added ✓";
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 1200);
    });
  });

  const billingTabs = requestForm.querySelectorAll(".billing-tab");
  const billingCycleInput = document.getElementById("billingCycle");

  billingTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      billingTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const cycle = tab.dataset.billing;

      if (billingCycleInput) billingCycleInput.value = cycle === "weekly" ? "Weekly" : "Monthly";

      const subscriptionPanel = document.getElementById("tierGrid");
      subscriptionPanel?.querySelectorAll(".price-amount").forEach((el) => {
        el.textContent = cycle === "weekly" ? el.dataset.weekly : el.dataset.monthly;
      });
      subscriptionPanel?.querySelectorAll(".price-period").forEach((el) => {
        el.textContent = cycle === "weekly" ? "/wk" : "/mo";
      });
    });
  });

  // "None of those fit?" — asking for a custom quote replaces buying a package,
  // so the button changes to match rather than sending someone to a cart.
  const quoteBox = document.getElementById("wantQuote");
  const quoteDetail = document.getElementById("quoteDetail");
  const wantsQuote = () => !!(quoteBox && quoteBox.checked);

  const checkoutBtn = document.getElementById("checkoutBtn");

  if (quoteBox) {
    quoteBox.addEventListener("change", () => {
      if (quoteDetail) quoteDetail.hidden = !quoteBox.checked;
      if (!checkoutBtn) return;
      checkoutBtn.textContent = quoteBox.checked
        ? "Request a Quote"
        : checkoutBtn.dataset.enquiry === "true"
        ? "Send Request"
        : "Checkout";
      // Untick any package they'd already chosen, so the two can't conflict.
      if (quoteBox.checked) {
        requestForm
          .querySelectorAll('input[name="buildTier"]')
          .forEach((r) => (r.checked = false));
      }
    });
  }

  if (checkoutBtn) {
    checkoutBtn.addEventListener("click", () => {
      const lines = [];
      requestForm.querySelectorAll("input, textarea").forEach((el) => {
        if (el.name === "buildTier" || el.name === "subscriptionTier") return;
        const label = el.dataset.label;
        if (!label) return;
        if (el.type === "radio" || el.type === "checkbox") {
          if (el.checked) lines.push(label);
        } else {
          const val = el.value.trim();
          if (val) lines.push(`${label}: ${val}`);
        }
      });

      const serviceName = requestForm.dataset.service || "Website";
      // Anything the client attached (js/uploads.js) rides along with the
      // enquiry, so the order names the files and their upload reference.
      if (typeof window.digicodeUploads === "function") {
        lines.push(...window.digicodeUploads());
      }

      localStorage.setItem(CUSTOMER_KEY, JSON.stringify({ service: serviceName, lines }));

      // A quote request takes no payment: it lands in Pending Projects marked
      // as a quote so it is obvious it needs pricing rather than starting.
      if (wantsQuote()) {
        checkoutBtn.disabled = true;
        checkoutBtn.textContent = "Sending…";
        const field = (label) => {
          const line = lines.find((l) => l.startsWith(label + ":"));
          return line ? line.slice(label.length + 1).trim() : "";
        };
        digicodeSupabase
          .rpc("request_quote", {
            p_service: serviceName + " — quote",
            p_name: field("Name"),
            p_email: field("Email"),
            p_details: lines.join("\n"),
          })
          .catch(() => {})
          .then(() => {
            const subject = encodeURIComponent(`Quote request — ${serviceName}`);
            const body = encodeURIComponent(
              [`Quote request — ${serviceName}`, ""].concat(lines).join("\n")
            );
            window.location.href =
              `mailto:developerteam@digi-code.com.au?subject=${subject}&body=${body}`;
            checkoutBtn.disabled = false;
            checkoutBtn.textContent = "Request a Quote";
          });
        return;
      }

      // Pages with nothing to add to a cart (SEO, for instance — that work is
      // quoted, not bought off a shelf) send the enquiry instead of sending
      // someone to an empty cart.
      if (checkoutBtn.dataset.enquiry === "true") {
        const subject = encodeURIComponent(`${serviceName} enquiry`);
        const body = encodeURIComponent(
          [`${serviceName} enquiry:`, ""].concat(lines).join("\n")
        );
        window.location.href = `mailto:developerteam@digi-code.com.au?subject=${subject}&body=${body}`;
        return;
      }

      window.location.href = checkoutBtn.dataset.cartUrl || "cart.html";
    });
  }
}

const cartItemsEl = document.getElementById("cartItems");

if (cartItemsEl) {
  const cartEmptyEl = document.getElementById("cartEmpty");
  const cartSummaryEl = document.getElementById("cartSummary");

  // ---------------------------------------------------------------------
  // Discount codes. The shopper isn't signed in, so this goes through the
  // anon-callable RPCs in supabase/020_discount_codes.sql — the codes table
  // itself is closed to them. Kept in sessionStorage rather than localStorage
  // so a code doesn't quietly persist for weeks after it expires.
  // ---------------------------------------------------------------------
  const DISCOUNT_KEY = "digicodeDiscount";

  function getDiscount() {
    try {
      const raw = sessionStorage.getItem(DISCOUNT_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      // A code held from earlier in the session may have expired since.
      if (d.expires_at && new Date(d.expires_at) <= new Date()) {
        sessionStorage.removeItem(DISCOUNT_KEY);
        return null;
      }
      return d;
    } catch (e) {
      return null;
    }
  }

  function setDiscount(d) {
    try {
      if (d) sessionStorage.setItem(DISCOUNT_KEY, JSON.stringify(d));
      else sessionStorage.removeItem(DISCOUNT_KEY);
    } catch (e) { /* private mode */ }
  }

  function discountLabel(d) {
    const value = d.kind === "percent" ? `${+d.amount}% off` : `$${(+d.amount).toFixed(2)} off`;
    const scope =
      d.applies_to === "one_time" ? "one-time" :
      d.applies_to === "subscription" ? "subscription" : "everything";
    return `${d.code.toUpperCase()} — ${value} ${scope}`;
  }

  // Returns what a discount takes off a given amount, never more than the
  // amount itself.
  function discountOn(d, amount) {
    if (!d || amount <= 0) return 0;
    const off = d.kind === "percent" ? amount * (+d.amount / 100) : +d.amount;
    return Math.min(off, amount);
  }

  function renderCart() {
    const cart = getCart();

    if (!cart.length) {
      if (cartEmptyEl) cartEmptyEl.hidden = false;
      if (cartSummaryEl) cartSummaryEl.hidden = true;
      cartItemsEl.innerHTML = "";
      return;
    }

    if (cartEmptyEl) cartEmptyEl.hidden = true;
    if (cartSummaryEl) cartSummaryEl.hidden = false;

    cartItemsEl.innerHTML = cart
      .map(
        (item) => `
      <div class="cart-item">
        <div class="cart-item-info">
          <span class="cart-item-service">${item.service} — ${item.type}</span>
          <span class="cart-item-name">${item.name}</span>
        </div>
        <div class="cart-item-price">${item.price}<span class="price-period">${item.period ? " " + item.period : ""}</span></div>
        <button type="button" class="cart-item-remove" data-key="${item.key}" aria-label="Remove ${item.name}">&times;</button>
      </div>`
      )
      .join("");

    cartItemsEl.querySelectorAll(".cart-item-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        removeFromCart(btn.dataset.key);
        updateCartBadge();
        renderCart();
      });
    });

    let oneTimeTotal = 0;
    let subLine = "";
    cart.forEach((item) => {
      const num = parseFloat(String(item.price).replace(/[^0-9.]/g, "")) || 0;
      if (item.period === "one-time") {
        oneTimeTotal += num;
      } else {
        subLine = subLine ? `${subLine}, ${item.price}${item.period}` : `${item.price}${item.period}`;
      }
    });

    const oneTimeTotalEl = document.getElementById("oneTimeTotal");
    if (oneTimeTotalEl) oneTimeTotalEl.textContent = "$" + oneTimeTotal.toFixed(0);

    const subRow = document.getElementById("subscriptionRow");
    const subTotalEl = document.getElementById("subscriptionTotal");
    if (subRow && subTotalEl) {
      subRow.hidden = !subLine;
      subTotalEl.textContent = subLine;
    }

    renderDiscount(oneTimeTotal, cart);
  }

  // Shows the applied code and what it actually comes to. Subscription items
  // are summed separately because they recur — a discount on them is quoted
  // per month, not as one number off the order.
  function renderDiscount(oneTimeTotal, cart) {
    const d = getDiscount();
    const appliedEl = document.getElementById("discountApplied");
    const tagEl = document.getElementById("discountTag");
    const rowEl = document.getElementById("discountedRow");
    const labelEl = document.getElementById("discountedLabel");
    const totalEl = document.getElementById("discountedTotal");
    const inputWrap = document.querySelector(".cart-discount-row");
    if (!appliedEl || !rowEl) return;

    if (!d) {
      appliedEl.hidden = true;
      rowEl.hidden = true;
      if (inputWrap) inputWrap.hidden = false;
      return;
    }

    appliedEl.hidden = false;
    tagEl.textContent = discountLabel(d);
    if (inputWrap) inputWrap.hidden = true;

    const subTotal = cart
      .filter((i) => i.period !== "one-time")
      .reduce((n, i) => n + (parseFloat(String(i.price).replace(/[^0-9.]/g, "")) || 0), 0);

    const offOneTime = d.applies_to === "subscription" ? 0 : discountOn(d, oneTimeTotal);
    const offSub = d.applies_to === "one_time" ? 0 : discountOn(d, subTotal);

    const parts = [];
    if (offOneTime > 0) parts.push(`$${(oneTimeTotal - offOneTime).toFixed(2)} one-time`);
    if (offSub > 0) parts.push(`$${(subTotal - offSub).toFixed(2)}/mo`);

    if (!parts.length) {
      // Valid code, but nothing in the cart it applies to.
      rowEl.hidden = true;
      showDiscountMsg("That code doesn't apply to anything in your cart.", true);
      return;
    }

    labelEl.textContent = `After discount (−$${(offOneTime + offSub).toFixed(2)})`;
    totalEl.textContent = parts.join(" + ");
    rowEl.hidden = false;
  }

  function showDiscountMsg(text, isError) {
    const el = document.getElementById("discountMsg");
    if (!el) return;
    el.textContent = text;
    el.hidden = !text;
    el.classList.toggle("is-error", !!isError);
  }

  const applyBtn = document.getElementById("applyDiscountBtn");
  const codeInput = document.getElementById("discountCodeInput");

  async function applyDiscountCode() {
    const raw = (codeInput.value || "").trim();
    if (!raw) return;
    applyBtn.disabled = true;
    showDiscountMsg("Checking…", false);
    try {
      const { data, error } = await digicodeSupabase.rpc("validate_discount_code", { p_code: raw });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        setDiscount(null);
        showDiscountMsg("That code isn't valid or has expired.", true);
      } else {
        setDiscount(row);
        showDiscountMsg("", false);
        codeInput.value = "";
      }
    } catch (e) {
      showDiscountMsg("Couldn't check that code. Try again in a moment.", true);
    } finally {
      applyBtn.disabled = false;
      renderCart();
    }
  }

  applyBtn?.addEventListener("click", applyDiscountCode);
  codeInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); applyDiscountCode(); }
  });
  document.getElementById("removeDiscountBtn")?.addEventListener("click", () => {
    setDiscount(null);
    showDiscountMsg("", false);
    renderCart();
  });

  renderCart();

  const clearCartBtn = document.getElementById("clearCartBtn");
  clearCartBtn?.addEventListener("click", () => {
    saveCartItems([]);
    updateCartBadge();
    renderCart();
  });

  // ---------------------------------------------------------------------
  // Stripe checkout
  //
  // The cart sends SKUs only — never prices. public.quote_cart() in
  // supabase/023 decides what the order costs, so editing these numbers in
  // dev tools achieves nothing. If the Edge Function isn't deployed yet the
  // old email flow still runs, so the cart never simply breaks.
  // ---------------------------------------------------------------------

  const CHECKOUT_FN =
    "https://phlmnlildwkkichlbtoy.supabase.co/functions/v1/stripe-checkout";

  // Cart entries carry a display name and period; the catalog keys off a SKU.
  function skuFor(item) {
    // Scripts carry their own SKU because the catalogue is dynamic — the slug
    // only exists once someone has listed that script for sale.
    if (item.sku) return item.sku;

    const name = (item.name || "").toLowerCase();
    const weekly = /wk|week/.test(item.period || "");

    if (item.type === "Build") {
      if (name.includes("basic")) return "build-basic";
      if (name.includes("common")) return "build-common";
      if (name.includes("ultimate")) return "build-ultimate";
      return null;
    }

    const suffix = weekly ? "week" : "month";
    if (name.includes("silver")) return `mgmt-silver-${suffix}`;
    if (name.includes("gold")) return `mgmt-gold-${suffix}`;
    if (name.includes("platinum")) return `mgmt-platinum-${suffix}`;
    return null;
  }

  function cartLine(customer, label) {
    const line = customer?.lines?.find((l) => l.startsWith(label + ":"));
    return line ? line.slice(label.length + 1).trim() : "";
  }

  // Falls back to the email order. Kept as its own function so both the
  // "payments not set up yet" and "Stripe is down" paths land somewhere sane.
  function emailTheOrder(cart, customer, discount) {
    const lines = ["Cart:"];
    cart.forEach((item) => {
      lines.push(
        `- ${item.service} — ${item.name} (${item.price}${item.period ? " " + item.period : ""})`
      );
    });

    if (discount) {
      lines.push("");
      lines.push(`Discount code applied: ${discountLabel(discount)}`);
    }

    if (customer?.lines?.length) {
      lines.push("");
      lines.push(`Details (from ${customer.service}):`);
      customer.lines.forEach((l) => lines.push(l));
    }

    const subject = encodeURIComponent("New DigiCode Order");
    const body = encodeURIComponent(lines.join("\n"));
    window.location.href = `mailto:developerteam@digi-code.com.au?subject=${subject}&body=${body}`;
  }

  const confirmOrderBtn = document.getElementById("confirmOrderBtn");
  confirmOrderBtn?.addEventListener("click", async () => {
    const cart = getCart();
    const customer = JSON.parse(localStorage.getItem(CUSTOMER_KEY) || "null");
    const discount = getDiscount();
    if (!cart.length) return;

    const originalText = confirmOrderBtn.textContent;
    confirmOrderBtn.disabled = true;
    confirmOrderBtn.textContent = "Taking you to checkout…";

    const items = cart
      .map((i) => ({ sku: skuFor(i), qty: 1 }))
      .filter((i) => i.sku);

    // Anything we couldn't map to a real product can't be priced safely, so
    // that order goes by email rather than being charged a guess. Subscription
    // carts are no longer blocked here — the function holds a separate,
    // subscription-scoped key and answers 409 if it isn't configured, which
    // lands in the same email fallback below.
    if (items.length !== cart.length) {
      confirmOrderBtn.disabled = false;
      confirmOrderBtn.textContent = originalText;
      await pushPendingProjectFromOrder(cart, customer);
      emailTheOrder(cart, customer, discount);
      return;
    }

    try {
      // The function keeps Supabase's JWT check on, which the public anon key
      // satisfies — the same header live-chat.js already sends. It is not a
      // secret; the real protection is that prices are decided server-side.
      const res = await fetch(CHECKOUT_FN, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          items,
          code: discount ? discount.code : null,
          email: cartLine(customer, "Email") || null,
          name: cartLine(customer, "Name") || null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.url) {
        // Stripe confirms the payment by webhook, which is what creates the
        // project and counts the discount — deliberately not done here, since
        // arriving back on the success page proves nothing about payment.
        window.location.href = data.url;
        return;
      }

      // 503 means the function is deployed but has no Stripe key yet.
      throw new Error(data.error || `checkout unavailable (${res.status})`);
    } catch (err) {
      confirmOrderBtn.disabled = false;
      confirmOrderBtn.textContent = originalText;
      await pushPendingProjectFromOrder(cart, customer);
      if (discount) {
        try {
          await digicodeSupabase.rpc("redeem_discount_code", { p_code: discount.code });
        } catch (e) {
          /* non-fatal */
        }
      }
      emailTheOrder(cart, customer, discount);
    }
  });
}

// Portal auth. Signing in day to day is a normal password; the one-time code
// exists only to set that password the first time, or to reset a forgotten
// one. Whatever's typed in the identifier box can be an email or a developer's
// username — resolve_portal_login (supabase/015) turns either into the email
// the account actually lives under, and returns nothing for anyone without
// portal access, which is what keeps strangers out.
const portalLoginForm = document.getElementById("portalLoginForm");
if (portalLoginForm) {
  // Bounced back here by the portal's own access re-check (see portal.html).
  if (sessionStorage.getItem("digicodePortalDenied")) {
    sessionStorage.removeItem("digicodePortalDenied");
    const deniedEl = document.getElementById("loginError");
    if (deniedEl) {
      deniedEl.textContent = "That account does not have access to the portal.";
      deniedEl.hidden = false;
    }
  }

  // Signed out by js/idle-logout.js. Saying why avoids the "it just logged me
  // out for no reason" confusion.
  if (sessionStorage.getItem("digicodePortalTimedOut")) {
    sessionStorage.removeItem("digicodePortalTimedOut");
    const idleEl = document.getElementById("loginError");
    if (idleEl) {
      idleEl.textContent = "You were signed out after 15 minutes of inactivity. Sign in again to carry on.";
      idleEl.hidden = false;
    }
  }

  const codeForm = document.getElementById("portalCodeForm");
  const backRow = document.getElementById("backToPasswordRow");
  const showCodeBtn = document.getElementById("showCodeFormBtn");
  const showPasswordBtn = document.getElementById("showPasswordFormBtn");
  const passwordNote = showCodeBtn ? showCodeBtn.closest("p") : null;

  function showCodeMode(show) {
    portalLoginForm.hidden = show;
    if (passwordNote) passwordNote.hidden = show;
    if (codeForm) {
      codeForm.hidden = !show;
      // Only require the field while its form is the one on screen, or the
      // hidden form's validation would block the visible one from submitting.
      const idField = document.getElementById("codeIdentifier");
      if (idField) idField.required = show;
    }
    if (backRow) backRow.hidden = !show;
  }
  showCodeMode(false);
  showCodeBtn?.addEventListener("click", () => {
    // Carry across whatever they'd already typed, so they don't retype it.
    const typed = document.getElementById("loginEmail")?.value.trim();
    const idField = document.getElementById("codeIdentifier");
    if (typed && idField && !idField.value) idField.value = typed;
    showCodeMode(true);
  });
  showPasswordBtn?.addEventListener("click", () => showCodeMode(false));

  // Turns an email-or-username into the account's email. Returns
  // { email } on success, or { message } describing what to tell them.
  async function resolveIdentifier(identifier) {
    const { data, error } = await digicodeSupabase
      .rpc("resolve_portal_login", { identifier });
    if (error) return { message: "We couldn't check that just now — please try again." };
    if (!data) return { message: "That email or username does not have access to the portal." };
    return { email: data };
  }

  portalLoginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const identifier = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const errorEl = document.getElementById("loginError");
    const submitBtn = document.getElementById("loginSubmitBtn");
    if (errorEl) errorEl.hidden = true;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Signing in…"; }

    const failWith = (message) => {
      if (errorEl) { errorEl.textContent = message; errorEl.hidden = false; }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Sign In"; }
    };

    const resolved = await resolveIdentifier(identifier);
    if (!resolved.email) { failWith(resolved.message); return; }

    const { error } = await digicodeSupabase.auth.signInWithPassword({
      email: resolved.email,
      password,
    });
    if (error) {
      // Covers both a wrong password and an account that hasn't set one yet —
      // Supabase reports the same "invalid credentials" for both, and we don't
      // want to confirm which of the two it was anyway.
      failWith("That password didn't work. If you haven't set one yet, get a one-time code below.");
      return;
    }

    window.location.href = "portal.html";
  });

  codeForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const identifier = document.getElementById("codeIdentifier").value.trim();
    const errorEl = document.getElementById("codeError");
    const submitBtn = document.getElementById("codeSubmitBtn");
    if (errorEl) errorEl.hidden = true;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Sending…"; }

    const failWith = (message) => {
      if (errorEl) { errorEl.textContent = message; errorEl.hidden = false; }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Send Code"; }
    };

    const resolved = await resolveIdentifier(identifier);
    if (!resolved.email) { failWith(resolved.message); return; }

    // shouldCreateUser stays true on purpose: a developer who's just been
    // added to the roster has no auth user yet, and this first code is
    // exactly what creates it (and promotes them — see supabase/003).
    const { error } = await digicodeSupabase.auth.signInWithOtp({
      email: resolved.email,
      options: { shouldCreateUser: true },
    });
    if (error) {
      failWith("Something went wrong sending your code — try again.");
      return;
    }

    sessionStorage.setItem("digicodePendingEmail", resolved.email);
    window.location.href = "verify.html";
  });
}

const verifyCodeForm = document.getElementById("verifyCodeForm");
if (verifyCodeForm) {
  const pendingEmail = sessionStorage.getItem("digicodePendingEmail");
  const subEl = document.getElementById("verifySub");
  if (pendingEmail && subEl) {
    subEl.textContent = `We've sent a one-time code to ${pendingEmail}. Enter it below and you'll choose your password next.`;
  } else if (!pendingEmail) {
    window.location.href = "signin.html";
  }

  verifyCodeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = document.getElementById("oneTimeCode").value.trim();
    const errorEl = document.getElementById("verifyError");
    const submitBtn = document.getElementById("verifySubmitBtn");
    if (errorEl) errorEl.hidden = true;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Verifying…"; }

    const { error } = await digicodeSupabase.auth.verifyOtp({
      email: pendingEmail,
      token: code,
      type: "email",
    });

    if (error) {
      if (errorEl) errorEl.hidden = false;
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Verify Code"; }
      return;
    }

    sessionStorage.removeItem("digicodePendingEmail");
    // A code is only ever issued to set or reset a password now, so this
    // always lands on the password screen — the code isn't a way in on its
    // own. (An explicit redirect still wins, so the games can reuse this
    // flow later just to sync a profile.)
    const redirect = sessionStorage.getItem("digicodeAuthRedirect") || "create-password.html";
    sessionStorage.removeItem("digicodeAuthRedirect");
    window.location.href = redirect;
  });

  document.getElementById("resendCodeBtn")?.addEventListener("click", async () => {
    if (!pendingEmail) return;
    await digicodeSupabase.auth.signInWithOtp({ email: pendingEmail, options: { shouldCreateUser: true } });
  });
}

// Setting a portal password, reached straight after a one-time code has been
// verified. That code is what put a real session in place, and the session is
// what authorises updateUser() here — so there's no token to pass around.
const createPasswordForm = document.getElementById("createPasswordForm");
if (createPasswordForm) {
  const errorEl = document.getElementById("createPasswordError");
  const submitBtn = document.getElementById("createPasswordBtn");

  const showError = (message) => {
    if (errorEl) { errorEl.textContent = message; errorEl.hidden = false; }
  };

  // Landing here without having verified a code means there's nothing to
  // attach a password to — send them back to the start.
  (async () => {
    const { data: { session } } = await digicodeSupabase.auth.getSession();
    if (!session) window.location.href = "signin.html";
  })();

  createPasswordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = document.getElementById("newPassword").value;
    const confirm = document.getElementById("confirmPassword").value;
    if (errorEl) errorEl.hidden = true;

    if (password.length < 8) { showError("Use at least 8 characters."); return; }
    if (password !== confirm) { showError("Those two passwords don't match."); return; }

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Saving…"; }
    const { error } = await digicodeSupabase.auth.updateUser({ password });
    if (error) {
      showError(error.message || "We couldn't save that password — please try again.");
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Create Password"; }
      return;
    }

    window.location.href = "portal.html";
  });
}

// Game password reset — landing page for the link Supabase emails from
// resetPasswordForEmail. The recovery token in the URL is picked up
// automatically (detectSessionInUrl is on by default), which is what
// authorizes updateUser() below; no separate token handling needed.
const resetPasswordForm = document.getElementById("resetPasswordForm");
if (resetPasswordForm) {
  resetPasswordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const newPassword = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    const errorEl = document.getElementById("resetError");
    const submitBtn = document.getElementById("resetSubmitBtn");
    if (errorEl) errorEl.hidden = true;

    if (newPassword !== confirmPassword) {
      if (errorEl) { errorEl.textContent = "Those passwords don't match."; errorEl.hidden = false; }
      return;
    }

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Saving…"; }
    const { error } = await digicodeSupabase.auth.updateUser({ password: newPassword });

    if (error) {
      if (errorEl) {
        errorEl.textContent = "That link may have expired — request a new reset email from the game and try again.";
        errorEl.hidden = false;
      }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Set Password"; }
      return;
    }

    window.location.href = "digicode-gaming.html";
  });
}

document.addEventListener("click", async (e) => {
  if (!e.target.closest("[data-portal-logout]")) return;
  await digicodeSupabase.auth.signOut();
  window.location.href = "signin.html";
});

// Dev project pipeline (Pending / Assigned / Finished / Developers)
const devTabs = document.querySelectorAll(".dev-tab");

if (devTabs.length) {
  let chatListMode = "clients";
  let activeChatId = null;

  devTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      devTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".dev-tab-panel").forEach((p) => {
        p.hidden = p.dataset.panel !== tab.dataset.tab;
      });
    });
  });

  function tierTagsHtml(p) {
    return `${p.buildTier ? `<span class="project-tag">${p.buildTier}</span>` : ""}${p.managementTier ? `<span class="project-tag">${p.managementTier}</span>` : ""}`;
  }

  function scoreClass(score) {
    if (score == null) return "";
    if (score >= 90) return "health-good";
    if (score >= 50) return "health-warning";
    return "health-critical";
  }

  function domainAndHealthHtml(p) {
    const health = p.health;
    let healthHtml = "";

    if (p.domain) {
      if (health?.loading) {
        healthHtml = `<div class="health-panel"><p class="health-loading">Running a live PageSpeed check on ${escapeHtml(p.domain)} — this takes 10–20 seconds…</p></div>`;
      } else if (health?.error) {
        healthHtml = `
          <div class="health-panel">
            <p class="health-error">${escapeHtml(health.error)}</p>
            <button type="button" class="btn btn-ghost btn-small-inline check-health-btn" data-id="${p.id}">Try Again</button>
          </div>`;
      } else if (health) {
        healthHtml = `
          <div class="health-panel">
            <div class="health-header">
              <span>Website Health</span>
              <span class="health-meta">Checked ${formatDate(health.checkedAt)} · Live via Google PageSpeed Insights</span>
            </div>
            <div class="health-grid">
              <div class="stat-tile health-tile"><span class="stat-tile-label">Performance</span><span class="stat-tile-value ${scoreClass(health.performance)}">${health.performance ?? "—"}</span></div>
              <div class="stat-tile health-tile"><span class="stat-tile-label">SEO</span><span class="stat-tile-value ${scoreClass(health.seo)}">${health.seo ?? "—"}</span></div>
              <div class="stat-tile health-tile"><span class="stat-tile-label">Accessibility</span><span class="stat-tile-value ${scoreClass(health.accessibility)}">${health.accessibility ?? "—"}</span></div>
              <div class="stat-tile health-tile"><span class="stat-tile-label">Best Practices</span><span class="stat-tile-value ${scoreClass(health.bestPractices)}">${health.bestPractices ?? "—"}</span></div>
            </div>
            <p class="health-vitals">LCP ${escapeHtml(health.lcp)} · CLS ${escapeHtml(health.cls)} · FCP ${escapeHtml(health.fcp)}</p>
            <button type="button" class="btn btn-ghost btn-small-inline check-health-btn" data-id="${p.id}">Re-check</button>
          </div>`;
      } else {
        healthHtml = `
          <div class="health-panel">
            <button type="button" class="btn btn-primary btn-small-inline check-health-btn" data-id="${p.id}">Check Website Health (Live)</button>
          </div>`;
      }
    }

    return `
      <div class="domain-row">
        ${
          p.domain
            ? `<span class="domain-value">${escapeHtml(p.domain)}</span> <button type="button" class="clear-cart-link edit-domain-btn" data-id="${p.id}">Unlink</button>`
            : `<form class="domain-form" data-id="${p.id}">
                <input type="text" class="domain-input" placeholder="clientwebsite.com" />
                <button type="submit" class="btn btn-ghost btn-small-inline">Link Domain</button>
              </form>`
        }
      </div>
      ${healthHtml}`;
  }

  // Paid work needs starting; a quote needs pricing and a reply. Same list,
  // opposite next action, so the card has to say which at a glance.
  function orderKindBadge(p) {
    if (p.orderKind === "paid") {
      const amount = p.amountCents
        ? " · $" + (p.amountCents / 100).toFixed(2)
        : "";
      return `<div class="order-flag flag-paid">
                <svg viewBox="0 0 24 24" fill="none" width="13" height="13" aria-hidden="true"><path d="M5 12l4 4L19 6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Paid${escapeHtml(amount)} — ready to start
              </div>`;
    }
    if (p.orderKind === "quote") {
      return `<div class="order-flag flag-quote">
                <svg viewBox="0 0 24 24" fill="none" width="13" height="13" aria-hidden="true"><path d="M12 17h.01M12 13a2.5 2.5 0 10-2.5-2.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
                Quote requested — needs pricing
              </div>`;
    }
    return `<div class="order-flag flag-enquiry">Enquiry — no payment taken</div>`;
  }

  // Mirrors public.can_remove_projects() in supabase/026. The database is the
  // real gate; this only decides whether the button is worth showing.
  function canRemoveProjects() {
    const email = (window.digicodePortalEmail || "").toLowerCase();
    const me = getTeam().find((d) => (d.email || "").toLowerCase() === email);
    if (!me) return true; // owner account, not on the roster
    return me.rank === "Lead Developer" || (me.permissions || []).includes("Delete Projects");
  }

  // Cancel keeps the row — right for a real job that fell through, especially
  // a paid one where the record is the money trail. Delete removes it, which
  // is only ever right for test rows, spam and duplicates.
  function projectActionsHtml(p) {
    const del = canRemoveProjects()
      ? `<button type="button" class="clear-cart-link danger-link delete-project-btn" data-id="${p.id}">Delete</button>`
      : "";
    return `<div class="project-actions">
              <button type="button" class="clear-cart-link cancel-project-btn" data-id="${p.id}">Cancel</button>
              ${del}
            </div>`;
  }

  async function cancelProject(id) {
    const why = window.prompt(
      "Cancel this project? It stays on record, marked cancelled.\n\nReason (optional):",
      ""
    );
    if (why === null) return;
    const { error } = await digicodeSupabase.rpc("cancel_project", { p_id: id, p_reason: why });
    if (error) {
      window.alert("Couldn't cancel that — if this is the first time, run supabase/026_project_cancel_delete.sql.");
      return;
    }
    await loadProjects();
    renderAllPanels();
  }

  async function deleteProject(id, label, kind) {
    const extra =
      kind === "paid"
        ? "\n\nThis one was PAID. Deleting it removes the record of that payment from the portal — cancel it instead unless this is a test row."
        : "";
    if (!window.confirm(`Delete "${label}" permanently? This can't be undone.${extra}`)) return;
    const { error } = await digicodeSupabase.from("projects").delete().eq("id", id);
    if (error) {
      window.alert("Couldn't delete that — your account may not have permission.");
      return;
    }
    await loadProjects();
    renderAllPanels();
  }

  async function restoreProject(id) {
    const { error } = await digicodeSupabase.rpc("restore_project", { p_id: id });
    if (error) {
      window.alert("Couldn't restore that project.");
      return;
    }
    await loadProjects();
    renderAllPanels();
  }

  async function updateProjectFields(id, fields) {
    await digicodeSupabase.from("projects").update(fields).eq("id", id);
    await loadProjects();
  }

  function wireDomainAndHealthHandlers(panel) {
    panel.querySelectorAll(".domain-form").forEach((form) => {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = form.querySelector(".domain-input");
        const val = input.value.trim();
        if (!val) return;
        const domain = /^https?:\/\//i.test(val) ? val : "https://" + val;
        await updateProjectFields(form.dataset.id, { domain, health: null });
        renderAllPanels();
      });
    });

    panel.querySelectorAll(".edit-domain-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await updateProjectFields(btn.dataset.id, { domain: null, health: null });
        renderAllPanels();
      });
    });

    panel.querySelectorAll(".check-health-btn").forEach((btn) => {
      btn.addEventListener("click", () => checkWebsiteHealth(btn.dataset.id));
    });
  }

  async function checkWebsiteHealth(projectId) {
    const project = getProjects().find((p) => p.id === projectId);
    if (!project || !project.domain) return;

    const key = getPsiKey();
    if (!key) {
      await updateProjectFields(projectId, {
        health: { error: "Add a free Google PageSpeed API key in the Developers tab to run live checks." },
      });
      renderAllPanels();
      return;
    }

    await updateProjectFields(projectId, { health: { loading: true } });
    renderAllPanels();

    const url =
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(project.domain)}` +
      `&category=performance&category=seo&category=accessibility&category=best-practices&strategy=mobile&key=${encodeURIComponent(key)}`;

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `Request failed (${res.status})`);

      const cats = data.lighthouseResult?.categories || {};
      const audits = data.lighthouseResult?.audits || {};

      await updateProjectFields(projectId, {
        health: {
          performance: cats.performance ? Math.round(cats.performance.score * 100) : null,
          seo: cats.seo ? Math.round(cats.seo.score * 100) : null,
          accessibility: cats.accessibility ? Math.round(cats.accessibility.score * 100) : null,
          bestPractices: cats["best-practices"] ? Math.round(cats["best-practices"].score * 100) : null,
          lcp: audits["largest-contentful-paint"]?.displayValue || "—",
          cls: audits["cumulative-layout-shift"]?.displayValue || "—",
          fcp: audits["first-contentful-paint"]?.displayValue || "—",
          checkedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      await updateProjectFields(projectId, {
        health: { error: err.message || "Couldn't fetch results — check the domain and try again." },
      });
    }

    renderAllPanels();
  }

  function renderPendingPanel() {
    const panel = document.getElementById("pendingPanel");
    if (!panel) return;
    const list = getProjects().filter((p) => p.status === "pending");

    // Cancelled jobs are kept, listed under the live ones, and can be put
    // back — so cancelling is never a decision you can't walk away from.
    const cancelled = getProjects().filter((p) => p.status === "cancelled");
    const cancelledHtml = cancelled.length
      ? `<div class="cancelled-block">
           <h3 class="cancelled-head">Cancelled (${cancelled.length})</h3>
           ${cancelled
             .map(
               (p) => `
             <div class="project-card is-cancelled">
               <div class="project-card-head">
                 <div>
                   <span class="project-service">${escapeHtml(p.service)}</span>
                   <span class="project-client">${escapeHtml(p.clientName) || "No name provided"}</span>
                 </div>
                 <span class="project-date">Cancelled ${formatDate(p.cancelledAt)}</span>
               </div>
               ${p.cancelledReason ? `<p class="project-details">Reason: ${escapeHtml(p.cancelledReason)}</p>` : ""}
               <div class="project-actions">
                 <button type="button" class="clear-cart-link restore-project-btn" data-id="${p.id}">Restore</button>
                 ${
                   canRemoveProjects()
                     ? `<button type="button" class="clear-cart-link danger-link delete-project-btn" data-id="${p.id}">Delete</button>`
                     : ""
                 }
               </div>
             </div>`
             )
             .join("")}
         </div>`
      : "";

    if (!list.length) {
      panel.innerHTML =
        `<p class="dev-empty">No pending projects right now.</p>` + cancelledHtml;
      wireProjectActions(panel);
      return;
    }

    panel.innerHTML = list
      .map(
        (p) => `
      <div class="project-card${p.orderKind === "quote" ? " is-quote" : p.orderKind === "paid" ? " is-paid" : ""}">
        <div class="project-card-head">
          <div>
            <span class="project-service">${escapeHtml(p.service)}${p.sample ? " · Sample" : ""}</span>
            <span class="project-client">${escapeHtml(p.clientName) || "No name provided"}</span>
          </div>
          <span class="project-date">Submitted ${formatDate(p.createdAt)}</span>
        </div>
        ${orderKindBadge(p)}
        <div class="project-tiers">${tierTagsHtml(p)}</div>
        <dl class="project-contact">
          <div><dt>Email</dt><dd>${escapeHtml(p.clientEmail) || "—"}</dd></div>
          <div><dt>Discord</dt><dd>${escapeHtml(p.clientDiscord) || "—"}</dd></div>
          <div><dt>Mobile</dt><dd>${escapeHtml(p.clientMobile) || "—"}</dd></div>
        </dl>
        <p class="project-details">${escapeHtml(p.details) || "No project details provided."}</p>
        ${domainAndHealthHtml(p)}
        <button type="button" class="btn btn-primary assign-btn" data-id="${p.id}">Assign to Me</button>
        ${projectActionsHtml(p)}
      </div>`
      )
      .join("") + cancelledHtml;

    panel.querySelectorAll(".assign-btn").forEach((btn) => {
      btn.addEventListener("click", () => assignProject(btn.dataset.id));
    });
    wireProjectActions(panel);
    wireDomainAndHealthHandlers(panel);
  }

  // Shared by the pending list and the cancelled list below it.
  function wireProjectActions(panel) {
    panel.querySelectorAll(".cancel-project-btn").forEach((btn) => {
      btn.addEventListener("click", () => cancelProject(btn.dataset.id));
    });
    panel.querySelectorAll(".delete-project-btn").forEach((btn) => {
      const p = getProjects().find((x) => x.id === btn.dataset.id);
      btn.addEventListener("click", () =>
        deleteProject(btn.dataset.id, (p && p.service) || "this project", p && p.orderKind)
      );
    });
    panel.querySelectorAll(".restore-project-btn").forEach((btn) => {
      btn.addEventListener("click", () => restoreProject(btn.dataset.id));
    });
  }

  async function assignProject(id) {
    const project = getProjects().find((p) => p.id === id);
    if (!project) return;

    await updateProjectFields(id, {
      status: "assigned",
      assigned_dev: window.digicodePortalEmail || "Dev",
      assigned_at: new Date().toISOString(),
    });

    if (project.clientEmail) {
      const subject = encodeURIComponent(`Your ${project.service} project is underway`);
      const body = encodeURIComponent(
        `Hi ${project.clientName || "there"},\n\nA developer has been assigned to your project and will be in touch with you soon via the contact details you provided.\n\nThanks,\nDigiCode`
      );
      window.location.href = `mailto:${project.clientEmail}?subject=${subject}&body=${body}`;
    }

    renderAllPanels();
  }

  function renderAssignedPanel() {
    const panel = document.getElementById("assignedPanel");
    if (!panel) return;
    const list = getProjects().filter((p) => p.status === "assigned");

    if (!list.length) {
      panel.innerHTML = `<p class="dev-empty">No assigned projects right now.</p>`;
      return;
    }

    panel.innerHTML = list
      .map(
        (p) => `
      <div class="project-card">
        <div class="project-card-head">
          <div>
            <span class="project-service">${escapeHtml(p.service)}${p.sample ? " · Sample" : ""}</span>
            <span class="project-client">${escapeHtml(p.clientName) || "No name provided"}</span>
          </div>
          <span class="project-date">Assigned ${formatDate(p.assignedAt)}</span>
        </div>
        <div class="project-tiers">${tierTagsHtml(p)}</div>
        <p class="project-assigned-to">Assigned to <strong>${escapeHtml(p.assignedDev)}</strong></p>
        <div class="project-notes">
          ${
            p.progressNotes.length
              ? p.progressNotes
                  .map((n) => `<div class="project-note"><span class="project-note-date">${formatDate(n.date)}</span><p>${escapeHtml(n.note)}</p></div>`)
                  .join("")
              : `<p class="dev-empty">No progress notes yet.</p>`
          }
        </div>
        <form class="add-note-form" data-id="${p.id}">
          <input type="text" placeholder="Add a progress note…" class="note-input" />
          <button type="submit" class="btn btn-ghost btn-small-inline">Add Note</button>
        </form>
        ${domainAndHealthHtml(p)}
        <button type="button" class="btn btn-primary finish-btn" data-id="${p.id}">Mark as Finished</button>
      </div>`
      )
      .join("");

    panel.querySelectorAll(".add-note-form").forEach((form) => {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = form.querySelector(".note-input");
        const text = input.value.trim();
        if (!text) return;
        addProgressNote(form.dataset.id, text);
      });
    });

    panel.querySelectorAll(".finish-btn").forEach((btn) => {
      btn.addEventListener("click", () => finishProject(btn.dataset.id));
    });
    wireDomainAndHealthHandlers(panel);
  }

  async function addProgressNote(id, text) {
    const project = getProjects().find((p) => p.id === id);
    if (!project) return;
    const notes = [...project.progressNotes, { date: new Date().toISOString(), note: text }];
    await updateProjectFields(id, { progress_notes: notes });
    renderAssignedPanel();
  }

  async function finishProject(id) {
    await updateProjectFields(id, { status: "finished", finished_at: new Date().toISOString() });
    renderAllPanels();
  }

  function renderFinishedPanel() {
    const panel = document.getElementById("finishedPanel");
    if (!panel) return;
    const list = getProjects().filter((p) => p.status === "finished");

    if (!list.length) {
      panel.innerHTML = `<p class="dev-empty">No finished projects yet.</p>`;
      return;
    }

    panel.innerHTML = list
      .map(
        (p) => `
      <div class="project-card">
        <div class="project-card-head">
          <div>
            <span class="project-service">${escapeHtml(p.service)}${p.sample ? " · Sample" : ""}</span>
            <span class="project-client">${escapeHtml(p.clientName) || "No name provided"}</span>
          </div>
          <span class="project-date">Finished ${formatDate(p.finishedAt)}</span>
        </div>
        <div class="project-tiers">${tierTagsHtml(p)}</div>
        ${
          p.review
            ? `<div class="project-review">
                <span class="project-review-stars">${"★".repeat(p.review.rating)}${"☆".repeat(5 - p.review.rating)}</span>
                <p>"${escapeHtml(p.review.text)}"</p>
              </div>`
            : `<p class="dev-empty">No customer review submitted yet.</p>`
        }
        ${domainAndHealthHtml(p)}
      </div>`
      )
      .join("");

    wireDomainAndHealthHandlers(panel);
  }

  // One list, used by both the add form and the edit form, so a permission
  // added here can never appear in one and not the other.
  const DEV_PERMISSIONS = [
    ["View Pending", "View Pending Projects"],
    ["View Assigned", "View Assigned Projects"],
    ["View Finished", "View Finished Projects"],
    ["Assign Projects", "Assign Projects to Self"],
    ["Manage Developers", "Manage Other Developers"],
    ["Delete Live Chats", "Delete Live Chat History"],
    ["Manage Discount Codes", "Manage Discount Codes"],
    ["Delete Projects", "Delete Projects"],
    ["Manage Scripts", "List Scripts For Sale"],
    ["Price Quotes", "Price & Send Quotes"],
  ];
  const DEV_RANKS = ["Junior Developer", "Developer", "Senior Developer", "Lead Developer"];
  const DEFAULT_NEW_DEV_PERMISSIONS = ["View Pending", "View Assigned", "View Finished"];

  function permissionCheckboxes(granted) {
    return DEV_PERMISSIONS.map(
      ([value, label]) =>
        `<label class="checkbox-option"><input type="checkbox" value="${value}"${
          granted.includes(value) ? " checked" : ""
        } /> ${label}</label>`
    ).join("");
  }

  // Mirrors public.can_manage_developers() in supabase/021. The database is the
  // real gate; this only decides whether to draw the controls.
  function canManageDevelopers() {
    const email = (window.digicodePortalEmail || "").toLowerCase();
    const me = getTeam().find((d) => (d.email || "").toLowerCase() === email);
    if (!me) return true; // owner account, not on the roster
    return me.rank === "Lead Developer" || (me.permissions || []).includes("Manage Developers");
  }

  // Which developer row is open for editing. Held as a string because
  // mapDeveloperRow casts row ids to strings — comparing against a Number
  // here silently never matches.
  let editingDevId = null;

  function renderDevelopersPanel() {
    const panel = document.getElementById("developersPanel");
    if (!panel) return;
    const team = getTeam();
    const canManage = canManageDevelopers();

    panel.innerHTML = `
      <div class="add-dev-form api-key-card">
        <h3 class="dashboard-section-title" style="margin-bottom: 8px; font-size: 1rem;">Website Health — API Settings</h3>
        <p class="form-hint">Live SEO/performance checks (in the project tabs) run on Google's free PageSpeed Insights API. Get a free key from Google Cloud Console (enable "PageSpeed Insights API," create an API key) and paste it here — it's stored only in this browser, never sent anywhere except directly to Google when you run a check.</p>
        <form id="psiKeyForm" class="form-grid" style="margin-top: 12px;">
          <div class="form-group" style="grid-column: 1 / -1;">
            <label for="psiKeyInput">Google PageSpeed API Key</label>
            <input type="text" id="psiKeyInput" placeholder="Paste your API key" value="${escapeHtml(getPsiKey())}" />
          </div>
        </form>
        <button type="button" id="savePsiKeyBtn" class="btn btn-ghost btn-small-inline">Save Key</button>
        <span id="psiKeySavedNote" class="dev-team-meta" style="margin-left: 10px;" hidden>Saved.</span>
      </div>

      ${canManage ? `
      <div class="dev-warning-banner">Adding someone here grants real access — the moment they sign in at the normal sign-in page with this exact email, they'll get a real Dev account with this rank and these permissions. No password to set or share; they use the same one-time-code sign-in as everyone else.</div>
      <form id="addDevForm" class="add-dev-form">
        <div class="form-grid">
          <div class="form-group">
            <label for="newDevName">Name</label>
            <input type="text" id="newDevName" required />
          </div>
          <div class="form-group">
            <label for="newDevEmail">Email</label>
            <input type="email" id="newDevEmail" required />
          </div>
          <div class="form-group">
            <label for="newDevUsername">Username</label>
            <input type="text" id="newDevUsername" required />
          </div>
        </div>
        <div class="form-group">
          <label for="newDevRank">Rank</label>
          <select id="newDevRank">
            <option value="Junior Developer">Junior Developer</option>
            <option value="Developer" selected>Developer</option>
            <option value="Senior Developer">Senior Developer</option>
            <option value="Lead Developer">Lead Developer</option>
          </select>
        </div>
        <div class="form-group">
          <span class="form-label">Permissions</span>
          <div class="permission-grid">${permissionCheckboxes(DEFAULT_NEW_DEV_PERMISSIONS)}</div>
        </div>
        <button type="submit" class="btn btn-primary">Create Developer</button>
      </form>
` : `<p class="dev-empty">Only a Lead Developer, or someone with the "Manage Developers" permission, can add or change accounts here.</p>`}

      <div class="dev-team-list">
        ${
          team.length
            ? team
                .map(
                  (d) => `
          <div class="dev-team-row${editingDevId === d.id ? " is-editing" : ""}">
            <div class="dev-team-info">
              <span class="dev-team-name"><span class="cosmic-name">${escapeHtml(d.name)}</span> <span class="rank-badge">${escapeHtml(d.rank)}</span></span>
              <span class="dev-team-meta">${escapeHtml(d.username)} · ${escapeHtml(d.email)}</span>
              <span class="dev-team-perms">${d.permissions.length ? escapeHtml(d.permissions.join(", ")) : "No permissions granted"}</span>
            </div>
            ${
              canManage
                ? `<div class="dev-team-actions">
                     <button type="button" class="btn btn-ghost btn-small edit-dev-btn" data-id="${d.id}">${editingDevId === d.id ? "Close" : "Edit"}</button>
                     <button type="button" class="cart-item-remove remove-dev-btn" data-id="${d.id}" aria-label="Remove ${escapeHtml(d.name)}">&times;</button>
                   </div>`
                : ""
            }
          </div>
          ${
            editingDevId === d.id && canManage
              ? `
          <form class="dev-edit-form" data-id="${d.id}">
            <h4>Editing ${escapeHtml(d.name)}</h4>
            <div class="form-group">
              <label for="editRank-${d.id}">Rank</label>
              <select id="editRank-${d.id}" class="edit-rank">
                ${DEV_RANKS.map(
                  (r) => `<option value="${r}"${d.rank === r ? " selected" : ""}>${r}</option>`
                ).join("")}
              </select>
              <span class="form-hint">Lead Developer carries every permission automatically, whatever is ticked below.</span>
            </div>
            <div class="form-group">
              <span class="form-label">Permissions</span>
              <div class="permission-grid edit-perms">${permissionCheckboxes(d.permissions || [])}</div>
            </div>
            <p class="portal-login-error edit-dev-error" hidden></p>
            <div class="dev-edit-actions">
              <button type="submit" class="btn btn-primary btn-small">Save Changes</button>
              <button type="button" class="btn btn-ghost btn-small cancel-edit-btn">Cancel</button>
              <span class="dev-team-meta edit-dev-saved" hidden>Saved.</span>
            </div>
          </form>`
              : ""
          }`
                )
                .join("")
            : `<p class="dev-empty">No developers added yet.</p>`
        }
      </div>
    `;

    document.getElementById("savePsiKeyBtn")?.addEventListener("click", () => {
      const val = document.getElementById("psiKeyInput").value.trim();
      savePsiKey(val);
      const note = document.getElementById("psiKeySavedNote");
      if (note) {
        note.hidden = false;
        setTimeout(() => (note.hidden = true), 2000);
      }
    });

    document.getElementById("addDevForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("newDevName").value.trim();
      const email = document.getElementById("newDevEmail").value.trim();
      const username = document.getElementById("newDevUsername").value.trim();
      const rank = document.getElementById("newDevRank").value;
      const permissions = Array.from(panel.querySelectorAll(".permission-grid input:checked")).map((cb) => cb.value);

      await digicodeSupabase.from("developers").insert({ name, email, username, rank, permissions });
      await loadTeam();
      renderDevelopersPanel();
      renderChatPanel();
    });

    panel.querySelectorAll(".remove-dev-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const dev = getTeam().find((d) => String(d.id) === String(btn.dataset.id));
        if (!window.confirm(`Remove ${dev ? dev.name : "this developer"} from the roster? They'll lose portal access.`)) return;
        const { error } = await digicodeSupabase.from("developers").delete().eq("id", btn.dataset.id);
        if (error) {
          window.alert("Couldn't remove them — your account may not have permission.");
          return;
        }
        if (editingDevId === btn.dataset.id) editingDevId = null;
        await loadTeam();
        renderDevelopersPanel();
      });
    });

    panel.querySelectorAll(".edit-dev-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        editingDevId = editingDevId === id ? null : id;
        renderDevelopersPanel();
      });
    });

    panel.querySelectorAll(".cancel-edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        editingDevId = null;
        renderDevelopersPanel();
      });
    });

    panel.querySelectorAll(".dev-edit-form").forEach((form) => {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const id = form.dataset.id;
        const err = form.querySelector(".edit-dev-error");
        const rank = form.querySelector(".edit-rank").value;
        const permissions = Array.from(form.querySelectorAll(".edit-perms input:checked")).map((cb) => cb.value);

        err.hidden = true;
        const { error } = await digicodeSupabase
          .from("developers")
          .update({ rank, permissions })
          .eq("id", id);

        if (error) {
          err.textContent = "Couldn't save that — your account may not have permission to change the roster.";
          err.hidden = false;
          return;
        }

        await loadTeam();
        editingDevId = null;
        renderDevelopersPanel();
        renderChatPanel(); // rank shows on the dev chat list
      });
    });
  }

  function chatDisplayName(chatId) {
    if (chatId.startsWith("client:")) {
      const project = getProjects().find((p) => p.id === chatId.slice(7));
      return project ? project.clientName || "Unnamed client" : "Unknown client";
    }
    if (chatId.startsWith("dev:")) {
      const dev = getTeam().find((d) => d.id === chatId.slice(4));
      return dev ? dev.name : "Unknown developer";
    }
    return "Unknown";
  }

  function renderChatPanel() {
    const panel = document.getElementById("chatPanel");
    if (!panel) return;

    const projects = getProjects().filter((p) => p.clientName);
    const team = getTeam();
    const chats = getChats();

    if (activeChatId) {
      const stillExists =
        (activeChatId.startsWith("client:") && projects.some((p) => "client:" + p.id === activeChatId)) ||
        (activeChatId.startsWith("dev:") && team.some((d) => "dev:" + d.id === activeChatId)) ||
        (activeChatId.startsWith("visitor:") &&
          getVisitorChats().some((c) => "visitor:" + c.id === activeChatId));
      if (!stillExists) activeChatId = null;
    }

    // Visitor threads come from their own tables and have their own shape, so
    // they get their own branch rather than being forced into the one above.
    if (chatListMode === "visitors") {
      renderVisitorChat(panel);
      return;
    }

    const lastMessagePreview = (chatId) => {
      const msgs = chats[chatId] || [];
      const last = msgs[msgs.length - 1];
      return last ? escapeHtml(last.text) : "No messages yet";
    };

    const listItemsHtml =
      chatListMode === "clients"
        ? projects.length
          ? projects
              .map((p) => {
                const chatId = "client:" + p.id;
                return `
              <button type="button" class="chat-list-item ${activeChatId === chatId ? "active" : ""}" data-chat-id="${chatId}">
                <span class="chat-list-name">${escapeHtml(p.clientName)}</span>
                <span class="chat-list-preview">${lastMessagePreview(chatId)}</span>
              </button>`;
              })
              .join("")
          : `<p class="dev-empty">No client conversations yet.</p>`
        : team.length
        ? team
            .map((d) => {
              const chatId = "dev:" + d.id;
              return `
              <button type="button" class="chat-list-item ${activeChatId === chatId ? "active" : ""}" data-chat-id="${chatId}">
                <span class="chat-list-name"><span class="cosmic-name">${escapeHtml(d.name)}</span> <span class="rank-badge">${escapeHtml(d.rank)}</span></span>
                <span class="chat-list-preview">${lastMessagePreview(chatId)}</span>
              </button>`;
            })
            .join("")
        : `<p class="dev-empty">No developers added yet. Add one in the Developers tab.</p>`;

    const activeMsgs = activeChatId ? chats[activeChatId] || [] : [];
    const threadHtml = activeChatId
      ? `
        <div class="chat-thread-header">${escapeHtml(chatDisplayName(activeChatId))}</div>
        <div class="chat-messages" id="chatMessages">
          ${
            activeMsgs.length
              ? activeMsgs
                  .map(
                    (m) => `
              <div class="chat-message ${m.from === window.digicodePortalEmail ? "mine" : "theirs"}">
                <div class="chat-message-bubble">${escapeHtml(m.text)}</div>
                <span class="chat-message-meta">${escapeHtml(m.from)} · ${formatDate(m.at)}</span>
              </div>`
                  )
                  .join("")
              : `<p class="dev-empty">No messages yet — say hello.</p>`
          }
        </div>
        <form id="chatSendForm" class="chat-input-row">
          <input type="text" id="chatInput" class="chat-input" placeholder="Type a message…" autocomplete="off" />
          <button type="submit" class="btn btn-primary">Send</button>
        </form>`
      : `<div class="chat-empty-state">Select a conversation to start chatting.</div>`;

    panel.innerHTML = `
      <div class="chat-layout">
        <div class="chat-sidebar">
          <div class="billing-toggle chat-mode-toggle">
            <button type="button" class="billing-tab chat-mode-btn ${chatListMode === "clients" ? "active" : ""}" data-mode="clients">Clients</button>
            <button type="button" class="billing-tab chat-mode-btn ${chatListMode === "team" ? "active" : ""}" data-mode="team">Talk to a Developer</button>
            <button type="button" class="billing-tab chat-mode-btn ${chatListMode === "visitors" ? "active" : ""}" data-mode="visitors">Site Visitors${totalVisitorUnread() ? ` (${totalVisitorUnread()})` : ""}</button>
          </div>
          <div class="chat-list">${listItemsHtml}</div>
        </div>
        <div class="chat-thread">${threadHtml}</div>
      </div>
    `;

    panel.querySelectorAll(".chat-mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        chatListMode = btn.dataset.mode;
        activeChatId = null;
        renderChatPanel();
      });
    });

    panel.querySelectorAll(".chat-list-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeChatId = btn.dataset.chatId;
        renderChatPanel();
        const msgsEl = document.getElementById("chatMessages");
        if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
      });
    });

    const chatSendForm = document.getElementById("chatSendForm");
    chatSendForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("chatInput");
      const text = input.value.trim();
      if (!text || !activeChatId) return;
      await digicodeSupabase.from("chats").insert({
        chat_id: activeChatId,
        from_name: window.digicodePortalEmail || "Dev",
        message: text,
      });
      await loadChats();
      renderChatPanel();
      const msgsEl = document.getElementById("chatMessages");
      if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
    });
  }

  function totalVisitorUnread() {
    return getVisitorChats().reduce((n, c) => n + visitorUnreadCount(c.id), 0);
  }

  // Mirrors public.can_delete_visitor_chats() in supabase/019. The database is
  // the real gate — this only decides whether to draw the buttons, so a dev
  // isn't shown a control that would just bounce off RLS.
  function canDeleteVisitorChats() {
    const email = (window.digicodePortalEmail || "").toLowerCase();
    const me = getTeam().find((d) => (d.email || "").toLowerCase() === email);
    if (!me) return true; // owner account, not on the roster
    return me.rank === "Lead Developer" || (me.permissions || []).includes("Delete Live Chats");
  }

  async function deleteVisitorConversation(id, label) {
    if (!window.confirm(`Delete the whole conversation with ${label}? This can't be undone.`)) return;
    const { error } = await digicodeSupabase.from("visitor_chats").delete().eq("id", id);
    if (error) {
      window.alert("Couldn't delete that conversation — your account may not have permission.");
      return;
    }
    if (activeChatId === "visitor:" + id) activeChatId = null;
    await loadVisitorChats();
    renderChatPanel();
  }

  async function deleteReadVisitorConversations() {
    const stale = getVisitorChats().filter((c) => visitorUnreadCount(c.id) === 0);
    if (!stale.length) {
      window.alert("Nothing to clear — every conversation still has unread messages.");
      return;
    }
    if (!window.confirm(`Delete ${stale.length} read conversation${stale.length === 1 ? "" : "s"}? This can't be undone.`)) return;
    const { error } = await digicodeSupabase
      .from("visitor_chats")
      .delete()
      .in("id", stale.map((c) => c.id));
    if (error) {
      window.alert("Couldn't clear those — your account may not have permission.");
      return;
    }
    activeChatId = null;
    await loadVisitorChats();
    renderChatPanel();
  }

  function renderVisitorChat(panel) {
    const convos = getVisitorChats();
    const canDelete = canDeleteVisitorChats();
    const activeId = activeChatId && activeChatId.startsWith("visitor:")
      ? Number(activeChatId.slice(8))
      : null;

    const listHtml = convos.length
      ? convos
          .map((c) => {
            const msgs = getVisitorMessages(c.id);
            const last = msgs[msgs.length - 1];
            const unread = visitorUnreadCount(c.id);
            const chatId = "visitor:" + c.id;
            const label = c.visitor_name || "Anonymous visitor";
            return `
              <div class="chat-visitor-row">
                <button type="button" class="chat-list-item ${activeChatId === chatId ? "active" : ""}" data-chat-id="${chatId}">
                  <span class="chat-list-name">
                    ${escapeHtml(label)}
                    ${unread ? `<span class="chat-visitor-badge">${unread} new</span>` : ""}
                  </span>
                  <span class="chat-list-preview">${last ? escapeHtml(last.body) : "No messages yet"}</span>
                  <span class="chat-visitor-meta">${escapeHtml(c.visitor_email || "No email given")} · ${formatDate(c.last_message_at)}</span>
                </button>
                ${
                  canDelete
                    ? `<button type="button" class="chat-visitor-delete" data-delete-id="${c.id}" data-label="${escapeHtml(label)}" title="Delete this conversation" aria-label="Delete the conversation with ${escapeHtml(label)}">&times;</button>`
                    : ""
                }
              </div>`;
          })
          .join("")
      : `<p class="dev-empty">No one has started a chat yet. The bubble is live on every page of the site.</p>`;

    const convo = convos.find((c) => c.id === activeId);
    const msgs = activeId ? getVisitorMessages(activeId) : [];

    const threadHtml = convo
      ? `
        <div class="chat-thread-header">
          ${escapeHtml(convo.visitor_name || "Anonymous visitor")}
          <span class="chat-live-pill">Live</span>
        </div>
        <div class="chat-messages" id="chatMessages">
          ${
            msgs.length
              ? msgs
                  .map(
                    (m) => `
              <div class="chat-message ${m.sender === "dev" ? "mine" : "theirs"}">
                <div class="chat-message-bubble">${escapeHtml(m.body)}</div>
                <span class="chat-message-meta">${escapeHtml(
                  m.sender === "dev" ? m.sender_name || "DigiCode" : convo.visitor_name || "Visitor"
                )} · ${formatDate(m.created_at)}</span>
              </div>`
                  )
                  .join("")
              : `<p class="dev-empty">No messages yet.</p>`
          }
        </div>
        <form id="visitorSendForm" class="chat-input-row">
          <input type="text" id="visitorInput" class="chat-input" placeholder="Reply to this visitor…" autocomplete="off" />
          <button type="submit" class="btn btn-primary">Send</button>
        </form>`
      : `<div class="chat-empty-state">Select a conversation to reply. New messages arrive here live.</div>`;

    panel.innerHTML = `
      <div class="chat-layout">
        <div class="chat-sidebar">
          <div class="billing-toggle chat-mode-toggle">
            <button type="button" class="billing-tab chat-mode-btn" data-mode="clients">Clients</button>
            <button type="button" class="billing-tab chat-mode-btn" data-mode="team">Talk to a Developer</button>
            <button type="button" class="billing-tab chat-mode-btn active" data-mode="visitors">Site Visitors${
              totalVisitorUnread() ? ` (${totalVisitorUnread()})` : ""
            }</button>
          </div>
          <div class="chat-list">${listHtml}</div>
          ${
            canDelete && convos.length
              ? `<button type="button" class="btn btn-ghost btn-small chat-clear-read" id="clearReadChats">Clear read conversations</button>`
              : ""
          }
        </div>
        <div class="chat-thread">${threadHtml}</div>
      </div>
    `;

    panel.querySelectorAll(".chat-mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        chatListMode = btn.dataset.mode;
        activeChatId = null;
        renderChatPanel();
      });
    });

    panel.querySelectorAll(".chat-list-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeChatId = btn.dataset.chatId;
        markVisitorSeen(Number(activeChatId.slice(8)));
        renderChatPanel();
        const el = document.getElementById("chatMessages");
        if (el) el.scrollTop = el.scrollHeight;
      });
    });

    panel.querySelectorAll(".chat-visitor-delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteVisitorConversation(Number(btn.dataset.deleteId), btn.dataset.label);
      });
    });

    document.getElementById("clearReadChats")?.addEventListener("click", deleteReadVisitorConversations);

    if (activeId) markVisitorSeen(activeId);

    const msgsEl = document.getElementById("chatMessages");
    if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;

    document.getElementById("visitorSendForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("visitorInput");
      const text = input.value.trim();
      if (!text || !activeId) return;
      input.value = "";
      const { error } = await digicodeSupabase.from("visitor_messages").insert({
        conversation_id: activeId,
        sender: "dev",
        sender_name: resolvePortalFirstName() || "DigiCode",
        body: text,
      });
      if (error) {
        input.value = text;
        return;
      }
      await loadVisitorChats();
      renderChatPanel();
    });
  }

  // Push new visitor messages straight into the panel instead of waiting for
  // a refresh — this is the "live" half of live chat.
  function subscribeToVisitorChat() {
    if (!digicodeSupabase.channel) return;
    digicodeSupabase
      .channel("visitor-chat-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "visitor_messages" }, async () => {
        await loadVisitorChats();
        if (chatListMode === "visitors") renderChatPanel();
        else renderChatPanel();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "visitor_chats" }, async () => {
        await loadVisitorChats();
        renderChatPanel();
      })
      .subscribe();
  }

  // ---------------------------------------------------------------------
  // Discount codes. Mirrors public.can_manage_discount_codes() in
  // supabase/020 — the database is the real gate, this just decides whether
  // to draw the form.
  // ---------------------------------------------------------------------
  function canManageDiscounts() {
    const email = (window.digicodePortalEmail || "").toLowerCase();
    const me = getTeam().find((d) => (d.email || "").toLowerCase() === email);
    if (!me) return true; // owner account, not on the roster
    return me.rank === "Lead Developer" || (me.permissions || []).includes("Manage Discount Codes");
  }

  function codeStatus(c) {
    const now = Date.now();
    const start = new Date(c.starts_at).getTime();
    const end = new Date(c.expires_at).getTime();
    const exhausted = c.max_uses != null && c.times_used >= c.max_uses;

    if (!c.active) return { label: "Switched off", tone: "off" };
    if (exhausted) return { label: "Used up", tone: "off" };
    if (now < start) return { label: "Not started yet", tone: "wait" };
    if (now >= end) return { label: "Expired", tone: "off" };

    const hoursLeft = (end - now) / 3600000;
    const left = hoursLeft >= 48
      ? `${Math.floor(hoursLeft / 24)} days left`
      : hoursLeft >= 2
      ? `${Math.floor(hoursLeft)} hours left`
      : `${Math.max(1, Math.floor(hoursLeft * 60))} min left`;
    return { label: left, tone: hoursLeft < 48 ? "soon" : "live" };
  }

  function activeForLabel(c) {
    const days = (Date.now() - new Date(c.starts_at).getTime()) / 86400000;
    if (days < 0) return "Scheduled";
    if (days < 1) return `Live ${Math.max(1, Math.floor(days * 24))}h`;
    return `Live ${Math.floor(days)} day${Math.floor(days) === 1 ? "" : "s"}`;
  }

  async function renderDiscountsPanel() {
    const panel = document.getElementById("discountsPanel");
    if (!panel) return;

    const { data, error } = await digicodeSupabase
      .from("discount_codes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      panel.innerHTML = `<p class="dev-empty">Couldn't load discount codes. If this is the first time, run supabase/020_discount_codes.sql.</p>`;
      return;
    }

    const codes = data || [];
    const canManage = canManageDiscounts();

    const formHtml = canManage
      ? `
      <form class="add-dev-form" id="addDiscountForm">
        <h3>Create a discount code</h3>
        <div class="form-grid">
          <div class="form-group">
            <label for="dcCode">Code</label>
            <input type="text" id="dcCode" placeholder="e.g. LAUNCH20" maxlength="40" required />
          </div>
          <div class="form-group">
            <label for="dcKind">Type</label>
            <select id="dcKind">
              <option value="percent">Percentage off</option>
              <option value="fixed">Fixed amount off</option>
            </select>
          </div>
          <div class="form-group">
            <label for="dcAmount">Amount</label>
            <input type="number" id="dcAmount" min="1" step="0.01" placeholder="20" required />
            <span class="form-hint" id="dcAmountHint">Percent off, 1–100.</span>
          </div>
          <div class="form-group">
            <label for="dcApplies">Applies to</label>
            <select id="dcApplies">
              <option value="both">Everything in the cart</option>
              <option value="one_time">One-time builds only</option>
              <option value="subscription">Subscriptions only</option>
            </select>
          </div>
          <div class="form-group">
            <label for="dcDays">Runs for</label>
            <input type="number" id="dcDays" min="1" max="30" value="14" required />
            <span class="form-hint">Days from now. Maximum 30.</span>
          </div>
          <div class="form-group">
            <label for="dcMaxUses">Usage limit</label>
            <input type="number" id="dcMaxUses" min="1" placeholder="Leave blank for unlimited" />
          </div>
        </div>
        <p class="portal-login-error" id="dcError" hidden></p>
        <button type="submit" class="btn btn-primary">Create Code</button>
      </form>`
      : `<p class="dev-empty">You can see the codes here, but creating and changing them needs the Lead Developer rank or the "Manage Discount Codes" permission.</p>`;

    const listHtml = codes.length
      ? codes
          .map((c) => {
            const st = codeStatus(c);
            const value = c.kind === "percent" ? `${+c.amount}% off` : `$${(+c.amount).toFixed(2)} off`;
            const scope =
              c.applies_to === "one_time" ? "one-time only" :
              c.applies_to === "subscription" ? "subscriptions only" : "everything";
            const uses = c.max_uses != null ? `${c.times_used} of ${c.max_uses} used` : `${c.times_used} used`;
            return `
          <div class="discount-row">
            <div class="discount-main">
              <span class="discount-code">${escapeHtml(c.code)}</span>
              <span class="discount-value">${value} · ${scope}</span>
              <span class="discount-meta">${activeForLabel(c)} · ${uses} · expires ${formatDate(c.expires_at)}</span>
            </div>
            <span class="discount-status tone-${st.tone}">${st.label}</span>
            ${
              canManage
                ? `<div class="discount-actions">
                     <button type="button" class="btn btn-ghost btn-small dc-toggle" data-id="${c.id}" data-active="${c.active}">${c.active ? "Turn off" : "Turn on"}</button>
                     <button type="button" class="cart-item-remove dc-delete" data-id="${c.id}" data-code="${escapeHtml(c.code)}" aria-label="Delete ${escapeHtml(c.code)}">&times;</button>
                   </div>`
                : ""
            }
          </div>`;
          })
          .join("")
      : `<p class="dev-empty">No discount codes yet.</p>`;

    panel.innerHTML = formHtml + `<div class="discount-list">${listHtml}</div>`;

    const kindEl = document.getElementById("dcKind");
    kindEl?.addEventListener("change", () => {
      document.getElementById("dcAmountHint").textContent =
        kindEl.value === "percent" ? "Percent off, 1–100." : "Dollars off the total.";
    });

    document.getElementById("addDiscountForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = document.getElementById("dcError");
      const code = document.getElementById("dcCode").value.trim().toUpperCase();
      const kind = document.getElementById("dcKind").value;
      const amount = parseFloat(document.getElementById("dcAmount").value);
      const applies = document.getElementById("dcApplies").value;
      const days = parseInt(document.getElementById("dcDays").value, 10);
      const maxUsesRaw = document.getElementById("dcMaxUses").value.trim();

      const fail = (m) => { err.textContent = m; err.hidden = false; };
      err.hidden = true;

      if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return fail("Codes can use letters, numbers, dashes and underscores — 3 to 40 characters.");
      if (!(amount > 0)) return fail("Enter a discount amount above zero.");
      if (kind === "percent" && amount > 100) return fail("A percentage discount can't be more than 100%.");
      if (!(days >= 1 && days <= 30)) return fail("A code can run for between 1 and 30 days.");

      const { error: insErr } = await digicodeSupabase.from("discount_codes").insert({
        code,
        kind,
        amount,
        applies_to: applies,
        expires_at: new Date(Date.now() + days * 86400000).toISOString(),
        max_uses: maxUsesRaw ? parseInt(maxUsesRaw, 10) : null,
        created_by: window.digicodePortalEmail || null,
      });

      if (insErr) {
        return fail(
          /duplicate|unique/i.test(insErr.message)
            ? "That code already exists."
            : "Couldn't create that code — your account may not have permission."
        );
      }
      renderDiscountsPanel();
    });

    panel.querySelectorAll(".dc-toggle").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await digicodeSupabase
          .from("discount_codes")
          .update({ active: btn.dataset.active !== "true" })
          .eq("id", Number(btn.dataset.id));
        renderDiscountsPanel();
      });
    });

    panel.querySelectorAll(".dc-delete").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!window.confirm(`Delete the code ${btn.dataset.code}? This can't be undone.`)) return;
        await digicodeSupabase.from("discount_codes").delete().eq("id", Number(btn.dataset.id));
        renderDiscountsPanel();
      });
    });
  }

  function renderAllPanels() {
    renderPendingPanel();
    renderInvoicesPanel();
    renderDiscountsPanel();
    renderAssignedPanel();
    renderFinishedPanel();
    renderDevelopersPanel();
    renderChatPanel();
    renderScriptsPanel();
    renderScriptSalesPanel();
    renderStatGrid();
    renderRankList();
    renderPerfGrid();
  }

  function waitForAuthReady() {
    if (window.digicodePortalRole) return Promise.resolve();
    return new Promise((resolve) => document.addEventListener("digicode-auth-ready", resolve, { once: true }));
  }

  // TEMP: Dev/Client preview toggle — for design/testing only, remove once a
  // real client portal (separate login, real per-client data) exists.
  const viewSwitchBtns = document.querySelectorAll(".view-switch-btn");
  const viewSwitchRow = document.querySelector(".view-switch-row");
  const devViewContainer = document.getElementById("devViewContainer");
  const clientViewContainer = document.getElementById("clientViewContainer");
  const portalWelcomeName = document.getElementById("portalWelcomeName");

  function renderClientPreview() {
    if (!clientViewContainer) return;
    const isRealClient = window.digicodePortalRole === "client";
    const projects = getProjects();
    const demoProject = projects[0];

    if (!demoProject) {
      // An invoice can exist before there is a project — a quote priced for
      // someone who hasn't bought anything yet. Still show it, or they have
      // no way to pay from in here.
      const invoicesOnly = clientInvoicesHtml();
      clientViewContainer.innerHTML = isRealClient
        ? (invoicesOnly ||
            `<p class="dev-empty">We don't have a project on file for this account yet. If you've just purchased a build or plan, make sure you checked out with this same email — otherwise email <a href="mailto:developerteam@digi-code.com.au">developerteam@digi-code.com.au</a> and we'll sort it out.</p>`) +
           `<div style="text-align: center; margin-top: 24px;"><button type="button" class="clear-cart-link" data-portal-logout>Log out</button></div>`
        : `<p class="dev-empty">No projects exist yet to preview.</p>`;
      return;
    }

    const chatId = "client:" + demoProject.id;
    const chats = getChats();
    const msgs = chats[chatId] || [];
    const statusLabel =
      demoProject.status === "finished" ? "Finished" : demoProject.status === "assigned" ? "In progress" : "Submitted";
    const statusDate = demoProject.finishedAt || demoProject.assignedAt || demoProject.createdAt;

    // Where the project has got to, as three plain steps. Clients otherwise
    // have to infer progress from whether a dev's name has appeared.
    const stageIndex = demoProject.status === "finished" ? 2 : demoProject.status === "assigned" ? 1 : 0;
    const stages = ["Submitted", "In progress", "Finished"];
    const trackerHtml = `
      <ol class="client-stage-track">
        ${stages
          .map(
            (label, i) => `
          <li class="client-stage ${i < stageIndex ? "done" : i === stageIndex ? "current" : ""}">
            <span class="client-stage-dot"></span>
            <span class="client-stage-label">${label}</span>
          </li>`
          )
          .join("")}
      </ol>`;

    // Health is read-only here on purpose: running a check needs a dev's
    // PageSpeed API key and write access to the project, so a client sees
    // the most recent result rather than being able to trigger one. Skipped
    // entirely while a check is mid-flight or errored — a client shouldn't
    // be shown our API plumbing failing.
    const health = demoProject.health;
    const showHealth = health && !health.loading && !health.error && health.performance != null;
    const healthHtml = showHealth
      ? `
      <h2 class="dashboard-section-title" style="margin-top: 40px;">Your Website Health</h2>
      <div class="health-panel">
        <div class="health-header">
          <span>Latest check${demoProject.domain ? ` — ${escapeHtml(demoProject.domain)}` : ""}</span>
          <span class="health-meta">Checked ${formatDate(health.checkedAt)} · via Google PageSpeed Insights</span>
        </div>
        <div class="health-grid">
          <div class="stat-tile health-tile"><span class="stat-tile-label">Performance</span><span class="stat-tile-value ${scoreClass(health.performance)}">${health.performance ?? "—"}</span></div>
          <div class="stat-tile health-tile"><span class="stat-tile-label">SEO</span><span class="stat-tile-value ${scoreClass(health.seo)}">${health.seo ?? "—"}</span></div>
          <div class="stat-tile health-tile"><span class="stat-tile-label">Accessibility</span><span class="stat-tile-value ${scoreClass(health.accessibility)}">${health.accessibility ?? "—"}</span></div>
          <div class="stat-tile health-tile"><span class="stat-tile-label">Best Practices</span><span class="stat-tile-value ${scoreClass(health.bestPractices)}">${health.bestPractices ?? "—"}</span></div>
        </div>
        ${health.lcp ? `<p class="health-vitals">LCP ${escapeHtml(health.lcp)} · CLS ${escapeHtml(health.cls)} · FCP ${escapeHtml(health.fcp)}</p>` : ""}
        <p class="portal-note" style="margin: 10px 0 0;">Scored out of 100. We watch these as part of your plan and act on anything that slips.</p>
      </div>`
      : "";

    // Only offered once the work is actually done. An existing review is
    // shown back with the option to change it.
    const review = demoProject.review;
    const reviewHtml =
      demoProject.status !== "finished"
        ? ""
        : `
      <h2 class="dashboard-section-title" style="margin-top: 40px;">${review ? "Your Review" : "How did we do?"}</h2>
      <div class="project-card">
        ${
          review
            ? `<div class="project-review">
                 <span class="project-review-stars">${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</span>
                 ${review.text ? `<p>"${escapeHtml(review.text)}"</p>` : ""}
               </div>
               <button type="button" class="clear-cart-link" id="clientReviewEditBtn">Change my review</button>`
            : `<p class="portal-note" style="margin-top:0;">Your project's wrapped up — we'd love to know how it went.</p>`
        }
        <form id="clientReviewForm" class="portal-login-form" ${review ? "hidden" : ""} style="margin-top: 14px;">
          <div class="form-group">
            <span class="form-label">Rating</span>
            <div class="client-star-row" id="clientStarRow">
              ${[1, 2, 3, 4, 5]
                .map(
                  (n) =>
                    `<button type="button" class="client-star" data-rating="${n}" aria-label="${n} star${n > 1 ? "s" : ""}">★</button>`
                )
                .join("")}
            </div>
          </div>
          <div class="form-group">
            <label for="clientReviewText">Anything you'd like to add? (optional)</label>
            <textarea id="clientReviewText" rows="3" placeholder="What was it like working with us?">${review && review.text ? escapeHtml(review.text) : ""}</textarea>
          </div>
          <p class="portal-login-error" id="clientReviewError" hidden></p>
          <button type="submit" class="btn btn-primary" id="clientReviewSubmit">${review ? "Update Review" : "Submit Review"}</button>
        </form>
      </div>`;

    clientViewContainer.innerHTML = `
      ${
        isRealClient
          ? ""
          : `<div class="portal-sample-banner">This is a simulated preview of "${escapeHtml(demoProject.clientName)}"'s view, using real pipeline data — for design/testing only.</div>`
      }

      <h2 class="dashboard-section-title">Your Project</h2>
      <div class="project-card">
        <div class="project-card-head">
          <div>
            <span class="project-service">${escapeHtml(demoProject.service)}</span>
            <span class="project-client">${escapeHtml(demoProject.clientName)}</span>
          </div>
          <span class="project-date">${statusLabel} ${formatDate(statusDate)}</span>
        </div>
        <div class="project-tiers">${tierTagsHtml(demoProject)}</div>
        ${trackerHtml}
        ${
          demoProject.domain
            ? `<p class="project-assigned-to">Your site: <a href="https://${escapeHtml(demoProject.domain)}" target="_blank" rel="noopener"><strong>${escapeHtml(demoProject.domain)}</strong></a></p>`
            : ""
        }
        ${
          demoProject.assignedDev
            ? `<p class="project-assigned-to">Your developer: <strong>${escapeHtml(demoProject.assignedDev)}</strong></p>`
            : `<p class="dev-empty">A developer hasn't been assigned yet.</p>`
        }
        ${
          demoProject.details
            ? `<details class="client-brief"><summary>What you asked us for</summary><p>${escapeHtml(demoProject.details)}</p></details>`
            : ""
        }
        <div class="project-notes">
          ${
            demoProject.progressNotes.length
              ? demoProject.progressNotes
                  .map((n) => `<div class="project-note"><span class="project-note-date">${formatDate(n.date)}</span><p>${escapeHtml(n.note)}</p></div>`)
                  .join("")
              : `<p class="dev-empty">No updates yet — your developer will post progress here as work happens.</p>`
          }
        </div>
      </div>
      ${healthHtml}
      ${reviewHtml}
      ${clientInvoicesHtml()}

      <h2 class="dashboard-section-title" style="margin-top: 40px;">Message Your Developer</h2>
      <div class="chat-thread">
        <div class="chat-messages" id="clientChatMessages">
          ${
            msgs.length
              ? msgs
                  .map(
                    (m) => `
              <div class="chat-message ${m.from === (demoProject.clientName || "Client") ? "mine" : "theirs"}">
                <div class="chat-message-bubble">${escapeHtml(m.text)}</div>
                <span class="chat-message-meta">${escapeHtml(m.from)} · ${formatDate(m.at)}</span>
              </div>`
                  )
                  .join("")
              : `<p class="dev-empty">No messages yet.</p>`
          }
        </div>
        <form id="clientChatSendForm" class="chat-input-row">
          <input type="text" id="clientChatInput" class="chat-input" placeholder="Type a message…" autocomplete="off" />
          <button type="submit" class="btn btn-primary">Send</button>
        </form>
      </div>

      <div style="text-align: center; margin-top: 40px;">
        <button type="button" class="clear-cart-link" data-portal-logout>Log out</button>
      </div>
    `;

    // --- Review: star picker, then submit through the guarded RPC ---
    let chosenRating = review ? review.rating : 0;
    const starRow = document.getElementById("clientStarRow");
    const paintStars = () => {
      starRow?.querySelectorAll(".client-star").forEach((s) => {
        s.classList.toggle("on", Number(s.dataset.rating) <= chosenRating);
      });
    };
    paintStars();
    starRow?.querySelectorAll(".client-star").forEach((s) => {
      s.addEventListener("click", () => {
        chosenRating = Number(s.dataset.rating);
        paintStars();
      });
    });

    document.getElementById("clientReviewEditBtn")?.addEventListener("click", () => {
      const form = document.getElementById("clientReviewForm");
      if (form) form.hidden = false;
    });

    document.getElementById("clientReviewForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errEl = document.getElementById("clientReviewError");
      const btn = document.getElementById("clientReviewSubmit");
      if (errEl) errEl.hidden = true;
      if (!chosenRating) {
        if (errEl) { errEl.textContent = "Pick a star rating first."; errEl.hidden = false; }
        return;
      }
      if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
      const { error } = await digicodeSupabase.rpc("submit_project_review", {
        project_id: demoProject.id,
        rating: chosenRating,
        review_text: document.getElementById("clientReviewText").value.trim(),
      });
      if (error) {
        if (errEl) { errEl.textContent = "We couldn't save that just now — please try again."; errEl.hidden = false; }
        if (btn) { btn.disabled = false; btn.textContent = "Submit Review"; }
        return;
      }
      await loadProjects();
      renderClientPreview();
    });

    document.getElementById("clientChatSendForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("clientChatInput");
      const text = input.value.trim();
      if (!text) return;
      await digicodeSupabase.from("chats").insert({
        chat_id: chatId,
        from_name: demoProject.clientName || "Client",
        message: text,
      });
      await loadChats();
      renderClientPreview();
      const msgsEl = document.getElementById("clientChatMessages");
      if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
    });
  }

  viewSwitchBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      viewSwitchBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const isClient = btn.dataset.view === "client";
      if (devViewContainer) devViewContainer.hidden = isClient;
      if (clientViewContainer) clientViewContainer.hidden = !isClient;
      if (isClient) renderClientPreview();
    });
  });

  // A real client login goes straight to the client view, with no way to
  // flip back to the Dev pipeline — the switch above is a Dev-only testing tool.
  // The portal's auth gate (portal.html) resolves the session/role asynchronously,
  // so this waits for that to finish rather than assuming it's already set.
  // Greet whoever actually signed in by their first name. The name can come
  // from a few places depending on who they are, so try them in order of
  // how trustworthy they are and fall back gracefully:
  //   1. their profile name — set automatically for devs at signup
  //   2. the developer roster, matched on email
  //   3. the client name on one of their own projects
  //   4. the email's local part, tidied up
  // and only if all of that comes up empty, the old generic role word.
  function firstNameOf(full) {
    if (!full) return null;
    const first = String(full).trim().split(/[\s,]+/)[0];
    if (!first) return null;
    return first.charAt(0).toUpperCase() + first.slice(1);
  }

  function resolvePortalFirstName() {
    const email = (window.digicodePortalEmail || "").toLowerCase();

    const fromProfile = firstNameOf(window.digicodePortalName);
    if (fromProfile) return fromProfile;

    const dev = getTeam().find((d) => (d.email || "").toLowerCase() === email);
    const fromRoster = firstNameOf(dev && dev.name);
    if (fromRoster) return fromRoster;

    const project = getProjects().find((p) => (p.clientEmail || "").toLowerCase() === email);
    const fromProject = firstNameOf(project && project.clientName);
    if (fromProject) return fromProject;

    // Last resort: "jane.doe@…" → "Jane". Split on the usual separators so
    // we don't greet someone by their whole address.
    const local = email.split("@")[0] || "";
    return firstNameOf(local.split(/[._\-+0-9]+/).filter(Boolean)[0]);
  }

  function applyPortalRole() {
    const portalRole = window.digicodePortalRole;
    if (portalWelcomeName) {
      const firstName = resolvePortalFirstName();
      portalWelcomeName.textContent = firstName
        ? `${firstName}.`
        : portalRole === "client" ? "Client." : "Dev.";
    }
    if (portalRole === "client") {
      if (viewSwitchRow) viewSwitchRow.hidden = true;
      if (devViewContainer) devViewContainer.hidden = true;
      if (clientViewContainer) clientViewContainer.hidden = false;
      // The page's default heading copy still describes this as an unfinished
      // placeholder, which is a Dev-side note — a real client shouldn't be
      // told the thing they're looking at isn't connected yet.
      const eyebrow = document.querySelector(".page-hero .eyebrow");
      const heroSub = document.querySelector(".page-hero .hero-sub");
      if (eyebrow) eyebrow.textContent = "Your Portal";
      if (heroSub) heroSub.textContent = "Track your project, see how your site's performing, and talk to your developer — all in one place.";
      renderClientPreview();
    }
  }

  // ---------------------------------------------------------------------
  // Live dashboard
  //
  // The traffic figures come straight out of Supabase every time this page
  // loads — see public.site_stats() in supabase/022_site_analytics.sql, fed by
  // js/analytics.js on the public pages. The few things the site can't measure
  // about itself (uptime, PageSpeed, what Google thinks) live in
  // data/site-stats.json and are refreshed on a daily check.

  // ---------------------------------------------------------------------
  // Scripts tab — listing script files for sale.
  //
  // Mirrors public.can_manage_scripts() in supabase/027: Lead Developer, the
  // "Manage Scripts" permission, or the owner account that isn't on the
  // roster. The database is the real gate; this only decides what to render.
  // ---------------------------------------------------------------------

  const SCRIPT_BUCKET = "script-files";
  const SCRIPT_IMAGE_BUCKET = "script-images";

  // Thumbnails live in a separate PUBLIC bucket - the zip must stay unreadable
  // without a purchase, the shop photo has to be readable by everyone.
  function scriptImageUrl(path) {
    return path ? `${SUPABASE_URL}/storage/v1/object/public/${SCRIPT_IMAGE_BUCKET}/${path}` : "";
  }
  let scriptsCache = [];
  let editingScriptId = null;

  function canManageScripts() {
    const email = (window.digicodePortalEmail || "").toLowerCase();
    const me = getTeam().find((d) => (d.email || "").toLowerCase() === email);
    if (!me) return true; // owner account, not on the roster
    return me.rank === "Lead Developer" || (me.permissions || []).includes("Manage Scripts");
  }

  async function loadScripts() {
    const { data, error } = await digicodeSupabase
      .from("script_products")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) scriptsCache = data || [];
    return scriptsCache;
  }

  function scriptSize(bytes) {
    if (!bytes) return "no file";
    return bytes > 1048576
      ? (bytes / 1048576).toFixed(1) + " MB"
      : Math.round(bytes / 1024) + " KB";
  }

  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  const SCRIPT_CATEGORIES = ["Cars", "Custom Build Scripts", "CFX Scripts", "MLOs"];
  const CFX_CATEGORIES = ["CFX Scripts", "MLOs"];

  // Delivery is how a listing actually reaches a buyer — a file, a Drive
  // link, or a manual cfx.re transfer — and it's picked separately from the
  // category. A "CFX Scripts" listing isn't always a cfx.re transfer: the
  // owner might already hold the file and just be filing it under that
  // category for browsing, same as any of the other three.
  function currentDelivery(s) {
    if (!s) return "file";
    if (s.drive_url) return "drive";
    if (!s.file_path && (s.cfx_details || "").trim()) return "cfx";
    return "file";
  }

  function scriptFormHtml(s) {
    const v = (k, d) => escapeHtml(s && s[k] != null ? s[k] : d || "");
    const category = (s && s.category) || "Custom Build Scripts";
    const delivery = currentDelivery(s);
    return `
      <form class="form-card script-form" id="scriptForm">
        <h2>${s ? "Edit script" : "List a new script"}</h2>
        <div class="form-grid">
          <div class="form-group">
            <label for="sfName">Name</label>
            <input type="text" id="sfName" value="${v("name")}" placeholder="Advanced Garage System" required />
          </div>
          <div class="form-group">
            <label for="sfCategory">Category</label>
            <select id="sfCategory">
              ${SCRIPT_CATEGORIES.map(
                (c) => `<option value="${escapeHtml(c)}"${c === category ? " selected" : ""}>${escapeHtml(c)}</option>`
              ).join("")}
            </select>
          </div>
          <div class="form-group">
            <label for="sfPlatform">Platform</label>
            <input type="text" id="sfPlatform" value="${v("platform")}" placeholder="FiveM / Roblox / Minecraft" />
          </div>
          <div class="form-group">
            <label for="sfPrice">Price (AUD)</label>
            <input type="text" id="sfPrice" value="${s ? (s.price_cents / 100).toFixed(2) : ""}" placeholder="49.00" required />
          </div>
          <div class="form-group">
            <label for="sfVersion">Version</label>
            <input type="text" id="sfVersion" value="${v("version")}" placeholder="1.0.0" />
          </div>
        </div>
        <div class="form-group">
          <label for="sfSummary">One-line summary</label>
          <input type="text" id="sfSummary" value="${v("summary")}" placeholder="Shown on the store card — keep it to a sentence" />
        </div>
        <div class="form-group">
          <label for="sfDesc">Full description</label>
          <textarea id="sfDesc" rows="5" placeholder="What it does, what it needs to run, what's included. Buyers read this before they read the price.">${v("description")}</textarea>
        </div>
        <div class="form-group">
          <span class="form-label">How is it delivered?</span>
          <div class="radio-row">
            <label class="radio-option">
              <input type="radio" name="sfDelivery" value="file" ${delivery === "file" ? "checked" : ""} />
              Upload the file (up to 50MB) — instant download
            </label>
            <label class="radio-option">
              <input type="radio" name="sfDelivery" value="drive" ${delivery === "drive" ? "checked" : ""} />
              Google Drive link — instant download
            </label>
            <label class="radio-option">
              <input type="radio" name="sfDelivery" value="cfx" ${delivery === "cfx" ? "checked" : ""} />
              CFX transfer — you send it by hand via cfx.re
            </label>
          </div>
        </div>

        <div class="form-group" id="sfFileGroup" ${delivery === "file" ? "" : "hidden"}>
          <span class="form-label">Script file (.zip)</span>
          <input type="file" id="sfFile" accept=".zip,.rar,.7z" />
          <p class="form-note" id="sfFileNote">${
            s && s.file_name
              ? "Currently: " + escapeHtml(s.file_name) + " · " + scriptSize(s.file_bytes) + ". Choose a file only to replace it."
              : "Up to 50MB (the Supabase plan limit). This is what the buyer downloads."
          }</p>
        </div>

        <div class="form-group" id="sfDriveGroup" ${delivery === "drive" ? "" : "hidden"}>
          <label for="sfDrive">Google Drive link</label>
          <input type="url" id="sfDrive" value="${escapeHtml((s && s.drive_url) || "")}"
                 placeholder="https://drive.google.com/file/d/..." />
          <p class="form-note">
            Set the file's sharing to <strong>Anyone with the link</strong> in Drive, or buyers
            won't be able to open it. Revealed only after payment — but unlike an uploaded file,
            a Drive link can't expire, so anyone a buyer passes it to can download it too.
          </p>
        </div>

        <div class="form-group cfx-listing-group" id="sfCfxGroup" ${delivery === "cfx" ? "" : "hidden"}>
          <label for="sfCfxDetails">Which cfx.re asset is this?</label>
          <textarea id="sfCfxDetails" rows="2" placeholder="e.g. asset name or link on your cfx.re Keymaster/assets page — for your own reference when it sells">${v("cfx_details")}</textarea>
          <p class="form-note">
            Not shown to buyers — just enough for you to find the right asset when it's time to
            transfer it. No file or Drive link for this route: a buyer gives their cfx.re account
            name at checkout, and you complete the transfer yourself in cfx.re. This is a
            <strong>one-off</strong> — the listing comes off the store the moment it sells, since
            there's only one licence to give away.
          </p>
        </div>
        <div class="form-group">
          <span class="form-label">Thumbnail</span>
          <div class="script-image-row">
            <div class="script-image-preview" id="sfImagePreview">
              ${
                s && s.image_path
                  ? `<img src="${escapeHtml(scriptImageUrl(s.image_path))}" alt="" />`
                  : `<span>No image</span>`
              }
            </div>
            <div class="script-image-controls">
              <input type="file" id="sfImage" accept="image/png,image/jpeg,image/webp,image/gif" />
              <p class="form-note">Shown on the store card. Landscape works best — around 800&times;450. Up to 5MB.</p>
              ${
                s && s.image_path
                  ? `<button type="button" class="clear-cart-link danger-link" id="sfImageClear">Remove image</button>`
                  : ""
              }
            </div>
          </div>
        </div>
        <div class="form-group">
          <label class="checkbox-option">
            <input type="checkbox" id="sfActive" ${s && s.active ? "checked" : ""} />
            Listed for sale on the store
          </label>
        </div>
        <div class="form-actions" style="padding:0;">
          <button type="submit" class="btn btn-primary" id="sfSave">${s ? "Save changes" : "List script"}</button>
          ${s ? `<button type="button" class="clear-cart-link" id="sfCancel">Cancel</button>` : ""}
          <p class="form-note" id="sfStatus"></p>
        </div>
      </form>`;
  }

  function renderScriptsPanel() {
    const panel = document.getElementById("scriptsPanel");
    if (!panel) return;

    if (!canManageScripts()) {
      panel.innerHTML = `<p class="dev-empty">Only the Lead Developer can list scripts for sale.</p>`;
      return;
    }

    const editing = editingScriptId
      ? scriptsCache.find((s) => String(s.id) === String(editingScriptId))
      : null;

    const rows = scriptsCache.length
      ? scriptsCache
          .map(
            (s) => `
        <div class="project-card${s.active ? " is-paid" : ""}">
          <div class="project-card-head">
            <div class="script-admin-head">
              ${
                s.image_path
                  ? `<img class="script-admin-thumb" src="${escapeHtml(scriptImageUrl(s.image_path))}" alt="" />`
                  : ""
              }
              <div>
                <span class="project-service">${escapeHtml(s.category || "Custom Build Scripts")}${s.platform ? " · " + escapeHtml(s.platform) : ""}${s.version ? " · v" + escapeHtml(s.version) : ""}</span>
                <span class="project-client">${escapeHtml(s.name)}</span>
              </div>
            </div>
            <span class="project-date">$${(s.price_cents / 100).toFixed(2)}</span>
          </div>
          <div class="order-flag ${s.sold_at ? "flag-quote" : s.active ? "flag-paid" : "flag-enquiry"}">
            ${s.sold_at ? "Sold " + formatDate(s.sold_at) : s.active ? "Live on the store" : "Draft — not listed"}
          </div>
          ${s.summary ? `<p class="project-details">${escapeHtml(s.summary)}</p>` : ""}
          <p class="script-row-meta">${
            s.drive_url
              ? `<span class="script-route">Google Drive</span> · link revealed on purchase`
              : s.file_path
                ? `${escapeHtml(s.file_name || "no file uploaded")} · ${scriptSize(s.file_bytes)}`
                : `<span class="script-route">cfx.re transfer</span> · ${escapeHtml(s.cfx_details || "no asset noted")}`
          } · ${s.sales_count} sold</p>
          <div class="project-actions">
            <button type="button" class="clear-cart-link script-edit" data-id="${s.id}">Edit</button>
            <button type="button" class="clear-cart-link script-toggle" data-id="${s.id}">${s.active ? "Unlist" : "List for sale"}</button>
            <button type="button" class="clear-cart-link danger-link script-delete" data-id="${s.id}">Delete</button>
          </div>
        </div>`
          )
          .join("")
      : `<p class="dev-empty">No scripts listed yet.</p>`;

    panel.innerHTML = scriptFormHtml(editing) + `<div class="script-admin-list">${rows}</div>`;

    panel.querySelector("#scriptForm").addEventListener("submit", (e) => {
      e.preventDefault();
      saveScript(editing);
    });

    // Show the chosen image straight away — picking a thumbnail blind and only
    // finding out how it crops after saving is a poor way to do it.
    const imgInput = panel.querySelector("#sfImage");
    imgInput?.addEventListener("change", () => {
      const f = imgInput.files[0];
      const box = panel.querySelector("#sfImagePreview");
      if (!f || !box) return;
      const url = URL.createObjectURL(f);
      box.innerHTML = `<img src="${url}" alt="" />`;
    });

    panel.querySelector("#sfImageClear")?.addEventListener("click", () => {
      clearScriptImage(editing);
    });

    // Delivery is independent of category — a "CFX Scripts" listing might
    // still be a file the owner already holds, and a "Cars" listing could in
    // principle be a cfx.re transfer. Only ever show the field group for the
    // route actually chosen.
    function applyDeliveryVisibility(value) {
      panel.querySelector("#sfFileGroup").hidden = value !== "file";
      panel.querySelector("#sfDriveGroup").hidden = value !== "drive";
      panel.querySelector("#sfCfxGroup").hidden = value !== "cfx";
    }
    panel.querySelectorAll('input[name="sfDelivery"]').forEach((r) => {
      r.addEventListener("change", () => {
        if (r.checked) applyDeliveryVisibility(r.value);
      });
    });

    // A light default, not a lock: picking CFX Scripts / MLOs on a brand new
    // listing suggests the CFX delivery route, since that's the common case
    // — but only for a listing that isn't already something else, and it
    // never touches an existing listing's own delivery choice.
    panel.querySelector("#sfCategory")?.addEventListener("change", (e) => {
      if (editing) return;
      if (!CFX_CATEGORIES.includes(e.target.value)) return;
      const cfxRadio = panel.querySelector('input[name="sfDelivery"][value="cfx"]');
      if (!cfxRadio) return;
      cfxRadio.checked = true;
      applyDeliveryVisibility("cfx");
    });

    panel.querySelector("#sfCancel")?.addEventListener("click", () => {
      editingScriptId = null;
      renderScriptsPanel();
    });
    panel.querySelectorAll(".script-edit").forEach((b) =>
      b.addEventListener("click", () => {
        editingScriptId = b.dataset.id;
        renderScriptsPanel();
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
      })
    );
    panel.querySelectorAll(".script-toggle").forEach((b) =>
      b.addEventListener("click", () => toggleScript(b.dataset.id))
    );
    panel.querySelectorAll(".script-delete").forEach((b) =>
      b.addEventListener("click", () => deleteScript(b.dataset.id))
    );
  }

  async function saveScript(existing) {
    const status = document.getElementById("sfStatus");
    const save = document.getElementById("sfSave");
    const name = document.getElementById("sfName").value.trim();
    const priceRaw = document.getElementById("sfPrice").value.replace(/[^0-9.]/g, "");
    const cents = Math.round(parseFloat(priceRaw || "0") * 100);
    const file = document.getElementById("sfFile").files[0];

    if (!name) return;
    if (!Number.isFinite(cents) || cents < 0) {
      status.textContent = "That price doesn't look right.";
      return;
    }
    const category = document.getElementById("sfCategory")?.value || "Custom Build Scripts";
    const cfxDetails = (document.getElementById("sfCfxDetails")?.value || "").trim();
    const delivery =
      document.querySelector('input[name="sfDelivery"]:checked')?.value || "file";
    const driveUrl = (document.getElementById("sfDrive")?.value || "").trim();

    if (delivery === "cfx") {
      if (!cfxDetails) {
        status.textContent =
          "Note which cfx.re asset this is — you'll need it to complete the transfer once it sells.";
        return;
      }
    } else if (delivery === "drive") {
      if (!/^https:\/\/(drive|docs)\.google\.com\//i.test(driveUrl)) {
        status.textContent =
          "That doesn't look like a Google Drive link — it should start with https://drive.google.com/";
        return;
      }
    } else if (!existing && !file) {
      status.textContent = "Choose the script file to upload.";
      return;
    } else if (existing && !existing.file_path && !existing.drive_url && !file) {
      status.textContent = "This listing has no file yet — choose one to upload.";
      return;
    }

    // Supabase's Free plan refuses anything over 50MB before the bucket's own
    // rules are even consulted, so say so here rather than letting the upload
    // run and fail with a less obvious message.
    const MAX_UPLOAD = 50 * 1024 * 1024;
    if (delivery === "file" && file && file.size > MAX_UPLOAD) {
      status.textContent =
        `That file is ${(file.size / 1048576).toFixed(1)}MB. The plan caps uploads at 50MB — ` +
        `split it, or switch to a Google Drive link above.`;
      return;
    }
    const imageCheck = document.getElementById("sfImage").files[0];
    if (imageCheck && imageCheck.size > 5 * 1024 * 1024) {
      status.textContent = "That image is over 5MB — use a smaller one.";
      return;
    }

    save.disabled = true;
    status.textContent = file ? "Uploading…" : "Saving…";

    const fields = {
      name,
      slug: existing ? existing.slug : slugify(name) + "-" + Date.now().toString(36).slice(-4),
      platform: document.getElementById("sfPlatform").value.trim() || null,
      version: document.getElementById("sfVersion").value.trim() || null,
      summary: document.getElementById("sfSummary").value.trim() || null,
      description: document.getElementById("sfDesc").value.trim() || null,
      price_cents: cents,
      category,
      cfx_details: delivery === "cfx" ? cfxDetails : null,
      active: document.getElementById("sfActive").checked,
      updated_at: new Date().toISOString(),
    };

    try {
      if (delivery === "cfx") {
        // Delivered by hand through cfx.re, not hosted here — clear whichever
        // route a listing might have had before switching to this one.
        fields.drive_url = null;
        fields.file_path = null;
        fields.file_name = null;
        fields.file_bytes = null;
      } else if (delivery === "drive") {
        // Switching to Drive clears the stored file, and vice versa - a
        // listing is delivered one way or the other, never ambiguously both.
        fields.drive_url = driveUrl;
        fields.file_path = null;
        fields.file_name = null;
        fields.file_bytes = null;
      } else {
        fields.drive_url = null;
      }

      if (delivery === "file" && file) {
        const path =
          fields.slug + "/" + Date.now() + "-" + file.name.replace(/[^A-Za-z0-9._-]/g, "_");
        const up = await digicodeSupabase.storage
          .from(SCRIPT_BUCKET)
          .upload(path, file, { upsert: false });
        if (up.error) throw up.error;
        fields.file_path = path;
        fields.file_name = file.name;
        fields.file_bytes = file.size;
      }

      const image = document.getElementById("sfImage").files[0];
      if (image) {
        status.textContent = "Uploading image…";
        const ipath =
          fields.slug + "/" + Date.now() + "-" + image.name.replace(/[^A-Za-z0-9._-]/g, "_");
        const iup = await digicodeSupabase.storage
          .from(SCRIPT_IMAGE_BUCKET)
          .upload(ipath, image, { upsert: false, contentType: image.type || undefined });
        if (iup.error) throw iup.error;

        // Replacing a thumbnail shouldn't leave the old one lying in storage.
        if (existing && existing.image_path) {
          await digicodeSupabase.storage
            .from(SCRIPT_IMAGE_BUCKET)
            .remove([existing.image_path])
            .catch(() => {});
        }
        fields.image_path = ipath;
      }

      if (existing) {
        const { error } = await digicodeSupabase
          .from("script_products")
          .update(fields)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        fields.created_by = window.digicodePortalEmail || null;
        const { error } = await digicodeSupabase.from("script_products").insert(fields);
        if (error) throw error;
      }

      editingScriptId = null;
      await loadScripts();
      renderScriptsPanel();
    } catch (err) {
      save.disabled = false;
      status.textContent =
        "Couldn't save that — " + (err && err.message ? err.message : "check permissions.");
    }
  }

  async function clearScriptImage(s) {
    if (!s || !s.image_path) return;
    if (!window.confirm("Remove the thumbnail from this listing?")) return;
    try {
      await digicodeSupabase.storage.from(SCRIPT_IMAGE_BUCKET).remove([s.image_path]);
      const { error } = await digicodeSupabase
        .from("script_products")
        .update({ image_path: null, updated_at: new Date().toISOString() })
        .eq("id", s.id);
      if (error) throw error;
    } catch (e) {
      window.alert("Couldn't remove that image.");
      return;
    }
    await loadScripts();
    renderScriptsPanel();
  }

  async function toggleScript(id) {
    const s = scriptsCache.find((x) => String(x.id) === String(id));
    if (!s) return;
    // Three delivery routes are enough to go on sale: a hosted file, a Drive
    // link, or a cfx.re reference note — independent of category. This
    // mirrors the script_has_a_delivery_route constraint in supabase/035,
    // which is what actually enforces it.
    const hasCfxNote = (s.cfx_details || "").trim();
    if (!s.file_path && !s.drive_url && !hasCfxNote && !s.active) {
      window.alert(
        "Add a script file, a Google Drive link, or which cfx.re asset this is before listing it for sale."
      );
      return;
    }
    const { error } = await digicodeSupabase
      .from("script_products")
      .update({ active: !s.active, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      window.alert("Couldn't change that — your account may not have permission.");
      return;
    }
    await loadScripts();
    renderScriptsPanel();
  }

  async function deleteScript(id) {
    const s = scriptsCache.find((x) => String(x.id) === String(id));
    if (!s) return;
    if (s.sales_count > 0) {
      window.alert(
        `"${s.name}" has ${s.sales_count} sale${s.sales_count > 1 ? "s" : ""}. ` +
          "Deleting it would break those buyers' downloads — unlist it instead."
      );
      return;
    }
    if (!window.confirm(`Delete "${s.name}" and its file? This can't be undone.`)) return;

    try {
      if (s.file_path) {
        await digicodeSupabase.storage.from(SCRIPT_BUCKET).remove([s.file_path]);
      }
      const { error } = await digicodeSupabase.from("script_products").delete().eq("id", id);
      if (error) throw error;
    } catch (err) {
      window.alert("Couldn't delete that — your account may not have permission.");
      return;
    }
    await loadScripts();
    renderScriptsPanel();
  }
  // ---------------------------------------------------------------------

  // ---------------------------------------------------------------------
  // Sold Scripts — every script sale in one place, so a cfx.re transfer
  // doesn't have to be dug out of the free text on a Pending Projects card.
  //
  // Same gate as the Scripts tab: Lead Developer, anyone granted "Manage
  // Scripts", or the owner account that isn't on the roster.
  // list_script_sales() enforces the same rule server-side — this only
  // decides what to render.
  // ---------------------------------------------------------------------

  let scriptSalesCache = [];

  async function loadScriptSales() {
    const { data, error } = await digicodeSupabase.rpc("list_script_sales");
    if (!error) scriptSalesCache = data || [];
    return scriptSalesCache;
  }

  function scriptSaleRowHtml(sale) {
    const isCfx = sale.delivery === "cfx";
    const done = !!sale.fulfilled_at;
    return `
      <div class="project-card${done ? " is-paid" : isCfx ? " is-quote" : ""}">
        <div class="project-card-head">
          <div>
            <span class="project-service">${escapeHtml(sale.category || "Script")}</span>
            <span class="project-client">${escapeHtml(sale.script_name)}</span>
          </div>
          <span class="project-date">${money(sale.price_cents)}</span>
        </div>
        <div class="invoice-tag-row">
          <span class="invoice-tag ${isCfx ? "tag-due" : "tag-paid"}">${isCfx ? "cfx.re transfer" : "Instant download"}</span>
          ${
            isCfx
              ? done
                ? `<span class="invoice-tag tag-paid">Sent ${formatDate(sale.fulfilled_at)}</span>`
                : `<span class="invoice-tag tag-sent">Owed</span>`
              : ""
          }
        </div>
        <dl class="project-contact">
          <div><dt>Buyer</dt><dd>${escapeHtml(sale.buyer_email) || "—"}</dd></div>
          ${
            isCfx
              ? `<div><dt>cfx.re account</dt><dd>${escapeHtml((sale.cfx_account || "").replace(/^cfx\.re account:\s*/i, "")) || "not given"}</dd></div>`
              : `<div><dt>Downloads</dt><dd>${escapeHtml(sale.downloads)}</dd></div>`
          }
        </dl>
        ${
          isCfx
            ? `<p class="project-details">${sale.cfx_details ? "Send: " + escapeHtml(sale.cfx_details) : "No cfx.re asset noted on this listing."}</p>`
            : ""
        }
        <p class="script-row-meta">Sold ${formatDate(sale.purchased_at)}</p>
        ${
          isCfx && !done
            ? `<div class="project-actions">
                 <button type="button" class="btn btn-primary btn-small-inline script-sale-fulfil" data-id="${sale.purchase_id}">Mark as sent</button>
               </div>`
            : ""
        }
      </div>`;
  }

  function renderScriptSalesPanel() {
    const panel = document.getElementById("scriptSalesPanel");
    if (!panel) return;

    if (!canManageScripts()) {
      panel.innerHTML = `<p class="dev-empty">Only the Lead Developer can see script sales.</p>`;
      return;
    }

    if (!scriptSalesCache.length) {
      panel.innerHTML = `<p class="dev-empty">No scripts sold yet.</p>`;
      return;
    }

    const owed = scriptSalesCache.filter((s) => s.delivery === "cfx" && !s.fulfilled_at);
    const rest = scriptSalesCache.filter((s) => !(s.delivery === "cfx" && !s.fulfilled_at));

    panel.innerHTML =
      (owed.length
        ? `<h3 class="cancelled-head">cfx.re transfers owed (${owed.length})</h3>` +
          owed.map(scriptSaleRowHtml).join("") +
          `<h3 class="cancelled-head" style="margin-top: 30px;">All sales (${scriptSalesCache.length})</h3>`
        : `<h3 class="cancelled-head">All sales (${scriptSalesCache.length})</h3>`) +
      rest.map(scriptSaleRowHtml).join("");

    panel.querySelectorAll(".script-sale-fulfil").forEach((btn) => {
      btn.addEventListener("click", () => markScriptSaleFulfilled(btn.dataset.id));
    });
  }

  async function markScriptSaleFulfilled(purchaseId) {
    const { error } = await digicodeSupabase.rpc("mark_script_sale_fulfilled", {
      p_purchase_id: Number(purchaseId),
    });
    if (error) {
      window.alert(error.message || "Couldn't update that — your account may not have permission.");
      return;
    }
    await loadScriptSales();
    renderScriptSalesPanel();
  }
  // ---------------------------------------------------------------------

  // ---------------------------------------------------------------------
  // Invoices — putting a price on a quote
  //
  // A quote request arrives with no number on it. This is where someone
  // permitted writes the lines, adds whatever extra services the job needs,
  // and sends it. Sending turns the reference into a working pay link.
  //
  // Only the Lead Developer, or a dev granted "Price Quotes", sees any of
  // this. can_price_quotes() in supabase/032 is the real gate — everything
  // below only decides what to draw.
  // ---------------------------------------------------------------------

  let invoicesCache = [];
  let invoiceDraft = null; // null = no form open

  function canPriceQuotes() {
    const email = (window.digicodePortalEmail || "").toLowerCase();
    const me = getTeam().find((d) => (d.email || "").toLowerCase() === email);
    if (!me) return true; // owner account, not on the roster
    return me.rank === "Lead Developer" || (me.permissions || []).includes("Price Quotes");
  }

  // Grouped thousands, because an invoice can run to five figures and
  // "$12000.00" is easy to misread as "$1200.00".
  function money(cents) {
    return (
      "$" +
      ((Number(cents) || 0) / 100).toLocaleString("en-AU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }

  // due_at is a Postgres `date`, so it arrives as "2026-10-01" with no time in
  // it. formatDate() would append one, and parsing it with new Date() reads it
  // as UTC midnight, which can shift the day — so the parts are used as given.
  function invoiceDate(d) {
    if (!d) return "";
    const parts = String(d).slice(0, 10).split("-");
    if (parts.length !== 3) return String(d);
    const dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(dt)) return String(d);
    return dt.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  // The form takes dollars because that is what people think in; everything
  // past this point is cents, so rounding happens once, here.
  function toCents(dollars) {
    const n = Number(String(dollars).replace(/[^0-9.]/g, ""));
    return isFinite(n) ? Math.round(n * 100) : 0;
  }

  function invoicePayUrl(ref) {
    return location.origin + location.pathname.replace(/[^/]*$/, "") + "invoice.html?ref=" + ref;
  }

  async function loadInvoices() {
    const { data, error } = await digicodeSupabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) invoicesCache = data || [];
    return invoicesCache;
  }

  function blankDraft(project) {
    return {
      id: null,
      projectId: project ? project.id : null,
      clientName: project ? project.clientName || "" : "",
      clientEmail: project ? project.clientEmail || "" : "",
      title: project ? "Quote — " + (project.service || "Custom work") : "Quote",
      lines: [{ description: project ? project.service || "" : "", qty: 1, dollars: "" }],
      notes: "",
      dueAt: "",
      discount: "",
    };
  }

  function draftFromInvoice(inv) {
    return {
      id: inv.id,
      projectId: inv.project_id,
      clientName: inv.client_name || "",
      clientEmail: inv.client_email || "",
      title: inv.title || "Quote",
      lines: (inv.lines || []).map((l) => ({
        description: l.description || "",
        qty: Number(l.qty) || 1,
        dollars: ((Number(l.unit_cents) || 0) / 100).toFixed(2),
      })),
      notes: inv.notes || "",
      dueAt: inv.due_at || "",
      discount: inv.discount_cents ? (inv.discount_cents / 100).toFixed(2) : "",
    };
  }

  function draftTotals(d) {
    const subtotal = d.lines.reduce(
      (sum, l) => sum + toCents(l.dollars) * (Number(l.qty) || 1),
      0
    );
    const discount = Math.min(subtotal, toCents(d.discount));
    return { subtotal, discount, total: subtotal - discount };
  }

  function invoiceLineLabel(l) {
    const cents = l.line_cents != null ? l.line_cents : (l.unit_cents || 0) * (l.qty || 1);
    return money(cents);
  }

  function invoiceFormHtml(d) {
    const t = draftTotals(d);
    const lineRows = d.lines
      .map(
        (l, i) => `
      <div class="invoice-line-row" data-i="${i}">
        <input type="text" class="inv-desc" placeholder="What it's for" value="${escapeHtml(l.description)}" />
        <input type="number" class="inv-qty" min="1" max="999" step="1" value="${Number(l.qty) || 1}" aria-label="Quantity" />
        <div class="inv-price-wrap"><span>$</span><input type="text" class="inv-price" inputmode="decimal" placeholder="0.00" value="${escapeHtml(l.dollars)}" aria-label="Unit price" /></div>
        <button type="button" class="inv-line-remove" data-i="${i}" aria-label="Remove line"${d.lines.length === 1 ? " disabled" : ""}>&times;</button>
      </div>`
      )
      .join("");

    return `
      <form class="form-card invoice-builder" id="invoiceForm">
        <h2>${d.id ? "Edit invoice" : "Price this quote"}</h2>

        <div class="form-grid">
          <div class="form-group">
            <label for="ivTitle">Title</label>
            <input type="text" id="ivTitle" value="${escapeHtml(d.title)}" placeholder="Quote — Business website" />
          </div>
          <div class="form-group">
            <label for="ivDue">Due by <span class="form-optional">(optional)</span></label>
            <input type="date" id="ivDue" value="${escapeHtml(d.dueAt)}" />
          </div>
          <div class="form-group">
            <label for="ivName">Client name</label>
            <input type="text" id="ivName" value="${escapeHtml(d.clientName)}" placeholder="Jane Smith" />
          </div>
          <div class="form-group">
            <label for="ivEmail">Client email</label>
            <input type="email" id="ivEmail" value="${escapeHtml(d.clientEmail)}" placeholder="jane@example.com" />
          </div>
        </div>

        <h3 class="invoice-lines-head">What they're paying for</h3>
        <div class="invoice-line-head">
          <span>Description</span><span>Qty</span><span>Unit price</span><span></span>
        </div>
        <div id="invoiceLines">${lineRows}</div>
        <button type="button" class="btn btn-ghost btn-small" id="ivAddLine">+ Add another service</button>

        <div class="form-grid" style="margin-top: 22px;">
          <div class="form-group">
            <label for="ivDiscount">Discount <span class="form-optional">(optional, in dollars)</span></label>
            <div class="inv-price-wrap"><span>$</span><input type="text" id="ivDiscount" inputmode="decimal" placeholder="0.00" value="${escapeHtml(d.discount)}" /></div>
          </div>
        </div>

        <div class="form-group">
          <label for="ivNotes">Notes for the client <span class="form-optional">(optional)</span></label>
          <textarea id="ivNotes" rows="3" placeholder="What's included, timeframes, anything they should know before paying.">${escapeHtml(d.notes)}</textarea>
        </div>

        <div class="invoice-builder-total">
          <div><span>Subtotal</span><strong id="ivSubtotal">${money(t.subtotal)}</strong></div>
          <div${t.discount ? "" : ' hidden id="ivDiscountRow"'}${t.discount ? ' id="ivDiscountRow"' : ""}><span>Discount</span><strong id="ivDiscountShown">−${money(t.discount)}</strong></div>
          <div class="invoice-builder-grand"><span>Total</span><strong id="ivTotal">${money(t.total)}</strong></div>
        </div>

        <p class="portal-login-error" id="ivError" hidden></p>

        <div class="invoice-builder-actions">
          <button type="submit" class="btn btn-primary" id="ivSave">${d.id ? "Save changes" : "Save draft"}</button>
          <button type="button" class="clear-cart-link" id="ivCancel">Cancel</button>
        </div>
        <p class="form-note">Saving keeps it as a draft — the client sees nothing until you send it.</p>
      </form>`;
  }

  function invoiceStatusTag(inv) {
    const map = {
      draft: ["Draft", "tag-draft"],
      sent: ["Sent", "tag-sent"],
      paid: ["Paid", "tag-paid"],
      void: ["Cancelled", "tag-void"],
    };
    const pair = map[inv.status] || ["—", ""];
    return '<span class="invoice-tag ' + pair[1] + '">' + pair[0] + "</span>";
  }

  function invoiceRowHtml(inv) {
    const sent = inv.status === "sent";
    const paid = inv.status === "paid";
    const voided = inv.status === "void";
    const url = invoicePayUrl(inv.reference);

    return `
      <div class="project-card invoice-card${paid ? " is-paid" : voided ? " is-cancelled" : ""}">
        <div class="project-card-head">
          <div>
            <span class="project-service">${escapeHtml(inv.title)}</span>
            <span class="project-client">${escapeHtml(inv.client_name) || "No name"}${inv.client_email ? " · " + escapeHtml(inv.client_email) : ""}</span>
          </div>
          <span class="project-date">${money(inv.total_cents)}</span>
        </div>

        <div class="invoice-tag-row">
          ${invoiceStatusTag(inv)}
          ${inv.due_at && !paid ? `<span class="invoice-tag tag-due">Due ${invoiceDate(inv.due_at)}</span>` : ""}
        </div>

        <ul class="invoice-mini-lines">
          ${(inv.lines || [])
            .map(
              (l) =>
                `<li><span>${escapeHtml(l.description)}${Number(l.qty) > 1 ? " × " + Number(l.qty) : ""}</span><span>${invoiceLineLabel(l)}</span></li>`
            )
            .join("")}
        </ul>

        ${inv.notes ? `<p class="project-details">${escapeHtml(inv.notes)}</p>` : ""}

        ${
          paid
            ? `<p class="project-assigned-to">Paid ${formatDate(inv.paid_at)}</p>`
            : voided
              ? `<p class="dev-empty">Cancelled — the pay link no longer works.</p>`
              : sent
                ? `<p class="project-assigned-to">Sent ${formatDate(inv.sent_at)}${inv.delivery ? " · by " + escapeHtml(inv.delivery === "both" ? "email and portal" : inv.delivery) : ""}</p>
                   <div class="invoice-link-row">
                     <input type="text" class="invoice-link" readonly value="${escapeHtml(url)}" aria-label="Payment link" />
                     <button type="button" class="btn btn-ghost btn-small iv-copy" data-url="${escapeHtml(url)}">Copy link</button>
                   </div>`
                : `<p class="dev-empty">Not sent yet — the client can't see this.</p>`
        }

        <div class="project-actions invoice-actions-row">
          ${
            !paid && !voided
              ? `<button type="button" class="btn btn-primary btn-small-inline iv-send" data-id="${inv.id}">${sent ? "Send again" : "Send"}</button>
                 <button type="button" class="clear-cart-link iv-edit" data-id="${inv.id}">Edit</button>
                 <button type="button" class="clear-cart-link iv-void" data-id="${inv.id}">Cancel invoice</button>`
              : ""
          }
          ${paid ? `<button type="button" class="clear-cart-link iv-copy" data-url="${escapeHtml(url)}">Copy receipt link</button>` : ""}
          ${!paid ? `<button type="button" class="clear-cart-link danger-link iv-delete" data-id="${inv.id}">Delete</button>` : ""}
        </div>
      </div>`;
  }

  window.digicodeInvoiceEmail = (inv) => invoiceEmail(inv);

  function renderInvoicesPanel() {
    const panel = document.getElementById("invoicesPanel");
    if (!panel) return;

    if (!canPriceQuotes()) {
      panel.innerHTML = `<p class="dev-empty">Pricing and sending quotes needs the Lead Developer rank or the "Price Quotes" permission.</p>`;
      return;
    }

    const formHtml = invoiceDraft ? invoiceFormHtml(invoiceDraft) : "";

    // Quotes still waiting on a number, so they can be priced straight from
    // here rather than hunting through Pending Projects.
    const invoiced = new Set(
      invoicesCache.filter((i) => i.status !== "void").map((i) => i.project_id)
    );
    const waiting = getProjects().filter(
      (p) => p.orderKind === "quote" && p.status !== "cancelled" && !invoiced.has(p.id)
    );

    const waitingHtml = waiting.length
      ? `<div class="invoice-waiting">
           <h3 class="cancelled-head">Quotes waiting on a price (${waiting.length})</h3>
           ${waiting
             .map(
               (p) => `
             <div class="project-card is-quote">
               <div class="project-card-head">
                 <div>
                   <span class="project-service">${escapeHtml(p.service)}</span>
                   <span class="project-client">${escapeHtml(p.clientName) || "No name provided"}${p.clientEmail ? " · " + escapeHtml(p.clientEmail) : ""}</span>
                 </div>
                 <span class="project-date">Asked ${formatDate(p.createdAt)}</span>
               </div>
               <p class="project-details">${escapeHtml(p.details) || "No details provided."}</p>
               <button type="button" class="btn btn-primary btn-small-inline iv-price" data-project="${p.id}">Price this quote</button>
             </div>`
             )
             .join("")}
         </div>`
      : "";

    const listHtml = invoicesCache.length
      ? invoicesCache.map(invoiceRowHtml).join("")
      : `<p class="dev-empty">No invoices yet. Price a quote above, or start one from scratch.</p>`;

    panel.innerHTML =
      formHtml +
      (invoiceDraft
        ? ""
        : `<button type="button" class="btn btn-ghost" id="ivNew" style="margin-bottom: 26px;">+ New invoice</button>`) +
      waitingHtml +
      `<h3 class="cancelled-head" style="margin-top: 30px;">All invoices (${invoicesCache.length})</h3>` +
      listHtml;

    wireInvoicePanel(panel);
  }

  function readDraftFromForm() {
    if (!invoiceDraft) return null;
    const d = invoiceDraft;
    const val = (id) => {
      const el = document.getElementById(id);
      return el ? el.value : "";
    };
    if (!document.getElementById("invoiceForm")) return d;
    d.title = val("ivTitle");
    d.clientName = val("ivName");
    d.clientEmail = val("ivEmail");
    d.notes = val("ivNotes");
    d.dueAt = val("ivDue");
    d.discount = val("ivDiscount");
    d.lines = [...document.querySelectorAll(".invoice-line-row")].map((row) => {
      const pick = (sel) => {
        const el = row.querySelector(sel);
        return el ? el.value : "";
      };
      return {
        description: pick(".inv-desc"),
        qty: Number(pick(".inv-qty")) || 1,
        dollars: pick(".inv-price"),
      };
    });
    return d;
  }

  // Retotals in place. Re-rendering the whole panel on every keystroke would
  // throw away the caret, so only the numbers change.
  function refreshDraftTotals() {
    if (!invoiceDraft) return;
    readDraftFromForm();
    const t = draftTotals(invoiceDraft);
    const set = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };
    set("ivSubtotal", money(t.subtotal));
    set("ivDiscountShown", "−" + money(t.discount));
    set("ivTotal", money(t.total));
    const row = document.getElementById("ivDiscountRow");
    if (row) row.hidden = !t.discount;
  }

  function wireInvoicePanel(panel) {
    const newBtn = panel.querySelector("#ivNew");
    if (newBtn) {
      newBtn.addEventListener("click", () => {
        invoiceDraft = blankDraft(null);
        renderInvoicesPanel();
      });
    }

    panel.querySelectorAll(".iv-price").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = getProjects().find((x) => x.id === btn.dataset.project);
        invoiceDraft = blankDraft(p);
        renderInvoicesPanel();
        const form = document.getElementById("invoiceForm");
        if (form) form.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    panel.querySelectorAll(".iv-edit").forEach((btn) => {
      btn.addEventListener("click", () => {
        const inv = invoicesCache.find((i) => String(i.id) === String(btn.dataset.id));
        if (!inv) return;
        invoiceDraft = draftFromInvoice(inv);
        renderInvoicesPanel();
        const form = document.getElementById("invoiceForm");
        if (form) form.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    panel.querySelectorAll(".iv-send").forEach((btn) => {
      btn.addEventListener("click", () => sendInvoice(btn.dataset.id));
    });
    panel.querySelectorAll(".iv-void").forEach((btn) => {
      btn.addEventListener("click", () => voidInvoice(btn.dataset.id));
    });
    panel.querySelectorAll(".iv-delete").forEach((btn) => {
      btn.addEventListener("click", () => deleteInvoice(btn.dataset.id));
    });
    panel.querySelectorAll(".iv-copy").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(btn.dataset.url);
          const was = btn.textContent;
          btn.textContent = "Copied";
          setTimeout(() => {
            btn.textContent = was;
          }, 1600);
        } catch (e) {
          window.prompt("Copy this link:", btn.dataset.url);
        }
      });
    });

    const form = panel.querySelector("#invoiceForm");
    if (!form) return;

    form.addEventListener("input", refreshDraftTotals);

    const addBtn = panel.querySelector("#ivAddLine");
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        readDraftFromForm();
        invoiceDraft.lines.push({ description: "", qty: 1, dollars: "" });
        renderInvoicesPanel();
      });
    }

    panel.querySelectorAll(".inv-line-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        readDraftFromForm();
        invoiceDraft.lines.splice(Number(btn.dataset.i), 1);
        if (!invoiceDraft.lines.length) {
          invoiceDraft.lines.push({ description: "", qty: 1, dollars: "" });
        }
        renderInvoicesPanel();
      });
    });

    const cancelBtn = panel.querySelector("#ivCancel");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        invoiceDraft = null;
        renderInvoicesPanel();
      });
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      await saveInvoice();
    });
  }

  async function saveInvoice() {
    const d = readDraftFromForm();
    if (!d) return;
    const err = document.getElementById("ivError");
    const btn = document.getElementById("ivSave");
    const show = (msg) => {
      if (err) {
        err.textContent = msg;
        err.hidden = false;
      }
    };
    if (err) err.hidden = true;

    const lines = d.lines
      .filter((l) => l.description.trim())
      .map((l) => ({
        description: l.description.trim(),
        qty: Number(l.qty) || 1,
        unit_cents: toCents(l.dollars),
      }));

    if (!lines.length) {
      show("Add at least one line with a description.");
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Saving…";
    }

    const { data, error } = await digicodeSupabase.rpc("save_invoice", {
      p_id: d.id,
      p_project_id: d.projectId,
      p_client_name: d.clientName,
      p_client_email: d.clientEmail,
      p_title: d.title,
      p_lines: lines,
      p_notes: d.notes,
      p_due_at: d.dueAt || null,
      p_discount_cents: toCents(d.discount),
    });

    if (btn) {
      btn.disabled = false;
      btn.textContent = d.id ? "Save changes" : "Save draft";
    }

    if (error) {
      show(error.message || "Couldn't save that invoice.");
      return;
    }

    invoiceDraft = null;
    await loadInvoices();
    renderInvoicesPanel();
    return data;
  }

  // Sending is two separate things: the database records that it went out
  // (which is what makes the pay link live), and — for email — the mail app
  // opens with it already written. The portal copy always happens; the email
  // is only offered when there is an address to send to.
  async function sendInvoice(id) {
    const inv = invoicesCache.find((i) => String(i.id) === String(id));
    if (!inv) return;

    const hasEmail = !!(inv.client_email || "").trim();
    let delivery = "portal";

    if (hasEmail) {
      const byEmail = window.confirm(
        'Send "' + inv.title + '" for ' + money(inv.total_cents) + " to " + inv.client_email + "?\n\n" +
          "OK — open your mail app with the quote and pay link written out, and put it in their portal too.\n" +
          "Cancel — put it in their client portal only."
      );
      delivery = byEmail ? "both" : "portal";
    } else if (
      !window.confirm(
        "There's no email address on this invoice, so it can only go to the client portal. Send it there?"
      )
    ) {
      return;
    }

    const { error } = await digicodeSupabase.rpc("send_invoice", {
      p_id: inv.id,
      p_delivery: delivery,
    });

    if (error) {
      window.alert(error.message || "Couldn't send that invoice.");
      return;
    }

    if (delivery === "both") {
      window.location.href = invoiceMailto(inv);
    }

    await loadInvoices();
    renderInvoicesPanel();
  }

  // The email a lead developer sends. Split out from sendInvoice so the text
  // can be inspected on its own — a mailto: assignment is a navigation, and
  // there is no reading one back once it has happened.
  function invoiceEmail(inv) {
    const url = invoicePayUrl(inv.reference);
    const itemLines = (inv.lines || [])
      .map(
        (l) =>
          "  - " + l.description + (Number(l.qty) > 1 ? " x " + l.qty : "") +
          " — " + invoiceLineLabel(l)
      )
      .join("\n");

    const subject = "Your DigiCode quote — " + money(inv.total_cents);
    const body =
      "Hi " + (inv.client_name || "there") + ",\n\n" +
      "Thanks for your patience — here's what we've put together.\n\n" +
      inv.title + "\n\n" +
      itemLines + "\n" +
      (inv.discount_cents ? "  Discount — -" + money(inv.discount_cents) + "\n" : "") +
      "\nTotal: " + money(inv.total_cents) + " AUD\n" +
      (inv.due_at ? "Due by: " + invoiceDate(inv.due_at) + "\n" : "") +
      (inv.notes ? "\n" + inv.notes + "\n" : "") +
      "\nYou can look it over and pay securely by card here:\n" + url + "\n\n" +
      "Any questions at all, just reply to this email.\n\n" +
      "Thanks,\nDigiCode\nhttps://www.digi-code.com.au";

    return { to: inv.client_email, subject, body };
  }

  function invoiceMailto(inv) {
    const e = invoiceEmail(inv);
    return (
      "mailto:" + encodeURIComponent(e.to) +
      "?subject=" + encodeURIComponent(e.subject) +
      "&body=" + encodeURIComponent(e.body)
    );
  }

  async function voidInvoice(id) {
    const inv = invoicesCache.find((i) => String(i.id) === String(id));
    if (!inv) return;
    if (
      !window.confirm(
        'Cancel "' + inv.title + '"? The pay link stops working straight away.'
      )
    ) {
      return;
    }

    const { error } = await digicodeSupabase.rpc("void_invoice", { p_id: inv.id });
    if (error) {
      window.alert(error.message || "Couldn't cancel that invoice.");
      return;
    }
    await loadInvoices();
    renderInvoicesPanel();
  }

  async function deleteInvoice(id) {
    const inv = invoicesCache.find((i) => String(i.id) === String(id));
    if (!inv) return;
    if (!window.confirm('Delete "' + inv.title + '" completely? This can\'t be undone.')) return;

    const { error } = await digicodeSupabase.from("invoices").delete().eq("id", inv.id);
    if (error) {
      window.alert("Couldn't delete that — your account may not have permission.");
      return;
    }
    await loadInvoices();
    renderInvoicesPanel();
  }

  // What the client sees: their own invoices, and a Pay Now that goes straight
  // to Stripe. Drafts never reach here — the RLS policy in 032 filters them
  // out before this code ever runs.
  function clientInvoicesHtml() {
    const mine = invoicesCache.filter((i) => i.status === "sent" || i.status === "paid");
    if (!mine.length) return "";

    return (
      '<h2 class="dashboard-section-title" style="margin-top: 40px;">Invoices</h2>' +
      '<div class="client-invoice-list">' +
      mine
        .map((inv) => {
          const paid = inv.status === "paid";
          return `
        <div class="project-card invoice-card${paid ? " is-paid" : ""}">
          <div class="project-card-head">
            <div>
              <span class="project-service">${escapeHtml(inv.title)}</span>
              <span class="project-client">${paid ? "Paid " + formatDate(inv.paid_at) : "Sent " + formatDate(inv.sent_at)}</span>
            </div>
            <span class="project-date">${money(inv.total_cents)}</span>
          </div>
          <div class="invoice-tag-row">
            ${invoiceStatusTag(inv)}
            ${inv.due_at && !paid ? `<span class="invoice-tag tag-due">Due ${invoiceDate(inv.due_at)}</span>` : ""}
          </div>
          <ul class="invoice-mini-lines">
            ${(inv.lines || [])
              .map(
                (l) =>
                  `<li><span>${escapeHtml(l.description)}${Number(l.qty) > 1 ? " × " + Number(l.qty) : ""}</span><span>${invoiceLineLabel(l)}</span></li>`
              )
              .join("")}
          </ul>
          ${inv.notes ? `<p class="project-details">${escapeHtml(inv.notes)}</p>` : ""}
          <div class="project-actions">
            ${
              paid
                ? `<a class="clear-cart-link" href="invoice.html?ref=${escapeHtml(inv.reference)}">View receipt</a>`
                : `<a class="btn btn-primary btn-small-inline" href="invoice.html?ref=${escapeHtml(inv.reference)}">Pay ${money(inv.total_cents)} Now</a>`
            }
          </div>
        </div>`;
        })
        .join("") +
      "</div>"
    );
  }
  // ---------------------------------------------------------------------

  let siteStats = null;
  let statsSnapshot = null;

  async function loadSiteStats() {
    try {
      const { data, error } = await digicodeSupabase.rpc("site_stats");
      if (error) throw error;
      siteStats = data || null;
    } catch (e) {
      siteStats = null;
    }
    return siteStats;
  }

  async function loadStatsSnapshot() {
    try {
      const res = await fetch("data/site-stats.json?t=" + Date.now(), { cache: "no-store" });
      statsSnapshot = res.ok ? await res.json() : null;
    } catch (e) {
      statsSnapshot = null;
    }
    return statsSnapshot;
  }

  const ARROW_UP = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 8V2M5 2L2 5M5 2l3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ARROW_DOWN = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 2v6M5 8L2 5M5 8l3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  function pctChange(cur, prev) {
    cur = Number(cur) || 0;
    prev = Number(prev) || 0;
    if (!prev) return cur > 0 ? { dir: "up", text: "new" } : { dir: "flat", text: "—" };
    const pct = ((cur - prev) / prev) * 100;
    return {
      dir: pct > 0.05 ? "up" : pct < -0.05 ? "down" : "flat",
      text: (pct >= 0 ? "" : "") + Math.abs(pct).toFixed(1) + "%",
    };
  }

  // 12 numbers -> a polyline across the 100x30 viewBox the CSS already expects.
  function sparkPoints(series) {
    const vals = Array.isArray(series) && series.length ? series.map((n) => Number(n) || 0) : [];
    if (!vals.length) return null;
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const span = max - min || 1;
    return vals.map((v, i) => {
      const x = (i / (vals.length - 1 || 1)) * 100;
      const y = 27 - ((v - min) / span) * 24;
      return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    });
  }

  function sparkSvg(series) {
    const pts = sparkPoints(series);
    if (!pts) return "";
    const all = pts.map((p) => `${p.x},${p.y}`).join(" ");
    const tail = pts.slice(-2).map((p) => `${p.x},${p.y}`).join(" ");
    const last = pts[pts.length - 1];
    return `<svg class="stat-sparkline" width="80" height="24" viewBox="0 0 100 30" aria-hidden="true">
                  <polyline class="spark-base" points="${all}" />
                  <polyline class="spark-accent" points="${tail}" />
                  <circle class="spark-dot" cx="${last.x}" cy="${last.y}" r="3" />
                </svg>`;
  }

  function statTile(label, value, delta, series) {
    const arrow = delta.dir === "down" ? ARROW_DOWN : delta.dir === "up" ? ARROW_UP : "";
    const cls = delta.dir === "flat" ? "" : ` ${delta.dir}`;
    return `<div class="stat-tile">
              <span class="stat-tile-label">${escapeHtml(label)}</span>
              <span class="stat-tile-value">${escapeHtml(value)}</span>
              <div class="stat-tile-footer">
                <span class="stat-delta${cls}">${arrow}${escapeHtml(delta.text)}</span>
                ${sparkSvg(series)}
              </div>
            </div>`;
  }

  function renderStatGrid() {
    const grid = document.getElementById("statGrid");
    const stamp = document.getElementById("statsStamp");
    if (!grid) return;

    if (!siteStats) {
      grid.innerHTML = `<p class="dev-empty">Couldn't load live stats. If this is the first time, run <code>supabase/022_site_analytics.sql</code> in the Supabase SQL editor.</p>`;
      if (stamp) stamp.textContent = "";
      return;
    }

    const s = siteStats;
    const spark = s.spark_sessions || [];
    const visitors = Number(s.visitors) || 0;
    const orders = Number(s.orders_sent) || 0;
    const conv = visitors ? (orders / visitors) * 100 : 0;
    const prevVisitors = Number(s.visitors_prev) || 0;
    const prevConv = prevVisitors ? ((Number(s.orders_sent_prev) || 0) / prevVisitors) * 100 : 0;

    grid.innerHTML = [
      statTile("Visitors", visitors.toLocaleString(), pctChange(visitors, s.visitors_prev), spark),
      statTile("Unique visitors", (Number(s.unique_visitors) || 0).toLocaleString(), pctChange(s.unique_visitors, s.unique_visitors_prev), spark),
      statTile("Members", (Number(s.members) || 0).toLocaleString(), {
        dir: Number(s.members_new) > 0 ? "up" : "flat",
        text: Number(s.members_new) > 0 ? `+${s.members_new} this month` : "no change",
      }, null),
      statTile("Requests started", (Number(s.requests_started) || 0).toLocaleString(), pctChange(s.requests_started, s.requests_started_prev), null),
      statTile("Orders sent", orders.toLocaleString(), pctChange(orders, s.orders_sent_prev), null),
      statTile("Conversion rate", conv.toFixed(1) + "%", pctChange(conv, prevConv), null),
    ].join("");

    if (stamp) {
      const since = s.first_view_at ? ` · collecting since ${formatDay(s.first_view_at)}` : "";
      stamp.innerHTML = `<span class="stats-live-dot"></span>Live from the site — read just now${escapeHtml(since)}. ${escapeHtml((Number(s.page_views) || 0).toLocaleString())} page views in the window.`;
    }
  }

  function renderRankList() {
    const list = document.getElementById("rankList");
    if (!list) return;

    if (!siteStats) {
      list.innerHTML = `<p class="dev-empty">No data yet.</p>`;
      return;
    }

    // Real orders are the better signal. Until there are enough of those, fall
    // back to which service pages people are actually reading.
    const byService = siteStats.by_service || [];
    let rows = byService;
    let basis = "from orders placed in the last 90 days";

    if (rows.length < 2) {
      rows = (siteStats.by_page || []).map((r) => ({
        label: prettyServicePath(r.label),
        n: r.n,
      }));
      basis = "from service-page visits — switches to real orders once a few come in";
    }

    if (!rows.length) {
      list.innerHTML = `<p class="dev-empty">Nothing to show yet — this fills in as people visit the service pages.</p>`;
      return;
    }

    const total = rows.reduce((sum, r) => sum + (Number(r.n) || 0), 0) || 1;
    list.innerHTML =
      rows
        .slice(0, 6)
        .map((r) => {
          const pct = Math.round((Number(r.n) || 0) * 100 / total);
          return `<div class="rank-row">
              <span class="rank-label">${escapeHtml(r.label)}</span>
              <div class="rank-bar-track"><div class="rank-bar-fill" style="width: ${pct}%;"></div></div>
              <span class="rank-value">${pct}%</span>
            </div>`;
        })
        .join("") + `<p class="stats-stamp">${escapeHtml(basis)}.</p>`;
  }

  function prettyServicePath(path) {
    const file = String(path || "").split("/").pop().replace(/\.html$/, "");
    const names = {
      business: "Business Websites",
      gaming: "Gaming Websites",
      seo: "SEO",
      hosting: "Website Hosting",
      updates: "Update Management",
      social: "Social Platforms",
    };
    return names[file] || file || "Other";
  }

  const TICK = `<svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const WARN = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M10.3 4.3L2.9 17a1.8 1.8 0 001.6 2.7h15a1.8 1.8 0 001.6-2.7L13.7 4.3a1.8 1.8 0 00-3.4 0z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  function perfTile(label, value, state) {
    const icon = state === "warning" ? WARN : TICK;
    return `<div class="perf-tile">
              <span class="perf-icon ${state}">${icon}</span>
              <div class="perf-body">
                <span class="perf-label">${escapeHtml(label)}</span>
                <span class="perf-value">${escapeHtml(value)}</span>
              </div>
            </div>`;
  }

  function renderPerfGrid() {
    const grid = document.getElementById("perfGrid");
    const stamp = document.getElementById("healthStamp");
    if (!grid) return;

    const s = siteStats || {};
    const snap = statsSnapshot || {};
    const tiles = [];

    // Real user timing, straight from visitors' browsers.
    if (s.avg_load_ms != null) {
      const sec = Number(s.avg_load_ms) / 1000;
      tiles.push(perfTile("Avg. page load", sec.toFixed(1) + "s", sec <= 2.5 ? "good" : "warning"));
    } else {
      tiles.push(perfTile("Avg. page load", "—", "good"));
    }

    const up = snap.uptime || {};
    if (up.status) {
      tiles.push(perfTile("Uptime", up.status === "up" ? "Up" : "Down", up.status === "up" ? "good" : "warning"));
    }

    if (s.bounce_pct != null) {
      const b = Number(s.bounce_pct);
      tiles.push(perfTile("Bounce rate", b.toFixed(0) + "%", b <= 60 ? "good" : "warning"));
    } else {
      tiles.push(perfTile("Bounce rate", "—", "good"));
    }

    if (s.avg_session_sec != null) {
      const sec = Number(s.avg_session_sec);
      const m = Math.floor(sec / 60);
      tiles.push(perfTile("Avg. session", (m ? m + "m " : "") + Math.round(sec % 60) + "s", "good"));
    } else {
      tiles.push(perfTile("Avg. session", "—", "good"));
    }

    if (s.open_chats != null) {
      const open = Number(s.open_chats);
      tiles.push(perfTile("Open chats", String(open), open > 0 ? "warning" : "good"));
    }

    const ps = snap.pagespeed || {};
    if (ps.performance != null) {
      tiles.push(perfTile("PageSpeed", String(ps.performance), Number(ps.performance) >= 90 ? "good" : "warning"));
    }

    grid.innerHTML = tiles.join("");

    if (stamp) {
      const when = snap.generatedAt ? formatDay(snap.generatedAt) : null;
      const by = snap.checkedBy ? ` by ${snap.checkedBy}` : "";
      stamp.textContent = when
        ? `Page load, bounce, session and chats are live. Uptime and PageSpeed come from the last daily check — ${when}${by}.`
        : `Page load, bounce, session and chats are live. No daily check has run yet.`;
    }
  }

  async function refreshDashboard() {
    const btn = document.getElementById("statsRefresh");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Refreshing…";
    }
    await Promise.all([loadSiteStats(), loadStatsSnapshot()]);
    renderStatGrid();
    renderRankList();
    renderPerfGrid();
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Refresh";
    }
  }

  const statsRefreshBtn = document.getElementById("statsRefresh");
  if (statsRefreshBtn) statsRefreshBtn.addEventListener("click", refreshDashboard);

  (async () => {
    await Promise.all([waitForAuthReady(), loadProjects(), loadTeam(), loadChats(), loadVisitorChats(), loadSiteStats(), loadStatsSnapshot(), loadScripts(), loadInvoices(), loadScriptSales()]);
    renderAllPanels();
    applyPortalRole();
    subscribeToVisitorChat();
  })();
}

// ---------------------------------------------------------------------------
// Subscription page — choose a plan, then tell us about the site.
//
// Management is sold on its own now, separate from builds: a plan can start on
// a site we built or one that already exists somewhere else. So the questions
// here are about taking over an existing site, not specifying a new one.
// ---------------------------------------------------------------------------
const mgmtForm = document.getElementById("mgmtForm");

if (mgmtForm) {
  const chosenLine = document.getElementById("mgmtChosenLine");
  const tierInput = document.getElementById("mgmtTierInput");
  const tierGrid = document.getElementById("tierGrid");
  const buildCta = document.getElementById("mgmtBuildCta");

  function currentCycle() {
    const active = document.querySelector(".billing-tab.active");
    return active && active.dataset.billing === "weekly" ? "weekly" : "monthly";
  }

  function priceFor(tierName, cycle) {
    const card = [...document.querySelectorAll(".tier-card")].find(
      (c) => c.querySelector(".tier-name")?.textContent.trim() === tierName
    );
    const el = card?.querySelector(".price-amount");
    if (!el) return { amount: "", period: "" };
    return {
      amount: cycle === "weekly" ? el.dataset.weekly : el.dataset.monthly,
      period: cycle === "weekly" ? "/wk" : "/mo",
    };
  }

  function showForm(tierName) {
    const cycle = currentCycle();
    const { amount, period } = priceFor(tierName, cycle);

    tierInput.value = `${tierName} (${amount}${period})`;
    chosenLine.textContent =
      `${tierName} — ${amount}${period}, billed ${cycle}. ` +
      `Everything below helps us take the site over cleanly.`;

    mgmtForm.hidden = false;
    if (tierGrid) tierGrid.hidden = true;
    if (buildCta) buildCta.hidden = true;
    mgmtForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.querySelectorAll(".mgmt-choose").forEach((btn) => {
    btn.addEventListener("click", () => showForm(btn.dataset.tier));
  });

  document.getElementById("mgmtChangeBtn")?.addEventListener("click", () => {
    mgmtForm.hidden = true;
    if (tierGrid) tierGrid.hidden = false;
    if (buildCta) buildCta.hidden = false;
    tierGrid?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.getElementById("mgmtCheckoutBtn")?.addEventListener("click", () => {
    const tierName = (tierInput.value || "").split(" (")[0];
    if (!tierName) return;

    const cycle = currentCycle();
    const { amount, period } = priceFor(tierName, cycle);

    // Management is its own cart, never mixed with a build — that is what lets
    // checkout use the subscription-scoped Stripe key on its own.
    saveCartItems([
      {
        key: "Website Management::mgmtTier",
        service: "Website Management",
        type: "Management",
        name: tierName,
        price: amount,
        period,
      },
    ]);
    updateCartBadge();

    const lines = [];
    mgmtForm.querySelectorAll("input, textarea").forEach((el) => {
      const label = el.dataset.label;
      if (!label) return;
      if (el.type === "radio" || el.type === "checkbox") {
        if (el.checked) lines.push(label);
      } else {
        const val = el.value.trim();
        if (val) lines.push(`${label}: ${val}`);
      }
    });

    localStorage.setItem(
      CUSTOMER_KEY,
      JSON.stringify({ service: "Website Management", lines })
    );
    window.location.href = "cart.html";
  });
}
