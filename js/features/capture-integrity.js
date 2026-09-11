import { loadJSON } from '../core/storage.js';
import { markDirty } from '../core/sync.js';
import { findQuickCaptureCommand } from './quick-capture-domain.js';
import {
  needsRecovery,
  pruneCaptureJournal,
  reconcileCaptureJournal
} from './capture-integrity-domain.js';

const QUICK_CAPTURE_QUEUE_KEY = 'pace-quick-capture-queue-v1';
const SAFETY_JOURNAL_KEY = 'paceSafetyJournalV1';

let journalAvailable = true;

function pendingEntries() {
  const parsed = loadJSON(QUICK_CAPTURE_QUEUE_KEY, []);
  return Array.isArray(parsed)
    ? parsed.filter(entry => entry?.id && entry?.plan && entry?.createdAt)
    : [];
}

function loadSafetyJournal() {
  try {
    const raw = localStorage.getItem(SAFETY_JOURNAL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    journalAvailable = false;
    return [];
  }
}

function saveSafetyJournal(entries) {
  try {
    localStorage.setItem(SAFETY_JOURNAL_KEY, JSON.stringify(entries));
    journalAvailable = true;
    return true;
  } catch {
    journalAvailable = false;
    return false;
  }
}

function journalId() {
  if (globalThis.crypto?.randomUUID) return `safety-${crypto.randomUUID()}`;
  return `safety-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function installStyles() {
  if (document.querySelector('style[data-pace-capture-integrity]')) return;

  const style = document.createElement('style');
  style.dataset.paceCaptureIntegrity = 'true';
  style.textContent = `
    .capture-pending,.capture-recovery{margin:7px 3px 0;border-radius:12px;overflow:hidden}
    .capture-pending{border:1px solid rgba(181,127,38,.24);background:rgba(255,248,229,.72)}
    .capture-recovery{border:1px solid rgba(160,77,65,.28);background:rgba(252,239,236,.82)}
    .capture-pending[hidden],.capture-recovery[hidden]{display:none!important}
    .capture-pending summary,.capture-recovery summary{cursor:pointer;padding:8px 10px;font-size:.8rem;font-weight:750}
    .capture-pending summary{color:#6b5a35}.capture-recovery summary{color:#874e47}
    .capture-pending-list,.capture-recovery-list{display:grid;gap:1px;border-top:1px solid rgba(23,63,95,.1)}
    .capture-pending-item,.capture-recovery-item{display:grid;grid-template-columns:auto 1fr;gap:3px 9px;padding:8px 10px;background:rgba(255,255,255,.62)}
    .capture-pending-time,.capture-recovery-time{grid-row:1/3;color:#8a7650;font-size:.75rem;font-variant-numeric:tabular-nums}
    .capture-pending-title,.capture-recovery-title{min-width:0;color:var(--ink);font-size:.8rem;font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .capture-pending-value,.capture-recovery-value{min-width:0;color:#5e6f75;font-size:.78rem;overflow-wrap:anywhere;white-space:pre-wrap}
    .capture-recovery-action{grid-column:2;justify-self:start;min-height:32px;border:1px solid rgba(135,78,71,.24);border-radius:9px;background:#fff;color:#71443f;padding:4px 9px;font:inherit;font-size:.76rem;font-weight:700;cursor:pointer}
    .capture-integrity-warning{margin:7px 3px 0;padding:8px 10px;border-radius:10px;background:#f7ebea;color:#854d47;font-size:.78rem;line-height:1.4}
  `;
  document.head.appendChild(style);
}

function createDetails(shell, className) {
  const existing = shell.querySelector(`.${className}`);
  if (existing) return existing;
  const details = document.createElement('details');
  details.className = className;
  details.hidden = true;
  const summary = document.createElement('summary');
  const list = document.createElement('div');
  list.className = `${className}-list`;
  details.append(summary, list);
  shell.appendChild(details);
  return details;
}

function createPanels() {
  const shell = document.querySelector('.quick-capture-shell');
  if (!shell) return null;
  const pending = createDetails(shell, 'capture-pending');
  const recovery = createDetails(shell, 'capture-recovery');
  let warning = shell.querySelector('.capture-integrity-warning');
  if (!warning) {
    warning = document.createElement('p');
    warning.className = 'capture-integrity-warning';
    warning.textContent = 'Zusätzliche lokale Sicherheitskopie ist auf diesem Gerät derzeit nicht verfügbar.';
    warning.hidden = true;
    shell.appendChild(warning);
  }
  return { pending, recovery, warning };
}

function renderPending(panel, entries) {
  panel.hidden = entries.length === 0;
  if (!entries.length) return;
  panel.querySelector('summary').textContent = `${entries.length} ${entries.length === 1 ? 'Eintrag lokal gesichert' : 'Einträge lokal gesichert'} · noch nicht bestätigt`;
  const list = panel.querySelector('.capture-pending-list');
  list.innerHTML = '';
  for (const entry of entries.slice().reverse()) {
    const item = document.createElement('div');
    item.className = 'capture-pending-item';
    const time = document.createElement('span');
    time.className = 'capture-pending-time';
    time.textContent = formatTime(entry.createdAt);
    const title = document.createElement('span');
    title.className = 'capture-pending-title';
    title.textContent = `${entry.icon ? `${entry.icon} ` : ''}${entry.fieldTitle || entry.plan?.title || 'Eintrag'}`;
    const value = document.createElement('span');
    value.className = 'capture-pending-value';
    value.textContent = String(entry.plan?.value ?? '');
    item.append(time, title, value);
    list.appendChild(item);
  }
}

function restoreSafetyEntry(entry) {
  const textarea = document.querySelector('.quick-capture-textarea');
  if (!textarea) return;
  const restored = `${entry.value} ,,${entry.fieldTitle}`;
  textarea.value = textarea.value.trim()
    ? `${textarea.value.replace(/\s+$/, '')}\n${restored}`
    : restored;
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function renderRecovery(panel, entries) {
  const recoverable = entries.filter(entry => needsRecovery(entry));
  panel.hidden = recoverable.length === 0;
  if (!recoverable.length) return;
  panel.open = true;
  panel.querySelector('summary').textContent = `${recoverable.length} ${recoverable.length === 1 ? 'Eingabe braucht Prüfung' : 'Eingaben brauchen Prüfung'} · Sicherheitskopie vorhanden`;
  const list = panel.querySelector('.capture-recovery-list');
  list.innerHTML = '';
  for (const entry of recoverable.slice().reverse()) {
    const item = document.createElement('div');
    item.className = 'capture-recovery-item';
    const time = document.createElement('span');
    time.className = 'capture-recovery-time';
    time.textContent = formatTime(entry.createdAt);
    const title = document.createElement('span');
    title.className = 'capture-recovery-title';
    title.textContent = entry.fieldTitle || 'Eintrag';
    const value = document.createElement('span');
    value.className = 'capture-recovery-value';
    value.textContent = entry.value;
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'capture-recovery-action';
    restore.textContent = 'In Eingabe wiederherstellen';
    restore.addEventListener('click', () => restoreSafetyEntry(entry));
    item.append(time, title, value, restore);
    list.appendChild(item);
  }
}

function activeSuggestion() {
  const suggestions = document.querySelector('.quick-capture-suggestions');
  if (!suggestions || suggestions.hidden) return null;
  return suggestions.querySelector('.quick-capture-suggestion.active') || suggestions.querySelector('.quick-capture-suggestion');
}

function capturePayload(button) {
  const textarea = document.querySelector('.quick-capture-textarea');
  if (!textarea || !button) return null;
  const fieldTitle = button.querySelector('.quick-capture-suggestion-title')?.textContent?.trim() || '';
  if (!fieldTitle) return null;

  let value = '';
  if (textarea.selectionStart !== textarea.selectionEnd) {
    value = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd).trim();
  } else {
    value = findQuickCaptureCommand(textarea.value, textarea.selectionStart)?.payload?.trim() || '';
  }
  if (!value) return null;
  return { fieldTitle, value };
}

function recordSafetyCapture(button) {
  const payload = capturePayload(button);
  if (!payload) return;
  const now = Date.now();
  let journal = loadSafetyJournal();
  const duplicate = journal.some(entry =>
    entry.state !== 'confirmed' &&
    entry.fieldTitle === payload.fieldTitle &&
    entry.value === payload.value &&
    Math.abs(now - new Date(entry.createdAt).getTime()) < 2000
  );
  if (duplicate) return;

  journal.push({
    id: journalId(),
    createdAt: new Date(now).toISOString(),
    state: 'captured',
    fieldTitle: payload.fieldTitle,
    value: payload.value
  });
  journal = pruneCaptureJournal(journal, now);
  saveSafetyJournal(journal);

  for (const delay of [0, 80, 300, 1100, 2200]) {
    setTimeout(reconcileJournal, delay);
  }
}

function reconcileJournal() {
  const queue = pendingEntries();
  const before = loadSafetyJournal();
  const after = pruneCaptureJournal(reconcileCaptureJournal(before, queue));
  if (JSON.stringify(before) !== JSON.stringify(after)) saveSafetyJournal(after);
  if (panels) {
    renderPending(panels.pending, queue);
    renderRecovery(panels.recovery, after);
    panels.warning.hidden = journalAvailable;
  }
}

let panels = null;

export function initCaptureIntegrityFeature() {
  installStyles();
  panels = createPanels();
  if (!panels) return;

  const initial = pendingEntries();
  if (initial.length) markDirty('quick-capture');

  document.addEventListener('pointerdown', event => {
    const button = event.target.closest?.('.quick-capture-suggestion');
    if (button) recordSafetyCapture(button);
  }, true);

  document.addEventListener('keydown', event => {
    if (!['Enter', 'Tab'].includes(event.key)) return;
    if (!event.target.matches?.('.quick-capture-textarea')) return;
    const button = activeSuggestion();
    if (button) recordSafetyCapture(button);
  }, true);

  reconcileJournal();
  setInterval(reconcileJournal, 1000);
}
