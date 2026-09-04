import { loadJSON, nowIso, saveJSON, uid } from '../core/storage.js';
import { $, announce, emptyMessage, openDialog, option } from '../core/ui.js';
import { isConnected, loadTable, replaceTable } from '../core/google.js';

const KEY = 'pace-progress-v1';
const AREA_HEADERS = ['ID','Name','Warum','Wunschzustand','IstStand','Ressourcen','Status','Aktualisiert'];
const ITEM_HEADERS = ['ID','Typ','Text','Details','ZielbereichIDs','ElternIDs','Status','Aktualisiert'];

export const progressSheetSpecs = {
  Zielbereiche: AREA_HEADERS,
  Fortschritt: ITEM_HEADERS
};

const EMPTY = { areas: [], items: [] };
let data = loadJSON(KEY, EMPTY);
let editingAreaId = '';
let editingItemId = '';
let syncTimer = null;

function splitIds(value) {
  return String(value || '').split(';').map(v => v.trim()).filter(Boolean);
}
function joinIds(values) { return [...new Set(values.filter(Boolean))].join(';'); }

function areaFromRow(row) {
  return { id: row[0] || uid('area'), name: row[1] || '', why: row[2] || '', desired: row[3] || '', current: row[4] || '', resources: row[5] || '', status: row[6] || 'active', updatedAt: row[7] || nowIso() };
}
function areaToRow(area) {
  return [area.id, area.name, area.why, area.desired, area.current, area.resources, area.status, area.updatedAt];
}
function itemFromRow(row) {
  return { id: row[0] || uid('progress'), type: row[1] || 'Aufgabe', text: row[2] || '', details: row[3] || '', areaIds: splitIds(row[4]), parentIds: splitIds(row[5]), status: row[6] || 'active', updatedAt: row[7] || nowIso() };
}
function itemToRow(item) {
  return [item.id, item.type, item.text, item.details, joinIds(item.areaIds || []), joinIds(item.parentIds || []), item.status, item.updatedAt];
}

function mergeById(local, remote) {
  const map = new Map();
  for (const item of [...remote, ...local]) {
    const old = map.get(item.id);
    if (!old || String(item.updatedAt || '') >= String(old.updatedAt || '')) map.set(item.id, item);
  }
  return [...map.values()];
}

function persist(sync = true) {
  saveJSON(KEY, data);
  renderProgress();
  if (sync) scheduleSync();
}

function scheduleSync() {
  clearTimeout(syncTimer);
  if (isConnected()) syncTimer = setTimeout(() => pushProgress().catch(error => announce(error.message, 'bad')), 800);
}

async function pushProgress() {
  await Promise.all([
    replaceTable('Zielbereiche', AREA_HEADERS, data.areas.map(areaToRow)),
    replaceTable('Fortschritt', ITEM_HEADERS, data.items.map(itemToRow))
  ]);
}

export async function syncProgress() {
  if (!isConnected()) return;
  const [areaRows, itemRows] = await Promise.all([
    loadTable('Zielbereiche', AREA_HEADERS),
    loadTable('Fortschritt', ITEM_HEADERS)
  ]);
  data = {
    areas: mergeById(data.areas, areaRows.map(areaFromRow)),
    items: mergeById(data.items, itemRows.map(itemFromRow))
  };
  saveJSON(KEY, data);
  await pushProgress();
  renderProgress();
}

function activeAreas() { return data.areas.filter(area => area.status !== 'archived'); }
function activeItems() { return data.items.filter(item => item.status !== 'archived'); }

function renderOverview() {
  const areaCount = activeAreas().length;
  const openActions = activeItems().filter(item => ['Aufgabe','Anweisung'].includes(item.type)).length;
  $('progressOverview').textContent = areaCount
    ? `${areaCount} Zielbereich${areaCount === 1 ? '' : 'e'} · ${openActions} konkrete nächste Möglichkeit${openActions === 1 ? '' : 'en'}`
    : 'Noch keine Zielbereiche angelegt. Die Lebenslandkarte bleibt vollständig deine.';
}

