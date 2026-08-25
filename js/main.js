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

const CART_KEY = "veloraCart";
const CUSTOMER_KEY = "veloraCustomerInfo";

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
  };
}

async function loadProjects() {
  const { data, error } = await veloraSupabase.from("projects").select("*").order("created_at", { ascending: false });
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

  await veloraSupabase.from("projects").insert({
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
  const { data, error } = await veloraSupabase.from("developers").select("*").order("created_at", { ascending: true });
  if (!error) teamCache = (data || []).map(mapDeveloperRow);
  return teamCache;
}

function getTeam() {
  return teamCache;
}

async function loadChats() {
  const { data, error } = await veloraSupabase.from("chats").select("*").order("created_at", { ascending: true });
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

const PSI_KEY_STORAGE = "veloraPageSpeedKey";

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

  const checkoutBtn = document.getElementById("checkoutBtn");
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
      localStorage.setItem(CUSTOMER_KEY, JSON.stringify({ service: serviceName, lines }));

      window.location.href = checkoutBtn.dataset.cartUrl || "cart.html";
    });
  }
}

const cartItemsEl = document.getElementById("cartItems");

if (cartItemsEl) {
  const cartEmptyEl = document.getElementById("cartEmpty");
  const cartSummaryEl = document.getElementById("cartSummary");

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
  }

  renderCart();

  const clearCartBtn = document.getElementById("clearCartBtn");
  clearCartBtn?.addEventListener("click", () => {
    saveCartItems([]);
    updateCartBadge();
    renderCart();
  });

  const confirmOrderBtn = document.getElementById("confirmOrderBtn");
  confirmOrderBtn?.addEventListener("click", async () => {
    const cart = getCart();
    const customer = JSON.parse(localStorage.getItem(CUSTOMER_KEY) || "null");

    confirmOrderBtn.disabled = true;
    await pushPendingProjectFromOrder(cart, customer);
    confirmOrderBtn.disabled = false;

    const lines = ["Cart:"];
    cart.forEach((item) => {
      lines.push(`- ${item.service} — ${item.name} (${item.price}${item.period ? " " + item.period : ""})`);
    });

    if (customer?.lines?.length) {
      lines.push("");
      lines.push(`Details (from ${customer.service}):`);
      customer.lines.forEach((l) => lines.push(l));
    }

    const subject = encodeURIComponent("New Velora Order");
    const body = encodeURIComponent(lines.join("\n"));
    window.location.href = `mailto:hello@veloradigital.com?subject=${subject}&body=${body}`;
  });
}

// Portal login — real Supabase email one-time-code auth.
const portalLoginForm = document.getElementById("portalLoginForm");
if (portalLoginForm) {
  portalLoginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const errorEl = document.getElementById("loginError");
    const submitBtn = document.getElementById("loginSubmitBtn");
    if (errorEl) errorEl.hidden = true;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Sending…"; }

    const { error } = await veloraSupabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });

    if (error) {
      if (errorEl) errorEl.hidden = false;
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Send Code"; }
      return;
    }

    sessionStorage.setItem("veloraPendingEmail", email);
    window.location.href = "verify.html";
  });
}

const verifyCodeForm = document.getElementById("verifyCodeForm");
if (verifyCodeForm) {
  const pendingEmail = sessionStorage.getItem("veloraPendingEmail");
  const subEl = document.getElementById("verifySub");
  if (pendingEmail && subEl) {
    subEl.textContent = `We've sent a one-time code to ${pendingEmail}. Enter it below to continue.`;
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

    const { error } = await veloraSupabase.auth.verifyOtp({
      email: pendingEmail,
      token: code,
      type: "email",
    });

    if (error) {
      if (errorEl) errorEl.hidden = false;
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Verify Code"; }
      return;
    }

    sessionStorage.removeItem("veloraPendingEmail");
    // Signing in from the game (to sync a profile across devices) sends
    // the player back there instead of the portal.
    const redirect = sessionStorage.getItem("veloraAuthRedirect") || "portal.html";
    sessionStorage.removeItem("veloraAuthRedirect");
    window.location.href = redirect;
  });

  document.getElementById("resendCodeBtn")?.addEventListener("click", async () => {
    if (!pendingEmail) return;
    await veloraSupabase.auth.signInWithOtp({ email: pendingEmail, options: { shouldCreateUser: true } });
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
    const { error } = await veloraSupabase.auth.updateUser({ password: newPassword });

    if (error) {
      if (errorEl) {
        errorEl.textContent = "That link may have expired — request a new reset email from the game and try again.";
        errorEl.hidden = false;
      }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Set Password"; }
      return;
    }

    window.location.href = "velora-gaming.html";
  });
}

