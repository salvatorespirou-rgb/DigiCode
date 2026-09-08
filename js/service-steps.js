(() => {
  'use strict';
  const form = document.querySelector('.request-form');
  if (!form) return;
  const steps = [...form.children].filter(el => el.classList.contains('form-card'));
  if (steps.length < 2) return;
  const build = steps.find(step => step.querySelector('input[name="buildTier"]'));
  const quote = form.querySelector('#wantQuote');
  if (build) {
    steps.splice(steps.indexOf(build), 1);
    steps.unshift(build);
    form.prepend(build);
  }
  const hasChoice = () => !build || !!build.querySelector('input[name="buildTier"]:checked') || !!quote?.checked;
  const actions = form.querySelector('.form-actions');
  const titles = steps.map(el => el.querySelector('h2').textContent.trim());
  const header = document.createElement('div');
  header.className = 'visually-hidden sf-status';
  header.setAttribute('aria-live', 'polite');
  header.setAttribute('aria-atomic', 'true');
  const nav = document.createElement('div');
  nav.className = 'sf-nav';
  nav.setAttribute('aria-label', 'Form steps');
  nav.innerHTML = '<button type="button" class="sf-back">← Back</button><span class="sf-note">Skip anything you’re unsure about.</span><button type="button" class="sf-next">Next <span aria-hidden="true">→</span></button>';
  form.prepend(header);
  form.append(nav);
  form.classList.add('sf-wizard');
  const back = nav.querySelector('.sf-back');
  const next = nav.querySelector('.sf-next');
  let current = 0;
  steps.forEach((step, i) => {
    step.classList.add('sf-step');
    step.id = `service-step-${i + 1}`;
    const heading = step.querySelector('h2');
    heading.id = `service-step-heading-${i + 1}`;
    heading.tabIndex = -1;
    step.setAttribute('role', 'group');
    step.setAttribute('aria-labelledby', heading.id);
  });
  function show(index, focus = true) {
    if (index > 0 && !hasChoice()) index = 0;
    current = Math.max(0, Math.min(index, steps.length - 1));
    steps.forEach((step, i) => { step.hidden = i !== current; });
    if (actions) actions.hidden = current !== steps.length - 1;
    back.disabled = current === 0;
    next.hidden = current === steps.length - 1 || (current === 0 && !hasChoice());
    nav.querySelector('.sf-note').textContent = build && current === 0
      ? 'Choose a package to start your project.' : 'Skip anything you’re unsure about.';
    header.textContent = `Step ${current + 1} of ${steps.length} · ${titles[current]}`;
    next.setAttribute('aria-label', `Next: ${titles[current + 1] || 'Finish'}`);
    if (focus) {
      steps[current].querySelector('h2').focus({ preventScroll: true });
      steps[current].scrollIntoView({ block: 'start', behavior: 'auto' });
    }
  }
  function invalidIn(step) {
    return [...step.querySelectorAll('input, textarea, select')].find(el => {
      let parent = el.parentElement;
      while (parent && parent !== step) {
        if (parent.hidden) return false;
        parent = parent.parentElement;
      }
      return el.willValidate && !el.validity.valid;
    });
  }
  function advance() {
    const invalid = invalidIn(steps[current]);
    if (invalid) { invalid.reportValidity(); return; }
    show(current + 1);
  }
  back.addEventListener('click', () => show(current - 1));
  next.addEventListener('click', advance);
  form.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.matches('input:not([type="file"]):not([type="checkbox"]):not([type="radio"])')) {
      event.preventDefault();
      if (current < steps.length - 1) advance();
    }
  });
  // Existing checkout and upload handlers continue to read the same inputs.
  // Reveal an invalid earlier answer before the existing checkout can proceed.
  form.querySelector('#checkoutBtn')?.addEventListener('click', event => {
    for (let i = 0; i < steps.length; i++) {
      const invalid = invalidIn(steps[i]);
      if (!invalid) continue;
      event.preventDefault();
      event.stopImmediatePropagation();
      show(i);
      invalid.reportValidity();
      break;
    }
  }, true);
  if (build) {
    build.querySelectorAll('.tier-card').forEach(card => {
      const button = card.querySelector('.tier-purchase-btn');
      const radio = card.querySelector('.tier-radio');
      if (!button || !radio) return;
      const name = card.querySelector('.tier-name').textContent.trim();
      button.textContent = `Choose ${name}`;
      // The existing purchase handler adds/replaces this service's build in
      // the cart. Advance only after that handler has run; no payment occurs.
      card.addEventListener('click', event => {
        if (event.target !== radio && !event.target.closest('.tier-purchase-btn')) {
          button.click();
        }
      });
      button.addEventListener('click', () => {
        if (quote?.checked) {
          quote.checked = false;
          quote.dispatchEvent(new Event('change', { bubbles: true }));
        }
        radio.checked = true;
        show(1);
      });
      radio.addEventListener('change', () => { if (radio.checked) button.click(); });
    });
    if (quote) {
      const custom = document.createElement('button');
      custom.type = 'button';
      custom.className = 'sf-custom-quote';
      custom.textContent = 'Need something different? Start with a custom quote →';
      custom.addEventListener('click', () => {
        quote.checked = true;
        quote.dispatchEvent(new Event('change', { bubbles: true }));
        show(1);
      });
      build.append(custom);
    }
  }
  show(0, false);
})();
