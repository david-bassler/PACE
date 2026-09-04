import { loadJSON, nowIso, saveJSON, uid, dateKey } from '../core/storage.js';
import { $, announce, emptyMessage, openDialog, option } from '../core/ui.js';
import { isConnected, loadTable, replaceTable } from '../core/google.js';
import { addProgressSelection } from './day.js';

const KEY = 'pace-progress-v1';
const AREA_HEADERS = ['ID','Name','Warum','Wunschzustand','IstStand','Ressourcen','Status','Aktualisiert'];
const ITEM_HEADERS = ['ID','Typ','Text','Details','ZielbereichIDs','ElternIDs','Status','Aktualisiert'];
const EVENT_HEADERS = ['ID','Datum','Text','ZielbereichIDs','BezugsIDs','Aktualisiert'];

export const progressSheetSpecs = {
  Zielbereiche: AREA_HEADERS,
  Fortschritt: ITEM_HEADERS,
  FortschrittEreignisse: EVENT_HEADERS
};

const EMPTY = { areas: [], items: [], events: [] };
let data = { ...EMPTY, ...loadJSON(KEY, EMPTY) };
data.areas ||= []; data.items ||= []; data.events ||= [];
let editingAreaId = '';
let editingItemId = '';
let editingEventId = '';
let syncTimer = null;
let actionOffset = 0;

function splitIds(value) { return String(value || '').split(';').map(v => v.trim()).filter(Boolean); }
function joinIds(values) { return [...new Set((values || []).filter(Boolean))].join(';'); }

function areaFromRow(row) { return { id: row[0] || uid('area'), name: row[1] || '', why: row[2] || '', desired: row[3] || '', current: row[4] || '', resources: row[5] || '', status: row[6] || 'active', updatedAt: row[7] || nowIso() }; }
function areaToRow(area) { return [area.id, area.name, area.why, area.desired, area.current, area.resources, area.status, area.updatedAt]; }
function itemFromRow(row) { return { id: row[0] || uid('progress'), type: row[1] || 'Aufgabe', text: row[2] || '', details: row[3] || '', areaIds: splitIds(row[4]), parentIds: splitIds(row[5]), status: row[6] || 'active', updatedAt: row[7] || nowIso() }; }
function itemToRow(item) { return [item.id, item.type, item.text, item.details, joinIds(item.areaIds), joinIds(item.parentIds), item.status, item.updatedAt]; }
function eventFromRow(row) { return { id: row[0] || uid('event'), date: row[1] || dateKey(), text: row[2] || '', areaIds: splitIds(row[3]), referenceIds: splitIds(row[4]), updatedAt: row[5] || nowIso() }; }
function eventToRow(event) { return [event.id, event.date, event.text, joinIds(event.areaIds), joinIds(event.referenceIds), event.updatedAt]; }

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
    replaceTable('Fortschritt', ITEM_HEADERS, data.items.map(itemToRow)),
    replaceTable('FortschrittEreignisse', EVENT_HEADERS, data.events.map(eventToRow))
  ]);
}

export async function syncProgress() {
  if (!isConnected()) return;
  const [areaRows, itemRows, eventRows] = await Promise.all([
    loadTable('Zielbereiche', AREA_HEADERS),
    loadTable('Fortschritt', ITEM_HEADERS),
    loadTable('FortschrittEreignisse', EVENT_HEADERS)
  ]);
  data = {
    areas: mergeById(data.areas, areaRows.map(areaFromRow)),
    items: mergeById(data.items, itemRows.map(itemFromRow)),
    events: mergeById(data.events, eventRows.map(eventFromRow))
  };
  saveJSON(KEY, data);
  await pushProgress();
  renderProgress();
}

function activeAreas() { return data.areas.filter(area => area.status !== 'archived'); }
function activeItems() { return data.items.filter(item => item.status !== 'archived'); }
function areaNames(ids = []) { return ids.map(id => data.areas.find(area => area.id === id)?.name).filter(Boolean); }

