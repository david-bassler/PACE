import {
  flushStorage,
  loadJSON,
  loadRedundantValue,
  nowIso,
  saveJSON,
  saveRedundantValue,
  uid
} from '../core/storage.js';
import { announce } from '../core/ui.js';
import { markDirty, registerSync } from '../core/sync.js';
import { buildTrackingWritePlan, getTrackingConfig } from './tracking.js';
import { repairTrackingJournal, writeTrackingPlan } from './tracking-sheet.js';
import { removeTrackingDraft, trackingDraftIdentity } from './tracking-entry-draft-domain.js';
import {
  REDUNDANT_OP_PREFIX,
  listTrackingOperations,
  removeTrackingOperation,
  saveTrackingOperation,
  updateTrackingOperation
} from './tracking-operation-store.js';

const LEGACY_QUEUE_KEY = 'pace-quick-capture-queue-v1';
const GROUP_DRAFTS_KEY = 'paceTrackingEntryDraftsV1';
const SYNC_NAME = 'quick-capture';
const RECOVERY_DELAY = 3500;
const TERMINAL_RETENTION = 90 * 24 * 60 * 60 * 1000;
const LEGACY_MATCH_WINDOW = 5000;

let panel = null;
let lastRepairConflicts = [];
let groupSubmissionInFlight = false;

function operations() {
  return listTrackingOperations();
}

