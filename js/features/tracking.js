import { loadJSON, nowIso, saveJSON, uid } from '../core/storage.js';
import { $, announce, emptyMessage, openDialog, option } from '../core/ui.js';
import { loadTable, replaceTable } from '../core/google.js';
import { markDirty, registerSync } from '../core/sync.js';
import { mergeUpdatedById } from '../core/collections.js';
import {
  CONFIG_HEADERS,
  INPUT_TYPES,
  WRITE_MODES,
  trackingSheetSpecs,
  trackingFromRow,
  trackingRows,
  sortTrackingItems as sortItems
} from './tracking-data.js';
import { buildTrackingWritePlan } from './tracking-domain.js';

export { trackingSheetSpecs, buildTrackingWritePlan };

const KEY = 'pace-tracking-config-v1';

const EMOJI_RECENT_KEY = 'pace-emoji-recent-v1';
const EMOJI_CATEGORIES = {
  Alltag: ['☕','🫖','🥤','💧','🍽️','🛒','🧺','🧹','🛏️','🚿','🪥','🧴','🧻','🗑️','📦','🔑','💳','💶','📞','✉️','📅','⏰','📝','✅'],
  Essen: ['🍎','🍐','🍌','🍊','🍓','🍇','🥝','🥑','🥕','🥗','🍞','🥐','🥚','🧀','🍲','🍝','🍚','🍕','🍰','🍫','🍪','🥜','☕','🍵'],
  Körper: ['❤️','🫀','🧠','🫁','🦷','👁️','👂','💪','🦵','🦶','🩹','💊','🌡️','😴','🛌','🧘','🪥','🧴','🩺','⚖️'],
  Aktivität: ['🚶','🏃','🚴','🏊','🧘','🏋️','🤸','🧗','⚽','🎾','🥾','🌳','☀️','🌧️','🐕','🐾','🎧','🎵','📚','🎮'],
  Arbeit: ['💻','⌨️','🖥️','📱','📞','📧','📝','📌','📎','📁','📊','🧮','🔧','🛠️','💡','🔍','✅','⏳','🚧','🎯'],
  Stimmung: ['🙂','😊','😌','🥰','😐','😕','😟','😢','😭','😣','😫','😴','🤯','😤','😡','🤔','🥱','🫠','✨','🌤️'],
  Orte: ['🏠','🏢','🏥','🏪','🛒','☕','🍽️','🌳','🌲','🏞️','🚗','🚲','🚌','🚆','✈️','🛋️','🛏️','🚿','🧑‍💻','🐕'],
  Symbole: ['✅','❌','➕','➖','⭐','✨','⚠️','❗','❓','❤️','💚','💙','🟡','🔴','🟢','🔵','⬆️','⬇️','➡️','🔁','⏰','📍','🔒','🔓']
};

const EMPTY = { groups: [], fields: [] };
let data = { ...EMPTY, ...loadJSON(KEY, EMPTY) };
data.groups ||= [];
data.fields ||= [];

let editingGroupId = '';
let editingFieldId = '';
let currentEntryFields = [];
let emojiTargetId = '';
let emojiCategory = Object.keys(EMOJI_CATEGORIES)[0];

function loadRecentEmojis() {
  const parsed = loadJSON(EMOJI_RECENT_KEY, []);
  return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 12) : [];
}

function rememberEmoji(emoji) {
  const recent = [emoji, ...loadRecentEmojis().filter(item => item !== emoji)].slice(0, 12);
  saveJSON(EMOJI_RECENT_KEY, recent);
}

function emojiButton(emoji) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'emoji-choice';
  button.textContent = emoji;
  button.setAttribute('role', 'option');
  button.setAttribute('aria-label', `Emoji ${emoji}`);
  button.addEventListener('click', () => chooseEmoji(emoji));
  return button;
}

