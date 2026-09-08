(() => {
  'use strict';
  const form = document.querySelector('.request-form');
  if (!form) return;
  const steps = [...form.children].filter(el => el.classList.contains('form-card'));
  if (steps.length < 2) return;
  const actions = form.querySelector('.form-actions');
  const titles = steps.map(el => el.querySelector('h2').textContent.trim());
  const header = document.createElement('div');
  header.className = 'sf-header';
  header.innerHTML = '<div class="sf-intro"><span class="sf-eyebrow">LET’S BUILD SOMETHING GREAT</span><p>Your project. One step at a time.</p></div><div class="sf-status" aria-live="polite" aria-atomic="true"></div><label class="sf-jump-label" for="serviceStep">Jump to a section</label><select id="serviceStep" class="sf-jump"></select><div class="sf-track" aria-hidden="true"><span></span></div>';
  const select = header.querySelector('select');
  titles.forEach((title, i) => select.add(new Option(`${String(i + 1).padStart(2, '0')} / ${title}`, String(i))));
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
    current = Math.max(0, Math.min(index, steps.length - 1));
    steps.forEach((step, i) => { step.hidden = i !== current; });
    if (actions) actions.hidden = current !== steps.length - 1;
    back.disabled = current === 0;
    next.hidden = current === steps.length - 1;
    select.value = String(current);
    header.querySelector('.sf-status').textContent = `Step ${current + 1} of ${steps.length} · ${titles[current]}`;
    header.querySelector('.sf-track span').style.width = `${(current + 1) / steps.length * 100}%`;
    next.setAttribute('aria-label', `Next: ${titles[current + 1] || 'Finish'}`);
    if (focus) {
      steps[current].querySelector('h2').focus({ preventScroll: true });
      header.scrollIntoView({ block: 'start', behavior: 'auto' });
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
  select.addEventListener('change', () => show(Number(select.value)));
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
  show(0, false);
})();
