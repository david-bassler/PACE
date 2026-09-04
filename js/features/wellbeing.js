import { loadJSON, nowIso, saveJSON, uid, dateKey } from '../core/storage.js';
import { $, announce, emptyMessage, openDialog } from '../core/ui.js';
import { isConnected, loadTable, replaceTable } from '../core/google.js';
import { getActionableItems, getProgressData } from './progress.js';
import { getSuggestions } from './day.js';

const KEY = 'pace-library-v1';
const EXAMPLE_HEADERS = ['ID','Bereich','Datum','Titel','Text','Aktualisiert'];
const CHANCE_HEADERS = ['ID','Titel','Text','Aktiv','Aktualisiert'];

export const wellbeingSheetSpecs = {
  Beispiele: EXAMPLE_HEADERS,
  Resonanzchancen: CHANCE_HEADERS
};

const EXPLANATIONS = {
  goodday: {
    title: 'Was ist hier ein guter Tag?',
    text: 'Kein perfekter Tag und kein Tag mit vier erfüllten Kästchen. Eher ein Tag, an dessen Ende etwas Reales weiter ist, Kompetenz spürbar war, Resonanz möglich wurde und genug Reserve übrig blieb, um müde statt ausgebrannt ins Bett zu gehen.'
  },
  progress: {
    title: 'Was zählt als echter Fortschritt?',
    text: 'Fortschritt ist eine reale Zustandsänderung in einer Richtung, die für dein Leben wichtig ist. Er kann geplant sein oder erst im Nachhinein sichtbar werden. Aktivität allein reicht nicht.'
  },
  resonance: {
    title: 'Warum ist Resonanz keine Aufgabe?',
    text: 'Resonanz lässt sich nicht erzwingen und nur begrenzt vorhersagen. Die App kann Chancen und innere Offenheit dafür wahrscheinlicher machen, aber das eigentliche Erleben bleibt unverfügbar.'
  },
  reserve: {
    title: 'Warum ist Reserve kein Luxus?',
    text: 'Reserve ist Zeit, Energie, Aufmerksamkeit und Entscheidungsspielraum, die nicht vollständig verbraucht werden. Sie schützt den nächsten Tag und kann überhaupt erst Platz für Resonanz schaffen.'
  },
  competence: {
    title: 'Was ist Kompetenz hier?',
    text: 'Kompetenz ist das eigene Erleben: Ich kann, verstehe, löse oder erkläre etwas. Sie muss nicht mit langfristigem Fortschritt zusammenfallen und braucht keine äußere Bestätigung.'
  },
  notatest: {
    title: 'PACE ist kein Test',
    text: 'Die vier Bereiche beschreiben Bedingungen, die gute Tage wahrscheinlicher machen. Sie sind keine täglichen Pflichten. Ein Tag darf klein, leer, schwierig oder unvollständig sein, ohne dass du PACE falsch benutzt hast.'
  }
};

let data = { examples: [], chances: [], ...loadJSON(KEY, { examples: [], chances: [] }) };
data.examples ||= []; data.chances ||= [];
let syncTimer = null;
let mehMode = '';

function exampleFromRow(row) { return { id: row[0] || uid('example'), area: row[1] || 'E', date: row[2] || dateKey(), title: row[3] || '', text: row[4] || '', updatedAt: row[5] || nowIso() }; }
function exampleToRow(item) { return [item.id, item.area, item.date, item.title, item.text, item.updatedAt]; }
function chanceFromRow(row) { return { id: row[0] || uid('chance'), title: row[1] || '', text: row[2] || '', active: String(row[3] ?? 'true') !== 'false', updatedAt: row[4] || nowIso() }; }
function chanceToRow(item) { return [item.id, item.title, item.text, item.active, item.updatedAt]; }

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
  renderLibrary();
  if (sync) scheduleSync();
}
function scheduleSync() { clearTimeout(syncTimer); if (isConnected()) syncTimer = setTimeout(() => push().catch(error => announce(error.message, 'bad')), 800); }
async function push() {
  await Promise.all([
    replaceTable('Beispiele', EXAMPLE_HEADERS, data.examples.map(exampleToRow)),
    replaceTable('Resonanzchancen', CHANCE_HEADERS, data.chances.map(chanceToRow))
  ]);
}

