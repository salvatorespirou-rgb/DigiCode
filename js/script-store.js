/* DigiCode — the script store.
 *
 * Three jobs: list what's for sale, hand over the file after someone has
 * paid, and — for a CFX Scripts / MLOs listing — take an email and cfx.re
 * account name before sending them to pay, since that purchase is fulfilled
 * by hand rather than downloaded. Prices come from list_scripts() and the
 * cart only ever sends "script:<slug>" — quote_cart() decides what that
 * costs, same rule as everything else, so editing this file buys nothing
 * cheaply.
 */
(function () {
  "use strict";

  var list = document.getElementById("scriptList");
  if (!list || typeof digicodeSupabase === "undefined") return;

  var cfxSection = document.getElementById("cfxScriptSection");
  var cfxList = document.getElementById("cfxScriptList");

  var DOWNLOAD_FN =
    "https://phlmnlildwkkichlbtoy.supabase.co/functions/v1/script-download";
  var CHECKOUT_FN =
    "https://phlmnlildwkkichlbtoy.supabase.co/functions/v1/stripe-checkout";

  var CFX_CATEGORIES = ["CFX Scripts", "MLOs"];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function money(cents) {
    return cents === 0 ? "Free" : "$" + (cents / 100).toFixed(2);
  }

  function size(bytes) {
    if (!bytes) return "";
    return bytes > 1048576
      ? (bytes / 1048576).toFixed(1) + " MB"
      : Math.round(bytes / 1024) + " KB";
  }

  // A summary or description clamps to a fixed number of lines so every card
  // in the grid stays the same height (see .script-desc in style.css) — but
  // that leaves no way to read past the cut-off point. Each clamped field
  // gets a "Read more" trigger right after it, as a sibling rather than
  // something nested inside it, so the popover it opens isn't clipped by the
  // field's own overflow:hidden. wireClampTriggers() below decides, after
  // layout, which of these triggers a card actually needs.
  function clampField(text, cls) {
    if (!text) return "";
    var full = esc(text);
    return (
      '<p class="' + cls + '">' + full + "</p>" +
      '<button type="button" class="script-clamp-more">Read more' +
      '<span class="script-clamp-panel">' + full + "</span>" +
      "</button>"
    );
  }

  // Only shows the trigger where the text is actually cut off — comparing
  // scrollHeight to clientHeight after the real layout, rather than guessing
  // from character count, which would be wrong the moment the font, card
  // width, or line-clamp value changes.
  function wireClampTriggers(container) {
    container.querySelectorAll(".script-clamp-more").forEach(function (btn) {
      var field = btn.previousElementSibling;
      if (!field || field.scrollHeight <= field.clientHeight + 1) {
        btn.remove();
        return;
      }
      btn.classList.add("is-shown");
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var wasOpen = btn.classList.contains("is-open");
        container.querySelectorAll(".script-clamp-more.is-open").forEach(function (b) {
          b.classList.remove("is-open");
        });
        if (!wasOpen) btn.classList.add("is-open");
      });
    });
  }

  // ----- After payment: show the downloads for this order -------------------

  async function showDownloads(ref) {
    var box = document.createElement("div");
    box.className = "script-paid";
    box.innerHTML = '<p class="dev-empty">Fetching your order…</p>';
    list.parentNode.insertBefore(box, list);
    box.scrollIntoView({ behavior: "smooth", block: "start" });

    var rows = [];
    try {
      var res = await digicodeSupabase.rpc("downloads_for_order", { p_reference: ref });
      if (res.error) throw res.error;
      rows = res.data || [];
    } catch (e) {
      rows = [];
    }

    if (!rows.length) {
      // Stripe's webhook can land a second or two after the redirect.
      box.innerHTML =
        '<h2>Thanks — payment received.</h2>' +
        "<p>Your order is still being prepared. Refresh in a few seconds, " +
        "and if it still isn't here email " +
        '<a href="mailto:developerteam@digi-code.com.au">developerteam@digi-code.com.au</a> ' +
        "with this reference and we'll sort it out.</p>" +
        '<p class="script-ref">Reference: ' + esc(ref) + "</p>";
      return;
    }

    var cfxRows = rows.filter(function (r) { return r.delivery === "cfx"; });
    var fileRows = rows.filter(function (r) { return r.delivery !== "cfx"; });

    box.innerHTML =
      "<h2>Thanks — payment received.</h2>" +
      (fileRows.length
        ? "<p>Save the file somewhere safe. This page is the only place the link " +
          "appears, so bookmark it or download now.</p>"
        : "") +
      '<div class="script-paid-list">' +
      fileRows
        .map(function (r) {
          return (
            '<div class="script-paid-row">' +
            "<div><strong>" + esc(r.name) + "</strong>" +
            '<span class="script-paid-meta">' +
            (r.delivery === "drive"
              ? "Hosted on Google Drive"
              : esc(r.file_name || "") + (r.file_bytes ? " · " + size(r.file_bytes) : "")) +
            "</span></div>" +
            '<button type="button" class="btn btn-primary btn-small-inline script-get" ' +
            'data-token="' + esc(r.token) + '">' +
            (r.delivery === "drive" ? "Open in Drive" : "Download") +
            "</button>" +
            "</div>"
          );
        })
        .join("") +
      "</div>" +
      (cfxRows.length
        ? '<div class="script-paid-cfx">' +
          cfxRows
            .map(function (r) {
              return (
                '<div class="script-paid-row">' +
                "<div><strong>" + esc(r.name) + "</strong>" +
                '<span class="script-paid-meta">Delivered by cfx.re asset transfer</span>' +
                "</div></div>"
              );
            })
            .join("") +
          "<p class=\"form-note\">We'll transfer " +
          (cfxRows.length > 1 ? "these" : "this") +
          " to the cfx.re account you gave us at checkout — please allow up to " +
          "30 minutes. Any trouble, email " +
          '<a href="mailto:developerteam@digi-code.com.au">developerteam@digi-code.com.au</a> ' +
          "with your reference below.</p>" +
          "</div>"
        : "") +
      '<p class="script-ref">Reference: ' + esc(ref) + "</p>";

    box.querySelectorAll(".script-get").forEach(function (btn) {
      btn.addEventListener("click", function () { getFile(btn); });
    });
  }

  async function getFile(btn) {
    var original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Preparing…";

    try {
      var res = await fetch(DOWNLOAD_FN, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: "Bearer " + SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ token: btn.dataset.token }),
      });
      var data = await res.json();

      if (!res.ok || !data.url) throw new Error(data.error || "no url");

      if (data.delivery === "drive") {
        // Drive opens its own page rather than starting a download, so keep
        // this tab where it is — the buyer still has their other files here.
        window.open(data.url, "_blank", "noopener");
        btn.textContent = "Opened in Drive";
        setTimeout(function () {
          btn.disabled = false;
          btn.textContent = original;
        }, 4000);
        return;
      }

      // The signed URL is short-lived, so send them straight to it.
      window.location.href = data.url;
      btn.textContent = "Downloading…";
      setTimeout(function () {
        btn.disabled = false;
        btn.textContent = original;
      }, 4000);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = original;
      window.alert(
        "Couldn't prepare that download. Try again, or email " +
          "developerteam@digi-code.com.au and we'll send it over."
      );
    }
  }

  // ----- The regular storefront ----------------------------------------------

  var IMAGE_BASE =
    "https://phlmnlildwkkichlbtoy.supabase.co/storage/v1/object/public/script-images/";

  function card(s) {
    return (
      '<article class="script-card">' +
        (s.image_path
          ? '<div class="script-thumb"><img src="' + esc(IMAGE_BASE + s.image_path) +
            '" alt="' + esc(s.name) + '" loading="lazy" /></div>'
          : "") +
        '<div class="script-card-top">' +
          (s.platform ? '<span class="script-platform">' + esc(s.platform) + "</span>" : "") +
          (s.version ? '<span class="script-version">v' + esc(s.version) + "</span>" : "") +
        "</div>" +
        "<h3>" + esc(s.name) + "</h3>" +
        clampField(s.summary, "script-summary") +
        clampField(s.description, "script-desc") +
        '<div class="script-card-foot">' +
          '<span class="script-price">' + esc(money(s.price_cents)) + "</span>" +
          '<button type="button" class="btn btn-primary script-buy" data-slug="' +
            esc(s.slug) + '">Buy &amp; Download</button>' +
        "</div>" +
        (s.file_bytes || s.sales_count
          ? '<div class="script-card-meta">' +
              (s.file_bytes ? esc(size(s.file_bytes)) : "") +
              (s.file_bytes && s.sales_count ? " · " : "") +
              (s.sales_count ? esc(s.sales_count) + " sold" : "") +
            "</div>"
          : "") +
      "</article>"
    );
  }

  // A script is its own order — mixing a file with a website build would put
  // one cart across two very different fulfilment paths.
  function buy(btn) {
    var slug = btn.dataset.slug;
    try {
      localStorage.setItem(
        "digicodeCart",
        JSON.stringify([
          {
            key: "Script::" + slug,
            service: "Game Script",
            type: "Script",
            sku: "script:" + slug,
            name: btn.closest(".script-card").querySelector("h3").textContent,
            price: btn.closest(".script-card").querySelector(".script-price").textContent,
            period: "one-time",
          },
        ])
      );
    } catch (e) {
      /* storage blocked */
    }
    window.location.href = "cart.html";
  }

  // ----- CFX-sourced scripts: sold once, transferred by hand ------------------
  //
  // These aren't files this site holds — they're licences on the store
  // owner's own cfx.re assets account, handed over there after payment. So
  // the buy flow is different in three ways: it asks for a cfx.re account
  // name before paying, it goes straight to Stripe rather than through the
  // cart (a cfx purchase is always exactly one item), and once it's paid for
  // the listing is gone — list_scripts() will not return it again.

  function cfxCard(s) {
    return (
      '<article class="script-card cfx-script-card">' +
        (s.image_path
          ? '<div class="script-thumb"><img src="' + esc(IMAGE_BASE + s.image_path) +
            '" alt="' + esc(s.name) + '" loading="lazy" /></div>'
          : "") +
        '<div class="script-card-top">' +
          '<span class="script-platform cfx-badge">' + esc(s.category) + "</span>" +
          (s.platform ? '<span class="script-version">' + esc(s.platform) + "</span>" : "") +
        "</div>" +
        "<h3>" + esc(s.name) + "</h3>" +
        clampField(s.summary, "script-summary") +
        clampField(s.description, "script-desc") +
        '<div class="script-card-foot">' +
          '<span class="script-price">' + esc(money(s.price_cents)) + "</span>" +
          '<button type="button" class="btn btn-primary cfx-script-buy" data-slug="' +
            esc(s.slug) + '" data-name="' + esc(s.name) + '" data-price="' + esc(money(s.price_cents)) + '">' +
            "Buy — via cfx.re</button>" +
        "</div>" +
        '<div class="script-card-meta cfx-one-off">Only one licence — gone once it sells' +
          (s.sales_count ? " · " + esc(s.sales_count) + " sold" : "") + "</div>" +
      "</article>"
    );
  }

  function cfxModalHtml(name, price) {
    return (
      '<div class="cfx-buy-inner">' +
        "<strong>" + esc(name) + "</strong>" +
        '<p class="cfx-buy-price">' + esc(price) + "</p>" +
        "<p>This one is delivered by a personal asset transfer through cfx.re, " +
        "not an instant download. We need a couple of details first, then " +
        "you'll pay the same way as anywhere else on the site.</p>" +
        '<form id="cfxBuyForm">' +
          '<div class="form-group">' +
            '<label for="cfxBuyEmail">Your email</label>' +
            '<input type="email" id="cfxBuyEmail" required placeholder="you@example.com" />' +
          "</div>" +
          '<div class="form-group">' +
            '<label for="cfxBuyAccount">Your cfx.re account name</label>' +
            '<input type="text" id="cfxBuyAccount" required placeholder="Exactly as it appears on cfx.re" />' +
          "</div>" +
          '<p class="cfx-buy-disclaimer">Please allow up to 30 minutes after payment for the ' +
          "cfx.re transfer to complete. This listing is one-off — once it's sold, it's removed " +
          "from the store and can't be bought again.</p>" +
          '<p class="portal-login-error" id="cfxBuyError" hidden></p>' +
          '<div class="cfx-buy-actions">' +
            '<button type="submit" class="btn btn-primary" id="cfxBuySubmit">Continue to Payment</button>' +
            '<button type="button" class="clear-cart-link" id="cfxBuyCancel">Cancel</button>' +
          "</div>" +
        "</form>" +
      "</div>"
    );
  }

  function openCfxModal(slug, name, price) {
    var overlay = document.createElement("div");
    overlay.className = "cfx-buy-overlay is-shown";
    overlay.innerHTML = cfxModalHtml(name, price);
    document.body.appendChild(overlay);

    function close() {
      overlay.remove();
    }
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) close();
    });
    overlay.querySelector("#cfxBuyCancel").addEventListener("click", close);

    overlay.querySelector("#cfxBuyForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      var email = overlay.querySelector("#cfxBuyEmail").value.trim();
      var account = overlay.querySelector("#cfxBuyAccount").value.trim();
      var err = overlay.querySelector("#cfxBuyError");
      var btn = overlay.querySelector("#cfxBuySubmit");
      err.hidden = true;

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        err.textContent = "That doesn't look like a valid email address.";
        err.hidden = false;
        return;
      }
      if (!account) {
        err.textContent = "Enter your cfx.re account name.";
        err.hidden = false;
        return;
      }

      btn.disabled = true;
      btn.textContent = "Taking you to checkout…";

      try {
        var res = await fetch(CHECKOUT_FN, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: "Bearer " + SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            items: [{ sku: "script:" + slug, qty: 1 }],
            email: email,
            note: "cfx.re account: " + account,
          }),
        });
        var data = await res.json().catch(function () { return {}; });

        if (res.ok && data.url) {
          window.location.href = data.url;
          return;
        }
        throw new Error(data.error || "checkout unavailable");
      } catch (ex) {
        btn.disabled = false;
        btn.textContent = "Continue to Payment";
        err.textContent =
          /unknown item/i.test(ex.message || "")
            ? "Sorry — someone just bought this one. Refresh the page to see what's left."
            : "Couldn't start checkout. Try again, or email developerteam@digi-code.com.au.";
        err.hidden = false;
      }
    });
  }

  // ----- Loading and rendering both grids -------------------------------------

  async function render() {
    var rows = [];
    try {
      var res = await digicodeSupabase.rpc("list_scripts");
      if (res.error) throw res.error;
      rows = res.data || [];
    } catch (e) {
      list.innerHTML =
        '<p class="dev-empty">Couldn\'t load the scripts just now. ' +
        "Refresh, or use the live chat and we'll help.</p>";
      return;
    }

    var normalRows = rows.filter(function (r) {
      return CFX_CATEGORIES.indexOf(r.category) === -1;
    });
    var cfxRows = rows.filter(function (r) {
      return CFX_CATEGORIES.indexOf(r.category) !== -1;
    });

    if (!normalRows.length) {
      list.innerHTML =
        '<p class="dev-empty">No scripts listed yet — the first ones are on ' +
        "their way. In the meantime we build to order: " +
        '<a href="digicode-gaming.html#script-request">tell us what you need</a>.</p>';
    } else {
      list.innerHTML = normalRows.map(card).join("");
      list.querySelectorAll(".script-buy").forEach(function (btn) {
        btn.addEventListener("click", function () { buy(btn); });
      });
      wireClampTriggers(list);
    }

    if (cfxSection && cfxList) {
      if (cfxRows.length) {
        cfxSection.hidden = false;
        cfxList.innerHTML = cfxRows.map(cfxCard).join("");
        cfxList.querySelectorAll(".cfx-script-buy").forEach(function (btn) {
          btn.addEventListener("click", function () {
            openCfxModal(btn.dataset.slug, btn.dataset.name, btn.dataset.price);
          });
        });
        wireClampTriggers(cfxList);
      } else {
        cfxSection.hidden = true;
      }
    }
  }

  // Tapping a "Read more" trigger opens its panel without this firing (it
  // stops propagation there); tapping anywhere else closes whichever one is
  // open — the only way to close it on a touch device, which has no hover.
  document.addEventListener("click", function () {
    document.querySelectorAll(".script-clamp-more.is-open").forEach(function (b) {
      b.classList.remove("is-open");
    });
  });

  var ref = new URLSearchParams(location.search).get("ref");
  if (ref && new URLSearchParams(location.search).get("paid") === "1") {
    showDownloads(ref);
  }
  render();
})();
