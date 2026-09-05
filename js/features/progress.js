import { loadJSON, nowIso, saveJSON, uid, dateKey } from '../core/storage.js';
import { $, announce, emptyMessage, openDialog, option } from '../core/ui.js';
import { loadTables, replaceTables } from '../core/google.js';
import { markDirty, registerSync } from '../core/sync.js';
import { addProgressSelection } from './day.js';

const KEY = 'pace-progress-v1';
const AREA_HEADERS = ['ID','Name','Warum','Wunschzustand','IstStand','Ressourcen','Status','Aktualisiert'];
const ITEM_HEADERS = ['ID','Typ','Text','Details','ZielbereichIDs','ElternIDs','Status','Aktualisiert','Aufgabenmodus','KlaerungszyklenJSON'];
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
let actionOffset = 0;
let clarificationTaskId = '';
let clarificationActionId = '';

function splitIds(value) { return String(value || '').split(';').map(v => v.trim()).filter(Boolean); }
function joinIds(values) { return [...new Set((values || []).filter(Boolean))].join(';'); }
function parseJSON(value, fallback) { try { return value ? JSON.parse(value) : structuredClone(fallback); } catch { return structuredClone(fallback); } }

function areaFromRow(row) { return { id: row[0] || uid('area'), name: row[1] || '', why: row[2] || '', desired: row[3] || '', current: row[4] || '', resources: row[5] || '', status: row[6] || 'active', updatedAt: row[7] || nowIso() }; }
function areaToRow(area) { return [area.id, area.name, area.why, area.desired, area.current, area.resources, area.status, area.updatedAt]; }
function itemFromRow(row) { return { id: row[0] || uid('progress'), type: row[1] || 'Aufgabe', text: row[2] || '', details: row[3] || '', areaIds: splitIds(row[4]), parentIds: splitIds(row[5]), status: row[6] || 'active', updatedAt: row[7] || nowIso(), taskMode: row[8] || 'ready', clarificationCycles: parseJSON(row[9], []) }; }
function itemToRow(item) { return [item.id, item.type, item.text, item.details, joinIds(item.areaIds), joinIds(item.parentIds), item.status, item.updatedAt, item.taskMode || 'ready', JSON.stringify(item.clarificationCycles || [])]; }
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
  if (sync) markDirty('progress');
}

async function pushProgress() {
  await replaceTables({
    Zielbereiche: { headers: AREA_HEADERS, rows: data.areas.map(areaToRow) },
    Fortschritt: { headers: ITEM_HEADERS, rows: data.items.map(itemToRow) },
    FortschrittEreignisse: { headers: EVENT_HEADERS, rows: data.events.map(eventToRow) }
  });
}

