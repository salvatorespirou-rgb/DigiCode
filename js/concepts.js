/* ==========================================================================
   concepts.js — the public concept-build listing
   DigiCode

   Reads public.concept_builds through the anon key. RLS does the filtering,
   not this file: the "Anyone can view listed concept builds" policy in
   supabase/040 only returns rows with status = 'listed', so a build that is
   hidden in the portal cannot appear here even if this code asked for it.
   The .eq() below is belt-and-braces, and keeps the intent obvious to anyone
   reading it.
   ========================================================================== */

(function () {
  "use strict";

  var list    = document.getElementById("conceptList");
  var loading = document.getElementById("conceptLoading");
  var empty   = document.getElementById("conceptEmpty");
  var errored = document.getElementById("conceptError");

  if (!list) return;

  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function card(c) {
    var href = c.url || "concepts/" + c.slug + "/index.html";
    return (
      '<article class="script-card">' +
        '<div class="script-card-body">' +
          '<h3 class="script-name">' + esc(c.name) + "</h3>" +
          (c.client ? '<p class="script-row-meta">' + esc(c.client) + "</p>" : "") +
          (c.summary ? '<p class="script-desc">' + esc(c.summary) + "</p>" : "") +
        "</div>" +
        '<div class="script-card-foot">' +
          '<a class="btn btn-primary btn-small-inline" href="' + esc(href) +
            '" target="_blank" rel="noopener">View the build</a>' +
        "</div>" +
      "</article>"
    );
  }

  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }

  (async function () {
    try {
      var res = await digicodeSupabase
        .from("concept_builds")
        .select("name, client, slug, url, summary")
        .eq("status", "listed")
        .order("created_at", { ascending: false });

      hide(loading);

      if (res.error) {
        show(errored);
        return;
      }

      var rows = res.data || [];
      if (!rows.length) {
        show(empty);
        return;
      }

      list.innerHTML = rows.map(card).join("");
    } catch (e) {
      hide(loading);
      show(errored);
    }
  })();
})();
