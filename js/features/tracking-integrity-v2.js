import {
  flushStorage,
  listRedundantValues,
  loadJSON,
  loadRedundantValue,
  nowIso,
  removeRedundantValue,
  saveJSON,
  saveRedundantValue,
  uid
} from '../core/storage.js';
import { announce } from '../core/ui.js';
import { markDirty, registerSync } from '../core/sync.js';
import { buildTrackingWritePlan, getTrackingConfig } from './tracking.js';
import { findQuickCaptureCommand } from './quick-capture-domain.js';
import { repairTrackingJournal, writeTrackingPlan } from './tracking-sheet.js';
import { removeTrackingDraft, trackingDraftIdentity } from './tracking-entry-draft-domain.js';

const OP_PREFIX = 'paceTrackingOperationV2:';
const LEGACY_QUEUE_KEY = 'pace-quick-capture-queue-v1';
const GROUP_DRAFTS_KEY = 'paceTrackingEntryDraftsV1';
const SYNC_NAME = 'quick-capture';
const RECOVERY_DELAY = 3500;
const CONFIRMED_RETENTION = 90 * 24 * 60 * 60 * 1000;

let panel = null;
let lastRepairConflicts = [];

function operationKey(id) {
  return `${OP_PREFIX}${id}`;
}

function parseOperation(raw) {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && value.id ? value : null;
  } catch {
    return null;
  }
}

function operations() {
  return listRedundantValues(OP_PREFIX)
    .map(([, raw]) => parseOperation(raw))
    .filter(Boolean)
    .sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')));
}

function saveOperation(operation) {
  return saveRedundantValue(operationKey(operation.id), JSON.stringify(operation));
}

function updateOperation(operation, patch) {
  const next = { ...operation, ...patch, updatedAt: nowIso() };
  if (!saveOperation(next)) throw new Error('Die lokale Sicherheitsoperation konnte nicht gespeichert werden.');
  return next;
}

function pruneConfirmedOperations() {
  const cutoff = Date.now() - CONFIRMED_RETENTION;
  for (const operation of operations()) {
    if (operation.state !== 'confirmed') continue;
    const confirmed = new Date(operation.confirmedAt || operation.updatedAt || 0).getTime();
    if (Number.isFinite(confirmed) && confirmed < cutoff) removeRedundantValue(operationKey(operation.id));
  }
}

function legacyQueue() {
  const parsed = loadJSON(LEGACY_QUEUE_KEY, []);
  return Array.isArray(parsed) ? parsed.filter(entry => entry?.id && entry?.plan && entry?.createdAt) : [];
}

function sameQueuedCapture(operation, queueEntry) {
  if (!operation || !queueEntry) return false;
  const title = String(queueEntry.fieldTitle || queueEntry.plan?.title || '').trim();
  const value = String(queueEntry.plan?.value || '').trim();
  return title === String(operation.fieldTitle || '').trim() && value === String(operation.value || '').trim();
}

function linkOperationsToLegacyQueue() {
  const queue = legacyQueue();
  let current = operations();
  const usedQueueIds = new Set(current.map(item => item.queueId).filter(Boolean));

  for (const operation of current) {
    if (operation.state !== 'captured' || operation.plan) continue;
    const created = new Date(operation.createdAt || 0).getTime();
    const match = queue.find(entry => {
      if (usedQueueIds.has(entry.id) || !sameQueuedCapture(operation, entry)) return false;
      const queued = new Date(entry.createdAt || 0).getTime();
      return !Number.isFinite(created) || !Number.isFinite(queued) || queued >= created - 2500;
    });
    if (!match) continue;
    usedQueueIds.add(match.id);
    updateOperation(operation, {
      state: 'pending',
      queueId: match.id,
      fieldId: match.fieldId || match.plan?.fieldId || operation.fieldId || '',
      icon: match.icon || operation.icon || '',
      plan: { ...match.plan }
    });
  }

  current = operations();
  const represented = new Set(current.map(item => item.queueId).filter(Boolean));
  for (const entry of queue) {
    if (represented.has(entry.id)) continue;
    const id = `legacy-${entry.id}`;
    if (current.some(item => item.id === id)) continue;
    saveOperation({
      id,
      createdAt: entry.createdAt,
      updatedAt: nowIso(),
      state: 'pending',
      source: 'legacy-quick',
      queueId: entry.id,
      fieldId: entry.fieldId || entry.plan?.fieldId || '',
      fieldTitle: entry.fieldTitle || entry.plan?.title || 'Eintrag',
      value: String(entry.plan?.value || ''),
      icon: entry.icon || '',
      plan: { ...entry.plan }
    });
  }
}

