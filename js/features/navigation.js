const ROOT_PAGES = new Set(['capture', 'tools', 'config']);
const PAGE_ALIASES = {
  today: 'capture',
  capture: 'capture',
  tools: 'tools',
  progress: 'tools',
  more: 'config',
  config: 'config'
};

const TOOL_DEFINITIONS = [
  { key: 'day', icon: '◷', title: 'Tagessteuerung', hint: 'Tagesform, Reserve und Abschluss' },
  { key: 'calm', icon: '◯', title: 'Ruhe im System', hint: 'Atemkreis' },
  { key: 'space', icon: '↘', title: 'Kopf entlasten', hint: 'Parken, verkleinern, behalten' },
  { key: 'direction', icon: '→', title: 'Richtung finden', hint: 'Wenn gerade nichts eindeutig zieht' },
  { key: 'perspective', icon: '◇', title: 'Perspektive wechseln', hint: 'Erinnern, Haltepunkte, Horizont' },
  { key: 'pace', icon: 'P', title: 'PACE-Vorschläge', hint: 'Direkt nach P · A · C · E' },
  { key: 'progress', icon: '↗', title: 'Fortschritt', hint: 'Lebenslandkarte und nächste Schritte' }
];

let currentTool = '';

function pageElement(name) {
  return document.querySelector(`[data-page="${name}"]`);
}

