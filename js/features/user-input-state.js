import {
  dateKey,
  loadJSON,
  loadRedundantValue,
  loadValue,
  nowIso,
  saveJSON,
  saveRedundantValue,
  saveValue
} from '../core/storage.js';
import { loadTables, replaceTables } from '../core/google.js';
import { markDirty, registerSync } from '../core/sync.js';
import { mergeUpdatedById } from '../core/collections.js';
import {
  userInputRecordFromRow,
  userInputStateSheetSpecs,
  userInputStateTables
} from './user-input-state-data.js';

export { userInputStateSheetSpecs };

const KEY = 'pace-user-input-state-v1';
const QUICK_DRAFT_KEY = 'pace-quick-capture-draft-v1';
const BREATH_KEY = 'pace-breath-settings-v1';
const HORIZON_KEY = 'pace-horizon-v1';
const TRACKING_DRAFTS_KEY = 'paceTrackingEntryDraftsV1';

const EMPTY = { records: [] };
let data = { ...EMPTY, ...loadJSON(KEY, EMPTY) };
data.records ||= [];
let suppressQuickDraft = false;

function persist(sync = true) {
  saveJSON(KEY, data);
  if (sync) markDirty('user-input-state');
}

function recordById(id) {
  return data.records.find(item => item.id === id) || null;
}

function recordsForArea(area) {
  return data.records.filter(item => item.area === area);
}

function sameRecord(a, b) {
  return a && b &&
    a.area === b.area &&
    a.text === b.text &&
    a.status === b.status &&
    a.extra === b.extra &&
    String(a.createdAt || '') === String(b.createdAt || '') &&
    String(a.updatedAt || '') === String(b.updatedAt || '');
}

function putRecord(next, { sync = true } = {}) {
  if (!next?.id || !next?.area) return null;
  const previous = recordById(next.id);
  const stamp = next.updatedAt || nowIso();
  const candidate = {
    id: next.id,
    area: next.area,
    text: String(next.text || ''),
    status: String(next.status || ''),
    extra: String(next.extra || ''),
    createdAt: next.createdAt || previous?.createdAt || stamp,
    updatedAt: stamp
  };

  if (previous && sameRecord(previous, candidate)) return previous;
  if (previous) Object.assign(previous, candidate);
  else data.records.push(candidate);
  persist(sync);
  return candidate;
}

function upsertCurrent(id, area, patch = {}) {
  const previous = recordById(id);
  const candidate = {
    id,
    area,
    text: patch.text ?? previous?.text ?? '',
    status: patch.status ?? previous?.status ?? '',
    extra: patch.extra ?? previous?.extra ?? '',
    createdAt: previous?.createdAt || nowIso(),
    updatedAt: nowIso()
  };
  const unchanged = previous &&
    previous.area === candidate.area &&
    previous.text === String(candidate.text || '') &&
    previous.status === String(candidate.status || '') &&
    previous.extra === String(candidate.extra || '');
  return unchanged ? previous : putRecord(candidate);
}

function safeJSON(value, fallback = null) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function applyQuickDraft() {
  const record = recordById('quick-capture-draft');
  if (!record) return;
  const value = record.status === 'cleared' ? '' : record.text;
  saveValue(QUICK_DRAFT_KEY, value);
  const textarea = document.querySelector('.quick-capture-textarea');
  if (!textarea || textarea.value === value) return;
  suppressQuickDraft = true;
  textarea.value = value;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  suppressQuickDraft = false;
}

function wireQuickDraft() {
  const textarea = document.querySelector('.quick-capture-textarea');
  if (!textarea) return;

  const local = String(loadValue(QUICK_DRAFT_KEY, '') || '');
  const existing = recordById('quick-capture-draft');
  if (!existing && local) {
    putRecord({
      id: 'quick-capture-draft', area: 'quick-capture-draft', text: local,
      status: 'draft', extra: '', createdAt: nowIso(), updatedAt: nowIso()
    });
  } else if (existing) {
    applyQuickDraft();
  }

  textarea.addEventListener('input', () => {
    if (suppressQuickDraft) return;
    const value = textarea.value;
    upsertCurrent('quick-capture-draft', 'quick-capture-draft', {
      text: value,
      status: value ? 'draft' : 'cleared'
    });
  });
}

function breathRecord() {
  return recordById('breath-settings');
}

