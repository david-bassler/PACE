import { loadJSON, nowIso, saveJSON, uid } from '../core/storage.js';
import { announce, emptyMessage } from '../core/ui.js';
import { loadTable, replaceTable } from '../core/google.js';
import { markDirty, registerSync } from '../core/sync.js';
import { mergeUpdatedById } from '../core/collections.js';

const KEY = 'pace-tracking-actions-v1';
const SYNC_NAME = 'tracking-actions';

export const ACTION_HEADERS = [
  'ID', 'TriggerFeldID', 'Bedingung', 'Bedingungswert',
  'ZielTabellenblatt', 'ZielSpaltenID', 'Operation', 'Wert',
  'Reihenfolge', 'Status', 'Aktualisiert'
];

export const trackingActionSheetSpecs = {
  ErfassungAktionen: ACTION_HEADERS
};

export const TRACKING_ACTION_OPERATIONS = {
  add_number: 'Zahl addieren',
  replace: 'Wert setzen / ersetzen',
  append_newline: 'Text anhängen'
};

export const TRACKING_ACTION_CONDITIONS = {
  nonempty: 'wenn das Feld gespeichert wird',
  equals: 'nur wenn die Eingabe genau entspricht'
};

const EMPTY = { actions: [] };
let data = normalizeData(loadJSON(KEY, EMPTY));
let getTrackingConfigProvider = () => ({ fields: [] });
let editingId = '';
let root = null;

function normalizeAction(raw = {}) {
  return {
    id: String(raw.id || uid('tracking-action')),
    triggerFieldId: String(raw.triggerFieldId || '').trim(),
    condition: raw.condition === 'equals' ? 'equals' : 'nonempty',
    conditionValue: String(raw.conditionValue || ''),
    sheetTab: String(raw.sheetTab || '').trim(),
    columnId: String(raw.columnId ?? '').trim(),
    operation: Object.hasOwn(TRACKING_ACTION_OPERATIONS, raw.operation) ? raw.operation : 'replace',
    value: String(raw.value ?? ''),
    order: Number(raw.order || 0),
    status: raw.status === 'archived' ? 'archived' : 'active',
    updatedAt: raw.updatedAt || nowIso()
  };
}

function normalizeData(value) {
  const actions = Array.isArray(value?.actions) ? value.actions : [];
  return { actions: actions.map(normalizeAction) };
}

function actionFromRow(row = []) {
  return normalizeAction({
    id: row[0],
    triggerFieldId: row[1],
    condition: row[2],
    conditionValue: row[3],
    sheetTab: row[4],
    columnId: row[5],
    operation: row[6],
    value: row[7],
    order: row[8],
    status: row[9],
    updatedAt: row[10]
  });
}

function actionToRow(action) {
  return [
    action.id,
    action.triggerFieldId,
    action.condition,
    action.conditionValue || '',
    action.sheetTab,
    action.columnId,
    action.operation,
    action.value,
    Number(action.order || 0),
    action.status || 'active',
    action.updatedAt || nowIso()
  ];
}

function sortedActions(actions = data.actions) {
  return [...actions].sort((a, b) =>
    Number(a.order || 0) - Number(b.order || 0) || String(a.id).localeCompare(String(b.id), 'de')
  );
}

export function getTrackingActions({ includeArchived = false } = {}) {
  const actions = includeArchived ? data.actions : data.actions.filter(item => item.status !== 'archived');
  return structuredClone(sortedActions(actions));
}

function activeFields() {
  return (getTrackingConfigProvider()?.fields || [])
    .filter(field => field.status !== 'archived')
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.title).localeCompare(String(b.title), 'de'));
}

function fieldTitle(id) {
  return activeFields().find(field => field.id === id)?.title || id || 'Unbekanntes Feld';
}

function persist(sync = true) {
  saveJSON(KEY, data);
  render();
  if (sync) markDirty(SYNC_NAME);
}

async function push() {
  await replaceTable('ErfassungAktionen', ACTION_HEADERS, sortedActions().map(actionToRow));
}

async function syncTrackingActions() {
  const rows = await loadTable('ErfassungAktionen', ACTION_HEADERS);
  const remote = (rows || []).map(actionFromRow);
  data.actions = mergeUpdatedById(data.actions, remote).map(normalizeAction);
  saveJSON(KEY, data);
  await push();
  render();
}

function nextOrder() {
  const highest = data.actions.reduce((max, item) => Math.max(max, Number(item.order || 0)), 0);
  return highest + 10;
}