function injectShellStyles() {
  if (document.querySelector('link[data-pace-shell-v2]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './shell-v2.css';
  link.dataset.paceShellV2 = 'true';
  document.head.appendChild(link);
}

function rootButtonMarkup(target, label, svg) {
  return `<button class="bottom-nav-button" type="button" data-page-target="${target}"><span class="bottom-nav-icon" aria-hidden="true">${svg}</span><span>${label}</span></button>`;
}

function setupRootNavigation() {
  const nav = document.querySelector('.primary-nav');
  if (!nav) return;

  nav.className = 'bottom-nav';
  nav.setAttribute('aria-label', 'PACE Hauptnavigation');
  nav.innerHTML = [
    rootButtonMarkup('capture', 'Erfassen', '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></svg>'),
    rootButtonMarkup('tools', 'Werkzeuge', '<svg viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 0-5 5L4 17l3 3 5.7-5.7a4 4 0 0 0 5-5l-2.4 2.4-3-3z"/></svg>'),
    rootButtonMarkup('config', 'Konfiguration', '<svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8 4 2-1-2-3-2 .5a8 8 0 0 0-1.5-1.5L17 5l-3-2-1 2a8 8 0 0 0-2 0l-1-2-3 2 .5 2A8 8 0 0 0 6 8.5L4 8l-2 3 2 1a8 8 0 0 0 0 2l-2 1 2 3 2-.5A8 8 0 0 0 7.5 19L7 21l3 2 1-2a8 8 0 0 0 2 0l1 2 3-2-.5-2a8 8 0 0 0 1.5-1.5l2 .5 2-3-2-1a8 8 0 0 0 0-2Z"/></svg>')
  ].join('');
}

function setIntro(page, micro, title, hint) {
  const intro = page?.querySelector('.page-intro');
  if (!intro) return;
  const microEl = intro.querySelector('.micro');
  const titleEl = intro.querySelector('h2');
  const hintEl = intro.querySelector('.hint');
  if (microEl) microEl.textContent = micro;
  if (titleEl) titleEl.textContent = title;
  if (hintEl) hintEl.textContent = hint;
}

function setupCapturePage() {
  const page = document.getElementById('page-today');
  if (!page) return;

  page.id = 'page-capture';
  page.dataset.page = 'capture';
  page.classList.add('capture-page');
  setIntro(page, 'ERFASSEN', 'Daten erfassen', 'Nur Eingabe. Alles andere liegt in Werkzeuge oder Konfiguration.');

  const intro = page.querySelector('.page-intro');
  const quickCapture = document.querySelector('.quick-capture-shell');
  const tracking = page.querySelector('.tracking-home');

  if (quickCapture) intro?.insertAdjacentElement('afterend', quickCapture);
  if (tracking) {
    const anchor = quickCapture || intro;
    anchor?.insertAdjacentElement('afterend', tracking);
  }
}

function createToolScreen(page, definition, elements) {
  const screen = document.createElement('section');
  screen.className = 'tool-screen';
  screen.dataset.toolScreen = definition.key;
  screen.hidden = true;

  const header = document.createElement('header');
  header.className = 'subscreen-header';
  header.innerHTML = `<button class="subscreen-back" type="button" aria-label="Zurück zu Werkzeuge">←</button><div><p class="micro">WERKZEUG</p><h2>${definition.title}</h2></div>`;
  header.querySelector('.subscreen-back')?.addEventListener('click', () => showToolsOverview());
  screen.appendChild(header);

  elements.filter(Boolean).forEach(element => screen.appendChild(element));
  page.appendChild(screen);
}

function setupToolsPage() {
  const page = document.getElementById('page-tools');
  if (!page) return;

  page.dataset.page = 'tools';
  page.classList.add('tools-page');
  setIntro(page, 'WERKZEUGE', 'Werkzeuge', 'Eine Funktion auswählen. Jede öffnet ihren eigenen Screen.');

  const intro = page.querySelector('.page-intro');
  const menu = document.createElement('div');
  menu.className = 'tools-overview screen-menu-grid';
  menu.setAttribute('aria-label', 'Werkzeuge');

  TOOL_DEFINITIONS.forEach(definition => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'screen-menu-tile';
    button.dataset.toolTarget = definition.key;
    button.innerHTML = `<span class="screen-menu-icon" aria-hidden="true">${definition.icon}</span><span><strong>${definition.title}</strong><small>${definition.hint}</small></span><span class="screen-menu-arrow" aria-hidden="true">›</span>`;
    button.addEventListener('click', () => showTool(definition.key));
    menu.appendChild(button);
  });
  intro?.insertAdjacentElement('afterend', menu);

  const dayElements = [
    document.querySelector('#page-capture .energy-strip'),
    document.getElementById('reserveFirst'),
    document.querySelector('#page-capture .today-panel'),
    document.getElementById('stuckButton'),
    document.getElementById('rescueCurrent'),
    document.querySelector('#page-capture .evening-card')
  ];

  const calm = page.querySelector('.calm-tool');
  const space = page.querySelector('.space-home');
  const direction = page.querySelector('.meh-home');
  const perspective = page.querySelector('.anchor-home');
  const paceSuggestions = page.querySelector('#paceSuggestionsDetails');

  const progressPage = document.getElementById('page-progress');
  const progressCard = progressPage?.querySelector('.progress-home');

  createToolScreen(page, TOOL_DEFINITIONS[0], dayElements);
  createToolScreen(page, TOOL_DEFINITIONS[1], [calm]);
  createToolScreen(page, TOOL_DEFINITIONS[2], [space]);
  createToolScreen(page, TOOL_DEFINITIONS[3], [direction]);
  createToolScreen(page, TOOL_DEFINITIONS[4], [perspective]);
  createToolScreen(page, TOOL_DEFINITIONS[5], [paceSuggestions]);
  createToolScreen(page, TOOL_DEFINITIONS[6], [progressCard]);

  if (progressPage) {
    progressPage.hidden = true;
    progressPage.removeAttribute('data-page');
    progressPage.classList.remove('active');
  }
}

function setupConfigPage() {
  const page = document.getElementById('page-more');
  if (!page) return;

  page.id = 'page-config';
  page.dataset.page = 'config';
  page.classList.add('config-page');
  setIntro(page, 'KONFIGURATION', 'Konfiguration', 'Verbindungen, Erfassung und persönliche Inhalte verwalten.');

  const cards = [...page.querySelectorAll(':scope > .feature-card')];
  const grid = document.createElement('div');
  grid.className = 'config-grid';
  const intro = page.querySelector('.page-intro');
  intro?.insertAdjacentElement('afterend', grid);

  cards.forEach(card => {
    card.classList.add('config-tile');
    grid.appendChild(card);
  });
}

function setupShell() {
  if (document.body.classList.contains('pace-shell-v2')) return;
  document.body.classList.add('pace-shell-v2');
  injectShellStyles();
  setupRootNavigation();
  setupCapturePage();
  setupToolsPage();
  setupConfigPage();
}

function showToolsOverview() {
  currentTool = '';
  const page = pageElement('tools');
  if (!page) return;
  page.classList.remove('showing-tool');
  page.querySelector('.page-intro')?.removeAttribute('hidden');
  const overview = page.querySelector('.tools-overview');
  if (overview) overview.hidden = false;
  page.querySelectorAll('[data-tool-screen]').forEach(screen => { screen.hidden = true; });
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function showTool(key) {
  const page = pageElement('tools');
  const screen = page?.querySelector(`[data-tool-screen="${key}"]`);
  if (!page || !screen) return false;

  currentTool = key;
  page.classList.add('showing-tool');
  const intro = page.querySelector('.page-intro');
  if (intro) intro.hidden = true;
  const overview = page.querySelector('.tools-overview');
  if (overview) overview.hidden = true;
  page.querySelectorAll('[data-tool-screen]').forEach(candidate => {
    candidate.hidden = candidate !== screen;
  });
  window.scrollTo({ top: 0, behavior: 'auto' });
  return true;
}

function toolForFocus(focus) {
  if (!focus) return '';
  const target = document.getElementById(focus);
  return target?.closest('[data-tool-screen]')?.dataset.toolScreen || '';
}

export function navigateTo(name, { focus = '', scroll = true } = {}) {
  const requested = PAGE_ALIASES[name] || 'capture';
  const page = ROOT_PAGES.has(requested) ? requested : 'capture';

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

  if (page === 'tools') {
    const requestedTool = name === 'progress' ? 'progress' : toolForFocus(focus);
    if (requestedTool) showTool(requestedTool);
    else if (!currentTool || name === 'tools') showToolsOverview();
  } else {
    currentTool = '';
  }

  const target = focus ? document.getElementById(focus) : null;
  if (target && !target.closest('[hidden]')) {
    window.requestAnimationFrame(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  } else if (scroll) {
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }
}

function closeDialog(id) {
  const dialog = document.getElementById(id);
  if (dialog?.open) dialog.close();
}

export function initNavigation() {
  setupShell();

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
    navigateTo('tools');
    showTool('direction');
    document.getElementById('openMeh')?.click();
  });

  navigateTo('capture', { scroll: false });
}