export async function syncWellbeing() {
  if (!isConnected()) return;
  const [examples, chances] = await Promise.all([
    loadTable('Beispiele', EXAMPLE_HEADERS),
    loadTable('Resonanzchancen', CHANCE_HEADERS)
  ]);
  data.examples = mergeById(data.examples, examples.map(exampleFromRow));
  data.chances = mergeById(data.chances, chances.map(chanceFromRow));
  saveJSON(KEY, data);
  await push();
  renderLibrary();
}

function renderLibrary() {
  if (!$('libraryExampleList')) return;
  const list = $('libraryExampleList'); list.innerHTML = '';
  const sorted = [...data.examples].sort((a,b) => String(b.date).localeCompare(String(a.date)));
  if (!sorted.length) list.appendChild(emptyMessage('Noch keine persönlichen Beispiele. Gute Beispiele sind Erinnerungsstützen, keine Beweise.'));
  for (const item of sorted.slice(0, 30)) {
    const card = document.createElement('article'); card.className = 'library-card';
    const badge = document.createElement('span'); badge.className = `library-badge badge-${item.area.toLowerCase()}`; badge.textContent = item.area;
    const copy = document.createElement('div'); const title = document.createElement('strong'); title.textContent = item.title || item.text;
    const text = document.createElement('p'); text.textContent = item.title ? item.text : ''; const meta = document.createElement('small'); meta.textContent = item.date;
    copy.append(title); if (item.title && item.text) copy.append(text); copy.append(meta); card.append(badge, copy); list.appendChild(card);
  }

  const chances = $('resonanceChanceList'); chances.innerHTML = '';
  const active = data.chances.filter(chance => chance.active);
  if (!active.length) chances.appendChild(emptyMessage('Noch keine persönlichen Resonanzchancen hinterlegt.'));
  for (const chance of active) {
    const card = document.createElement('article'); card.className = 'library-card';
    const copy = document.createElement('div'); const title = document.createElement('strong'); title.textContent = chance.title; const p = document.createElement('p'); p.textContent = chance.text; copy.append(title); if (chance.text) copy.append(p); card.append(copy);
    const off = document.createElement('button'); off.type = 'button'; off.className = 'tiny-button'; off.textContent = 'Pausieren'; off.addEventListener('click', () => { chance.active = false; chance.updatedAt = nowIso(); persist(); }); card.append(off); chances.appendChild(card);
  }
}

function random(arr) { return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null; }
function exampleFor(area) { return random(data.examples.filter(item => item.area === area)); }

