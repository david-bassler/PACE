const PAGE_NAMES = new Set(['today', 'tools', 'progress', 'more']);

function pageElement(name) {
  return document.querySelector(`[data-page="${name}"]`);
}

function navButton(name) {
  return document.querySelector(`[data-page-target="${name}"]`);
}

export function navigateTo(name, { focus = '', scroll = true } = {}) {
  const page = PAGE_NAMES.has(name) ? name : 'today';

  document.querySelectorAll('[data-page]').forEach(section => {
    const active = section.dataset.page === page;
    section.hidden = !active;
    section.classList.toggle('active', active);
  });

  document.querySelectorAll('[data-page-target]').forEach(button => {
    const active = button.dataset.pageTarget === page;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });

  const target = focus ? document.getElementById(focus) : null;
  if (target) {
    window.requestAnimationFrame(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  } else if (scroll) {
    const nav = document.querySelector('.primary-nav');
    if (nav) window.requestAnimationFrame(() => nav.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }
}

function closeDialog(id) {
  const dialog = document.getElementById(id);
  if (dialog?.open) dialog.close();
}

export function initNavigation() {
  document.querySelectorAll('[data-page-target]').forEach(button => {
    button.addEventListener('click', () => navigateTo(button.dataset.pageTarget));
  });

  window.addEventListener('pace:navigate', event => {
    const detail = typeof event.detail === 'string' ? { page: event.detail } : (event.detail || {});
    navigateTo(detail.page, { focus: detail.focus || '', scroll: detail.scroll !== false });
  });

  document.getElementById('openSettingsFromMore')?.addEventListener('click', () => {
    document.getElementById('settingsButton')?.click();
  });

  document.getElementById('stuckOpenParking')?.addEventListener('click', () => {
    closeDialog('stuckDialog');
    navigateTo('tools', { focus: 'spaceHomeTitle' });
  });

  document.getElementById('stuckOpenDirection')?.addEventListener('click', () => {
    closeDialog('stuckDialog');
    document.getElementById('openMeh')?.click();
  });

  navigateTo('today', { scroll: false });
}