function pruneTerminalOperations() {
  const cutoff = Date.now() - TERMINAL_RETENTION;
  for (const operation of operations()) {
    if (!['confirmed', 'recovered'].includes(operation.state)) continue;
    const terminalAt = new Date(
      operation.confirmedAt || operation.recoveredAt || operation.updatedAt || operation.createdAt || 0
    ).getTime();
    if (Number.isFinite(terminalAt) && terminalAt < cutoff) {
      removeTrackingOperation(operation.id);
    }
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

function normalizeLegacyOperationPlans() {
  for (const operation of operations()) {
    if (!['captured', 'pending'].includes(operation.state)) continue;
    if (!operation.plan || Array.isArray(operation.plan) || typeof operation.plan !== 'object') continue;
    updateTrackingOperation(operation, { plan: [{ ...operation.plan }] });
  }
}

function migrateLegacyQueue() {
  // PR #15 konnte bereits Pending-Operationen mit einem einzelnen Plan-Objekt
  // erzeugen. Diese würden vom neuen Array-basierten Sync sonst dauerhaft
  // übersprungen. Vor jeder Migration werden solche Altstände normalisiert.
  normalizeLegacyOperationPlans();

  const queue = legacyQueue();
  let current = operations();
  const representedQueueIds = new Set(current.map(item => item.queueId).filter(Boolean));

  // Compatibility only for captured records created by the pre-#17 version.
  // Matching is bounded tightly in both directions so a stale orphan cannot
  // attach itself to a later identical coffee/medication entry.
  const usedOperationIds = new Set();
  for (const entry of queue) {
    if (representedQueueIds.has(entry.id)) continue;
    const queuedAt = new Date(entry.createdAt || 0).getTime();
    const match = current.find(operation => {
      if (usedOperationIds.has(operation.id)) return false;
      if (operation.state !== 'captured' || operation.source !== 'quick' || operation.plan) return false;
      if (!sameQueuedCapture(operation, entry)) return false;
      const capturedAt = new Date(operation.createdAt || 0).getTime();
      if (!Number.isFinite(queuedAt) || !Number.isFinite(capturedAt)) return false;
      return Math.abs(queuedAt - capturedAt) <= LEGACY_MATCH_WINDOW;
    });
    if (!match) continue;

    usedOperationIds.add(match.id);
    representedQueueIds.add(entry.id);
    updateTrackingOperation(match, {
      state: 'pending',
      queueId: entry.id,
      fieldId: entry.fieldId || entry.plan?.fieldId || match.fieldId || '',
      fieldTitle: entry.fieldTitle || entry.plan?.title || match.fieldTitle || 'Eintrag',
      value: String(entry.plan?.value || match.value || ''),
      icon: entry.icon || match.icon || '',
      plan: [{ ...entry.plan }]
    });
  }

  current = operations();
  const represented = new Set(current.map(item => item.queueId).filter(Boolean));
  for (const entry of queue) {
    if (represented.has(entry.id)) continue;
    const id = `legacy-${entry.id}`;
    if (current.some(item => item.id === id)) continue;
    saveTrackingOperation({
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
      plan: [{ ...entry.plan }]
    });
  }
}

function removeConfirmedFromLegacyQueue() {
  const confirmedQueueIds = new Set(
    operations()
      .filter(item => item.state === 'confirmed' && item.queueId)
      .map(item => item.queueId)
  );
  if (!confirmedQueueIds.size) return;

  const queue = legacyQueue();
  const cleaned = queue.filter(entry => !confirmedQueueIds.has(entry.id));
  if (cleaned.length === queue.length) return;
  saveJSON(LEGACY_QUEUE_KEY, cleaned);
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

async function queueGroupEntryOnce(form) {
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

  const timestamp = nowIso();
  const operation = {
    id: uid('tracking'),
    createdAt: timestamp,
    updatedAt: timestamp,
    state: 'captured',
    source: 'group',
    fieldTitle: document.getElementById('trackingEntryTitle')?.textContent || 'Erfassung',
    value: plan.map(item => item.value).join('\n'),
    plan
  };

  try {
    saveTrackingOperation(operation);
    await flushStorage();
  } catch (error) {
    try { removeTrackingOperation(operation.id); } catch {}
    announce(error?.message || 'Der Erfassungsentwurf konnte nicht sicher lokal gespeichert werden. Das Formular bleibt geöffnet.', 'bad');
    return;
  }

  const pending = updateTrackingOperation(operation, { state: 'pending', readyAt: nowIso() });
  try {
    await flushStorage();
  } catch {
    // Die captured-Version wurde bereits auf beiden lokalen Speicherwegen
    // bestätigt und die pending-Version liegt synchron im redundanten Store.
    // Deshalb darf das Formular jetzt geschlossen werden; die Operation bleibt
    // sichtbar und wird spätestens beim nächsten Start erneut synchronisiert.
    announce('Der Eintrag ist lokal gesichert; die zweite lokale Kopie wird später nachgezogen.', '');
  }

  clearGroupDraft(wrappers.map(wrapper => wrapper.dataset.fieldId));
  document.getElementById('trackingEntryDialog')?.close();
  announce(`${plan.length} ${plan.length === 1 ? 'Eintrag lokal gespeichert' : 'Einträge lokal gespeichert'} · Synchronisierung folgt.`, 'good');
  renderPanel();
  markDirty(SYNC_NAME);
  return pending;
}

async function queueGroupEntry(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.id !== 'trackingEntryForm') return;

  event.preventDefault();
  event.stopImmediatePropagation();

  if (groupSubmissionInFlight) {
    announce('Diese Erfassung wird bereits lokal gespeichert.', '');
    return;
  }

  groupSubmissionInFlight = true;
  const submit = form.querySelector('button[type="submit"]');
  const wasDisabled = Boolean(submit?.disabled);
  if (submit) submit.disabled = true;

  try {
    await queueGroupEntryOnce(form);
  } finally {
    groupSubmissionInFlight = false;
    if (submit) submit.disabled = wasDisabled;
  }
}

async function restoreCapturedOperation(operation) {
  const textarea = document.querySelector('.quick-capture-textarea');
  if (!textarea || operation.source !== 'quick') return;
  const restored = `${operation.value} ,,${operation.fieldTitle}`;
  textarea.value = textarea.value.trim()
    ? `${textarea.value.replace(/\s+$/, '')}\n${restored}`
    : restored;
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));

  try {
    await flushStorage();
  } catch {
    announce('Der Text wurde wieder eingesetzt, aber der Entwurf konnte noch nicht dauerhaft bestätigt werden. Die Sicherheitskopie bleibt erhalten.', 'bad');
    renderPanel();
    return;
  }

  updateTrackingOperation(operation, { state: 'recovered', recoveredAt: nowIso() });
  try { await flushStorage(); } catch {}
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
  const recoverable = active.filter(item =>
    item.source === 'quick' && item.state === 'captured' && Date.now() - new Date(item.createdAt).getTime() >= RECOVERY_DELAY
  );
  const pending = active.filter(item => item.state === 'pending');
  summary.textContent = `${pending.length} lokal ausstehend${recoverable.length ? ` · ${recoverable.length} braucht Prüfung` : ''}`;
  list.innerHTML = '';

  for (const operation of [...active].reverse()) {
    const item = document.createElement('div');
    const needsRecovery = operation.source === 'quick' && operation.state === 'captured' &&
      Date.now() - new Date(operation.createdAt).getTime() >= RECOVERY_DELAY;
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
      restore.addEventListener('click', () => {
        restoreCapturedOperation(operation).catch(error => {
          announce(error?.message || 'Die Sicherheitskopie konnte nicht wiederhergestellt werden.', 'bad');
        });
      });
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
  migrateLegacyQueue();
  const errors = [];

  const pending = operations().filter(item => item.state === 'pending' && Array.isArray(item.plan) && item.plan.length);
  for (const operation of pending) {
    try {
      await writeTrackingPlan(operation.plan, {
        now: new Date(operation.createdAt),
        operationId: operation.id,
        source: operation.source || 'local'
      });
      updateTrackingOperation(operation, { state: 'confirmed', confirmedAt: nowIso(), lastError: '' });
    } catch (error) {
      try { updateTrackingOperation(operation, { lastError: error?.message || String(error) }); } catch {}
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

  pruneTerminalOperations();
  renderPanel();
  if (errors.length) throw errors[0];
}

function installGroupCaptureListener() {
  document.addEventListener('submit', event => {
    queueGroupEntry(event).catch(error => {
      announce(error?.message || 'Die Erfassung konnte nicht sicher lokal gespeichert werden.', 'bad');
    });
  }, true);
}

export function initTrackingIntegrityV2() {
  installGroupCaptureListener();
  registerSync(SYNC_NAME, {
    push: () => flushOperations({ repair: false }),
    full: () => flushOperations({ repair: true })
  });

  migrateLegacyQueue();
  removeConfirmedFromLegacyQueue();
  renderPanel();
  pruneTerminalOperations();

  window.addEventListener('storage', event => {
    if (!event.key?.startsWith(REDUNDANT_OP_PREFIX)) return;
    migrateLegacyQueue();
    renderPanel();
    if (operations().some(item => item.state === 'pending')) markDirty(SYNC_NAME);
  });

  setInterval(() => {
    migrateLegacyQueue();
    renderPanel();
  }, 1200);

  if (operations().some(item => item.state === 'pending')) markDirty(SYNC_NAME);
}