function renderOverview() {
  const areaCount = activeAreas().length;
  const openActions = getActionableItems().length;
  const eventCount = data.events.length;
  $('progressOverview').textContent = areaCount
    ? `${areaCount} Zielbereich${areaCount === 1 ? '' : 'e'} · ${openActions} nächste Möglichkeit${openActions === 1 ? '' : 'en'} · ${eventCount} archivierte${eventCount === 1 ? 'r' : ''} Fortschritt${eventCount === 1 ? '' : 'e'}`
    : 'Noch keine Zielbereiche angelegt. Fortschritt darf trotzdem schon als Ereignis festgehalten werden.';
}

function renderAreaList() {
  const box = $('areaList'); box.innerHTML = '';
  const areas = activeAreas();
  if (!areas.length) { box.appendChild(emptyMessage('Noch keine Zielbereiche. Ein Bereich bekommt einen Sitz am Tisch, wenn er langfristig nicht auf null fallen soll.')); return; }
  for (const area of areas) {
    const card = document.createElement('article'); card.className = 'map-card';
    const head = document.createElement('div'); head.className = 'map-card-head';
    const title = document.createElement('h3'); title.textContent = area.name;
    const actions = document.createElement('div');
    actions.append(tiny('Bearbeiten', () => editArea(area.id)), tiny('Archivieren', () => { area.status = 'archived'; area.updatedAt = nowIso(); persist(); }));
    head.append(title, actions); card.appendChild(head);
    if (area.why) card.appendChild(detailLine('Warum', area.why));
    if (area.current) card.appendChild(detailLine('Ist', area.current));
    if (area.desired) card.appendChild(detailLine('Richtung', area.desired));
    if (area.resources) card.appendChild(detailLine('Darf beanspruchen', area.resources));
    const related = activeItems().filter(item => item.areaIds?.includes(area.id));
    if (related.length) {
      const chips = document.createElement('div'); chips.className = 'chip-row';
      related.slice(0, 6).forEach(item => { const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = `${item.type}: ${item.text}`; chips.appendChild(chip); });
      card.appendChild(chips);
    }
    box.appendChild(card);
  }
}

function detailLine(label, value) {
  const p = document.createElement('p'); p.className = 'map-detail';
  const strong = document.createElement('strong'); strong.textContent = `${label}: `;
  p.append(strong, document.createTextNode(value)); return p;
}
function tiny(text, handler) { const button = document.createElement('button'); button.type = 'button'; button.className = 'tiny-button'; button.textContent = text; button.addEventListener('click', handler); return button; }

function renderItemList() {
  const box = $('progressItemList'); box.innerHTML = '';
  const items = activeItems();
  if (!items.length) { box.appendChild(emptyMessage('Ziele, Meilensteine, Aufgaben und Anweisungen sind optional. Lege nur an, was dir tatsächlich Orientierung gibt.')); return; }
  for (const type of ['Ziel','Meilenstein','Aufgabe','Anweisung']) {
    const group = items.filter(item => item.type === type); if (!group.length) continue;
    const h = document.createElement('h3'); h.className = 'list-heading'; h.textContent = type; box.appendChild(h);
    for (const item of group) {
      const row = document.createElement('div'); row.className = 'progress-row';
      const copy = document.createElement('div'); const title = document.createElement('strong'); title.textContent = item.text;
      const meta = document.createElement('small'); const names = areaNames(item.areaIds); meta.textContent = names.length ? names.join(' · ') : 'Noch keinem Zielbereich zugeordnet'; copy.append(title, meta);
      const actions = document.createElement('div'); actions.append(tiny('Bearbeiten', () => editItem(item.id)), tiny('Archivieren', () => { item.status = 'archived'; item.updatedAt = nowIso(); persist(); }));
      row.append(copy, actions); box.appendChild(row);
    }
  }
}