document.addEventListener("click", async (e) => {
  if (!e.target.closest("[data-portal-logout]")) return;
  await veloraSupabase.auth.signOut();
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

  async function updateProjectFields(id, fields) {
    await veloraSupabase.from("projects").update(fields).eq("id", id);
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

    if (!list.length) {
      panel.innerHTML = `<p class="dev-empty">No pending projects right now.</p>`;
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
          <span class="project-date">Submitted ${formatDate(p.createdAt)}</span>
        </div>
        <div class="project-tiers">${tierTagsHtml(p)}</div>
        <dl class="project-contact">
          <div><dt>Email</dt><dd>${escapeHtml(p.clientEmail) || "—"}</dd></div>
          <div><dt>Discord</dt><dd>${escapeHtml(p.clientDiscord) || "—"}</dd></div>
          <div><dt>Mobile</dt><dd>${escapeHtml(p.clientMobile) || "—"}</dd></div>
        </dl>
        <p class="project-details">${escapeHtml(p.details) || "No project details provided."}</p>
        ${domainAndHealthHtml(p)}
        <button type="button" class="btn btn-primary assign-btn" data-id="${p.id}">Assign to Me</button>
      </div>`
      )
      .join("");

    panel.querySelectorAll(".assign-btn").forEach((btn) => {
      btn.addEventListener("click", () => assignProject(btn.dataset.id));
    });
    wireDomainAndHealthHandlers(panel);
  }

  async function assignProject(id) {
    const project = getProjects().find((p) => p.id === id);
    if (!project) return;

    await updateProjectFields(id, {
      status: "assigned",
      assigned_dev: window.veloraPortalEmail || "Dev",
      assigned_at: new Date().toISOString(),
    });

    if (project.clientEmail) {
      const subject = encodeURIComponent(`Your ${project.service} project is underway`);
      const body = encodeURIComponent(
        `Hi ${project.clientName || "there"},\n\nA developer has been assigned to your project and will be in touch with you soon via the contact details you provided.\n\nThanks,\nVelora Digital`
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

  function renderDevelopersPanel() {
    const panel = document.getElementById("developersPanel");
    if (!panel) return;
    const team = getTeam();

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
          <div class="permission-grid">
            <label class="checkbox-option"><input type="checkbox" value="View Pending" checked /> View Pending Projects</label>
            <label class="checkbox-option"><input type="checkbox" value="View Assigned" checked /> View Assigned Projects</label>
            <label class="checkbox-option"><input type="checkbox" value="View Finished" checked /> View Finished Projects</label>
            <label class="checkbox-option"><input type="checkbox" value="Assign Projects" /> Assign Projects to Self</label>
            <label class="checkbox-option"><input type="checkbox" value="Manage Developers" /> Manage Other Developers</label>
          </div>
        </div>
        <button type="submit" class="btn btn-primary">Create Developer</button>
      </form>

      <div class="dev-team-list">
        ${
          team.length
            ? team
                .map(
                  (d) => `
          <div class="dev-team-row">
            <div class="dev-team-info">
              <span class="dev-team-name">${escapeHtml(d.name)} <span class="rank-badge">${escapeHtml(d.rank)}</span></span>
              <span class="dev-team-meta">${escapeHtml(d.username)} · ${escapeHtml(d.email)}</span>
              <span class="dev-team-perms">${d.permissions.length ? escapeHtml(d.permissions.join(", ")) : "No permissions granted"}</span>
            </div>
            <button type="button" class="cart-item-remove remove-dev-btn" data-id="${d.id}" aria-label="Remove ${escapeHtml(d.name)}">&times;</button>
          </div>`
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

      await veloraSupabase.from("developers").insert({ name, email, username, rank, permissions });
      await loadTeam();
      renderDevelopersPanel();
      renderChatPanel();
    });

    panel.querySelectorAll(".remove-dev-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await veloraSupabase.from("developers").delete().eq("id", btn.dataset.id);
        await loadTeam();
        renderDevelopersPanel();
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
        (activeChatId.startsWith("dev:") && team.some((d) => "dev:" + d.id === activeChatId));
      if (!stillExists) activeChatId = null;
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
                <span class="chat-list-name">${escapeHtml(d.name)} <span class="rank-badge">${escapeHtml(d.rank)}</span></span>
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
              <div class="chat-message ${m.from === window.veloraPortalEmail ? "mine" : "theirs"}">
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
      await veloraSupabase.from("chats").insert({
        chat_id: activeChatId,
        from_name: window.veloraPortalEmail || "Dev",
        message: text,
      });
      await loadChats();
      renderChatPanel();
      const msgsEl = document.getElementById("chatMessages");
      if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
    });
  }

  function renderAllPanels() {
    renderPendingPanel();
    renderAssignedPanel();
    renderFinishedPanel();
    renderDevelopersPanel();
    renderChatPanel();
  }

  function waitForAuthReady() {
    if (window.veloraPortalRole) return Promise.resolve();
    return new Promise((resolve) => document.addEventListener("velora-auth-ready", resolve, { once: true }));
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
    const isRealClient = window.veloraPortalRole === "client";
    const projects = getProjects();
    const demoProject = projects[0];

    if (!demoProject) {
      clientViewContainer.innerHTML = isRealClient
        ? `<p class="dev-empty">We don't have a project on file for this account yet. If you've just purchased a build or plan, make sure you checked out with this same email — otherwise email <a href="mailto:hello@veloradigital.com">hello@veloradigital.com</a> and we'll sort it out.</p>
           <div style="text-align: center; margin-top: 24px;"><button type="button" class="clear-cart-link" data-portal-logout>Log out</button></div>`
        : `<p class="dev-empty">No projects exist yet to preview.</p>`;
      return;
    }

    const chatId = "client:" + demoProject.id;
    const chats = getChats();
    const msgs = chats[chatId] || [];
    const statusLabel =
      demoProject.status === "finished" ? "Finished" : demoProject.status === "assigned" ? "In progress" : "Submitted";
    const statusDate = demoProject.finishedAt || demoProject.assignedAt || demoProject.createdAt;

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
        ${
          demoProject.assignedDev
            ? `<p class="project-assigned-to">Your developer: <strong>${escapeHtml(demoProject.assignedDev)}</strong></p>`
            : `<p class="dev-empty">A developer hasn't been assigned yet.</p>`
        }
        <div class="project-notes">
          ${
            demoProject.progressNotes.length
              ? demoProject.progressNotes
                  .map((n) => `<div class="project-note"><span class="project-note-date">${formatDate(n.date)}</span><p>${escapeHtml(n.note)}</p></div>`)
                  .join("")
              : `<p class="dev-empty">No updates yet.</p>`
          }
        </div>
      </div>

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

    document.getElementById("clientChatSendForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("clientChatInput");
      const text = input.value.trim();
      if (!text) return;
      await veloraSupabase.from("chats").insert({
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
  function applyPortalRole() {
    const portalRole = window.veloraPortalRole;
    if (portalWelcomeName) portalWelcomeName.textContent = portalRole === "client" ? "Client." : "Dev.";
    if (portalRole === "client") {
      if (viewSwitchRow) viewSwitchRow.hidden = true;
      if (devViewContainer) devViewContainer.hidden = true;
      if (clientViewContainer) clientViewContainer.hidden = false;
      renderClientPreview();
    }
  }

  (async () => {
    await Promise.all([waitForAuthReady(), loadProjects(), loadTeam(), loadChats()]);
    renderAllPanels();
    applyPortalRole();
  })();
}
