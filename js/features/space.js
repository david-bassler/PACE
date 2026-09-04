import { loadJSON, nowIso, saveJSON, uid, dateKey } from '../core/storage.js';
import { $, announce, emptyMessage, openDialog } from '../core/ui.js';
import { isConnected, loadTables, replaceTables } from '../core/google.js';
import { markDirty, registerSync } from '../core/sync.js';
import { getDayState, setSmallDay } from './day.js';

const KEY = 'pace-space-v1';
const PARK_HEADERS = ['ID','Erstellt','Text','NaechsterSchritt','Wiederaufnahme','Status','Aktualisiert'];
const KEEP_HEADERS = ['ID','Datum','Text','Aktualisiert'];

export const spaceSheetSpecs = {
  Geparkt: PARK_HEADERS,
  Behalten: KEEP_HEADERS
};

let data = { parked: [], keeps: [], ...loadJSON(KEY, { parked: [], keeps: [] }) };
data.parked ||= []; data.keeps ||= [];

function parkedFromRow(row) { return { id: row[0] || uid('park'), createdAt: row[1] || nowIso(), text: row[2] || '', next: row[3] || '', resume: row[4] || '', status: row[5] || 'open', updatedAt: row[6] || nowIso() }; }
function parkedToRow(item) { return [item.id, item.createdAt, item.text, item.next, item.resume, item.status, item.updatedAt]; }
function keepFromRow(row) { return { id: row[0] || uid('keep'), date: row[1] || dateKey(), text: row[2] || '', updatedAt: row[3] || nowIso() }; }
function keepToRow(item) { return [item.id, item.date, item.text, item.updatedAt]; }

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
  renderParked(); renderKeeps(); renderEveningKeeps();
  if (sync) markDirty('space');
}
async function push() {
  await replaceTables({
    Geparkt: { headers: PARK_HEADERS, rows: data.parked.map(parkedToRow) },
    Behalten: { headers: KEEP_HEADERS, rows: data.keeps.map(keepToRow) }
  });
}

export async function syncSpace() {
  const tables = await loadTables(spaceSheetSpecs);
  data.parked = mergeById(data.parked, (tables.Geparkt || []).map(parkedFromRow));
  data.keeps = mergeById(data.keeps, (tables.Behalten || []).map(keepFromRow));
  saveJSON(KEY, data);
  await push();
  renderParked(); renderKeeps(); renderEveningKeeps();
}

function renderParked() {
  if (!$('parkedList')) return;
  const box = $('parkedList'); box.innerHTML = '';
  const open = data.parked.filter(item => item.status === 'open').sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (!open.length) { box.appendChild(emptyMessage('Nichts offen geparkt. Parken heißt: nicht lösen müssen, aber den Faden nicht verlieren.')); return; }
  for (const item of open) {
    const card = document.createElement('article'); card.className = 'park-card';
    const copy = document.createElement('div'); const h = document.createElement('strong'); h.textContent = item.text; copy.appendChild(h);
    if (item.next) { const p = document.createElement('p'); p.textContent = `Nächster Schritt: ${item.next}`; copy.appendChild(p); }
    if (item.resume) { const p = document.createElement('small'); p.textContent = `Wieder aufnehmen: ${item.resume}`; copy.appendChild(p); }
    const done = document.createElement('button'); done.type = 'button'; done.className = 'tiny-button'; done.textContent = 'Erledigt'; done.addEventListener('click', () => { item.status = 'done'; item.updatedAt = nowIso(); persist(); });
    card.append(copy, done); box.appendChild(card);
  }
}

function renderKeeps() {
  if (!$('keepList')) return;
  const box = $('keepList'); box.innerHTML = '';
  const recent = [...data.keeps].sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 20);
  if (!recent.length) { box.appendChild(emptyMessage('Noch nichts behalten. Ein Satz reicht.')); return; }
  for (const item of recent) {
    const card = document.createElement('article'); card.className = 'keep-card';
    const text = document.createElement('p'); text.textContent = item.text;
    const date = document.createElement('small'); date.textContent = item.date;
    card.append(text, date); box.appendChild(card);
  }
}

function renderEveningKeeps() {
  if (!$('eveningKeeps')) return;
  const today = data.keeps.filter(item => item.date === dateKey());
  const box = $('eveningKeeps'); box.innerHTML = '';
  if (!today.length) { box.hidden = true; return; }
  box.hidden = false;
  const label = document.createElement('p'); label.className = 'micro'; label.textContent = 'DAS WOLLTEST DU BEHALTEN'; box.appendChild(label);
  for (const item of today) { const p = document.createElement('p'); p.className = 'keep-evening'; p.textContent = item.text; box.appendChild(p); }
}

function addPark(event) {
  event.preventDefault(); const text = $('parkText').value.trim(); if (!text) return;
  data.parked.push({ id: uid('park'), createdAt: nowIso(), text, next: $('parkNext').value.trim(), resume: $('parkResume').value.trim(), status: 'open', updatedAt: nowIso() });
  $('parkForm').reset();
  persist();
  announce(isConnected() ? 'Lokal geparkt · wird mit Google synchronisiert.' : 'Lokal geparkt · wartet auf Google.', 'good');
}

function addKeep(event) {
  event.preventDefault(); const text = $('keepText').value.trim(); if (!text) return;
  data.keeps.push({ id: uid('keep'), date: dateKey(), text, updatedAt: nowIso() });
  $('keepForm').reset();
  persist();
  announce(isConnected() ? 'Lokal gespeichert · wird mit Google synchronisiert.' : 'Lokal gespeichert · wartet auf Google.', 'good');
}

function openShrink() {
  const state = getDayState();
  $('shrinkFocus').value = state.smallDay?.focus || state.selections?.A || '';
  $('shrinkRelease').value = state.smallDay?.release || state.selections?.C || '';
  openDialog('shrinkDialog');
}

function saveShrink(event) {
  event.preventDefault();
  setSmallDay({ active: true, focus: $('shrinkFocus').value.trim(), release: $('shrinkRelease').value.trim() });
  $('shrinkDialog').close(); announce('Der Tag darf jetzt kleiner sein.', 'good');
}

export function initSpaceFeature() {
  registerSync('space', { push, full: syncSpace });
  renderParked(); renderKeeps(); renderEveningKeeps();
  $('openParking').addEventListener('click', () => { renderParked(); openDialog('parkingDialog'); });
  $('openKeep').addEventListener('click', () => { renderKeeps(); openDialog('keepDialog'); });
  $('shrinkDay').addEventListener('click', openShrink);
  $('parkForm').addEventListener('submit', addPark);
  $('keepForm').addEventListener('submit', addKeep);
  $('shrinkForm').addEventListener('submit', saveShrink);
  $('eveningButton').addEventListener('click', renderEveningKeeps);
}

export function getTodaysKeeps() { return data.keeps.filter(item => item.date === dateKey()).map(item => item.text); }
