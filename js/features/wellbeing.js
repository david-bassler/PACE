import { loadJSON, nowIso, saveJSON, uid, dateKey } from '../core/storage.js';
import { $, announce, emptyMessage, openDialog } from '../core/ui.js';
import { loadTables, replaceTables } from '../core/google.js';
import { markDirty, registerSync } from '../core/sync.js';
import { getActionableItems, getProgressData } from './progress.js';
import { getSuggestions } from './day.js';
import { mergeUpdatedById } from '../core/collections.js';
import {
  wellbeingSheetSpecs,
  exampleFromRow,
  chanceFromRow,
  resonanceRecordFromRow,
  wellbeingTables
} from './wellbeing-data.js';

export { wellbeingSheetSpecs };

const KEY = 'pace-library-v1';

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

let data = { examples: [], chances: [], resonanceEvents: [], resonanceTags: [], anchors: [], ...loadJSON(KEY, { examples: [], chances: [], resonanceEvents: [], resonanceTags: [], anchors: [] }) };
data.examples ||= []; data.chances ||= []; data.resonanceEvents ||= []; data.resonanceTags ||= []; data.anchors ||= [];
let mehMode = '';
let editingTagId = '';
let editingAnchorId = '';
let currentAnchorId = '';
let lastAnchorEventId = '';

function persist(sync = true) {
  saveJSON(KEY, data);
  renderLibrary();
  if (sync) markDirty('wellbeing');
}
async function push() {
  await replaceTables(wellbeingTables(data));
}

export async function syncWellbeing() {
  const tables = await loadTables(wellbeingSheetSpecs);
  data.examples = mergeUpdatedById(data.examples, (tables.Beispiele || []).map(exampleFromRow));
  data.chances = mergeUpdatedById(data.chances, (tables.Resonanzchancen || []).map(chanceFromRow));

  const records = (tables.Resonanzbibliothek || []).map(resonanceRecordFromRow).filter(Boolean);
  data.resonanceTags = mergeUpdatedById(data.resonanceTags, records.filter(item => item.type === 'tag'));
  data.anchors = mergeUpdatedById(data.anchors, records.filter(item => item.type === 'anchor'));
  data.resonanceEvents = mergeUpdatedById(data.resonanceEvents, records.filter(item => item.type === 'event'));

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
  renderResonanceLibrary();
}

function activeResonanceTags() { return data.resonanceTags.filter(item => item.active !== false && item.name); }
function tagName(id) { return data.resonanceTags.find(item => item.id === id)?.name || id; }

function renderTagChoices(targetId, selected = []) {
  const box = $(targetId); box.innerHTML = '';
  const tags = [...activeResonanceTags()].sort((a,b) => a.name.localeCompare(b.name, 'de'));
  if (!tags.length) {
    box.appendChild(emptyMessage('Noch keine Resonanz-Schlagwörter vorhanden. Nach dem CSV-Import erscheinen sie hier automatisch.'));
    return;
  }
  for (const tag of tags) {
    const label = document.createElement('label'); label.className = 'check-chip';
    const input = document.createElement('input'); input.type = 'checkbox'; input.value = tag.id; input.checked = selected.includes(tag.id);
    label.append(input, document.createTextNode(tag.name)); box.appendChild(label);
  }
}

function clearTagForm() {
  editingTagId = '';
  $('resonanceTagForm').reset();
  $('resonanceTagSubmit').textContent = 'Tag anlegen';
  $('resonanceTagCancel').hidden = true;
}

function editTag(id) {
  const tag = data.resonanceTags.find(item => item.id === id); if (!tag) return;
  editingTagId = id;
  $('resonanceTagName').value = tag.name || '';
  $('resonanceTagDescription').value = tag.description || '';
  $('resonanceTagSubmit').textContent = 'Tag speichern';
  $('resonanceTagCancel').hidden = false;
  $('resonanceTagName').focus();
}

function submitTag(event) {
  event.preventDefault();
  const name = $('resonanceTagName').value.trim(); if (!name) return;
  const old = data.resonanceTags.find(item => item.id === editingTagId);
  const tag = old || { id: uid('res-tag'), active: true };
  Object.assign(tag, { name, description: $('resonanceTagDescription').value.trim(), updatedAt: nowIso() });
  if (!old) data.resonanceTags.push(tag);
  clearTagForm(); persist();
}

function clearAnchorForm() {
  editingAnchorId = '';
  $('anchorForm').reset();
  $('anchorMatchMode').value = 'any';
  renderTagChoices('anchorTagChoices', []);
  $('anchorSubmit').textContent = 'Erinnerungsanker anlegen';
  $('anchorCancel').hidden = true;
}