export async function syncProgress() {
  const tables = await loadTables(progressSheetSpecs);
  const areaRows = tables.Zielbereiche || [];
  const itemRows = tables.Fortschritt || [];
  const eventRows = tables.FortschrittEreignisse || [];
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

function clarificationCycles(item) {
  if (!Array.isArray(item.clarificationCycles)) item.clarificationCycles = [];
  return item.clarificationCycles;
}

function currentClarification(item) {
  return clarificationCycles(item).find(cycle => cycle.status === 'active') || null;
}

function isClarifying(item) {
  return item.type === 'Aufgabe' && item.taskMode === 'clarify';
}

function openClarificationActions(item) {
  const cycle = currentClarification(item);
  return cycle ? (cycle.actions || []).filter(action => action.status !== 'done') : [];
}

function allClarificationActionsDone(item) {
  const cycle = currentClarification(item);
  return Boolean(cycle?.actions?.length) && cycle.actions.every(action => action.status === 'done');
}

function getActionableEntries() {
  const entries = [];
  for (const item of activeItems()) {
    if (item.type === 'Anweisung') {
      entries.push({ kind: 'item', item, type: item.type, text: item.text, areaIds: item.areaIds || [] });
      continue;
    }
    if (item.type !== 'Aufgabe') continue;

    if (!isClarifying(item)) {
      entries.push({ kind: 'item', item, type: item.type, text: item.text, areaIds: item.areaIds || [] });
      continue;
    }

    const cycle = currentClarification(item);
    if (!cycle) {
      entries.push({ kind: 'clarification-setup', item, type: 'Klärung', text: 'Nächste Klärungsfrage festlegen', question: '', areaIds: item.areaIds || [] });
      continue;
    }

    const openActions = openClarificationActions(item);
    for (const action of openActions) {
      entries.push({ kind: 'clarification', item, cycle, action, type: 'Klärung', text: action.text, question: cycle.question, areaIds: item.areaIds || [] });
    }
    if (!openActions.length && allClarificationActionsDone(item)) {
      entries.push({ kind: 'clarification-review', item, cycle, type: 'Klärung', text: 'Klärung auswerten', question: cycle.question, areaIds: item.areaIds || [] });
    }
  }
  return entries;
}

function renderOverview() {
  const areaCount = activeAreas().length;
  const openActions = getActionableEntries().length;
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
      const row = document.createElement('div'); row.className = `progress-row${isClarifying(item) ? ' clarification-row' : ''}`;
      const copy = document.createElement('div'); const title = document.createElement('strong'); title.textContent = item.text;
      const meta = document.createElement('small'); const names = areaNames(item.areaIds); meta.textContent = names.length ? names.join(' · ') : 'Noch keinem Zielbereich zugeordnet'; copy.append(title, meta);
      if (item.type === 'Aufgabe' && isClarifying(item)) {
        const cycle = currentClarification(item);
        const state = document.createElement('small'); state.className = 'clarification-state';
        state.textContent = cycle ? `Erst klären: ${cycle.question}` : 'Erst klären: nächste Frage noch festlegen';
        copy.appendChild(state);
      }
      const actions = document.createElement('div');
      if (item.type === 'Aufgabe') {
        actions.append(tiny(isClarifying(item) ? 'Klärung' : 'Erst klären', () => openClarification(item.id)));
      }
      actions.append(tiny('Bearbeiten', () => editItem(item.id)), tiny('Archivieren', () => { item.status = 'archived'; item.updatedAt = nowIso(); persist(); }));
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
  const actions = getActionableEntries();
  if (!actions.length) { box.appendChild(emptyMessage('Noch keine Aufgaben, klaren Anweisungen oder Klärungsschritte hinterlegt. Du kannst trotzdem spontanen Fortschritt archivieren.')); return; }
  const sorted = [...actions].sort((a,b) => {
    const rank = entry => entry.kind === 'clarification' ? 0 : entry.type === 'Anweisung' ? 1 : entry.kind === 'clarification-review' ? 2 : 3;
    return rank(a) - rank(b);
  });
  const shown = Array.from({length: Math.min(3, sorted.length)}, (_, i) => sorted[(i + actionOffset) % sorted.length]);
  for (const entry of shown) {
    const card = document.createElement('article'); card.className = `action-card${entry.kind.startsWith('clarification') ? ' clarification-action-card' : ''}`;
    const micro = document.createElement('p'); micro.className = 'micro'; micro.textContent = entry.type.toUpperCase();
    const h = document.createElement('h3'); h.textContent = entry.text;
    card.append(micro, h);

    if (entry.question) {
      const question = document.createElement('p'); question.className = 'clarification-question';
      question.textContent = `Klärt: ${entry.question}`;
      card.appendChild(question);
    }

    const names = areaNames(entry.areaIds);
    if (names.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = names.join(' · '); card.appendChild(p); }

    const tools = document.createElement('div'); tools.className = 'action-card-tools';
    if (entry.kind === 'clarification') {
      const choose = document.createElement('button'); choose.type = 'button'; choose.className = 'primary-button'; choose.textContent = 'Für heute merken';
      choose.addEventListener('click', () => { addProgressSelection(entry.text); $('nextActionDialog').close(); announce('Klärungsschritt für heute gemerkt.', 'good'); });
      const done = document.createElement('button'); done.type = 'button'; done.className = 'secondary-button'; done.textContent = 'Erledigt / Ergebnis';
      done.addEventListener('click', () => { $('nextActionDialog').close(); openClarificationAction(entry.item.id, entry.action.id); });
      tools.append(choose, done);
    } else if (entry.kind === 'clarification-review') {
      const review = document.createElement('button'); review.type = 'button'; review.className = 'primary-button'; review.textContent = 'Jetzt auswerten';
      review.addEventListener('click', () => { $('nextActionDialog').close(); openClarificationReview(entry.item.id); });
      tools.appendChild(review);
    } else if (entry.kind === 'clarification-setup') {
      const setup = document.createElement('button'); setup.type = 'button'; setup.className = 'primary-button'; setup.textContent = 'Klärungsfrage festlegen';
      setup.addEventListener('click', () => { $('nextActionDialog').close(); openClarification(entry.item.id); });
      tools.appendChild(setup);
    } else {
      const choose = document.createElement('button'); choose.type = 'button'; choose.className = 'primary-button'; choose.textContent = 'Für heute merken';
      choose.addEventListener('click', () => { addProgressSelection(entry.text); $('nextActionDialog').close(); announce('Als mögliche Fortschrittsrichtung für heute gemerkt.', 'good'); });
      tools.appendChild(choose);
    }
    card.appendChild(tools); box.appendChild(card);
  }
}

function renderClarificationHistory(item) {
  const box = $('clarificationHistory');
  box.innerHTML = '';
  const history = clarificationCycles(item).filter(cycle => cycle.status !== 'active');
  box.hidden = history.length === 0;
  if (!history.length) return;

  const heading = document.createElement('p'); heading.className = 'micro'; heading.textContent = 'BISHER GEKLÄRT';
  box.appendChild(heading);
  for (const cycle of [...history].reverse().slice(0, 5)) {
    const card = document.createElement('div'); card.className = 'clarification-history-card';
    const question = document.createElement('strong'); question.textContent = cycle.question;
    const outcome = document.createElement('small');
    outcome.textContent = cycle.outcome === 'ready' ? 'danach ausführungsreif' : cycle.outcome === 'change' ? 'Lösung sollte geändert werden' : 'weitere Klärung nötig';
    card.append(question, outcome);
    box.appendChild(card);
  }
}

function renderClarificationManager(item) {
  const cycle = currentClarification(item);
  $('clarificationTaskTitle').textContent = item.text;
  $('clarificationCreate').hidden = Boolean(cycle);
  $('clarificationCurrent').hidden = !cycle;
  renderClarificationHistory(item);

  if (!cycle) {
    $('clarificationQuestion').value = '';
    $('clarificationActions').value = '';
    $('clarificationQuestion').focus();
    return;
  }

  $('clarificationCurrentQuestion').textContent = cycle.question;
  const list = $('clarificationActionList'); list.innerHTML = '';
  for (const action of cycle.actions || []) {
    const row = document.createElement('div'); row.className = `clarification-step${action.status === 'done' ? ' done' : ''}`;
    const copy = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = action.text;
    copy.appendChild(title);
    if (action.result) {
      const result = document.createElement('small'); result.textContent = `Geklärt: ${action.result}`; copy.appendChild(result);
    } else {
      const state = document.createElement('small'); state.textContent = action.status === 'done' ? 'erledigt' : 'noch offen'; copy.appendChild(state);
    }
    row.appendChild(copy);
    if (action.status !== 'done') row.appendChild(tiny('Erledigt / Ergebnis', () => openClarificationAction(item.id, action.id)));
    list.appendChild(row);
  }

  $('clarificationReviewButton').hidden = !allClarificationActionsDone(item);
  $('clarificationAddActionForm').hidden = false;
  $('clarificationAddAction').value = '';
}

function openClarification(itemId) {
  const item = data.items.find(entry => entry.id === itemId);
  if (!item || item.type !== 'Aufgabe') return;
  clarificationTaskId = itemId;
  renderClarificationManager(item);
  openDialog('clarificationDialog');
}

function submitClarification(event) {
  event.preventDefault();
  const item = data.items.find(entry => entry.id === clarificationTaskId);
  if (!item) return;
  const question = $('clarificationQuestion').value.trim();
  const actionTexts = $('clarificationActions').value.split(/\n+/).map(text => text.trim()).filter(Boolean);
  if (!question || !actionTexts.length) return;

  const stamp = nowIso();
  clarificationCycles(item).push({
    id: uid('clarify'),
    question,
    status: 'active',
    outcome: '',
    createdAt: stamp,
    updatedAt: stamp,
    actions: actionTexts.map(text => ({ id: uid('clarify-action'), text, status: 'open', result: '', updatedAt: stamp }))
  });
  item.taskMode = 'clarify';
  item.updatedAt = stamp;
  persist();
  renderClarificationManager(item);
  announce('Klärungsfrage mit nächsten Schritten gespeichert.', 'good');
}

function addClarificationAction(event) {
  event.preventDefault();
  const item = data.items.find(entry => entry.id === clarificationTaskId);
  const cycle = item && currentClarification(item);
  const text = $('clarificationAddAction').value.trim();
  if (!item || !cycle || !text) return;
  const stamp = nowIso();
  cycle.actions ||= [];
  cycle.actions.push({ id: uid('clarify-action'), text, status: 'open', result: '', updatedAt: stamp });
  cycle.updatedAt = stamp; item.updatedAt = stamp;
  persist();
  renderClarificationManager(item);
}

function openClarificationAction(itemId, actionId) {
  const item = data.items.find(entry => entry.id === itemId);
  const cycle = item && currentClarification(item);
  const action = cycle?.actions?.find(entry => entry.id === actionId);
  if (!item || !cycle || !action) return;
  clarificationTaskId = itemId;
  clarificationActionId = actionId;
  $('clarificationActionQuestion').textContent = cycle.question;
  $('clarificationActionTitle').textContent = action.text;
  $('clarificationActionResult').value = action.result || '';
  if ($('clarificationDialog').open) $('clarificationDialog').close();
  openDialog('clarificationActionDialog');
  $('clarificationActionResult').focus();
}

function submitClarificationAction(event) {
  event.preventDefault();
  const item = data.items.find(entry => entry.id === clarificationTaskId);
  const cycle = item && currentClarification(item);
  const action = cycle?.actions?.find(entry => entry.id === clarificationActionId);
  if (!item || !cycle || !action) return;
  const result = $('clarificationActionResult').value.trim();
  const stamp = nowIso();
  action.status = 'done'; action.result = result; action.updatedAt = stamp;
  cycle.updatedAt = stamp; item.updatedAt = stamp;
  persist();
  $('clarificationActionDialog').close();

  if (allClarificationActionsDone(item)) {
    openClarificationReview(item.id);
  } else {
    openClarification(item.id);
    announce('Klärungsschritt erledigt. Die Frage bleibt noch offen.', 'good');
  }
}

function renderClarificationReview(item) {
  const cycle = currentClarification(item);
  if (!cycle) return false;
  $('clarificationReviewTask').textContent = item.text;
  $('clarificationReviewQuestion').textContent = cycle.question;
  const list = $('clarificationReviewResults'); list.innerHTML = '';
  for (const action of cycle.actions || []) {
    const row = document.createElement('div'); row.className = 'clarification-review-result';
    const strong = document.createElement('strong'); strong.textContent = action.text;
    const small = document.createElement('small'); small.textContent = action.result || 'Erledigt, ohne zusätzliche Notiz';
    row.append(strong, small); list.appendChild(row);
  }
  return true;
}

function openClarificationReview(itemId) {
  const item = data.items.find(entry => entry.id === itemId);
  if (!item || !renderClarificationReview(item)) return;
  clarificationTaskId = itemId;
  if ($('clarificationDialog').open) $('clarificationDialog').close();
  openDialog('clarificationReviewDialog');
}

function resolveClarification(outcome) {
  const item = data.items.find(entry => entry.id === clarificationTaskId);
  const cycle = item && currentClarification(item);
  if (!item || !cycle) return;
  const stamp = nowIso();
  cycle.status = 'resolved'; cycle.outcome = outcome; cycle.updatedAt = stamp;
  item.updatedAt = stamp;

  if (outcome === 'ready') {
    item.taskMode = 'ready';
    persist();
    $('clarificationReviewDialog').close();
    announce('Die Aufgabe ist wieder als ausführbare Möglichkeit verfügbar.', 'good');
    return;
  }

  if (outcome === 'more') {
    item.taskMode = 'clarify';
    persist();
    $('clarificationReviewDialog').close();
    openClarification(item.id);
    announce('Dann nur die nächste Klärungsfrage.', '');
    return;
  }

  item.taskMode = 'ready';
  persist();
  $('clarificationReviewDialog').close();
  openDialog('progressDialog');
  editItem(item.id);
  announce('Du kannst die Aufgabe jetzt ändern oder anschließend neu klären.', '');
}

export function initProgressFeature() {
  registerSync('progress', { push: pushProgress, full: syncProgress });
  renderProgress();
  $('openProgress').addEventListener('click', () => { renderProgress(); openDialog('progressDialog'); });
  $('quickProgressEvent').addEventListener('click', () => openEvent());
  $('nextProgressAction').addEventListener('click', () => { renderNextActions(); openDialog('nextActionDialog'); });
  $('nextActionMore').addEventListener('click', () => { actionOffset += 3; renderNextActions(); });
  $('areaForm').addEventListener('submit', submitArea); $('areaCancel').addEventListener('click', clearAreaForm);
  $('itemForm').addEventListener('submit', submitItem); $('itemCancel').addEventListener('click', clearItemForm);
  $('progressEventForm').addEventListener('submit', submitEvent);
  $('clarificationForm').addEventListener('submit', submitClarification);
  $('clarificationAddActionForm').addEventListener('submit', addClarificationAction);
  $('clarificationActionForm').addEventListener('submit', submitClarificationAction);
  $('clarificationReviewButton').addEventListener('click', () => openClarificationReview(clarificationTaskId));
  $('clarificationReady').addEventListener('click', () => resolveClarification('ready'));
  $('clarificationMore').addEventListener('click', () => resolveClarification('more'));
  $('clarificationChange').addEventListener('click', () => resolveClarification('change'));
}

export function getProgressData() { return structuredClone(data); }
export function getActionableItems() { return activeItems().filter(item => item.type === 'Anweisung' || (item.type === 'Aufgabe' && !isClarifying(item))); }