function renderEmojiPicker() {
  const tabs = $('emojiCategoryTabs');
  const grid = $('emojiPickerGrid');
  const recentSection = $('emojiRecentSection');
  const recentGrid = $('emojiRecentGrid');
  if (!tabs || !grid || !recentSection || !recentGrid) return;

  tabs.innerHTML = '';
  for (const name of Object.keys(EMOJI_CATEGORIES)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `emoji-category${name === emojiCategory ? ' active' : ''}`;
    button.textContent = name;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(name === emojiCategory));
    button.addEventListener('click', () => {
      emojiCategory = name;
      renderEmojiPicker();
    });
    tabs.appendChild(button);
  }

  grid.innerHTML = '';
  for (const emoji of EMOJI_CATEGORIES[emojiCategory] || []) grid.appendChild(emojiButton(emoji));

  const recent = loadRecentEmojis();
  recentGrid.innerHTML = '';
  recentSection.hidden = recent.length === 0;
  for (const emoji of recent) recentGrid.appendChild(emojiButton(emoji));
}

function openEmojiPicker(targetId) {
  emojiTargetId = targetId;
  renderEmojiPicker();
  openDialog('emojiPickerDialog');
}

function chooseEmoji(emoji) {
  const target = $(emojiTargetId);
  if (!target) return;
  target.value = emoji;
  target.dispatchEvent(new Event('input', { bubbles: true }));
  rememberEmoji(emoji);
  $('emojiPickerDialog').close();
  target.focus();
}

function clearEmoji() {
  const target = $(emojiTargetId);
  if (!target) return;
  target.value = '';
  $('emojiPickerDialog').close();
  target.focus();
}

function activeGroups() {
  return data.groups.filter(item => item.status !== 'archived').sort(sortItems);
}

function activeFields() {
  return data.fields.filter(item => item.status !== 'archived').sort(sortItems);
}

function persist(sync = true) {
  saveJSON(KEY, data);
  renderAll();
  if (sync) markDirty('tracking');
}

async function pushTrackingConfig() {
  await replaceTable('ErfassungKonfig', CONFIG_HEADERS, trackingRows(data));
}

export async function syncTrackingConfig() {
  const rows = await loadTable('ErfassungKonfig', CONFIG_HEADERS);
  const remote = rows.map(trackingFromRow);
  data.groups = mergeUpdatedById(data.groups, remote.filter(item => item.kind === 'group'));
  data.fields = mergeUpdatedById(data.fields, remote.filter(item => item.kind === 'field'));
  saveJSON(KEY, data);
  await pushTrackingConfig();
  renderAll();
}

function nextOrder(items) {
  return items.length ? Math.max(...items.map(item => Number(item.order || 0))) + 10 : 10;
}

function groupName(id) {
  return data.groups.find(group => group.id === id && group.status !== 'archived')?.title || '';
}

function renderQuickActions() {
  const box = $('trackingQuickActions');
  const summary = $('trackingSummary');
  if (!box || !summary) return;
  box.innerHTML = '';

  const groups = activeGroups();
  const fields = activeFields();
  const groupedIds = new Set();

  for (const group of groups) {
    const members = fields.filter(field => field.groupId === group.id);
    if (!members.length) continue;
    members.forEach(field => groupedIds.add(field.id));
    box.appendChild(actionButton(group.icon, group.title, members.length === 1 ? '1 Feld' : `${members.length} Felder`, () => openEntry(group.title, group.icon, members)));
  }

  for (const field of fields.filter(item => !groupedIds.has(item.id))) {
    box.appendChild(actionButton(field.icon, field.title, INPUT_TYPES[field.inputType] || field.inputType, () => openEntry(field.title, field.icon, [field])));
  }

  const count = fields.length;
  summary.textContent = count
    ? `${count} Erfassungsfeld${count === 1 ? '' : 'er'} konfiguriert. Das Schreiben in die bestehende Tracking-Tabelle wird erst mit der späteren Picker-Anbindung aktiviert.`
    : 'Noch keine Erfassungsfelder konfiguriert. Die bestehende Tracking-Tabelle wird noch nicht verändert.';
}

function actionButton(icon, title, meta, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tracking-action';
  const iconEl = document.createElement('span');
  iconEl.className = 'tracking-action-icon';
  iconEl.textContent = icon || '＋';
  const copy = document.createElement('span');
  copy.className = 'tracking-action-copy';
  const strong = document.createElement('strong');
  strong.textContent = title;
  const small = document.createElement('small');
  small.textContent = meta;
  copy.append(strong, small);
  button.append(iconEl, copy);
  button.addEventListener('click', handler);
  return button;
}