function editAnchor(id) {
  const anchor = data.anchors.find(item => item.id === id); if (!anchor) return;
  editingAnchorId = id;
  $('anchorName').value = anchor.title || '';
  $('anchorDescription').value = anchor.description || '';
  $('anchorMatchMode').value = anchor.matchMode === 'all' ? 'all' : 'any';
  renderTagChoices('anchorTagChoices', anchor.tagIds || []);
  $('anchorSubmit').textContent = 'Erinnerungsanker speichern';
  $('anchorCancel').hidden = false;
  $('anchorName').focus();
}

function submitAnchor(event) {
  event.preventDefault();
  const title = $('anchorName').value.trim(); if (!title) return;
  const tagIds = [...$('anchorTagChoices').querySelectorAll('input:checked')].map(input => input.value);
  if (!tagIds.length) { announce('Wähle mindestens ein Schlagwort für den Erinnerungsanker.', ''); return; }
  const old = data.anchors.find(item => item.id === editingAnchorId);
  const anchor = old || { id: uid('anchor'), active: true };
  Object.assign(anchor, {
    title,
    description: $('anchorDescription').value.trim(),
    tagIds,
    matchMode: $('anchorMatchMode').value === 'all' ? 'all' : 'any',
    updatedAt: nowIso()
  });
  if (!old) data.anchors.push(anchor);
  clearAnchorForm(); persist();
}

function matchingEvents(anchor) {
  const wanted = anchor?.tagIds || [];
  if (!wanted.length) return [];
  return data.resonanceEvents.filter(event => {
    if (event.active === false) return false;
    const ids = new Set(event.tagIds || []);
    return anchor.matchMode === 'all' ? wanted.every(id => ids.has(id)) : wanted.some(id => ids.has(id));
  });
}

function pickAnchorEvent(anchor) {
  const matches = matchingEvents(anchor);
  if (!matches.length) return null;
  let candidates = matches.filter(item => item.id !== lastAnchorEventId);
  if (!candidates.length) candidates = matches;
  const rich = candidates.filter(item => item.context && item.context !== '—');
  return random(rich.length ? rich : candidates);
}

function renderAnchorEvent(anchor) {
  const box = $('anchorEventCard'); box.innerHTML = '';
  const event = pickAnchorEvent(anchor);
  $('anchorResultTitle').textContent = anchor.title;
  $('anchorResultDescription').textContent = anchor.description || 'Ein reales Beispiel aus deiner eigenen Resonanzbibliothek.';
  $('anchorNextExample').disabled = !event;

  if (!event) {
    box.appendChild(emptyMessage('Für diesen Erinnerungsanker gibt es noch kein passendes Ereignis.'));
    return;
  }

  lastAnchorEventId = event.id;
  const date = document.createElement('p'); date.className = 'micro'; date.textContent = event.date || 'UNDATIERT';
  const title = document.createElement('h3'); title.textContent = event.title;
  box.append(date, title);
  if (event.context && event.context !== '—') {
    const context = document.createElement('p'); context.className = 'anchor-context'; context.textContent = event.context; box.appendChild(context);
  }
  const tags = document.createElement('p'); tags.className = 'anchor-tags';
  tags.textContent = (event.tagIds || []).map(tagName).filter(Boolean).join(' · ');
  if (tags.textContent) box.appendChild(tags);
}

function openAnchor(id) {
  const anchor = data.anchors.find(item => item.id === id && item.active !== false); if (!anchor) return;
  currentAnchorId = id;
  lastAnchorEventId = '';
  renderAnchorEvent(anchor);
  openDialog('anchorResultDialog');
}

function openAnchorChooser() {
  const list = $('anchorChooserList'); list.innerHTML = '';
  const anchors = data.anchors.filter(item => item.active !== false);
  if (!anchors.length) {
    list.appendChild(emptyMessage('Noch keine Erinnerungsanker eingerichtet. Du kannst sie unter „Eigene Beispiele“ frei aus Schlagwörtern zusammensetzen.'));
  }
  for (const anchor of anchors) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'anchor-choice';
    const title = document.createElement('strong'); title.textContent = anchor.title;
    const text = document.createElement('small'); text.textContent = anchor.description || `${matchingEvents(anchor).length} passende Ereignisse`;
    button.append(title, text);
    button.addEventListener('click', () => { $('anchorChooserDialog').close(); openAnchor(anchor.id); });
    list.appendChild(button);
  }
  openDialog('anchorChooserDialog');
}

