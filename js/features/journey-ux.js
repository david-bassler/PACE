import { loadJSON, saveJSON } from '../core/storage.js';

const TRACKING_KEY = 'pace-tracking-config-v1';
const DECIMAL_KEY = 'pace-quick-capture-decimals-v1';
const DEFAULT_DECIMALS = ['0,25', '0,5', '0,2'];
const MAX_DECIMAL_VALUES = 12;
const MAX_DECIMAL_SUGGESTIONS = 5;

function normalize(value) {
  return String(value ?? '').trim().toLocaleLowerCase('de-DE');
}

function trackingConfig() {
  const parsed = loadJSON(TRACKING_KEY, { groups: [], fields: [] });
  return {
    groups: Array.isArray(parsed?.groups) ? parsed.groups : [],
    fields: Array.isArray(parsed?.fields) ? parsed.fields : []
  };
}

function actionHaystack(button) {
  const ownText = normalize(button?.textContent || '');
  const title = normalize(button?.querySelector('strong')?.textContent || '');
  if (!title) return ownText;

  const config = trackingConfig();
  const group = config.groups.find(item => item?.status !== 'archived' && normalize(item.title) === title);
  if (!group) return ownText;

  const members = config.fields
    .filter(item => item?.status !== 'archived' && item.groupId === group.id)
    .map(item => item.title)
    .join(' ');

  return normalize(`${ownText} ${members}`);
}

function setVisible(element, visible, display = '') {
  if (!element) return;
  element.hidden = !visible;
  element.style.display = visible ? display : 'none';
}

function installTrackingFilter() {
  const box = document.getElementById('trackingQuickActions');
  if (!box || document.querySelector('.tracking-action-filter')) return;

  const label = document.createElement('label');
  label.className = 'tracking-action-filter';

  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Gruppen oder Felder filtern …';
  input.autocomplete = 'off';
  input.enterKeyHint = 'search';
  input.setAttribute('aria-label', 'Schnellerfassung filtern');

  const empty = document.createElement('p');
  empty.className = 'tracking-action-filter-empty';
  empty.textContent = 'Keine passende Erfassung gefunden.';
  setVisible(empty, false);

  label.appendChild(input);
  box.before(label);
  box.after(empty);

  const applyFilter = () => {
    const query = normalize(input.value);
    let visible = 0;

    for (const button of box.querySelectorAll('.tracking-action')) {
      const matches = !query || actionHaystack(button).includes(query);
      setVisible(button, matches);
      if (matches) visible += 1;
    }

    setVisible(empty, Boolean(query) && visible === 0);
  };

  input.addEventListener('input', applyFilter);
  new MutationObserver(applyFilter).observe(box, { childList: true });
  applyFilter();
}

export function findDecimalContext(text, caretPosition) {
  const source = String(text ?? '');
  const numericCaret = Number(caretPosition);
  const caret = Number.isFinite(numericCaret)
    ? Math.max(0, Math.min(source.length, numericCaret))
    : source.length;
  const left = source.slice(0, caret);
  const match = left.match(/(?:^|[^\d])(-?\d+[,.]\d*)$/);
  if (!match) return null;

  const prefixRaw = match[1];
  const start = caret - prefixRaw.length;
  const rightDigits = source.slice(caret).match(/^\d*/)?.[0] || '';
  const end = caret + rightDigits.length;

  return {
    start,
    end,
    prefix: prefixRaw.replace('.', ','),
    current: `${prefixRaw}${rightDigits}`.replace('.', ',')
  };
}

function extractDecimals(text) {
  const matches = String(text ?? '').match(/-?\d+[,.]\d+/g) || [];
  return [...new Set(matches.map(value => value.replace('.', ',')))];
}

function loadRecentDecimals() {
  const parsed = loadJSON(DECIMAL_KEY, []);
  return Array.isArray(parsed)
    ? parsed.map(value => String(value || '').replace('.', ',')).filter(Boolean).slice(0, MAX_DECIMAL_VALUES)
    : [];
}

function rememberDecimals(values) {
  const next = [...loadRecentDecimals()];
  for (const rawValue of values) {
    const value = String(rawValue || '').replace('.', ',');
    if (!/^-?\d+,\d+$/.test(value)) continue;
    const existing = next.indexOf(value);
    if (existing >= 0) next.splice(existing, 1);
    next.unshift(value);
  }
  saveJSON(DECIMAL_KEY, next.slice(0, MAX_DECIMAL_VALUES));
}

export function decimalSuggestions(prefix, recent = []) {
  const normalizedPrefix = String(prefix || '').replace('.', ',');
  const catalog = [...new Set([
    ...recent.map(value => String(value || '').replace('.', ',')),
    ...DEFAULT_DECIMALS
  ])];

  return catalog
    .filter(value => value.startsWith(normalizedPrefix) && value !== normalizedPrefix)
    .slice(0, MAX_DECIMAL_SUGGESTIONS);
}