function applyBreathSettings() {
  const record = breathRecord();
  if (!record || record.status === 'cleared') return;
  const inhale = Number.parseFloat(record.text);
  const exhale = Number.parseFloat(record.extra);
  if (!Number.isFinite(inhale) || !Number.isFinite(exhale)) return;
  const settings = { inhale, exhale };
  saveJSON(BREATH_KEY, settings);
  const inhaleInput = document.getElementById('breathInhaleSeconds');
  const exhaleInput = document.getElementById('breathExhaleSeconds');
  if (inhaleInput) inhaleInput.value = inhale.toFixed(1);
  if (exhaleInput) exhaleInput.value = exhale.toFixed(1);
}

function wireBreathSettings() {
  const inhale = document.getElementById('breathInhaleSeconds');
  const exhale = document.getElementById('breathExhaleSeconds');
  if (!inhale || !exhale) return;

  const local = loadJSON(BREATH_KEY, null);
  if (!breathRecord() && Number.isFinite(Number(local?.inhale)) && Number.isFinite(Number(local?.exhale))) {
    putRecord({
      id: 'breath-settings', area: 'breath-settings', text: String(local.inhale),
      status: 'settings', extra: String(local.exhale), createdAt: nowIso(), updatedAt: nowIso()
    });
  } else if (breathRecord()) {
    applyBreathSettings();
  }

  const save = () => {
    const inValue = Number.parseFloat(String(inhale.value).replace(',', '.'));
    const outValue = Number.parseFloat(String(exhale.value).replace(',', '.'));
    if (!Number.isFinite(inValue) || !Number.isFinite(outValue)) return;
    upsertCurrent('breath-settings', 'breath-settings', {
      text: String(inValue), status: 'settings', extra: String(outValue)
    });
  };
  inhale.addEventListener('change', save);
  exhale.addEventListener('change', save);
}

const HORIZON_LABELS = {
  hours: 'Nächste Stunden',
  today: 'Heute',
  months: 'Wochen / Monate',
  life: 'Mein weiteres Leben',
  world: 'Gesellschaft / Welt'
};

function horizonRecordId(date = dateKey()) {
  return `horizon-${date}`;
}

function horizonRecordToState(record) {
  if (!record) return null;
  return {
    date: record.id.slice('horizon-'.length),
    current: record.text || '',
    mode: record.status || '',
    working: record.extra || '',
    updatedAt: record.updatedAt || ''
  };
}

function renderHorizonSummary(state) {
  const summary = document.getElementById('horizonCurrentSummary');
  if (!summary) return;
  if (!state?.current) {
    summary.textContent = 'Kein Horizont für den aktuellen Abschnitt gewählt.';
    return;
  }
  const current = HORIZON_LABELS[state.current] || state.current;
  summary.textContent = state.working
    ? `Im Hintergrund: ${current} · Für jetzt: ${state.working}`
    : `Für jetzt maßgeblich: ${current}`;
}

function applyHorizon() {
  const record = recordById(horizonRecordId());
  if (!record) return;
  const state = horizonRecordToState(record);
  saveJSON(HORIZON_KEY, state);
  renderHorizonSummary(state);
}

function mirrorHorizonLocal() {
  const state = loadJSON(HORIZON_KEY, null);
  if (!state?.current || state.date !== dateKey()) return;
  putRecord({
    id: horizonRecordId(state.date),
    area: 'horizon',
    text: state.current,
    status: state.mode || '',
    extra: state.working || '',
    createdAt: state.updatedAt || nowIso(),
    updatedAt: state.updatedAt || nowIso()
  });
}

function wireHorizon() {
  const local = loadJSON(HORIZON_KEY, null);
  if (!recordById(horizonRecordId()) && local?.date === dateKey() && local.current) mirrorHorizonLocal();
  else applyHorizon();

  const result = document.getElementById('horizonStepResult');
  if (!result) return;
  new MutationObserver(() => {
    if (!result.hidden) mirrorHorizonLocal();
  }).observe(result, { attributes: true, attributeFilter: ['hidden'] });
}

