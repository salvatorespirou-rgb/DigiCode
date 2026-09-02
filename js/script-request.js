/* DigiCode — script request form on the gaming page.
 *
 * Lands in Pending Projects as a quote (order_kind = 'quote', see
 * supabase/025) so a script enquiry sits in the same queue as everything else
 * and gets flagged "needs pricing". The email is the belt-and-braces copy —
 * mailto does nothing on a machine with no mail client, so the database row is
 * what actually guarantees the lead isn't lost.
 */
(function () {
  "use strict";

  var modal = document.getElementById("scriptModal");
  if (!modal) return;

  var form = document.getElementById("scriptForm");
  var closeBtn = document.getElementById("scriptModalClose");
  var submitBtn = document.getElementById("scriptSubmit");
  var note = document.getElementById("scriptFormNote");
  var lastFocused = null;

  function open() {
    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("script-modal-open");
    var first = modal.querySelector("input, textarea, button");
    if (first) first.focus();
  }

  function close() {
    modal.hidden = true;
    document.body.classList.remove("script-modal-open");
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  document.querySelectorAll("[data-open-script-form]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      open();
    });
  });

  closeBtn.addEventListener("click", close);

  // Clicking the backdrop closes; clicking the card must not.
  modal.addEventListener("click", function (e) {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !modal.hidden) close();
  });

  function collect() {
    var lines = [];
    form.querySelectorAll("input, textarea").forEach(function (el) {
      var label = el.dataset.label;
      if (!label) return;
      if (el.type === "radio" || el.type === "checkbox") {
        if (el.checked) lines.push(label);
      } else {
        var v = el.value.trim();
        if (v) lines.push(label + ": " + v);
      }
    });
    if (typeof window.digicodeUploads === "function") {
      lines = lines.concat(window.digicodeUploads());
    }
    return lines;
  }

  function field(lines, label) {
    var hit = lines.find(function (l) { return l.indexOf(label + ": ") === 0; });
    return hit ? hit.slice(label.length + 2) : "";
  }

  submitBtn.addEventListener("click", async function () {
    var lines = collect();

    if (!lines.length) {
      note.textContent = "Add a couple of details first — even one line about what you need is enough.";
      note.style.color = "#ff9d6b";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    var name = field(lines, "Name");
    var email = field(lines, "Email");
    var landed = false;

    try {
      var res = await digicodeSupabase.rpc("request_quote", {
        p_service: "Game Script — quote",
        p_name: name,
        p_email: email || field(lines, "Discord"),
        p_details: lines.join("\n"),
      });
      landed = !res.error;
    } catch (e) {
      landed = false;
    }

    submitBtn.disabled = false;
    submitBtn.textContent = "Send Script Request";

    if (landed) {
      // Confirm on the page rather than relying on a mailto opening — that is
      // the bit that silently does nothing on a machine with no mail client.
      form.innerHTML =
        '<div class="form-card" style="text-align:center;">' +
          "<h2>Got it.</h2>" +
          '<p class="form-hint" style="margin-top:8px;">' +
          "We'll read through it properly and come back with what it takes and a " +
          "fixed price — usually within a day. If you left a Discord, that's " +
          "probably where we'll reach you." +
          "</p>" +
        "</div>";
      return;
    }

    // Couldn't reach the database — fall back to email so the lead survives.
    note.textContent = "Couldn't send that automatically — opening your email instead.";
    note.style.color = "#ff9d6b";
    var subject = encodeURIComponent("Script request");
    var body = encodeURIComponent(["Script request:", ""].concat(lines).join("\n"));
    window.location.href =
      "mailto:developerteam@digi-code.com.au?subject=" + subject + "&body=" + body;
  });
})();