function installDecimalSuggestions() {
  const textarea = document.querySelector('.quick-capture-textarea');
  const editorWrap = document.querySelector('.quick-capture-editor-wrap');
  if (!textarea || !editorWrap || document.querySelector('.quick-capture-decimals')) return;

  const row = document.createElement('div');
  row.className = 'quick-capture-decimals';
  row.setAttribute('aria-label', 'Dezimalwert-Vorschläge');
  setVisible(row, false, 'flex');

  const label = document.createElement('span');
  label.className = 'quick-capture-decimals-label';
  label.textContent = 'Häufig:';

  const choices = document.createElement('span');
  choices.className = 'quick-capture-decimal-choices';
  row.append(label, choices);
  editorWrap.insertAdjacentElement('afterend', row);

  const render = () => {
    if (textarea.selectionStart !== textarea.selectionEnd) {
      setVisible(row, false, 'flex');
      return;
    }

    const context = findDecimalContext(textarea.value, textarea.selectionStart);
    if (!context) {
      setVisible(row, false, 'flex');
      return;
    }

    const matches = decimalSuggestions(context.prefix, loadRecentDecimals())
      .filter(value => value !== context.current);
    choices.innerHTML = '';

    for (const value of matches) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'quick-capture-decimal';
      button.textContent = value;
      button.setAttribute('aria-label', `${value} einsetzen`);
      button.addEventListener('pointerdown', event => event.preventDefault());
      button.addEventListener('click', () => {
        const current = findDecimalContext(textarea.value, textarea.selectionStart);
        if (!current) return;

        textarea.value = textarea.value.slice(0, current.start) + value + textarea.value.slice(current.end);
        const cursor = current.start + value.length;
        textarea.focus();
        textarea.setSelectionRange(cursor, cursor);
        rememberDecimals([value]);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        render();
      });
      choices.appendChild(button);
    }

    setVisible(row, matches.length > 0, 'flex');
  };

  const rememberCurrentText = () => rememberDecimals(extractDecimals(textarea.value));

  textarea.addEventListener('input', render);
  textarea.addEventListener('click', render);
  textarea.addEventListener('keyup', render);
  textarea.addEventListener('blur', rememberCurrentText);
  textarea.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === 'Tab') && !document.querySelector('.quick-capture-suggestions')?.hidden) {
      rememberCurrentText();
    }
  }, true);
  document.addEventListener('pointerdown', event => {
    if (event.target.closest('.quick-capture-suggestion')) rememberCurrentText();
  }, true);

  render();
}

function installStyles() {
  if (document.querySelector('style[data-pace-journey-ux]')) return;

  const style = document.createElement('style');
  style.dataset.paceJourneyUx = 'true';
  style.textContent = `
    .tracking-action-filter{display:block;margin:12px 0 10px}
    .tracking-action-filter input{
      width:100%;min-height:44px;border:1px solid rgba(23,63,95,.18);border-radius:13px;
      background:rgba(255,255,255,.8);padding:9px 12px;color:var(--ink);font:inherit;
      box-shadow:0 5px 18px rgba(23,63,95,.05)
    }
    .tracking-action-filter input:focus{outline:2px solid rgba(23,63,95,.18);outline-offset:2px}
    .tracking-action-filter-empty{margin:8px 2px 0;color:#71858d;font-size:.84rem}
    .quick-capture-decimals{align-items:center;gap:7px;margin:6px 3px 0;min-height:34px;flex-wrap:wrap}
    .quick-capture-decimals-label{color:#6d828a;font-size:.74rem;font-weight:700}
    .quick-capture-decimal-choices{display:flex;gap:6px;flex-wrap:wrap}
    .quick-capture-decimal{
      min-height:34px;border:1px solid rgba(23,63,95,.15);border-radius:999px;background:rgba(255,255,255,.88);
      color:var(--ink);padding:5px 10px;font:inherit;font-size:.86rem;font-weight:700;cursor:pointer
    }
    .quick-capture-decimal:hover,.quick-capture-decimal:focus-visible{background:#edf4f3}
    @media (max-width:520px){
      .tracking-action-filter input{min-height:42px}
      .quick-capture-decimals{gap:5px;margin-top:5px}
      .quick-capture-decimal-choices{gap:5px}
      .quick-capture-decimal{min-height:32px;padding:4px 9px;font-size:.82rem}
    }
  `;
  document.head.appendChild(style);
}

export function initJourneyUxFeature() {
  installStyles();
  installTrackingFilter();
  installDecimalSuggestions();
}