function loadTrackingDraftsLocal() {
  const raw = loadRedundantValue(TRACKING_DRAFTS_KEY, null);
  const parsed = raw ? safeJSON(raw, {}) : {};
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function saveTrackingDraftsLocal(drafts) {
  saveRedundantValue(TRACKING_DRAFTS_KEY, JSON.stringify(drafts));
}

function trackingDraftRecordId(identity) {
  return `tracking-entry-draft:${identity}`;
}

function parseTrackingDraftRecord(record) {
  const extra = safeJSON(record.extra, {}) || {};
  const identity = String(extra.identity || record.id.slice('tracking-entry-draft:'.length));
  return {
    identity,
    title: record.text || 'Erfassung',
    values: extra.values && typeof extra.values === 'object' ? extra.values : {},
    updatedAt: record.updatedAt || ''
  };
}

function mirrorTrackingDraftsLocal() {
  const local = loadTrackingDraftsLocal();
  for (const [identity, draft] of Object.entries(local)) {
    if (!identity || !draft || typeof draft !== 'object') continue;
    const id = trackingDraftRecordId(identity);
    const existing = recordById(id);
    const updatedAt = draft.updatedAt || nowIso();
    if (existing && String(existing.updatedAt || '') >= String(updatedAt)) continue;
    putRecord({
      id,
      area: 'tracking-entry-draft',
      text: draft.title || 'Erfassung',
      status: 'draft',
      extra: JSON.stringify({ identity, values: draft.values || {} }),
      createdAt: existing?.createdAt || updatedAt,
      updatedAt
    });
  }
}

function restoreOpenTrackingDraft(drafts) {
  const dialog = document.getElementById('trackingEntryDialog');
  const box = document.getElementById('trackingEntryFields');
  if (!dialog?.open || !box) return;
  const wrappers = [...box.querySelectorAll('[data-field-id]')];
  const identity = wrappers.map(item => item.dataset.fieldId).filter(Boolean).sort().join('|');
  const draft = drafts[identity];
  if (!draft?.values) return;
  for (const wrapper of wrappers) {
    const parts = draft.values[wrapper.dataset.fieldId];
    if (!parts) continue;
    for (const control of wrapper.querySelectorAll('[data-part]')) {
      if (Object.prototype.hasOwnProperty.call(parts, control.dataset.part)) {
        control.value = String(parts[control.dataset.part] ?? '');
      }
    }
  }
}

function applyTrackingDrafts() {
  const local = loadTrackingDraftsLocal();
  const next = { ...local };

  for (const record of recordsForArea('tracking-entry-draft')) {
    const draft = parseTrackingDraftRecord(record);
    if (!draft.identity) continue;
    const localStamp = String(next[draft.identity]?.updatedAt || '');
    if (localStamp && localStamp > String(record.updatedAt || '')) continue;
    if (record.status === 'cleared') delete next[draft.identity];
    else if (record.status === 'draft') next[draft.identity] = draft;
  }

  saveTrackingDraftsLocal(next);
  restoreOpenTrackingDraft(next);
}

function wireTrackingDrafts() {
  mirrorTrackingDraftsLocal();
  applyTrackingDrafts();

  const fields = document.getElementById('trackingEntryFields');
  const dialog = document.getElementById('trackingEntryDialog');
  if (!fields || !dialog) return;

  const mirror = () => queueMicrotask(mirrorTrackingDraftsLocal);
  fields.addEventListener('input', mirror);
  fields.addEventListener('change', mirror);

  dialog.addEventListener('close', () => {
    queueMicrotask(() => {
      const wrappers = [...fields.querySelectorAll('[data-field-id]')];
      const identity = wrappers.map(item => item.dataset.fieldId).filter(Boolean).sort().join('|');
      if (!identity) return;
      const local = loadTrackingDraftsLocal();
      if (local[identity]) {
        mirrorTrackingDraftsLocal();
        return;
      }
      const id = trackingDraftRecordId(identity);
      const existing = recordById(id);
      if (!existing || existing.status === 'cleared') return;
      upsertCurrent(id, 'tracking-entry-draft', {
        text: '', status: 'cleared', extra: JSON.stringify({ identity })
      });
    });
  });
}

function applyAll() {
  applyQuickDraft();
  applyBreathSettings();
  applyHorizon();
  applyTrackingDrafts();
}

async function push() {
  await replaceTables(userInputStateTables(data.records));
}

export async function syncUserInputState() {
  const tables = await loadTables(userInputStateSheetSpecs);
  const remote = (tables.Nutzereingaben || []).map(userInputRecordFromRow).filter(Boolean);
  data.records = mergeUpdatedById(data.records, remote);
  saveJSON(KEY, data);
  await push();
  applyAll();
}

export function initUserInputStateFeature() {
  registerSync('user-input-state', { push, full: syncUserInputState });
  wireQuickDraft();
  wireBreathSettings();
  wireHorizon();
  wireTrackingDrafts();
}
