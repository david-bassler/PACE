import { flushStorage, loadJSON, nowIso, saveJSON, uid } from '../core/storage.js';
import { announce } from '../core/ui.js';
import { markDirty, registerSync } from '../core/sync.js';
import { buildTrackingWritePlan, getTrackingConfig } from './tracking.js';
import { writeTrackingPlan } from './tracking-sheet.js';
import {
  findQuickCaptureCommand,
  quickCaptureMatches,
  removeQuickCaptureLine
} from './quick-capture-domain.js';

const QUEUE_KEY = 'pace-quick-capture-queue-v1';
const MAX_SUGGESTIONS = 8;

let queue = loadJSON(QUEUE_KEY, []);
if (!Array.isArray(queue)) queue = [];

let textarea = null;
let editorWrap = null;
let suggestions = null;
let status = null;
let activeIndex = 0;
let currentCommand = null;
let currentMatches = [];
let statusTimer = null;

function saveQueue() {
  saveJSON(QUEUE_KEY, queue);
}

function pendingLabel() {
  if (!queue.length) return '';
  return `${queue.length} ${queue.length === 1 ? 'Eintrag' : 'Einträge'} lokal gespeichert · Synchronisierung ausstehend`;
}

function showPendingStatus() {
  clearTimeout(statusTimer);
  if (status) status.textContent = pendingLabel();
}

function flashStatus(message, delay = 2600) {
  clearTimeout(statusTimer);
  if (!status) return;
  status.textContent = message;
  statusTimer = setTimeout(() => {
    if (queue.length) showPendingStatus();
    else status.textContent = '';
  }, delay);
}

async function flushQueue() {
  let synced = 0;

  while (queue.length) {
    const entry = queue[0];
    if (!entry?.plan || !entry?.createdAt) {
      throw new Error('Ein lokaler Schnellerfassungs-Eintrag ist unvollständig und wurde nicht synchronisiert.');
    }

    await writeTrackingPlan([entry.plan], { now: new Date(entry.createdAt) });
    queue.shift();
    saveQueue();
    await flushStorage();
    synced += 1;
    showPendingStatus();
  }

  if (synced) {
    flashStatus(`${synced} ${synced === 1 ? 'Eintrag' : 'Einträge'} in die Tracking-Tabelle synchronisiert.`);
  }
}

function installStyles() {
  if (document.querySelector('style[data-pace-quick-capture]')) return;

  const style = document.createElement('style');
  style.dataset.paceQuickCapture = 'true';
  style.textContent = `
    .quick-capture-shell{position:relative;z-index:16;margin:0 0 14px}
    .quick-capture-editor-wrap{position:relative}
    .quick-capture-textarea{display:block;width:100%;min-height:82px;resize:vertical;border:1px solid rgba(23,63,95,.2);border-radius:16px;background:rgba(255,255,255,.84);box-shadow:0 7px 22px rgba(23,63,95,.07);padding:12px 13px;color:var(--ink);font-size:16px;line-height:1.45}
    .quick-capture-textarea::placeholder{color:#7a8e95}
    .quick-capture-suggestions{position:absolute;z-index:40;width:min(310px,calc(100% - 8px));max-height:270px;overflow:auto;border:1px solid #c7d6d9;border-radius:13px;background:#fff;box-shadow:0 14px 38px rgba(20,49,61,.2);padding:4px}
    .quick-capture-suggestion{width:100%;min-height:43px;border:0;border-radius:9px;background:#fff;color:#294d5b;padding:7px 9px;display:flex;align-items:center;gap:9px;text-align:left;cursor:pointer}
    .quick-capture-suggestion:hover,.quick-capture-suggestion.active{background:#edf4f3}
    .quick-capture-suggestion-icon{width:28px;height:28px;flex:0 0 auto;border-radius:8px;background:#f2f6f5;display:grid;place-items:center;font-size:1.08rem}
    .quick-capture-suggestion-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
    .quick-capture-status{min-height:1.05em;margin:5px 4px 0;color:#6d828a;font-size:.76rem;line-height:1.35}
  `;
  document.head.appendChild(style);
}