function renderAreaList() {
  const box = $('areaList');
  box.innerHTML = '';
  const areas = activeAreas();
  if (!areas.length) {
    box.appendChild(emptyMessage('Noch keine Zielbereiche. Ein Bereich bekommt einen Sitz am Tisch, wenn er langfristig nicht auf null fallen soll.'));
    return;
  }
  for (const area of areas) {
    const card = document.createElement('article');
    card.className = 'map-card';
    const head = document.createElement('div');
    head.className = 'map-card-head';
    const title = document.createElement('h3');
    title.textContent = area.name;
    const actions = document.createElement('div');
    const edit = document.createElement('button');
    edit.type = 'button'; edit.className = 'tiny-button'; edit.textContent = 'Bearbeiten';
    edit.addEventListener('click', () => editArea(area.id));
    const archive = document.createElement('button');
    archive.type = 'button'; archive.className = 'tiny-button'; archive.textContent = 'Archivieren';
    archive.addEventListener('click', () => { area.status = 'archived'; area.updatedAt = nowIso(); persist(); });
    actions.append(edit, archive);
    head.append(title, actions);
    card.appendChild(head);
    if (area.why) card.appendChild(detailLine('Warum', area.why));
    if (area.current) card.appendChild(detailLine('Ist', area.current));
    if (area.desired) card.appendChild(detailLine('Richtung', area.desired));
    if (area.resources) card.appendChild(detailLine('Darf beanspruchen', area.resources));
    const related = activeItems().filter(item => item.areaIds?.includes(area.id));
    if (related.length) {
      const chips = document.createElement('div'); chips.className = 'chip-row';
      related.slice(0, 6).forEach(item => {
        const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = `${item.type}: ${item.text}`; chips.appendChild(chip);
      });
      card.appendChild(chips);
    }
    box.appendChild(card);
  }
}

function detailLine(label, value) {
  const p = document.createElement('p'); p.className = 'map-detail';
  const strong = document.createElement('strong'); strong.textContent = `${label}: `;
  p.append(strong, document.createTextNode(value));
  return p;
}

function renderItemList() {
  const box = $('progressItemList');
  box.innerHTML = '';
  const items = activeItems();
  if (!items.length) {
    box.appendChild(emptyMessage('Ziele, Meilensteine, Aufgaben und Anweisungen sind optional. Lege nur an, was dir tatsächlich Orientierung gibt.'));
    return;
  }
  const order = ['Ziel','Meilenstein','Aufgabe','Anweisung'];
  for (const type of order) {
    const group = items.filter(item => item.type === type);
    if (!group.length) continue;
    const h = document.createElement('h3'); h.className = 'list-heading'; h.textContent = type; box.appendChild(h);
    for (const item of group) {
      const row = document.createElement('div'); row.className = 'progress-row';
      const copy = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = item.text;
      const meta = document.createElement('small');
      const names = (item.areaIds || []).map(id => data.areas.find(area => area.id === id)?.name).filter(Boolean);
      meta.textContent = names.length ? names.join(' · ') : 'Noch keinem Zielbereich zugeordnet';
      copy.append(title, meta);
      const actions = document.createElement('div');
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'tiny-button'; edit.textContent = 'Bearbeiten'; edit.addEventListener('click', () => editItem(item.id));
      const archive = document.createElement('button'); archive.type = 'button'; archive.className = 'tiny-button'; archive.textContent = 'Archivieren'; archive.addEventListener('click', () => { item.status = 'archived'; item.updatedAt = nowIso(); persist(); });
      actions.append(edit, archive);
      row.append(copy, actions); box.appendChild(row);
    }
  }
}

