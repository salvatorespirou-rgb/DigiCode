/* ==========================================================================
   motion.js — Tyre Express concept build, DigiCode

   Same rule as the rest of our work: JavaScript measures, CSS draws. Nothing
   here writes a transform string. It writes numbers onto custom properties
   and the stylesheet decides what they mean, which keeps the motion tunable
   in CSS and lets the reduced-motion block switch it all off without this
   file knowing.

   The wheel's intro spin and its scroll rotation are both driven from here,
   deliberately. They were briefly a CSS keyframe plus a scroll transform,
   which cannot work — an animation with fill-mode "both" holds its final
   transform forever, so the wheel would have spun up once and then sat dead.
   ========================================================================== */

(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var root = document.documentElement;
  var wheel = document.getElementById("wheel");
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
     The wheel
     Intro: eases from a quarter turn back to zero while fading up.
     After that the scroll owns the rotation — a wheel that turns as the page
     moves is the one bit of motion a tyre shop has actually earned.
     ---------------------------------------------------------------------- */

  var introSpin = -200;      // degrees still to unwind
  var scrollSpin = 0;
  var introDone = false;

  function paintWheel() {
    if (!wheel) return;
    wheel.style.setProperty("--spin", (introSpin + scrollSpin).toFixed(2));
  }

  function runIntro() {
    if (!wheel) return;
    if (reduced.matches) {
      introSpin = 0;
      wheel.style.setProperty("--wheel-scale", 1);
      wheel.style.setProperty("--wheel-op", 1);
      introDone = true;
      paintWheel();
      return;
    }

    var start = null;
    var DURATION = 1500;

    function step(ts) {
      if (start === null) start = ts;
      var t = clamp((ts - start) / DURATION, 0, 1);
      // easeOutQuint — fast off the mark, long settle, like a wheel slowing.
      var e = 1 - Math.pow(1 - t, 5);

      introSpin = -200 * (1 - e);
      wheel.style.setProperty("--wheel-scale", (0.84 + 0.16 * e).toFixed(3));
      wheel.style.setProperty("--wheel-op", e.toFixed(3));
      paintWheel();

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        introSpin = 0;
        introDone = true;
        paintWheel();
      }
    }
    requestAnimationFrame(step);
  }

  var queued = false;

  function frame() {
    queued = false;
    var y = window.scrollY || window.pageYOffset || 0;

    root.style.setProperty("--scroll", clamp(y / (window.innerHeight || 1), 0, 1).toFixed(4));

    if (wheel) {
      // A third of a turn per screen travelled. Enough to read as rolling,
      // slow enough that it never strobes.
      scrollSpin = y * 0.12;
      if (introDone) paintWheel();
    }
  }

  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(frame);
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
    runIntro();

    if (!reduced.matches) {
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      frame();
    }

    // Someone can turn reduced motion on mid-visit; respect it immediately.
    reduced.addEventListener("change", function () {
      if (reduced.matches) {
        window.removeEventListener("scroll", onScroll);
        scrollSpin = 0;
        introSpin = 0;
        paintWheel();
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
