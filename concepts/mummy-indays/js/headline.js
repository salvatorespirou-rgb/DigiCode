/* Repeatable gold greeting; the complete heading remains accessible. */
(function () {
  'use strict';
  var heading = document.querySelector('.hero h1');
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  if (!heading || !Element.prototype.animate || !window.IntersectionObserver) return;
  heading.setAttribute('aria-label', heading.textContent.replace(/\s+/g, ' ').trim());
  var chars = [], animations = [], timer, generation = 0;
  var visible = false, ready = false, paused = false, playing = false, hasPlayed = false;
  var layer = document.createElement('div');
  layer.className = 'headline-sparkles';
  layer.setAttribute('aria-hidden', 'true');
  heading.appendChild(layer);
  heading.querySelectorAll('.line').forEach(function (line) {
    line.setAttribute('aria-hidden', 'true');
    var text = line.querySelector('em') || line.firstElementChild;
    var original = text.textContent;
    text.textContent = '';
    Array.from(original).forEach(function (letter) {
      var span = document.createElement('span');
      span.className = 'typed-letter';
      span.textContent = letter;
      text.appendChild(span);
      chars.push(span);
    });
  });
  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'headline-toggle';
  toggle.textContent = 'Pause animation';
  heading.parentNode.appendChild(toggle);
  function allowed() { return ready && visible && !document.hidden && !reduced.matches && !paused; }
  function stop() {
    generation++;
    clearTimeout(timer);
    animations.forEach(function (animation) { animation.cancel(); });
    animations = [];
    layer.replaceChildren();
    playing = false;
  }
  function play(skipFade) {
    if (!allowed() || playing) return;
    playing = true;
    var run = ++generation;
    // Fade the previous greeting away before its next reveal, instead of cutting.
    if (hasPlayed && !skipFade) {
      var fade = heading.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 380, fill: 'forwards', easing: 'ease-in-out'
      });
      animations.push(fade);
      fade.finished.then(function () {
        if (run !== generation) return;
        fade.cancel();
        animations = [];
        playing = false;
        play(true);
      }).catch(function () {});
      return;
    }
    hasPlayed = true;
    var bounds = heading.getBoundingClientRect();
    var positions = chars.map(function (char) { return char.getBoundingClientRect(); });
    var colours = chars.map(function (char) { return getComputedStyle(char).color; });
    var count = matchMedia('(max-width: 700px)').matches ? 3 : 5;
    chars.forEach(function (char, i) {
      var delay = 350 + i * 145;
      animations.push(char.animate([
        { opacity: 0, color: '#b47a16', textShadow: '0 0 0 transparent' },
        { opacity: 1, color: '#a96c0b', textShadow: '0 0 10px #ffe5a1', offset: .38 },
        { opacity: 1, color: colours[i], textShadow: '0 0 0 transparent' }
      ], { duration: 850, delay: delay, fill: 'backwards', easing: 'ease-in-out' }));
      if (!char.textContent.trim()) return;
      for (var p = 0; p < count; p++) {
        var rect = positions[i];
        var particle = document.createElement('span');
        particle.className = 'gold-sparkle';
        particle.style.left = (rect.left - bounds.left + rect.width * (.15 + p / count * .7)) + 'px';
        particle.style.top = (rect.bottom - bounds.top - rect.height * .25) + 'px';
        var size = 4 + ((i + p * 3) % 7);
        particle.style.width = particle.style.height = size + 'px';
        var drift = (i % 5 - 2) * 14 + (p - (count - 1) / 2) * 18;
        var fall = 125 + p * 18;
        layer.appendChild(particle);
        animations.push(particle.animate([
          { transform: 'translate3d(0,0,0) rotate(0deg) scale(.2)', opacity: 0 },
          { transform: 'translate3d(' + drift * .18 + 'px,12px,0) rotate(25deg) scale(1)', opacity: .95, offset: .18 },
          { transform: 'translate3d(' + drift * .68 + 'px,' + fall * .48 + 'px,0) rotate(90deg) scale(.8)', opacity: .7, offset: .58 },
          { transform: 'translate3d(' + drift + 'px,' + fall + 'px,0) rotate(155deg) scale(.15)', opacity: 0 }
        ], { duration: 2200 + p * 100, delay: delay + 100 + p * 65, fill: 'both', easing: 'cubic-bezier(.25,.1,.45,1)' }));
      }
    });
    Promise.all(animations.map(function (animation) { return animation.finished.catch(function () {}); })).then(function () {
      if (run !== generation) return;
      animations.forEach(function (animation) { animation.cancel(); });
      animations = [];
      layer.replaceChildren();
      playing = false;
      if (allowed()) timer = setTimeout(play, 5000);
    });
  }
  function sync() {
    toggle.hidden = reduced.matches;
    stop();
    if (allowed()) play();
  }
  toggle.addEventListener('click', function () {
    paused = !paused;
    toggle.textContent = paused ? 'Play animation' : 'Pause animation';
    sync();
  });
  new IntersectionObserver(function (entries) {
    var next = entries[0].isIntersecting;
    if (next !== visible) { visible = next; sync(); }
  }, { threshold: 0 }).observe(heading);
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  window.addEventListener('resize', function () {
    stop();
    if (allowed()) timer = setTimeout(play, 250);
  }, { passive: true });
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(function () { ready = true; sync(); });
})();
