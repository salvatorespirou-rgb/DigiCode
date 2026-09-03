/* DigiCode — the script store.
 *
 * Two jobs: list what's for sale, and hand over the file after someone has
 * paid. Prices come from list_scripts() and the cart only ever sends
 * "script:<slug>" — quote_cart() decides what that costs, same rule as
 * everything else, so editing this file buys nothing cheaply.
 */
(function () {
  "use strict";

  var list = document.getElementById("scriptList");
  if (!list || typeof digicodeSupabase === "undefined") return;

  var DOWNLOAD_FN =
    "https://phlmnlildwkkichlbtoy.supabase.co/functions/v1/script-download";

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

  // ----- After payment: show the downloads for this order -------------------

  async function showDownloads(ref) {
    var box = document.createElement("div");
    box.className = "script-paid";
    box.innerHTML = '<p class="dev-empty">Fetching your download…</p>';
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
        "<p>Your download is still being prepared. Refresh in a few seconds, " +
        "and if it still isn't here email " +
        '<a href="mailto:developerteam@digi-code.com.au">developerteam@digi-code.com.au</a> ' +
        "with this reference and we'll sort it out.</p>" +
        '<p class="script-ref">Reference: ' + esc(ref) + "</p>";
      return;
    }

    box.innerHTML =
      "<h2>Thanks — here's your download.</h2>" +
      "<p>Save the file somewhere safe. This page is the only place the link " +
      "appears, so bookmark it or download now.</p>" +
      '<div class="script-paid-list">' +
      rows
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

  // ----- The storefront -----------------------------------------------------

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
        (s.summary ? "<p class=\"script-summary\">" + esc(s.summary) + "</p>" : "") +
        (s.description
          ? '<p class="script-desc">' + esc(s.description) + "</p>"
          : "") +
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

    if (!rows.length) {
      list.innerHTML =
        '<p class="dev-empty">No scripts listed yet — the first ones are on ' +
        "their way. In the meantime we build to order: " +
        '<a href="digicode-gaming.html#script-request">tell us what you need</a>.</p>';
      return;
    }

    list.innerHTML = rows.map(card).join("");

    list.querySelectorAll(".script-buy").forEach(function (btn) {
      btn.addEventListener("click", function () { buy(btn); });
    });
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

  var ref = new URLSearchParams(location.search).get("ref");
  if (ref && new URLSearchParams(location.search).get("paid") === "1") {
    showDownloads(ref);
  }
  render();
})();