function renderGroupList() {
  const box = $('trackingGroupList');
  if (!box) return;
  box.innerHTML = '';
  const groups = activeGroups();
  if (!groups.length) {
    box.appendChild(emptyMessage('Noch keine Gruppen. Felder können auch ohne Gruppe existieren.'));
    return;
  }

  for (const group of groups) {
    const count = activeFields().filter(field => field.groupId === group.id).length;
    const card = document.createElement('article');
    card.className = 'tracking-config-card';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = `${group.icon ? `${group.icon} ` : ''}${group.title}`;
    const meta = document.createElement('small');
    meta.textContent = `${count} Feld${count === 1 ? '' : 'er'} · Reihenfolge ${group.order || 0}`;
    copy.append(title, meta);
    const actions = document.createElement('div');
    actions.append(
      tinyButton('Bearbeiten', () => editGroup(group.id)),
      tinyButton('Archivieren', () => archiveGroup(group.id))
    );
    card.append(copy, actions);
    box.appendChild(card);
  }
}

function renderFieldList() {
  const box = $('trackingFieldList');
  if (!box) return;
  box.innerHTML = '';
  const fields = activeFields();
  if (!fields.length) {
    box.appendChild(emptyMessage('Noch keine Felder konfiguriert.'));
    return;
  }

  for (const field of fields) {
    const card = document.createElement('article');
    card.className = 'tracking-config-card';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = `${field.icon ? `${field.icon} ` : ''}${field.title}`;
    const meta = document.createElement('small');
    const target = field.sheetTab && field.columnId ? `${field.sheetTab} · ID ${field.columnId}` : 'Ziel noch unvollständig';
    const group = groupName(field.groupId);
    meta.textContent = [group, target, INPUT_TYPES[field.inputType], WRITE_MODES[field.writeMode]].filter(Boolean).join(' · ');
    copy.append(title, meta);
    const actions = document.createElement('div');
    actions.append(
      tinyButton('Bearbeiten', () => editField(field.id)),
      tinyButton('Archivieren', () => archiveField(field.id))
    );
    card.append(copy, actions);
    box.appendChild(card);
  }
}

