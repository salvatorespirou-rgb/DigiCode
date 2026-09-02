/* DigiCode — sign out of the portal after 15 minutes of inactivity.
 *
 * Works off a timestamp in localStorage rather than a running countdown,
 * because a countdown is exactly the thing you cannot trust here: browsers
 * throttle timers in background tabs and stop them entirely while a laptop is
 * asleep. Comparing "when did they last do something" against the clock is
 * correct whether the tab was hidden for ten seconds or the machine was shut
 * for three hours.
 *
 * localStorage also means the timer is shared across tabs — working in one
 * portal tab keeps the others alive, which is what anyone would expect.
 */
(function () {
  "use strict";

  // Only guard a real portal session.
  if (!document.getElementById("devViewContainer")) return;
  if (typeof digicodeSupabase === "undefined") return;

  var IDLE_MS = 15 * 60 * 1000;   // sign out after this much inactivity
  var WARN_MS = 60 * 1000;        // warn this long before it happens
  var CHECK_MS = 5 * 1000;        // how often we compare against the clock
  var KEY = "digicodePortalLastActive";

  var warnEl = null;
  var countdownEl = null;
  var signingOut = false;

  function now() { return Date.now(); }

  function touch() {
    try {
      localStorage.setItem(KEY, String(now()));
    } catch (e) {
      /* private mode — fall through, the in-tab timer still works */
    }
    hideWarning();
  }

  function lastActive() {
    try {
      var v = parseInt(localStorage.getItem(KEY) || "0", 10);
      return v > 0 ? v : now();
    } catch (e) {
      return now();
    }
  }

  async function signOut() {
    if (signingOut) return;
    signingOut = true;
    try {
      localStorage.removeItem(KEY);
      sessionStorage.setItem("digicodePortalTimedOut", "1");
    } catch (e) {
      /* nothing useful to do */
    }
    try {
      await digicodeSupabase.auth.signOut();
    } catch (e) {
      /* sign out locally regardless */
    }
    window.location.href = "signin.html";
  }

  function buildWarning() {
    if (warnEl) return;
    warnEl = document.createElement("div");
    warnEl.className = "idle-warning";
    warnEl.setAttribute("role", "alertdialog");
    warnEl.setAttribute("aria-live", "assertive");
    warnEl.innerHTML =
      '<div class="idle-warning-inner">' +
        '<strong>Still there?</strong>' +
        '<p>You\'ll be signed out in <span class="idle-count">60</span> seconds ' +
        'because the portal has been idle.</p>' +
        '<div class="idle-warning-actions">' +
          '<button type="button" class="btn btn-primary btn-small-inline idle-stay">Stay signed in</button>' +
          '<button type="button" class="clear-cart-link idle-now">Sign out now</button>' +
        '</div>' +
      "</div>";
    document.body.appendChild(warnEl);
    countdownEl = warnEl.querySelector(".idle-count");

    // Clicking inside the warning shouldn't itself count as activity — only
    // the button does, otherwise dismissing is too easy to do by accident.
    warnEl.addEventListener("click", function (e) { e.stopPropagation(); });
    warnEl.querySelector(".idle-stay").addEventListener("click", touch);
    warnEl.querySelector(".idle-now").addEventListener("click", signOut);
  }

  function showWarning(secondsLeft) {
    buildWarning();
    warnEl.classList.add("is-shown");
    if (countdownEl) countdownEl.textContent = String(secondsLeft);
  }

  function hideWarning() {
    if (warnEl) warnEl.classList.remove("is-shown");
  }

  function check() {
    if (signingOut) return;
    var idle = now() - lastActive();

    if (idle >= IDLE_MS) {
      signOut();
    } else if (idle >= IDLE_MS - WARN_MS) {
      showWarning(Math.max(0, Math.ceil((IDLE_MS - idle) / 1000)));
    } else {
      hideWarning();
    }
  }

  // Activity. mousemove fires constantly, so it's throttled — the rest are
  // deliberate actions and can write every time.
  var lastMove = 0;
  document.addEventListener("mousemove", function () {
    var t = now();
    if (t - lastMove > 5000) { lastMove = t; touch(); }
  }, { passive: true });

  ["mousedown", "keydown", "touchstart", "scroll", "focus"].forEach(function (ev) {
    document.addEventListener(ev, touch, { passive: true, capture: true });
  });

  // Coming back to the tab — or waking the machine — has to re-check straight
  // away rather than waiting for the next interval.
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) check();
  });
  window.addEventListener("focus", check);
  window.addEventListener("pageshow", check);

  // Another tab said the session is still alive.
  window.addEventListener("storage", function (e) {
    if (e.key === KEY) hideWarning();
  });

  touch();
  setInterval(check, CHECK_MS);
  check();
})();