function renderEventList() {
  const box = $('progressEventList'); box.innerHTML = '';
  const events = [...data.events].sort((a,b) => String(b.date).localeCompare(String(a.date))).slice(0, 12);
  if (!events.length) { box.appendChild(emptyMessage('Noch kein Fortschritt archiviert. Er muss nicht vorher geplant gewesen sein.')); return; }
  for (const event of events) {
    const row = document.createElement('div'); row.className = 'progress-row';
    const copy = document.createElement('div'); const title = document.createElement('strong'); title.textContent = event.text;
    const meta = document.createElement('small'); const names = areaNames(event.areaIds); meta.textContent = `${event.date}${names.length ? ` · ${names.join(' · ')}` : ' · noch nicht zugeordnet'}`; copy.append(title, meta);
    const actions = document.createElement('div'); actions.append(tiny('Zuordnen', () => openEvent(event.id)));
    row.append(copy, actions); box.appendChild(row);
  }
}

function renderAreaCheckboxes(targetId, selected = []) {
  const box = $(targetId); box.innerHTML = '';
  for (const area of activeAreas()) {
    const label = document.createElement('label'); label.className = 'check-chip';
    const input = document.createElement('input'); input.type = 'checkbox'; input.value = area.id; input.checked = selected.includes(area.id);
    label.append(input, document.createTextNode(area.name)); box.appendChild(label);
  }
  if (!activeAreas().length) box.appendChild(emptyMessage('Noch keine Zielbereiche – das kann später zugeordnet werden.'));
}

function renderParentSelect(targetId, selected = [], excludeId = '') {
  const select = $(targetId); select.innerHTML = '';
  for (const item of activeItems().filter(item => item.id !== excludeId)) {
    const opt = option(item.id, `${item.type}: ${item.text}`); opt.selected = selected.includes(item.id); select.appendChild(opt);
  }
}

function editArea(id) {
  const area = data.areas.find(item => item.id === id); if (!area) return;
  editingAreaId = id; $('areaName').value = area.name; $('areaWhy').value = area.why; $('areaDesired').value = area.desired; $('areaCurrent').value = area.current; $('areaResources').value = area.resources;
  $('areaSubmit').textContent = 'Zielbereich speichern'; $('areaCancel').hidden = false; $('areaName').focus();
}
function clearAreaForm() { editingAreaId = ''; $('areaForm').reset(); $('areaSubmit').textContent = 'Zielbereich anlegen'; $('areaCancel').hidden = true; }

function editItem(id) {
  const item = data.items.find(entry => entry.id === id); if (!item) return;
  editingItemId = id; $('itemType').value = item.type; $('itemText').value = item.text; $('itemDetails').value = item.details || '';
  renderAreaCheckboxes('itemAreas', item.areaIds || []); renderParentSelect('itemParents', item.parentIds || [], item.id);
  $('itemSubmit').textContent = 'Element speichern'; $('itemCancel').hidden = false; $('itemText').focus();
}
function clearItemForm() { editingItemId = ''; $('itemForm').reset(); renderAreaCheckboxes('itemAreas', []); renderParentSelect('itemParents', []); $('itemSubmit').textContent = 'Element anlegen'; $('itemCancel').hidden = true; }

function renderProgress() {
  renderOverview();
  if (!$('progressDialog')) return;
  renderAreaList(); renderItemList(); renderEventList();
  if (!editingItemId) { renderAreaCheckboxes('itemAreas', []); renderParentSelect('itemParents', []); }
}

function submitArea(event) {
  event.preventDefault(); const name = $('areaName').value.trim(); if (!name) return;
  const old = data.areas.find(area => area.id === editingAreaId); const area = old || { id: uid('area'), status: 'active' };
  Object.assign(area, { name, why: $('areaWhy').value.trim(), desired: $('areaDesired').value.trim(), current: $('areaCurrent').value.trim(), resources: $('areaResources').value.trim(), updatedAt: nowIso() });
  if (!old) data.areas.push(area); clearAreaForm(); persist();
}