function removeConfirmedFromLegacyQueue() {
  const confirmedQueueIds = new Set(
    operations().filter(item => item.state === 'confirmed' && item.queueId).map(item => item.queueId)
  );
  if (!confirmedQueueIds.size) return;
  const queue = legacyQueue();
  const cleaned = queue.filter(entry => !confirmedQueueIds.has(entry.id));
  if (cleaned.length === queue.length) return;
  saveJSON(LEGACY_QUEUE_KEY, cleaned);
}

function activeSuggestion() {
  const box = document.querySelector('.quick-capture-suggestions');
  if (!box || box.hidden) return null;
  return box.querySelector('.quick-capture-suggestion.active') || box.querySelector('.quick-capture-suggestion');
}

function quickCapturePayload(button) {
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

  const matchingFields = (getTrackingConfig().fields || [])
    .filter(field => field?.status !== 'archived' && String(field.title || '').trim() === fieldTitle);

  return {
    fieldTitle,
    value,
    fieldId: matchingFields.length === 1 ? matchingFields[0].id : '',
    icon: matchingFields.length === 1 ? matchingFields[0].icon || '' : ''
  };
}

function captureQuickOperation(button, event) {
  const payload = quickCapturePayload(button);
  if (!payload) return null;
  const operation = {
    id: uid('capture'),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    state: 'captured',
    source: 'quick',
    ...payload
  };
  if (!saveOperation(operation)) {
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
    announce('PACE konnte keine unabhängige lokale Sicherheitskopie anlegen. Der Eintrag wurde vorsichtshalber nicht entfernt.', 'bad');
    return null;
  }

  for (const delay of [0, 60, 180, 500, 1200, 2600]) {
    setTimeout(() => {
      linkOperationsToLegacyQueue();
      renderPanel();
    }, delay);
  }
  return operation;
}

function clearGroupDraft(fieldIds) {
  const identity = trackingDraftIdentity(fieldIds);
  if (!identity) return;
  try {
    const raw = loadRedundantValue(GROUP_DRAFTS_KEY, null);
    const drafts = raw ? JSON.parse(raw) : {};
    const next = removeTrackingDraft(drafts, identity);
    saveRedundantValue(GROUP_DRAFTS_KEY, JSON.stringify(next));
  } catch {}
}

function readGroupValue(wrapper, field) {
  if (field.inputType === 'time_text') {
    const time = wrapper.querySelector('[data-part="time"]')?.value.trim() || '';
    const text = wrapper.querySelector('[data-part="text"]')?.value.trim() || '';
    return [time, text].filter(Boolean).join(' ');
  }
  return wrapper.querySelector('[data-part="value"]')?.value.trim() || '';
}

function queueGroupEntry(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.id !== 'trackingEntryForm') return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const wrappers = [...form.querySelectorAll('[data-field-id]')];
  const config = getTrackingConfig();
  const fieldsById = new Map((config.fields || []).map(field => [field.id, field]));
  const fields = wrappers.map(wrapper => fieldsById.get(wrapper.dataset.fieldId)).filter(Boolean);
  const values = Object.fromEntries(wrappers.map(wrapper => {
    const field = fieldsById.get(wrapper.dataset.fieldId);
    return [wrapper.dataset.fieldId, field ? readGroupValue(wrapper, field) : ''];
  }));
  const plan = buildTrackingWritePlan(fields, values);

  if (!plan.length) {
    announce('Noch keine Eingabe zum Speichern vorhanden.', 'bad');
    return;
  }
  const incomplete = plan.filter(item => !item.sheetTab || !item.columnId);
  if (incomplete.length) {
    announce('Mindestens ein Tracking-Ziel ist unvollständig. Es wurde nichts gespeichert.', 'bad');
    return;
  }

  const operation = {
    id: uid('tracking'),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    state: 'pending',
    source: 'group',
    fieldTitle: document.getElementById('trackingEntryTitle')?.textContent || 'Erfassung',
    value: plan.map(item => item.value).join('\n'),
    plan
  };

  if (!saveOperation(operation)) {
    announce('Der Erfassungsentwurf konnte nicht als unabhängige lokale Operation gesichert werden. Das Formular bleibt geöffnet.', 'bad');
    return;
  }

  clearGroupDraft(wrappers.map(wrapper => wrapper.dataset.fieldId));
  document.getElementById('trackingEntryDialog')?.close();
  announce(`${plan.length} ${plan.length === 1 ? 'Eintrag lokal gespeichert' : 'Einträge lokal gespeichert'} · Synchronisierung folgt.`, 'good');
  renderPanel();
  markDirty(SYNC_NAME);
}