function createEditor() {
  const hero = document.querySelector('.hero');
  if (!hero || document.querySelector('.quick-capture-shell')) return false;

  const shell = document.createElement('section');
  shell.className = 'quick-capture-shell';
  shell.setAttribute('aria-label', 'Schnellerfassung');

  editorWrap = document.createElement('div');
  editorWrap.className = 'quick-capture-editor-wrap';

  textarea = document.createElement('textarea');
  textarea.className = 'quick-capture-textarea';
  textarea.rows = 3;
  textarea.placeholder = 'z. B. 10:13 Brötchen ,,e';
  textarea.setAttribute('aria-label', 'Schnellerfassung');
  textarea.setAttribute('aria-autocomplete', 'list');
  textarea.setAttribute('aria-expanded', 'false');
  textarea.autocomplete = 'off';

  suggestions = document.createElement('div');
  suggestions.className = 'quick-capture-suggestions';
  suggestions.hidden = true;
  suggestions.setAttribute('role', 'listbox');

  status = document.createElement('p');
  status.className = 'quick-capture-status';
  status.setAttribute('aria-live', 'polite');

  editorWrap.append(textarea, suggestions);
  shell.append(editorWrap, status);
  hero.insertAdjacentElement('afterend', shell);
  return true;
}

const CARET_STYLE_PROPERTIES = [
  'boxSizing', 'width', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
  'letterSpacing', 'textTransform', 'textAlign', 'lineHeight', 'tabSize',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'
];

function caretCoordinates(input, position) {
  const computed = getComputedStyle(input);
  const mirror = document.createElement('div');
  mirror.style.position = 'fixed';
  mirror.style.left = '-10000px';
  mirror.style.top = '0';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.wordBreak = 'break-word';
  mirror.style.overflow = 'hidden';

  for (const property of CARET_STYLE_PROPERTIES) mirror.style[property] = computed[property];
  mirror.style.width = `${input.getBoundingClientRect().width}px`;

  const before = document.createTextNode(input.value.slice(0, position));
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  mirror.append(before, marker);
  document.body.appendChild(mirror);

  const mirrorRect = mirror.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();
  const lineHeight = Number.parseFloat(computed.lineHeight) || Number.parseFloat(computed.fontSize) * 1.4 || 22;

  const result = {
    left: markerRect.left - mirrorRect.left - input.scrollLeft,
    top: markerRect.top - mirrorRect.top - input.scrollTop + lineHeight
  };

  mirror.remove();
  return result;
}

function positionSuggestions() {
  if (!textarea || !editorWrap || !suggestions || suggestions.hidden) return;

  const caret = caretCoordinates(textarea, textarea.selectionStart);
  const textareaRect = textarea.getBoundingClientRect();
  const wrapRect = editorWrap.getBoundingClientRect();
  const popupWidth = Math.min(310, Math.max(220, editorWrap.clientWidth - 8));
  const desiredLeft = textareaRect.left - wrapRect.left + caret.left;
  const maxLeft = Math.max(4, editorWrap.clientWidth - popupWidth - 4);

  suggestions.style.left = `${Math.min(Math.max(4, desiredLeft), maxLeft)}px`;
  suggestions.style.top = `${textareaRect.top - wrapRect.top + caret.top + 4}px`;
}

function hideSuggestions() {
  currentCommand = null;
  currentMatches = [];
  activeIndex = 0;
  if (!suggestions || !textarea) return;
  suggestions.hidden = true;
  suggestions.innerHTML = '';
  textarea.setAttribute('aria-expanded', 'false');
}

function updateActiveSuggestion() {
  if (!suggestions) return;
  [...suggestions.querySelectorAll('.quick-capture-suggestion')].forEach((button, index) => {
    button.classList.toggle('active', index === activeIndex);
    button.setAttribute('aria-selected', String(index === activeIndex));
  });
}

