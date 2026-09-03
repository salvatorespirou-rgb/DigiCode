/* DigiCode — the page a priced quote links to.
 *
 * Reached from an emailed link, so nobody is signed in. The reference in the
 * URL is the only credential, and invoice_for_payment() decides what may be
 * shown for it: a draft or a cancelled invoice returns nothing at all.
 *
 * As everywhere else on the site, the amount lives on the server. This page
 * displays a total; it never sends one. Pressing Pay posts the reference to
 * the Edge Function, which reads the price out of the invoices table itself.
 */
(function () {
  "use strict";

  var view = document.getElementById("invoiceView");
  if (!view || typeof digicodeSupabase === "undefined") return;

  var CHECKOUT_FN =
    "https://phlmnlildwkkichlbtoy.supabase.co/functions/v1/stripe-checkout";

  var params = new URLSearchParams(location.search);
  var ref = (params.get("ref") || "").trim();
  var justPaid = params.get("paid") === "1";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function money(cents) {
    return "$" + ((Number(cents) || 0) / 100).toFixed(2);
  }

  function longDate(d) {
    if (!d) return "";
    var dt = new Date(d);
    if (isNaN(dt)) return "";
    return dt.toLocaleDateString("en-AU", {
      day: "numeric", month: "long", year: "numeric",
    });
  }

  function notFound() {
    view.innerHTML =
      '<div class="invoice-sheet">' +
      "<h2>We couldn't find that quote.</h2>" +
      "<p>The link may be incomplete, or the quote may have been withdrawn or " +
      "replaced with a newer one. Email " +
      '<a href="mailto:developerteam@digi-code.com.au">developerteam@digi-code.com.au</a> ' +
      "and we'll send you a fresh one.</p>" +
      "</div>";
  }

  function render(inv) {
    var paid = inv.status === "paid";
    var lines = Array.isArray(inv.lines) ? inv.lines : [];
    var overdue =
      !paid && inv.due_at && new Date(inv.due_at) < new Date(new Date().toDateString());

    var rows = lines
      .map(function (l) {
        var qty = Number(l.qty) || 1;
        return (
          '<tr><td class="invoice-desc">' + esc(l.description) +
          (qty > 1
            ? '<span class="invoice-qty">' + qty + " × " + money(l.unit_cents) + "</span>"
            : "") +
          "</td>" +
          '<td class="invoice-amt">' + money(l.line_cents != null ? l.line_cents : l.unit_cents * qty) +
          "</td></tr>"
        );
      })
      .join("");

    view.innerHTML =
      (paid
        ? '<div class="invoice-paid-banner">Paid' +
          (inv.paid_at ? " on " + esc(longDate(inv.paid_at)) : "") +
          " — thank you. Nothing more to do.</div>"
        : "") +
      '<div class="invoice-sheet">' +
        '<div class="invoice-head">' +
          "<div>" +
            '<p class="eyebrow">' + (paid ? "Receipt" : "Quote") + "</p>" +
            "<h2>" + esc(inv.title || "Quote") + "</h2>" +
            (inv.client_name
              ? '<p class="invoice-for">Prepared for ' + esc(inv.client_name) + "</p>"
              : "") +
          "</div>" +
          '<div class="invoice-total-box">' +
            "<span>" + (paid ? "Paid" : "Total due") + "</span>" +
            "<strong>" + money(inv.total_cents) + "</strong>" +
            '<span class="invoice-gst">AUD</span>' +
          "</div>" +
        "</div>" +

        '<table class="invoice-table"><tbody>' + rows + "</tbody>" +
        "<tfoot>" +
          (Number(inv.discount_cents) > 0
            ? '<tr class="invoice-sub"><td>Subtotal</td><td class="invoice-amt">' +
                money(inv.subtotal_cents) + "</td></tr>" +
              '<tr class="invoice-sub"><td>Discount</td><td class="invoice-amt">−' +
                money(inv.discount_cents) + "</td></tr>"
            : "") +
          '<tr class="invoice-grand"><td>' + (paid ? "Paid" : "Total") +
            '</td><td class="invoice-amt">' + money(inv.total_cents) + "</td></tr>" +
        "</tfoot></table>" +

        (inv.notes
          ? '<div class="invoice-notes"><h3>Notes</h3><p>' + esc(inv.notes) + "</p></div>"
          : "") +

        (!paid && inv.due_at
          ? '<p class="invoice-due' + (overdue ? " overdue" : "") + '">' +
            (overdue ? "Was due " : "Due by ") + esc(longDate(inv.due_at)) + "</p>"
          : "") +

        (paid
          ? ""
          : '<div class="invoice-actions">' +
              '<button type="button" class="btn btn-primary btn-large" id="invoicePayBtn">' +
                "Pay " + money(inv.total_cents) + " Now</button>" +
              '<p class="form-note">Secure card payment through Stripe. ' +
              "You'll get a receipt by email.</p>" +
            "</div>") +

        '<p class="invoice-ref">Reference: ' + esc(inv.reference) + "</p>" +
      "</div>";

    var btn = document.getElementById("invoicePayBtn");
    if (btn) btn.addEventListener("click", function () { pay(btn, inv); });
  }

  async function pay(btn, inv) {
    var original = btn.textContent;
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
        body: JSON.stringify({ invoice: ref }),
      });
      var data = await res.json().catch(function () { return {}; });

      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }

      // Someone paid it in another tab, or from the portal.
      if (data.paid) {
        window.location.href = "invoice.html?ref=" + encodeURIComponent(ref) + "&paid=1";
        return;
      }

      throw new Error(data.error || "checkout unavailable");
    } catch (e) {
      btn.disabled = false;
      btn.textContent = original;
      view.insertAdjacentHTML(
        "afterbegin",
        '<div class="invoice-error">We couldn\'t open the payment page just ' +
          "now. Try again in a moment, or email " +
          '<a href="mailto:developerteam@digi-code.com.au">developerteam@digi-code.com.au</a>' +
          " quoting reference " + esc(ref) + " and we'll take it from there.</div>"
      );
    }
  }

  async function load(attempt) {
    try {
      var res = await digicodeSupabase.rpc("invoice_for_payment", { p_reference: ref });
      if (res.error) throw res.error;
      var inv = (res.data || [])[0];
      if (!inv) return notFound();

      // Coming back from Stripe, the webhook may land a second or two after
      // the redirect. Give it a couple of tries before saying it's unpaid.
      if (justPaid && inv.status !== "paid" && attempt < 4) {
        view.innerHTML = '<p class="dev-empty">Confirming your payment…</p>';
        setTimeout(function () { load(attempt + 1); }, 1800);
        return;
      }

      render(inv);
    } catch (e) {
      view.innerHTML =
        '<p class="dev-empty">We couldn\'t load that quote just now. Refresh ' +
        "the page, or use the live chat and we'll help.</p>";
    }
  }

  if (!ref) {
    notFound();
  } else {
    load(0);
  }
})();