function tinyButton(label, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tiny-button';
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function refreshGroupSelect(selected = '') {
  const select = $('trackingFieldGroup');
  if (!select) return;
  select.innerHTML = '';
  select.appendChild(option('', 'Keine Gruppe'));
  for (const group of activeGroups()) select.appendChild(option(group.id, `${group.icon ? `${group.icon} ` : ''}${group.title}`));
  select.value = selected;
}

function renderAll() {
  renderQuickActions();
  renderGroupList();
  renderFieldList();
  if (!editingFieldId) refreshGroupSelect('');
}

function clearGroupForm() {
  editingGroupId = '';
  $('trackingGroupForm')?.reset();
  if ($('trackingGroupOrder')) $('trackingGroupOrder').value = String(nextOrder(activeGroups()));
  if ($('trackingGroupSubmit')) $('trackingGroupSubmit').textContent = 'Gruppe anlegen';
  if ($('trackingGroupCancel')) $('trackingGroupCancel').hidden = true;
}

function clearFieldForm() {
  editingFieldId = '';
  $('trackingFieldForm')?.reset();
  refreshGroupSelect('');
  if ($('trackingFieldOrder')) $('trackingFieldOrder').value = String(nextOrder(activeFields()));
  if ($('trackingFieldInputType')) $('trackingFieldInputType').value = 'text';
  if ($('trackingFieldWriteMode')) $('trackingFieldWriteMode').value = 'append_newline';
  if ($('trackingFieldSubmit')) $('trackingFieldSubmit').textContent = 'Feld anlegen';
  if ($('trackingFieldCancel')) $('trackingFieldCancel').hidden = true;
}

function editGroup(id) {
  const group = data.groups.find(item => item.id === id);
  if (!group) return;
  editingGroupId = id;
  $('trackingGroupTitle').value = group.title;
  $('trackingGroupIcon').value = group.icon || '';
  $('trackingGroupOrder').value = String(group.order || 0);
  $('trackingGroupSubmit').textContent = 'Gruppe speichern';
  $('trackingGroupCancel').hidden = false;
  $('trackingGroupTitle').focus();
}

function editField(id) {
  const field = data.fields.find(item => item.id === id);
  if (!field) return;
  editingFieldId = id;
  $('trackingFieldTitle').value = field.title;
  $('trackingFieldIcon').value = field.icon || '';
  refreshGroupSelect(field.groupId || '');
  $('trackingFieldSheetTab').value = field.sheetTab || '';
  $('trackingFieldColumnId').value = field.columnId || '';
  $('trackingFieldInputType').value = field.inputType || 'text';
  $('trackingFieldWriteMode').value = field.writeMode || 'append_newline';
  $('trackingFieldOrder').value = String(field.order || 0);
  $('trackingFieldSubmit').textContent = 'Feld speichern';
  $('trackingFieldCancel').hidden = false;
  $('trackingFieldTitle').focus();
}

function archiveGroup(id) {
  const group = data.groups.find(item => item.id === id);
  if (!group) return;
  group.status = 'archived';
  group.updatedAt = nowIso();
  for (const field of data.fields.filter(item => item.groupId === id && item.status !== 'archived')) {
    field.groupId = '';
    field.updatedAt = nowIso();
  }
  if (editingGroupId === id) clearGroupForm();
  persist();
}

function archiveField(id) {
  const field = data.fields.find(item => item.id === id);
  if (!field) return;
  field.status = 'archived';
  field.updatedAt = nowIso();
  if (editingFieldId === id) clearFieldForm();
  persist();
}

function submitGroup(event) {
  event.preventDefault();
  const title = $('trackingGroupTitle').value.trim();
  if (!title) return;
  const old = data.groups.find(item => item.id === editingGroupId);
  const group = old || { id: uid('trackgroup'), kind: 'group', status: 'active' };
  Object.assign(group, {
    title,
    icon: $('trackingGroupIcon').value.trim(),
    order: Number($('trackingGroupOrder').value || 0),
    updatedAt: nowIso()
  });
  if (!old) data.groups.push(group);
  clearGroupForm();
  persist();
  announce('Erfassungsgruppe gespeichert.', 'good');
}

function submitField(event) {
  event.preventDefault();
  const title = $('trackingFieldTitle').value.trim();
  if (!title) return;
  const old = data.fields.find(item => item.id === editingFieldId);
  const field = old || { id: uid('trackfield'), kind: 'field', status: 'active' };
  Object.assign(field, {
    title,
    icon: $('trackingFieldIcon').value.trim(),
    groupId: $('trackingFieldGroup').value,
    sheetTab: $('trackingFieldSheetTab').value.trim(),
    columnId: $('trackingFieldColumnId').value.trim(),
    inputType: $('trackingFieldInputType').value,
    writeMode: $('trackingFieldWriteMode').value,
    order: Number($('trackingFieldOrder').value || 0),
    updatedAt: nowIso()
  });
  if (!old) data.fields.push(field);
  clearFieldForm();
  persist();
  announce('Erfassungsfeld gespeichert.', 'good');
}

function currentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function inputControl(field) {
  const wrapper = document.createElement('label');
  wrapper.className = 'tracking-entry-field';
  const title = document.createElement('span');
  title.textContent = `${field.icon ? `${field.icon} ` : ''}${field.title}`;
  wrapper.appendChild(title);

  if (field.inputType === 'time_text') {
    const row = document.createElement('div');
    row.className = 'tracking-time-text';
    const time = document.createElement('input');
    time.type = 'time';
    time.value = currentTime();
    time.dataset.part = 'time';
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.placeholder = 'Text';
    textInput.dataset.part = 'text';
    row.append(time, textInput);
    wrapper.appendChild(row);
  } else if (field.inputType === 'time') {
    const input = document.createElement('input');
    input.type = 'time';
    input.value = currentTime();
    input.dataset.part = 'value';
    wrapper.appendChild(input);
  } else if (field.inputType === 'number') {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    input.inputMode = 'decimal';
    input.dataset.part = 'value';
    wrapper.appendChild(input);
  } else if (field.inputType === 'yes_no') {
    const select = document.createElement('select');
    select.dataset.part = 'value';
    select.append(option('', '–'), option('Ja', 'Ja'), option('Nein', 'Nein'));
    wrapper.appendChild(select);
  } else {
    const input = document.createElement('input');
    input.type = 'text';
    input.dataset.part = 'value';
    wrapper.appendChild(input);
  }

  const target = document.createElement('small');
  target.className = 'tracking-target';
  target.textContent = field.sheetTab && field.columnId
    ? `Ziel: ${field.sheetTab} · Spalten-ID ${field.columnId}`
    : 'Ziel noch nicht vollständig konfiguriert';
  wrapper.appendChild(target);
  wrapper.dataset.fieldId = field.id;
  return wrapper;
}

function openEntry(title, icon, fields) {
  currentEntryFields = [...fields].sort(sortItems);
  $('trackingEntryTitle').textContent = `${icon ? `${icon} ` : ''}${title}`;
  $('trackingEntryFields').innerHTML = '';
  $('trackingWritePreview').innerHTML = '';
  $('trackingWritePreview').hidden = true;
  for (const field of currentEntryFields) $('trackingEntryFields').appendChild(inputControl(field));
  openDialog('trackingEntryDialog');
}

function readEntryValue(field) {
  const wrapper = [...$('trackingEntryFields').querySelectorAll('[data-field-id]')].find(el => el.dataset.fieldId === field.id);
  if (!wrapper) return '';
  if (field.inputType === 'time_text') {
    const time = wrapper.querySelector('[data-part="time"]')?.value.trim() || '';
    const text = wrapper.querySelector('[data-part="text"]')?.value.trim() || '';
    return [time, text].filter(Boolean).join(' ');
  }
  return wrapper.querySelector('[data-part="value"]')?.value.trim() || '';
}

function previewEntry(event) {
  event.preventDefault();
  const values = Object.fromEntries(currentEntryFields.map(field => [field.id, readEntryValue(field)]));
  const plan = buildTrackingWritePlan(currentEntryFields, values);
  const box = $('trackingWritePreview');
  box.innerHTML = '';
  box.hidden = false;

  if (!plan.length) {
    box.appendChild(emptyMessage('Noch keine Eingabe.'));
    return;
  }

  const incomplete = plan.filter(item => !item.sheetTab || !item.columnId);
  if (incomplete.length) {
    const warning = document.createElement('p');
    warning.className = 'tracking-preview-warning';
    warning.textContent = 'Mindestens ein Ziel ist noch nicht vollständig konfiguriert.';
    box.appendChild(warning);
  }

  for (const item of plan) {
    const row = document.createElement('div');
    row.className = 'tracking-preview-row';
    const strong = document.createElement('strong');
    strong.textContent = item.title;
    const target = document.createElement('small');
    target.textContent = item.sheetTab && item.columnId
      ? `${item.sheetTab} · ID ${item.columnId} · ${WRITE_MODES[item.writeMode] || item.writeMode}`
      : 'Ziel fehlt';
    const value = document.createElement('code');
    value.textContent = item.value;
    row.append(strong, target, value);
    box.appendChild(row);
  }
}

export function initTrackingFeature() {
  registerSync('tracking', { push: pushTrackingConfig, full: syncTrackingConfig });
  renderAll();

  $('openTrackingConfig').addEventListener('click', () => {
    clearGroupForm();
    clearFieldForm();
    renderAll();
    openDialog('trackingConfigDialog');
  });

  $('trackingGroupForm').addEventListener('submit', submitGroup);
  $('trackingGroupCancel').addEventListener('click', clearGroupForm);
  $('trackingFieldForm').addEventListener('submit', submitField);
  $('trackingFieldCancel').addEventListener('click', clearFieldForm);
  $('trackingEntryForm').addEventListener('submit', previewEntry);
  document.querySelectorAll('.emoji-picker-open').forEach(button => {
    button.addEventListener('click', () => openEmojiPicker(button.dataset.emojiTarget));
  });
  $('emojiClear').addEventListener('click', clearEmoji);

  clearGroupForm();
  clearFieldForm();
}

export function getTrackingConfig() {
  return structuredClone(data);
}
