import { loadJSON, nowIso, saveJSON, uid } from '../core/storage.js';
import { loadTables, replaceTables } from '../core/google.js';
import { markDirty, registerSync } from '../core/sync.js';
import { mergeUpdatedById } from '../core/collections.js';
import {
  regulationRecordFromRow,
  regulationStateSheetSpecs,
  regulationStateTables
} from './regulation-state-data.js';

export { regulationStateSheetSpecs };

const KEY = 'pace-regulation-state-v1';
const LEGACY_DIRECTION_KEY = 'pace-direction-focus-v1';
const EMPTY = { records: [] };

let data = { ...EMPTY, ...loadJSON(KEY, EMPTY) };
data.records ||= [];
let directionRoot = null;

function persist(sync = true) {
  saveJSON(KEY, data);
  if (sync) markDirty('regulation-state');
}

function toolRecords(tool) {
  return data.records.filter(item => item.tool === tool);
}

function nextOrder(status, exceptId = '') {
  return toolRecords('direction')
    .filter(item => item.status === status && item.id !== exceptId)
    .reduce((max, item) => Math.max(max, Number(item.order || 0)), 0) + 1;
}

function normalizeDirection() {
  const others = data.records.filter(item => item.tool !== 'direction');
  const direction = toolRecords('direction');
  const byText = new Map();

  for (const item of direction) {
    const key = String(item.text || '').trim().toLocaleLowerCase('de-DE');
    if (!key) continue;
    const previous = byText.get(key);
    if (!previous || String(item.updatedAt || '') >= String(previous.updatedAt || '')) byText.set(key, item);
  }

  const normalized = [...byText.values()];
  const nowItems = normalized
    .filter(item => item.status === 'now')
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

  if (nowItems.length > 1) {
    const stamp = nowIso();
    for (const item of nowItems.slice(1)) {
      item.status = 'later';
      item.order = nextOrder('later', item.id);
      item.updatedAt = stamp;
    }
  }

  for (const item of normalized) {
    if (!['now', 'later', 'notToday'].includes(item.status)) item.status = 'later';
  }

  data.records = [...others, ...normalized];
}

function migrateLegacyDirection() {
  if (toolRecords('direction').length) return false;
  const legacy = loadJSON(LEGACY_DIRECTION_KEY, { now: '', later: [], notToday: [] });
  const rows = [];
  const stamp = nowIso();
  let order = 0;

  const add = (text, status) => {
    const value = String(text || '').trim();
    if (!value) return;
    order += 1;
    rows.push({
      id: uid('direction'), tool: 'direction', text: value, status,
      note: '', order, createdAt: stamp, updatedAt: stamp
    });
  };

  add(legacy.now, 'now');
  for (const item of Array.isArray(legacy.later) ? legacy.later : []) add(item, 'later');
  for (const item of Array.isArray(legacy.notToday) ? legacy.notToday : []) add(item, 'notToday');
  if (!rows.length) return false;
  data.records.push(...rows);
  normalizeDirection();
  persist(false);
  return true;
}

function directionItems(status) {
  return toolRecords('direction')
    .filter(item => item.status === status)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function addDirectionItems(values) {
  const existing = new Set(toolRecords('direction').map(item => String(item.text || '').trim().toLocaleLowerCase('de-DE')));
  const stamp = nowIso();
  let order = nextOrder('later');
  let changed = false;

  for (const raw of values) {
    const text = String(raw || '').trim();
    const key = text.toLocaleLowerCase('de-DE');
    if (!text || existing.has(key)) continue;
    existing.add(key);
    data.records.push({
      id: uid('direction'), tool: 'direction', text, status: 'later', note: '',
      order, createdAt: stamp, updatedAt: stamp
    });
    order += 1;
    changed = true;
  }

  if (changed) {
    persist();
    renderDirection();
  }
}

function setDirectionStatus(id, status) {
  const item = data.records.find(entry => entry.id === id && entry.tool === 'direction');
  if (!item || !['now', 'later', 'notToday'].includes(status)) return;
  const stamp = nowIso();

  if (status === 'now') {
    for (const current of toolRecords('direction').filter(entry => entry.status === 'now' && entry.id !== id)) {
      current.status = 'later';
      current.order = nextOrder('later', current.id);
      current.updatedAt = stamp;
    }
    item.order = 0;
  } else {
    item.order = nextOrder(status, item.id);
  }

  item.status = status;
  item.updatedAt = stamp;
  persist();
  renderDirection();
}

function directionItemRow(item, bucket) {
  const row = document.createElement('div');
  row.className = 'direction-item';

  const label = document.createElement('div');
  label.className = 'direction-item-text';
  label.textContent = item.text;

  const actions = document.createElement('div');
  actions.className = 'direction-item-actions';

  const nowButton = document.createElement('button');
  nowButton.type = 'button';
  nowButton.textContent = 'Jetzt';
  nowButton.addEventListener('click', () => setDirectionStatus(item.id, 'now'));
  actions.appendChild(nowButton);

  const otherButton = document.createElement('button');
  otherButton.type = 'button';
  if (bucket === 'later') {
    otherButton.textContent = 'Heute nicht';
    otherButton.addEventListener('click', () => setDirectionStatus(item.id, 'notToday'));
  } else {
    otherButton.textContent = 'Später';
    otherButton.addEventListener('click', () => setDirectionStatus(item.id, 'later'));
  }
  actions.appendChild(otherButton);
  row.append(label, actions);
  return row;
}

function renderDirectionBucket(listEl, items, bucket) {
  if (!listEl) return;
  listEl.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'direction-empty';
    empty.textContent = bucket === 'later' ? 'Nichts abgelegt.' : 'Für heute nichts herausgenommen.';
    listEl.appendChild(empty);
    return;
  }
  for (const item of items) listEl.appendChild(directionItemRow(item, bucket));
}