function renderResonanceLibrary() {
  if (!$('resonanceLibrarySummary')) return;
  $('resonanceLibrarySummary').textContent = `${data.resonanceEvents.filter(item => item.active !== false).length} Ereignisse · ${activeResonanceTags().length} Schlagwörter · ${data.anchors.filter(item => item.active !== false).length} Erinnerungsanker`;

  const tagList = $('resonanceTagList'); tagList.innerHTML = '';
  const tags = [...data.resonanceTags].sort((a,b) => (a.name || '').localeCompare(b.name || '', 'de'));
  if (!tags.length) tagList.appendChild(emptyMessage('Noch keine Resonanz-Schlagwörter.'));
  for (const tag of tags) {
    const card = document.createElement('article'); card.className = 'library-card';
    const copy = document.createElement('div'); const title = document.createElement('strong'); title.textContent = tag.name || '(unbenannt)';
    const p = document.createElement('p'); p.textContent = tag.description || '';
    copy.append(title); if (tag.description) copy.append(p);
    const actions = document.createElement('div');
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'tiny-button'; edit.textContent = 'Bearbeiten'; edit.addEventListener('click', () => editTag(tag.id));
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'tiny-button'; toggle.textContent = tag.active === false ? 'Aktivieren' : 'Pausieren'; toggle.addEventListener('click', () => { tag.active = tag.active === false; tag.updatedAt = nowIso(); persist(); });
    actions.append(edit, toggle); card.append(copy, actions); tagList.appendChild(card);
  }

  const anchorList = $('anchorConfigList'); anchorList.innerHTML = '';
  const anchors = [...data.anchors].sort((a,b) => (a.title || '').localeCompare(b.title || '', 'de'));
  if (!anchors.length) anchorList.appendChild(emptyMessage('Noch keine Erinnerungsanker. Sie kombinieren frei gewählte Schlagwörter.'));
  for (const anchor of anchors) {
    const card = document.createElement('article'); card.className = 'library-card';
    const copy = document.createElement('div'); const title = document.createElement('strong'); title.textContent = anchor.title;
    const names = (anchor.tagIds || []).map(tagName).filter(Boolean);
    const p = document.createElement('p'); p.textContent = anchor.description || '';
    const meta = document.createElement('small'); meta.textContent = `${anchor.matchMode === 'all' ? 'alle Schlagwörter' : 'mindestens ein Schlagwort'} · ${names.join(' · ')} · ${matchingEvents(anchor).length} Ereignisse`;
    copy.append(title); if (anchor.description) copy.append(p); copy.append(meta);
    const actions = document.createElement('div');
    const show = document.createElement('button'); show.type = 'button'; show.className = 'tiny-button'; show.textContent = 'Anzeigen'; show.addEventListener('click', () => openAnchor(anchor.id));
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'tiny-button'; edit.textContent = 'Bearbeiten'; edit.addEventListener('click', () => editAnchor(anchor.id));
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'tiny-button'; toggle.textContent = anchor.active === false ? 'Aktivieren' : 'Pausieren'; toggle.addEventListener('click', () => { anchor.active = anchor.active === false; anchor.updatedAt = nowIso(); persist(); });
    actions.append(show, edit, toggle); card.append(copy, actions); anchorList.appendChild(card);
  }

  if (!editingAnchorId) renderTagChoices('anchorTagChoices', []);
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
  registerSync('wellbeing', { push, full: syncWellbeing });
  renderLibrary(); renderExplanations();
  $('openMeh').addEventListener('click', () => { $('mehResult').innerHTML = '<p class="summary-empty">Wähle nur eine Richtung. Es geht nicht darum, alle vier zu bedienen.</p>'; openDialog('mehDialog'); });
  document.querySelectorAll('[data-meh]').forEach(button => button.addEventListener('click', () => showMeh(button.dataset.meh)));
  $('mehAnother').addEventListener('click', () => { if (mehMode) showMeh(mehMode); });
  $('openLibrary').addEventListener('click', () => { renderLibrary(); openDialog('libraryDialog'); });
  $('openExplanations').addEventListener('click', () => openDialog('explanationDialog'));
  $('exampleForm').addEventListener('submit', addExample);
  $('chanceForm').addEventListener('submit', addChance);
  $('resonanceTagForm').addEventListener('submit', submitTag);
  $('resonanceTagCancel').addEventListener('click', clearTagForm);
  $('anchorForm').addEventListener('submit', submitAnchor);
  $('anchorCancel').addEventListener('click', clearAnchorForm);
  $('openAnchorChooser').addEventListener('click', openAnchorChooser);
  $('openPerspectiveAnchors').addEventListener('click', () => { $('perspectiveDialog').close(); openAnchorChooser(); });
  $('openAnchorsFromStuck').addEventListener('click', () => { $('stuckDialog').close(); openDialog('perspectiveDialog'); });
  $('anchorNextExample').addEventListener('click', () => {
    const anchor = data.anchors.find(item => item.id === currentAnchorId);
    if (anchor) renderAnchorEvent(anchor);
  });
}

export function getWellbeingData() { return structuredClone(data); }