function selectOption(value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function updateTriggerOptions(select, selected = '') {
  if (!select) return;
  select.replaceChildren();
  select.appendChild(selectOption('', 'Feld wählen'));
  for (const field of activeFields()) select.appendChild(selectOption(field.id, `${field.icon || ''} ${field.title}`.trim()));
  select.value = selected;
}

function updateConditionUI() {
  if (!root) return;
  const condition = root.querySelector('[name="trackingActionCondition"]')?.value || 'nonempty';
  const wrap = root.querySelector('[data-action-condition-value-wrap]');
  const input = root.querySelector('[name="trackingActionConditionValue"]');
  if (wrap) wrap.hidden = condition !== 'equals';
  if (input) input.required = condition === 'equals';
}

function clearForm() {
  if (!root) return;
  editingId = '';
  const form = root.querySelector('[data-tracking-action-form]');
  form?.reset();
  updateTriggerOptions(root.querySelector('[name="trackingActionTrigger"]'));
  const order = root.querySelector('[name="trackingActionOrder"]');
  if (order) order.value = String(nextOrder());
  const submit = root.querySelector('[data-tracking-action-submit]');
  if (submit) submit.textContent = 'Folgeaktion anlegen';
  const cancel = root.querySelector('[data-tracking-action-cancel]');
  if (cancel) cancel.hidden = true;
  updateConditionUI();
}

function editAction(id) {
  if (!root) return;
  const action = data.actions.find(item => item.id === id);
  if (!action) return;
  editingId = id;
  updateTriggerOptions(root.querySelector('[name="trackingActionTrigger"]'), action.triggerFieldId);
  root.querySelector('[name="trackingActionCondition"]').value = action.condition;
  root.querySelector('[name="trackingActionConditionValue"]').value = action.conditionValue || '';
  root.querySelector('[name="trackingActionSheetTab"]').value = action.sheetTab;
  root.querySelector('[name="trackingActionColumnId"]').value = action.columnId;
  root.querySelector('[name="trackingActionOperation"]').value = action.operation;
  root.querySelector('[name="trackingActionValue"]').value = action.value;
  root.querySelector('[name="trackingActionOrder"]').value = String(action.order || 0);
  root.querySelector('[data-tracking-action-submit]').textContent = 'Folgeaktion speichern';
  root.querySelector('[data-tracking-action-cancel]').hidden = false;
  updateConditionUI();
  root.querySelector('[name="trackingActionTrigger"]')?.focus();
}

function actionDescription(action) {
  const trigger = fieldTitle(action.triggerFieldId);
  const condition = action.condition === 'equals'
    ? `wenn Eingabe = „${action.conditionValue}“`
    : 'wenn gespeichert';
  const operation = TRACKING_ACTION_OPERATIONS[action.operation] || action.operation;
  return `${trigger} · ${condition} → ${action.sheetTab} · ID ${action.columnId} · ${operation}: ${action.value}`;
}

function renderList() {
  if (!root) return;
  const list = root.querySelector('[data-tracking-action-list]');
  if (!list) return;
  list.replaceChildren();
  const actions = sortedActions();
  if (!actions.length) {
    list.appendChild(emptyMessage('Noch keine zusätzlichen Schreibaktionen konfiguriert.'));
    return;
  }

  for (const action of actions) {
    const card = document.createElement('article');
    card.className = 'tracking-config-card';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = action.status === 'archived' ? `${fieldTitle(action.triggerFieldId)} · archiviert` : fieldTitle(action.triggerFieldId);
    const meta = document.createElement('small');
    meta.textContent = actionDescription(action);
    copy.append(title, meta);

    const buttons = document.createElement('div');
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'tiny-button';
    edit.textContent = 'Bearbeiten';
    edit.addEventListener('click', () => editAction(action.id));

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'tiny-button';
    toggle.textContent = action.status === 'archived' ? 'Aktivieren' : 'Archivieren';
    toggle.addEventListener('click', () => {
      action.status = action.status === 'archived' ? 'active' : 'archived';
      action.updatedAt = nowIso();
      persist();
    });

    buttons.append(edit, toggle);
    card.append(copy, buttons);
    list.appendChild(card);
  }
}

function render() {
  if (!root) return;
  const trigger = root.querySelector('[name="trackingActionTrigger"]');
  const selected = trigger?.value || '';
  updateTriggerOptions(trigger, selected);
  renderList();
  updateConditionUI();
}

function numericLiteral(value) {
  const normalized = String(value || '').trim().replace(',', '.');
  return /^[+-]?\d+(?:\.\d+)?$/.test(normalized) && Number.isFinite(Number(normalized));
}

function submit(event) {
  event.preventDefault();
  if (!root) return;
  const triggerFieldId = root.querySelector('[name="trackingActionTrigger"]').value;
  const condition = root.querySelector('[name="trackingActionCondition"]').value === 'equals' ? 'equals' : 'nonempty';
  const conditionValue = root.querySelector('[name="trackingActionConditionValue"]').value.trim();
  const sheetTab = root.querySelector('[name="trackingActionSheetTab"]').value.trim();
  const columnId = root.querySelector('[name="trackingActionColumnId"]').value.trim();
  const operation = root.querySelector('[name="trackingActionOperation"]').value;
  const value = root.querySelector('[name="trackingActionValue"]').value.trim();
  const order = Number(root.querySelector('[name="trackingActionOrder"]').value || 0);

  if (!triggerFieldId || !sheetTab || !columnId || !value) {
    announce('Triggerfeld, Ziel-Tabellenblatt, Ziel-Spalten-ID und Wert sind erforderlich.', 'bad');
    return;
  }
  if (condition === 'equals' && !conditionValue) {
    announce('Für die Bedingung „genau entspricht“ fehlt der Vergleichswert.', 'bad');
    return;
  }
  if (operation === 'add_number' && !numericLiteral(value)) {
    announce('Für „Zahl addieren“ muss der Wert eine Zahl sein.', 'bad');
    return;
  }

  const old = data.actions.find(item => item.id === editingId);
  const action = old || { id: uid('tracking-action'), status: 'active' };
  Object.assign(action, {
    triggerFieldId,
    condition,
    conditionValue: condition === 'equals' ? conditionValue : '',
    sheetTab,
    columnId,
    operation,
    value,
    order,
    updatedAt: nowIso()
  });
  if (!old) data.actions.push(action);
  persist();
  clearForm();
  announce('Zusätzliche Schreibaktion gespeichert.', 'good');
}

function createUI() {
  const dialog = document.querySelector('#trackingConfigDialog');
  const container = dialog?.querySelector(':scope > div');
  if (!container || container.querySelector('[data-tracking-actions-root]')) {
    root = container?.querySelector('[data-tracking-actions-root]') || null;
    return;
  }

  const section = document.createElement('section');
  section.className = 'dialog-section';
  section.dataset.trackingActionsRoot = 'true';
  section.innerHTML = `
    <h3>Zusätzliche Schreibaktionen</h3>
    <p class="hint">Wenn ein Erfassungsfeld gespeichert wird, kann PACE in derselben Operation weitere Zellen verändern. Ziele werden immer über Tabellenblatt + stabile Spalten-ID angegeben.</p>
    <div class="tracking-config-list" data-tracking-action-list></div>
    <form class="stack-form" data-tracking-action-form>
      <label><span>Auslösendes Feld</span><select name="trackingActionTrigger" required></select></label>
      <label><span>Wann?</span><select name="trackingActionCondition"><option value="nonempty">wenn das Feld gespeichert wird</option><option value="equals">nur wenn die Eingabe genau entspricht</option></select></label>
      <label data-action-condition-value-wrap hidden><span>Vergleichswert</span><input name="trackingActionConditionValue" maxlength="1000"></label>
      <label><span>Ziel-Tabellenblatt</span><input name="trackingActionSheetTab" maxlength="180" value="Tage" required></label>
      <label><span>Ziel-Spalten-ID</span><input name="trackingActionColumnId" maxlength="80" inputmode="numeric" required></label>
      <label><span>Operation</span><select name="trackingActionOperation"><option value="add_number">Zahl addieren</option><option value="replace">Wert setzen / ersetzen</option><option value="append_newline">Text anhängen</option></select></label>
      <label><span>Wert</span><input name="trackingActionValue" maxlength="1000" required></label>
      <label><span>Reihenfolge</span><input name="trackingActionOrder" type="number" step="1" value="10"></label>
      <div class="form-actions"><button class="primary-button" data-tracking-action-submit type="submit">Folgeaktion anlegen</button><button class="secondary-button" data-tracking-action-cancel type="button" hidden>Abbrechen</button></div>
    </form>
  `;
  container.appendChild(section);
  root = section;

  root.querySelector('[data-tracking-action-form]')?.addEventListener('submit', submit);
  root.querySelector('[data-tracking-action-cancel]')?.addEventListener('click', clearForm);
  root.querySelector('[name="trackingActionCondition"]')?.addEventListener('change', updateConditionUI);
  clearForm();
  render();
}

export function initTrackingActionsFeature({ getTrackingConfig } = {}) {
  if (typeof getTrackingConfig === 'function') getTrackingConfigProvider = getTrackingConfig;
  createUI();
  registerSync(SYNC_NAME, { push, full: syncTrackingActions });
  document.querySelector('#openTrackingConfig')?.addEventListener('click', () => {
    window.requestAnimationFrame(render);
  });
}