function submitItem(event) {
  event.preventDefault(); const text = $('itemText').value.trim(); if (!text) return;
  const old = data.items.find(item => item.id === editingItemId); const item = old || { id: uid('progress'), status: 'active' };
  const areaIds = [...$('itemAreas').querySelectorAll('input:checked')].map(input => input.value); const parentIds = [...$('itemParents').selectedOptions].map(opt => opt.value);
  Object.assign(item, { type: $('itemType').value, text, details: $('itemDetails').value.trim(), areaIds, parentIds, updatedAt: nowIso() });
  if (!old) data.items.push(item); clearItemForm(); persist();
}

function openEvent(id = '') {
  editingEventId = id;
  const event = data.events.find(entry => entry.id === id);
  $('progressEventText').value = event?.text || '';
  renderAreaCheckboxes('progressEventAreas', event?.areaIds || []);
  renderParentSelect('progressEventRefs', event?.referenceIds || []);
  $('progressEventSubmit').textContent = event ? 'Fortschritt speichern' : 'Als Fortschritt archivieren';
  openDialog('progressEventDialog');
}

function submitEvent(eventObject) {
  eventObject.preventDefault(); const text = $('progressEventText').value.trim(); if (!text) return;
  const old = data.events.find(entry => entry.id === editingEventId); const event = old || { id: uid('event'), date: dateKey() };
  const areaIds = [...$('progressEventAreas').querySelectorAll('input:checked')].map(input => input.value); const referenceIds = [...$('progressEventRefs').selectedOptions].map(opt => opt.value);
  Object.assign(event, { text, areaIds, referenceIds, updatedAt: nowIso() });
  if (!old) data.events.push(event); editingEventId = ''; $('progressEventDialog').close(); persist(); announce('Fortschritt archiviert.', 'good');
}

function renderNextActions() {
  const box = $('nextActionChoices'); box.innerHTML = '';
  const actions = getActionableItems();
  if (!actions.length) { box.appendChild(emptyMessage('Noch keine Aufgaben oder klaren Anweisungen hinterlegt. Du kannst trotzdem spontanen Fortschritt archivieren.')); return; }
  const sorted = [...actions].sort((a,b) => (a.type === 'Anweisung' ? -1 : 1) - (b.type === 'Anweisung' ? -1 : 1));
  const shown = Array.from({length: Math.min(3, sorted.length)}, (_, i) => sorted[(i + actionOffset) % sorted.length]);
  for (const item of shown) {
    const card = document.createElement('article'); card.className = 'action-card';
    const micro = document.createElement('p'); micro.className = 'micro'; micro.textContent = item.type.toUpperCase();
    const h = document.createElement('h3'); h.textContent = item.text;
    const names = areaNames(item.areaIds); if (names.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = names.join(' · '); card.append(micro, h, p); } else card.append(micro, h);
    const choose = document.createElement('button'); choose.type = 'button'; choose.className = 'primary-button'; choose.textContent = 'Für heute merken'; choose.addEventListener('click', () => { addProgressSelection(item.text); $('nextActionDialog').close(); announce('Als mögliche Fortschrittsrichtung für heute gemerkt.', 'good'); });
    card.appendChild(choose); box.appendChild(card);
  }
}

export function initProgressFeature() {
  renderProgress();
  $('openProgress').addEventListener('click', () => { renderProgress(); openDialog('progressDialog'); });
  $('quickProgressEvent').addEventListener('click', () => openEvent());
  $('nextProgressAction').addEventListener('click', () => { renderNextActions(); openDialog('nextActionDialog'); });
  $('nextActionMore').addEventListener('click', () => { actionOffset += 3; renderNextActions(); });
  $('areaForm').addEventListener('submit', submitArea); $('areaCancel').addEventListener('click', clearAreaForm);
  $('itemForm').addEventListener('submit', submitItem); $('itemCancel').addEventListener('click', clearItemForm);
  $('progressEventForm').addEventListener('submit', submitEvent);
}

export function getProgressData() { return structuredClone(data); }
export function getActionableItems() { return activeItems().filter(item => ['Aufgabe','Anweisung'].includes(item.type)); }