function renderAreaCheckboxes(selected = []) {
  const box = $('itemAreas'); box.innerHTML = '';
  for (const area of activeAreas()) {
    const label = document.createElement('label'); label.className = 'check-chip';
    const input = document.createElement('input'); input.type = 'checkbox'; input.value = area.id; input.checked = selected.includes(area.id);
    label.append(input, document.createTextNode(area.name)); box.appendChild(label);
  }
  if (!activeAreas().length) box.appendChild(emptyMessage('Noch keine Zielbereiche – das Element kann trotzdem gespeichert werden.'));
}

function renderParentSelect(selected = []) {
  const select = $('itemParents'); select.innerHTML = '';
  for (const item of activeItems().filter(item => item.id !== editingItemId)) {
    const opt = option(item.id, `${item.type}: ${item.text}`); opt.selected = selected.includes(item.id); select.appendChild(opt);
  }
}

function editArea(id) {
  const area = data.areas.find(item => item.id === id); if (!area) return;
  editingAreaId = id;
  $('areaName').value = area.name; $('areaWhy').value = area.why; $('areaDesired').value = area.desired; $('areaCurrent').value = area.current; $('areaResources').value = area.resources;
  $('areaSubmit').textContent = 'Zielbereich speichern';
  $('areaCancel').hidden = false;
  $('areaName').focus();
}

function clearAreaForm() {
  editingAreaId = '';
  $('areaForm').reset(); $('areaSubmit').textContent = 'Zielbereich anlegen'; $('areaCancel').hidden = true;
}

function editItem(id) {
  const item = data.items.find(entry => entry.id === id); if (!item) return;
  editingItemId = id;
  $('itemType').value = item.type; $('itemText').value = item.text; $('itemDetails').value = item.details || '';
  renderAreaCheckboxes(item.areaIds || []); renderParentSelect(item.parentIds || []);
  $('itemSubmit').textContent = 'Element speichern'; $('itemCancel').hidden = false; $('itemText').focus();
}

function clearItemForm() {
  editingItemId = '';
  $('itemForm').reset(); renderAreaCheckboxes([]); renderParentSelect([]);
  $('itemSubmit').textContent = 'Element anlegen'; $('itemCancel').hidden = true;
}

function renderProgress() {
  renderOverview();
  if (!$('progressDialog')) return;
  renderAreaList(); renderItemList();
  if (!editingItemId) { renderAreaCheckboxes([]); renderParentSelect([]); }
}

function submitArea(event) {
  event.preventDefault();
  const name = $('areaName').value.trim(); if (!name) return;
  const old = data.areas.find(area => area.id === editingAreaId);
  const area = old || { id: uid('area'), status: 'active' };
  Object.assign(area, { name, why: $('areaWhy').value.trim(), desired: $('areaDesired').value.trim(), current: $('areaCurrent').value.trim(), resources: $('areaResources').value.trim(), updatedAt: nowIso() });
  if (!old) data.areas.push(area);
  clearAreaForm(); persist();
}

function submitItem(event) {
  event.preventDefault();
  const text = $('itemText').value.trim(); if (!text) return;
  const old = data.items.find(item => item.id === editingItemId);
  const item = old || { id: uid('progress'), status: 'active' };
  const areaIds = [...$('itemAreas').querySelectorAll('input:checked')].map(input => input.value);
  const parentIds = [...$('itemParents').selectedOptions].map(opt => opt.value);
  Object.assign(item, { type: $('itemType').value, text, details: $('itemDetails').value.trim(), areaIds, parentIds, updatedAt: nowIso() });
  if (!old) data.items.push(item);
  clearItemForm(); persist();
}

export function initProgressFeature() {
  renderProgress();
  $('openProgress').addEventListener('click', () => { renderProgress(); openDialog('progressDialog'); });
  $('areaForm').addEventListener('submit', submitArea); $('areaCancel').addEventListener('click', clearAreaForm);
  $('itemForm').addEventListener('submit', submitItem); $('itemCancel').addEventListener('click', clearItemForm);
}

export function getProgressData() { return structuredClone(data); }
export function getActionableItems() { return activeItems().filter(item => ['Aufgabe','Anweisung'].includes(item.type)); }