function renderDirection() {
  if (!directionRoot) return;
  const now = directionItems('now')[0] || null;
  const later = directionItems('later');
  const notToday = directionItems('notToday');
  const nowEl = directionRoot.querySelector('[data-direction-now]');
  const nowActions = directionRoot.querySelector('[data-direction-now-actions]');

  if (now) {
    nowEl.textContent = now.text;
    nowEl.classList.remove('direction-now-empty');
    nowActions.hidden = false;
    directionRoot.querySelector('[data-direction-now-later]').onclick = () => setDirectionStatus(now.id, 'later');
    directionRoot.querySelector('[data-direction-now-not-today]').onclick = () => setDirectionStatus(now.id, 'notToday');
  } else {
    nowEl.textContent = 'Noch nichts ausgewählt';
    nowEl.classList.add('direction-now-empty');
    nowActions.hidden = true;
  }

  directionRoot.querySelector('[data-direction-later-count]').textContent = `(${later.length})`;
  directionRoot.querySelector('[data-direction-not-today-count]').textContent = `(${notToday.length})`;
  renderDirectionBucket(directionRoot.querySelector('[data-direction-later-list]'), later, 'later');
  renderDirectionBucket(directionRoot.querySelector('[data-direction-not-today-list]'), notToday, 'notToday');
}

function upgradeDirectionTool() {
  const oldRoot = document.querySelector('[data-tool-screen="direction"] .direction-tool');
  if (!oldRoot) return;

  const fresh = document.createElement('section');
  fresh.className = 'regulation-card feature-card direction-tool';
  fresh.innerHTML = `
    <p class="regulation-prompt">Eine Sache im Fokus. Der Rest bleibt greifbar.</p>
    <div class="direction-add">
      <label class="regulation-field">
        <span>Was ist gerade alles offen?</span>
        <textarea rows="2" data-direction-input placeholder="Eine Sache pro Zeile"></textarea>
      </label>
      <button type="button" class="secondary-button" data-direction-add>Hinzufügen</button>
    </div>
    <section class="direction-now" aria-live="polite">
      <p class="direction-section-label">Jetzt</p>
      <div class="direction-now-value" data-direction-now></div>
      <div class="direction-now-actions" data-direction-now-actions hidden>
        <button type="button" data-direction-now-later>Später</button>
        <button type="button" data-direction-now-not-today>Heute nicht</button>
      </div>
    </section>
    <details class="direction-bucket" data-direction-later open>
      <summary><span>Später</span><span data-direction-later-count></span></summary>
      <div class="direction-list" data-direction-later-list></div>
    </details>
    <details class="direction-bucket" data-direction-not-today>
      <summary><span>Heute nicht</span><span data-direction-not-today-count></span></summary>
      <div class="direction-list" data-direction-not-today-list></div>
    </details>
  `;

  oldRoot.replaceWith(fresh);
  directionRoot = fresh;
  const input = fresh.querySelector('[data-direction-input]');
  fresh.querySelector('[data-direction-add]').addEventListener('click', () => {
    const values = String(input.value || '').split(/\n+/).map(item => item.trim()).filter(Boolean);
    if (!values.length) return;
    addDirectionItems(values);
    input.value = '';
  });
  renderDirection();
}

function upsertInsurmountable(id, patch) {
  const stamp = nowIso();
  let item = id ? data.records.find(entry => entry.id === id) : null;
  if (!item) {
    item = {
      id: uid('insurmountable'), tool: 'insurmountable', text: '', status: 'draft', note: '',
      order: 0, createdAt: stamp, updatedAt: stamp
    };
    data.records.push(item);
  }
  Object.assign(item, patch, { updatedAt: stamp });
  persist();
  return item.id;
}

function wireInsurmountableTool() {
  const screen = document.querySelector('[data-tool-screen="insurmountable"]');
  const task = screen?.querySelector('[data-insurmountable-task]');
  const prep = screen?.querySelector('[data-insurmountable-prep] input');
  const start = screen?.querySelector('[data-insurmountable-start]');
  if (!task || !prep || !start) return;

  let recordId = '';
  task.addEventListener('input', () => {
    if (!task.value && !recordId) return;
    recordId = upsertInsurmountable(recordId, { text: task.value, status: 'draft' });
  });
  prep.addEventListener('input', () => {
    if (!prep.value && !recordId) return;
    recordId = upsertInsurmountable(recordId, { text: task.value, note: prep.value, status: 'preparing' });
  });
  start.addEventListener('click', () => {
    if (!task.value && !recordId) return;
    recordId = upsertInsurmountable(recordId, { text: task.value, note: prep.value, status: 'preparing' });
  });
}

async function push() {
  await replaceTables(regulationStateTables(data.records));
}

export async function syncRegulationState() {
  const tables = await loadTables(regulationStateSheetSpecs);
  const remote = (tables.Werkzeugdaten || []).map(regulationRecordFromRow).filter(Boolean);
  data.records = mergeUpdatedById(data.records, remote);
  normalizeDirection();
  saveJSON(KEY, data);
  await push();
  renderDirection();
}

export function initRegulationStateFeature() {
  registerSync('regulation-state', { push, full: syncRegulationState });
  const migrated = migrateLegacyDirection();
  upgradeDirectionTool();
  wireInsurmountableTool();
  if (migrated) markDirty('regulation-state');
}
