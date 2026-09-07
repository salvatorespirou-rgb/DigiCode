/* ==========================================================================
   motion.js — Tyre Express concept build, DigiCode

   Same rule as the rest of our work: JavaScript measures, CSS draws. Nothing
   here writes a transform string. It writes numbers onto custom properties
   and the stylesheet decides what they mean, which keeps the motion tunable
   in CSS and lets the reduced-motion block switch it all off without this
   file knowing.

   This drove a CSS-drawn wheel that spun up on load and turned with the
   scroll. The wheel has been taken out of the hero, so that code is gone with
   it rather than left here doing nothing.
   ========================================================================== */

(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var root = document.documentElement;
  var nav = document.getElementById("nav");

  function clamp(n, lo, hi) { return n < lo ? lo : n > hi ? hi : n; }

  /* ----------------------------------------------------------------------
     Reveals — one-way, so scrolling back up doesn't replay everything.
     ---------------------------------------------------------------------- */

  function wireReveals() {
    var items = document.querySelectorAll("[data-reveal]");

    if (!("IntersectionObserver" in window) || reduced.matches) {
      Array.prototype.forEach.call(items, function (el) { el.classList.add("is-in"); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.1 });

    Array.prototype.forEach.call(items, function (el, i) {
      if (el.getAttribute("data-reveal") === "stagger") {
        el.style.setProperty("--delay", (i % 5) * 70 + "ms");
      }
      io.observe(el);
    });
  }

  /* ----------------------------------------------------------------------
     Scroll position, published as a 0–1 number for the stylesheet to use.
     ---------------------------------------------------------------------- */

  var queued = false;

  function frame() {
    queued = false;
    var y = window.scrollY || window.pageYOffset || 0;
    root.style.setProperty("--scroll", clamp(y / (window.innerHeight || 1), 0, 1).toFixed(4));
  }

  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(frame);
  }

  /* ----------------------------------------------------------------------
     Rolling headline
     Same state model as the framer-motion original it is adapted from: the
     live word rests at zero, everything before it is held above, everything
     after it below. Two seconds a word, matching the reference.

     The words are aria-hidden and the full sentence sits beside them in an
     .sr-only span, so a screen reader is read one sentence rather than a
     word looping forever.
     ---------------------------------------------------------------------- */

  function wireRollingHeadline() {
    var words = [].slice.call(document.querySelectorAll(".cyc"));
    if (words.length < 2) return;

    var active = 0;

    function paint() {
      words.forEach(function (w, i) {
        w.classList.toggle("is-on", i === active);
        // Already shown sits above; still to come stays below, which is the
        // default resting position.
        w.classList.toggle("is-past", i < active);
      });
    }

    if (reduced.matches) { paint(); return; }

    // The first word ships with is-on in the markup so that a visitor with no
    // JavaScript still reads a whole sentence. Take it off and hand it back a
    // frame later, so the word rolls up into the slot the way the two static
    // lines rise in rather than simply being there. The 100ms matches the
    // animation-delay on line two.
    words.forEach(function (w) { w.classList.remove("is-on", "is-past"); });

    // Plain setTimeout, deliberately not a requestAnimationFrame. rAF does not
    // run at all in a background tab, so opening this page in a new tab and
    // switching to it later left the headline with an empty line where the
    // first word should be. A timeout still fires, the class still lands, and
    // the transition simply plays or does not depending on visibility.
    setTimeout(paint, 100);

    var timer = setInterval(function () {
      active = (active + 1) % words.length;
      paint();
    }, 2000);

    // A rolling word in a background tab is wasted work and drifts out of
    // step with its own transitions.
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        clearInterval(timer);
        timer = null;
      } else if (!timer) {
        timer = setInterval(function () {
          active = (active + 1) % words.length;
          paint();
        }, 2000);
      }
    });
  }

  /* ----------------------------------------------------------------------
     Navigation
     ---------------------------------------------------------------------- */

  function wireNav() {
    var toggle = document.querySelector(".nav-toggle");
    if (!toggle || !nav) return;

    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    // Tapping a link should close the sheet behind it.
    nav.addEventListener("click", function (e) {
      if (!e.target.closest(".nav-links a")) return;
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    });
  }

  function wireYear() {
    var y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
  }

  /* ----------------------------------------------------------------------
     Boot
     ---------------------------------------------------------------------- */

  function boot() {
    wireReveals();
    wireNav();
    wireYear();
    wireRollingHeadline();

    if (!reduced.matches) {
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      frame();
    }

    // Someone can turn reduced motion on mid-visit; respect it immediately.
    reduced.addEventListener("change", function () {
      if (reduced.matches) {
        window.removeEventListener("scroll", onScroll);
      } else {
        window.addEventListener("scroll", onScroll, { passive: true });
        frame();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
