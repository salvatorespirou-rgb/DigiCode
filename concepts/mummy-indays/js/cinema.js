/* ==========================================================================
   cinema.js — the camera
   Mummy Inday's Catering, cinematic pitch build for DigiCode.

   One idea runs through this file: JavaScript measures, CSS draws. Nothing
   here writes a transform string. It writes normalised numbers onto custom
   properties (--scroll, --z, --p, --enter, --off) and the stylesheet
   decides what those mean. That keeps the motion tunable in CSS alone, and
   it means the reduced-motion block in the stylesheet can switch the whole
   film off without this file knowing anything about it.

   All reads happen together, all writes happen together, once per frame,
   so the browser is never forced into a mid-frame layout.
   ========================================================================== */

(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var root = document.documentElement;

  /* ----------------------------------------------------------------------
     Grain
     Generated rather than shipped, so there's no texture file to load and
     it never repeats visibly at the same scale as the layout.
     ---------------------------------------------------------------------- */

  function makeGrain() {
    var size = 180;
    var c = document.createElement("canvas");
    c.width = c.height = size;
    var ctx = c.getContext("2d");
    var img = ctx.createImageData(size, size);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = 120 + Math.random() * 135;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 22;
    }
    ctx.putImageData(img, 0, 0);
    root.style.setProperty("--grain", 'url("' + c.toDataURL() + '")');
  }

  /* ----------------------------------------------------------------------
     Helpers
     ---------------------------------------------------------------------- */

  function clamp(n, lo, hi) { return n < lo ? lo : n > hi ? hi : n; }

  // How far a section has travelled through the viewport: 0 as its top
  // meets the bottom of the screen, 1 as its bottom leaves the top.
  function throughView(rect, vh) {
    return clamp((vh - rect.top) / (vh + rect.height), 0, 1);
  }

  /* ----------------------------------------------------------------------
     Reveals
     Cheap and one-way — once a thing has arrived it stays arrived, so a
     reader scrolling back up isn't shown the same entrance twice.
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
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });

    Array.prototype.forEach.call(items, function (el, i) {
      // Stagger siblings so a grid arrives as a run rather than a slab.
      var group = el.getAttribute("data-reveal");
      if (group === "stagger") el.style.setProperty("--delay", (i % 6) * 90 + "ms");
      io.observe(el);
    });
  }

  /* ----------------------------------------------------------------------
     The scroll-driven scenes
     ---------------------------------------------------------------------- */

  var hero      = document.querySelector(".hero");
  var storyPanel= document.querySelector(".story-panel");
  var menuCards = document.querySelectorAll(".dish-card");
  var menuScene = document.querySelector(".menu");
  var nav       = document.querySelector(".nav");
  var rail      = document.querySelector(".rail");
  var parallax  = document.querySelectorAll("[data-parallax]");

  var queued = false;

  function frame() {
    queued = false;
    var vh = window.innerHeight;

    /* --- Hero: the camera pushes through the layers ------------------- */
    if (hero) {
      var h = hero.getBoundingClientRect();
      // 0 at rest, 1 once the hero has fully left.
      root.style.setProperty("--scroll", clamp(-h.top / (h.height || 1), 0, 1).toFixed(4));
    }

    /* --- Nav ---------------------------------------------------------- */
    if (nav) nav.classList.toggle("is-stuck", window.scrollY > 40);

    /* --- Story panel turns to face the reader ------------------------- */
    if (storyPanel) {
      var s = storyPanel.getBoundingClientRect();
      storyPanel.style.setProperty("--enter", throughView(s, vh).toFixed(4));
    }

    /* --- Menu cards fly in from depth --------------------------------- */
    if (menuScene && menuCards.length) {
      var m = menuScene.getBoundingClientRect();
      var p = throughView(m, vh);
      for (var i = 0; i < menuCards.length; i++) {
        // Each card lags the one before it, so the grid arrives in waves
        // instead of as a single flat plane.
        var lag = (i % 3) * 0.06;
        var local = clamp((p - lag) * 2.2, 0, 1);
        // -520px (far, small) → 0 (in plane).
        menuCards[i].style.setProperty("--z", Math.round(-520 * (1 - local)));
        menuCards[i].style.opacity = (0.15 + local * 0.85).toFixed(3);
      }
    }

    /* --- Interlude parallax -------------------------------------------- */
    for (var k = 0; k < parallax.length; k++) {
      // Measure the frame, not the image: the image deliberately overhangs
      // its own frame so the parallax never drags an empty edge into view.
      var host = parallax[k].parentNode.getBoundingClientRect();
      parallax[k].style.setProperty("--p", throughView(host, vh).toFixed(4));
    }

    /* --- Gallery coverflow -------------------------------------------- */
    if (rail) {
      var railRect = rail.getBoundingClientRect();
      var mid = railRect.left + railRect.width / 2;
      var cards = rail.children;
      for (var j = 0; j < cards.length; j++) {
        var cr = cards[j].getBoundingClientRect();
        var off = (cr.left + cr.width / 2 - mid) / (railRect.width / 2);
        cards[j].style.setProperty("--off", clamp(off, -1.6, 1.6).toFixed(3));
      }
    }
  }

  function onScroll() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(frame);
  }

  /* ----------------------------------------------------------------------
     Package tilt
     Pointer only. A touch device gets the resting state, which is the
     honest thing to do — there's no hover to leave.
     ---------------------------------------------------------------------- */

  function wireTilt() {
    if (reduced.matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    Array.prototype.forEach.call(document.querySelectorAll(".pkg"), function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty("--mx", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
        card.style.setProperty("--my", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
      });
      card.addEventListener("pointerleave", function () {
        card.style.setProperty("--mx", 0);
        card.style.setProperty("--my", 0);
      });
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

    // Tapping a link on mobile should close the sheet behind it.
    nav.addEventListener("click", function (e) {
      if (!e.target.closest(".nav-links a")) return;
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    });
  }

  /* ----------------------------------------------------------------------
     Photo slots
     Each .photo names the file it wants. If that file isn't in assets/img
     yet, the CSS stand-in underneath is what shows — so an un-imported
     build still looks composed rather than broken.
     ---------------------------------------------------------------------- */

  function wirePhotos() {
    var slots = document.querySelectorAll('.photo[data-img], [data-bg]');

    // Absolute, deliberately. A relative URL handed to a custom property is
    // resolved against the STYLESHEET's base URL when the CSS consumes it —
    // not the document's — so "assets/img/x.jpg" would be looked for under
    // css/assets/img/. Resolving here against location.href kills that whole
    // class of bug regardless of where the stylesheet lives.
    function urlFor(el) {
      var name = el.getAttribute('data-img');
      var path = name ? 'assets/img/' + name : el.getAttribute('data-bg');
      return new URL(path, location.href).href;
    }

    function load(el) {
      var src = urlFor(el);
      var probe = new Image();
      probe.onload = function () {
        if (el.hasAttribute('data-bg')) {
          el.style.backgroundImage = 'url("' + src + '")';
        } else {
          el.style.setProperty('--src', 'url("' + src + '")');
        }
        el.classList.add('has-photo');
      };
      probe.src = src;
    }

    // Twenty-odd photographs is a lot to fetch for a page you have only seen
    // the top of. Each one waits until it is within a screen and a half of
    // the viewport, which in practice means the hero and the first section
    // load, and the rest arrive as they are scrolled toward.
    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(slots, load);
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        // A group target stands in for everything inside it.
        var group = entry.target.querySelectorAll ? entry.target.querySelectorAll('.photo[data-img]') : [];
        if (entry.target.hasAttribute('data-photo-group') && group.length) {
          Array.prototype.forEach.call(group, load);
        } else {
          load(entry.target);
        }
        io.unobserve(entry.target);
      });
    }, { rootMargin: '150% 0px' });

    // The gallery is a horizontal scroller, and an ancestor's clipping still
    // applies to IntersectionObserver no matter how far rootMargin is pushed
    // out — so a card parked off to the right never intersects and never
    // loads. Watch the rail itself and load its cards as one group when the
    // section arrives; dragging is then instant instead of blank.
    var rail = document.querySelector('.rail');
    if (rail) {
      rail.setAttribute('data-photo-group', '');
      io.observe(rail);
    }

    Array.prototype.forEach.call(slots, function (el) {
      if (rail && rail.contains(el)) return;
      io.observe(el);
    });
  }

  /* ----------------------------------------------------------------------
     Deferred hero frames
     The first slide is preloaded and painted immediately — it is the largest
     thing on screen and decides the perceived load time. Frames two to four
     are not needed for another eight seconds, so they wait until the page has
     finished loading rather than competing with it.
     ---------------------------------------------------------------------- */

  function loadDeferred() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-defer]"), function (el) {
      var src = new URL(el.getAttribute("data-defer"), location.href).href;
      var probe = new Image();
      probe.onload = function () { el.style.backgroundImage = 'url("' + src + '")'; };
      probe.src = src;
    });
  }

  /* ----------------------------------------------------------------------
     Year
     ---------------------------------------------------------------------- */

  function wireYear() {
    var y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
  }

  /* ----------------------------------------------------------------------
     Boot
     ---------------------------------------------------------------------- */

  function boot() {
    makeGrain();
    wireReveals();
    wireTilt();
    wireNav();
    wirePhotos();
    wireYear();

    if (document.readyState === "complete") loadDeferred();
    else window.addEventListener("load", loadDeferred, { once: true });

    if (!reduced.matches) {
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      if (rail) rail.addEventListener("scroll", onScroll, { passive: true });
      frame();
    }

    // Someone can turn reduced motion on mid-visit; respect it immediately
    // rather than at the next reload.
    reduced.addEventListener("change", function () {
      if (reduced.matches) {
        window.removeEventListener("scroll", onScroll);
        root.style.setProperty("--scroll", 0);
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
