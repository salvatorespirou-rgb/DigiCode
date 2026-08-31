/* DigiCode — first-party page-view beacon.
 *
 * Feeds the live numbers on the portal dashboard. Deliberately tiny and
 * deliberately not Google Analytics: no cookies, no IP address, no user agent,
 * no cross-site anything. The "visitor id" is a random uuid this site invents
 * and keeps in this browser's own localStorage — it identifies a browser to
 * this site and to nothing else, and clearing site data ends it.
 *
 * Backed by public.record_page_view() in supabase/022_site_analytics.sql, which
 * is the only thing a visitor is allowed to call. Nobody can read the numbers
 * back without a developer login.
 */
(function () {
  "use strict";

  var SB_URL = "https://phlmnlildwkkichlbtoy.supabase.co";
  var SB_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBobG1ubGlsZHdra2ljaGxidG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1NzQ1ODksImV4cCI6MjEwMzE1MDU4OX0.5butaPl8qJGNT4eenhE7pFRAVw83i0g4xbeITIzUjW4";

  var VISITOR_KEY = "digicodeVisitorId";
  var SESSION_KEY = "digicodeSessionId";
  var SESSION_TS = "digicodeSessionAt";
  var SESSION_IDLE_MS = 30 * 60 * 1000; // a new session after 30 min idle

  // Respect an explicit opt-out, both the browser's and our own.
  if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return;
  try {
    if (localStorage.getItem("digicodeNoStats") === "1") return;
  } catch (e) {
    /* storage blocked — fall through, we just won't be able to dedupe */
  }

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // Everything below needs localStorage. Without it we cannot tell a returning
  // visitor from a new one, so we skip rather than record something misleading.
  var visitorId, sessionId;
  try {
    visitorId = localStorage.getItem(VISITOR_KEY);
    if (!visitorId) {
      visitorId = uuid();
      localStorage.setItem(VISITOR_KEY, visitorId);
    }

    var lastAt = parseInt(localStorage.getItem(SESSION_TS) || "0", 10);
    sessionId = localStorage.getItem(SESSION_KEY);
    if (!sessionId || !lastAt || Date.now() - lastAt > SESSION_IDLE_MS) {
      sessionId = uuid();
      localStorage.setItem(SESSION_KEY, sessionId);
    }
    localStorage.setItem(SESSION_TS, String(Date.now()));
  } catch (e) {
    return;
  }

  // Only count a referrer that came from somewhere else.
  var referrer = "";
  try {
    if (document.referrer && new URL(document.referrer).host !== location.host) {
      referrer = document.referrer;
    }
  } catch (e) {
    referrer = "";
  }

  function loadMs() {
    try {
      var nav = performance.getEntriesByType("navigation")[0];
      if (nav && nav.loadEventEnd > 0) return Math.round(nav.loadEventEnd);
      var t = performance.timing;
      if (t && t.loadEventEnd > 0 && t.navigationStart > 0) {
        return t.loadEventEnd - t.navigationStart;
      }
    } catch (e) {
      /* not available */
    }
    return null;
  }

  function send() {
    var body = JSON.stringify({
      p_visitor: visitorId,
      p_session: sessionId,
      p_path: location.pathname,
      p_referrer: referrer || null,
      p_load_ms: loadMs(),
    });

    fetch(SB_URL + "/rest/v1/rpc/record_page_view", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SB_KEY,
        Authorization: "Bearer " + SB_KEY,
      },
      body: body,
      keepalive: true,
    }).catch(function () {
      /* Analytics must never be able to break the page. */
    });
  }

  // Wait for load so the page-load timing is real, but don't lose the view if
  // someone leaves first.
  if (document.readyState === "complete") {
    send();
  } else {
    var sent = false;
    var once = function () {
      if (sent) return;
      sent = true;
      send();
    };
    window.addEventListener("load", function () {
      setTimeout(once, 0);
    });
    window.addEventListener("pagehide", once);
  }
})();