async function chooseField(field) {
  if (!textarea || !currentCommand || !field) return;

  const payload = currentCommand.payload;
  if (!payload) {
    flashStatus('Vor dem ,,Kürzel fehlt noch der eigentliche Eintrag.');
    return;
  }

  const plan = buildTrackingWritePlan([field], { [field.id]: payload });
  const item = plan[0];
  if (!item) {
    flashStatus('Der Eintrag enthält keinen speicherbaren Wert.');
    return;
  }
  if (!item.sheetTab || !item.columnId) {
    announce(`„${field.title}“ hat noch kein vollständiges Tracking-Ziel.`, 'bad');
    return;
  }

  const entry = {
    id: uid('quick-capture'),
    createdAt: nowIso(),
    fieldId: field.id,
    fieldTitle: field.title,
    icon: field.icon || '',
    plan: item
  };

  queue.push(entry);
  saveQueue();
  await flushStorage();

  const removal = removeQuickCaptureLine(textarea.value, currentCommand);
  textarea.value = removal.text;
  textarea.setSelectionRange(removal.cursor, removal.cursor);
  hideSuggestions();

  const icon = field.icon ? `${field.icon} ` : '';
  flashStatus(`${icon}${field.title} lokal gespeichert.`);
  markDirty('quick-capture');
  textarea.focus();
}

function renderSuggestions() {
  if (!textarea || !suggestions) return;
  if (textarea.selectionStart !== textarea.selectionEnd) {
    hideSuggestions();
    return;
  }

  const command = findQuickCaptureCommand(textarea.value, textarea.selectionStart);
  if (!command) {
    hideSuggestions();
    return;
  }

  const config = getTrackingConfig();
  const matches = quickCaptureMatches(config.fields || [], command.query, MAX_SUGGESTIONS);
  if (!matches.length) {
    hideSuggestions();
    return;
  }

  currentCommand = command;
  currentMatches = matches;
  activeIndex = Math.min(activeIndex, matches.length - 1);
  suggestions.innerHTML = '';

  for (const [index, field] of matches.entries()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `quick-capture-suggestion${index === activeIndex ? ' active' : ''}`;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(index === activeIndex));

    const icon = document.createElement('span');
    icon.className = 'quick-capture-suggestion-icon';
    icon.textContent = field.icon || '＋';

    const title = document.createElement('span');
    title.className = 'quick-capture-suggestion-title';
    title.textContent = field.title;

    button.append(icon, title);
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      chooseField(field).catch(error => {
        announce(error?.message || 'Der Eintrag konnte nicht lokal gespeichert werden.', 'bad');
      });
    });
    suggestions.appendChild(button);
  }

  suggestions.hidden = false;
  textarea.setAttribute('aria-expanded', 'true');
  positionSuggestions();
}

function handleKeydown(event) {
  if (!suggestions || suggestions.hidden || !currentMatches.length) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    activeIndex = (activeIndex + 1) % currentMatches.length;
    updateActiveSuggestion();
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeIndex = (activeIndex - 1 + currentMatches.length) % currentMatches.length;
    updateActiveSuggestion();
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    hideSuggestions();
    return;
  }

  if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault();
    chooseField(currentMatches[activeIndex]).catch(error => {
      announce(error?.message || 'Der Eintrag konnte nicht lokal gespeichert werden.', 'bad');
    });
  }
}

export function initQuickCaptureFeature() {
  registerSync('quick-capture', { push: flushQueue, full: flushQueue });

  installStyles();
  if (!createEditor()) return;

  textarea.addEventListener('input', renderSuggestions);
  textarea.addEventListener('click', renderSuggestions);
  textarea.addEventListener('keyup', event => {
    if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) renderSuggestions();
  });
  textarea.addEventListener('keydown', handleKeydown);
  textarea.addEventListener('scroll', positionSuggestions);
  textarea.addEventListener('blur', () => {
    setTimeout(() => {
      if (!editorWrap?.contains(document.activeElement)) hideSuggestions();
    }, 80);
  });

  window.addEventListener('resize', positionSuggestions);
  document.addEventListener('pointerdown', event => {
    if (editorWrap && !editorWrap.contains(event.target)) hideSuggestions();
  });

  if ('ResizeObserver' in window) {
    new ResizeObserver(() => positionSuggestions()).observe(textarea);
  }

  showPendingStatus();
  if (queue.length) markDirty('quick-capture');
}