function showMeh(mode) {
  mehMode = mode;
  const box = $('mehResult'); box.innerHTML = '';
  const title = document.createElement('h3');
  const body = document.createElement('p'); body.className = 'meh-copy';
  const action = document.createElement('div'); action.className = 'meh-action';

  if (mode === 'A') {
    title.textContent = 'Etwas Reales weiterbringen';
    const next = random(getActionableItems());
    const event = random(getProgressData().events || []);
    if (next) {
      body.textContent = 'Eine Möglichkeit aus deiner eigenen Lebenslandkarte:';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'suggestion'; b.textContent = next.text; b.addEventListener('click', () => { document.getElementById('nextProgressAction').click(); $('mehDialog').close(); }); action.appendChild(b);
    } else if (event) body.textContent = `So sah echter Fortschritt bei dir schon einmal aus: ${event.text}`;
    else body.textContent = 'Noch keine konkrete Fortschrittsstruktur. Auch ein ungeplanter realer Zustandswechsel kann später als Fortschritt archiviert werden.';
  }

  if (mode === 'P') {
    title.textContent = 'Eine Gelegenheit für Kompetenz';
    const example = exampleFor('P'); const suggestion = random(getSuggestions('P'));
    if (example) body.textContent = `So sah Kompetenz bei dir schon einmal aus: ${example.title || example.text}`;
    else if (suggestion) body.textContent = `Vielleicht eine Gelegenheit, dein Können zu spüren: ${suggestion}`;
    else body.textContent = 'Kompetenz muss nicht bewiesen werden. Suche eher eine kleine Situation, in der du etwas verstehst, löst, erklärst oder gestaltest.';
  }

  if (mode === 'E') {
    title.textContent = 'Etwas passieren lassen';
    const chance = random(data.chances.filter(item => item.active)); const example = exampleFor('E');
    if (chance) body.textContent = `${chance.title}${chance.text ? ` — ${chance.text}` : ''}`;
    else if (example) body.textContent = `So fühlte sich Resonanz bei dir schon einmal an: ${example.title || example.text}`;
    else body.textContent = 'Geh für eine Weile dorthin, wo etwas passieren darf, ohne dass etwas passieren muss. Resonanz selbst bleibt unverfügbar.';
    const readiness = document.createElement('button'); readiness.type = 'button'; readiness.className = 'secondary-button'; readiness.textContent = 'Ist gerade überhaupt Platz dafür?'; readiness.addEventListener('click', () => { body.textContent = 'Wenn dein Kopf vollständig an etwas hängt, kann zuerst Parken, Verkleinern oder Reserve schaffen sinnvoller sein als noch eine Resonanzaktivität.'; }); action.appendChild(readiness);
  }

  if (mode === 'C') {
    title.textContent = 'Etwas weglassen';
    const example = exampleFor('C'); const suggestion = random(getSuggestions('C'));
    if (example) body.textContent = `So sah eine gute Reserveentscheidung bei dir schon einmal aus: ${example.title || example.text}`;
    else if (suggestion) body.textContent = suggestion;
    else body.textContent = 'Was könnte heute kleiner, später, einfacher oder ganz weg sein? Reserve ist keine Belohnung nach erledigter Arbeit.';
  }

  box.append(title, body, action);
}

function renderExplanations() {
  const box = $('explanationList'); box.innerHTML = '';
  for (const item of Object.values(EXPLANATIONS)) {
    const details = document.createElement('details'); details.className = 'explanation-card';
    const summary = document.createElement('summary'); summary.textContent = item.title;
    const p = document.createElement('p'); p.textContent = item.text;
    details.append(summary, p); box.appendChild(details);
  }
}

function addExample(event) {
  event.preventDefault(); const text = $('exampleText').value.trim(); if (!text) return;
  data.examples.push({ id: uid('example'), area: $('exampleArea').value, date: dateKey(), title: $('exampleTitle').value.trim(), text, updatedAt: nowIso() });
  $('exampleForm').reset(); persist(); announce('Beispiel privat archiviert.', 'good');
}

function addChance(event) {
  event.preventDefault(); const title = $('chanceTitle').value.trim(); if (!title) return;
  data.chances.push({ id: uid('chance'), title, text: $('chanceText').value.trim(), active: true, updatedAt: nowIso() });
  $('chanceForm').reset(); persist(); announce('Resonanzchance gespeichert.', 'good');
}

export function initWellbeingFeature() {
  renderLibrary(); renderExplanations();
  $('openMeh').addEventListener('click', () => { $('mehResult').innerHTML = '<p class="summary-empty">Wähle nur eine Richtung. Es geht nicht darum, alle vier zu bedienen.</p>'; openDialog('mehDialog'); });
  document.querySelectorAll('[data-meh]').forEach(button => button.addEventListener('click', () => showMeh(button.dataset.meh)));
  $('mehAnother').addEventListener('click', () => { if (mehMode) showMeh(mehMode); });
  $('openLibrary').addEventListener('click', () => { renderLibrary(); openDialog('libraryDialog'); });
  $('openExplanations').addEventListener('click', () => openDialog('explanationDialog'));
  $('exampleForm').addEventListener('submit', addExample);
  $('chanceForm').addEventListener('submit', addChance);
}

export function getWellbeingData() { return structuredClone(data); }