function restoreCapturedOperation(operation) {
  const textarea = document.querySelector('.quick-capture-textarea');
  if (!textarea) return;
  const restored = `${operation.value} ,,${operation.fieldTitle}`;
  textarea.value = textarea.value.trim()
    ? `${textarea.value.replace(/\s+$/, '')}\n${restored}`
    : restored;
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  updateOperation(operation, { state: 'recovered', recoveredAt: nowIso() });
  renderPanel();
}

function ensurePanel() {
  const shell = document.querySelector('.quick-capture-shell');
  if (!shell) return null;
  let details = shell.querySelector('.capture-ledger-v2');
  if (details) return details;

  const style = document.createElement('style');
  style.textContent = `
    .capture-ledger-v2{margin:7px 3px 0;border:1px solid rgba(23,63,95,.16);border-radius:12px;background:rgba(247,250,250,.9);overflow:hidden}
    .capture-ledger-v2[hidden]{display:none!important}.capture-ledger-v2 summary{cursor:pointer;padding:8px 10px;color:#536b74;font-size:.8rem;font-weight:750}
    .capture-ledger-v2-list{display:grid;gap:1px;border-top:1px solid rgba(23,63,95,.1)}
    .capture-ledger-v2-item{display:grid;grid-template-columns:auto 1fr;gap:3px 9px;padding:8px 10px;background:rgba(255,255,255,.65)}
    .capture-ledger-v2-item.bad{background:rgba(252,239,236,.82)}.capture-ledger-v2-time{grid-row:1/3;color:#7a8b91;font-size:.75rem;font-variant-numeric:tabular-nums}
    .capture-ledger-v2-title{font-size:.8rem;font-weight:750}.capture-ledger-v2-value{font-size:.78rem;color:#5e6f75;white-space:pre-wrap;overflow-wrap:anywhere}
    .capture-ledger-v2-action{grid-column:2;justify-self:start;min-height:31px;border:1px solid rgba(23,63,95,.18);border-radius:9px;background:#fff;padding:4px 9px;font:inherit;font-size:.76rem;font-weight:700;cursor:pointer}
    .capture-ledger-v2-conflict{padding:8px 10px;background:#f7ebea;color:#854d47;font-size:.78rem;line-height:1.4}
  `;
  document.head.appendChild(style);

  details = document.createElement('details');
  details.className = 'capture-ledger-v2';
  details.hidden = true;
  details.innerHTML = '<summary></summary><div class="capture-ledger-v2-list"></div><div class="capture-ledger-v2-conflict" hidden></div>';
  shell.appendChild(details);
  return details;
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function renderPanel() {
  panel ||= ensurePanel();
  if (!panel) return;
  const all = operations();
  const active = all.filter(item => ['captured', 'pending'].includes(item.state));
  panel.hidden = active.length === 0 && lastRepairConflicts.length === 0;
  if (panel.hidden) return;

  const summary = panel.querySelector('summary');
  const list = panel.querySelector('.capture-ledger-v2-list');
  const conflict = panel.querySelector('.capture-ledger-v2-conflict');
  const recoverable = active.filter(item => item.state === 'captured' && Date.now() - new Date(item.createdAt).getTime() >= RECOVERY_DELAY);
  const pending = active.filter(item => item.state === 'pending');
  summary.textContent = `${pending.length} lokal ausstehend${recoverable.length ? ` · ${recoverable.length} braucht Prüfung` : ''}`;
  list.innerHTML = '';

  for (const operation of [...active].reverse()) {
    const item = document.createElement('div');
    const needsRecovery = operation.state === 'captured' && Date.now() - new Date(operation.createdAt).getTime() >= RECOVERY_DELAY;
    item.className = `capture-ledger-v2-item${needsRecovery ? ' bad' : ''}`;
    const time = document.createElement('span');
    time.className = 'capture-ledger-v2-time';
    time.textContent = formatTime(operation.createdAt);
    const title = document.createElement('span');
    title.className = 'capture-ledger-v2-title';
    title.textContent = operation.fieldTitle || operation.plan?.[0]?.title || 'Erfassung';
    const value = document.createElement('span');
    value.className = 'capture-ledger-v2-value';
    value.textContent = operation.value || operation.plan?.map(entry => entry.value).join('\n') || '';
    item.append(time, title, value);
    if (needsRecovery) {
      const restore = document.createElement('button');
      restore.type = 'button';
      restore.className = 'capture-ledger-v2-action';
      restore.textContent = 'In Eingabe wiederherstellen';
      restore.addEventListener('click', () => restoreCapturedOperation(operation));
      item.appendChild(restore);
    }
    list.appendChild(item);
  }

  conflict.hidden = lastRepairConflicts.length === 0;
  conflict.textContent = lastRepairConflicts.length
    ? `PACE hat ${lastRepairConflicts.length} Zelle${lastRepairConflicts.length === 1 ? '' : 'n'} mit uneindeutigem externem Zustand nicht automatisch überschrieben.`
    : '';
}

async function flushOperations({ repair = false } = {}) {
  linkOperationsToLegacyQueue();
  let errors = [];

  const pending = operations().filter(item => item.state === 'pending' && Array.isArray(item.plan) && item.plan.length);
  for (const operation of pending) {
    try {
      await writeTrackingPlan(operation.plan, {
        now: new Date(operation.createdAt),
        operationId: operation.id,
        source: operation.source || 'local'
      });
      updateOperation(operation, { state: 'confirmed', confirmedAt: nowIso(), lastError: '' });
    } catch (error) {
      updateOperation(operation, { lastError: error?.message || String(error) });
      errors.push(error);
    }
  }

  removeConfirmedFromLegacyQueue();
  try { await flushStorage(); } catch (error) { errors.push(error); }

  if (repair) {
    try {
      const result = await repairTrackingJournal();
      lastRepairConflicts = result.conflicts || [];
    } catch (error) {
      errors.push(error);
    }
  }

  pruneConfirmedOperations();
  renderPanel();
  if (errors.length) throw errors[0];
}

function installCaptureListeners() {
  document.addEventListener('pointerdown', event => {
    const button = event.target.closest?.('.quick-capture-suggestion');
    if (!button) return;
    captureQuickOperation(button, event);
  }, true);

  document.addEventListener('keydown', event => {
    if (!['Enter', 'Tab'].includes(event.key)) return;
    if (!event.target.matches?.('.quick-capture-textarea')) return;
    const button = activeSuggestion();
    if (button) captureQuickOperation(button, event);
  }, true);

  document.addEventListener('submit', queueGroupEntry, true);
}

export function initTrackingIntegrityV2() {
  installCaptureListeners();
  registerSync(SYNC_NAME, {
    push: () => flushOperations({ repair: false }),
    full: () => flushOperations({ repair: true })
  });

  linkOperationsToLegacyQueue();
  removeConfirmedFromLegacyQueue();
  renderPanel();
  pruneConfirmedOperations();

  window.addEventListener('storage', event => {
    if (!event.key?.startsWith(OP_PREFIX)) return;
    linkOperationsToLegacyQueue();
    renderPanel();
    if (operations().some(item => item.state === 'pending')) markDirty(SYNC_NAME);
  });

  setInterval(() => {
    linkOperationsToLegacyQueue();
    renderPanel();
  }, 1200);

  if (operations().some(item => item.state === 'pending')) markDirty(SYNC_NAME);
}
