import { KEYS, dateKey, loadJSON, loadValue, nowIso, saveJSON, saveValue } from '../core/storage.js';
import { $, $$, announce, emptyMessage, openDialog } from '../core/ui.js';
import { isConnected, loadTables, replaceTables, upsertRow } from '../core/google.js';
import { markDirty, registerSync } from '../core/sync.js';

export const META = {
  P: { title: 'Proficiency · Kompetenz', intro: 'Schaffe oder bemerke Gelegenheiten, in denen du dein eigenes Können spürst.' },
  A: { title: 'Advancement · Fortschritt', intro: 'Etwas Reales ist weiter als vorher. Aktivität allein ist noch kein Fortschritt.' },
  C: { title: 'Capacity · Reserve', intro: 'Lass genug übrig, damit der Tag nicht alles verbraucht.' },
  E: { title: 'Echo · Resonanz', intro: 'Resonanz lässt sich nicht erledigen. Du kannst nur Raum und Gelegenheiten dafür schaffen.' }
};

const DAY_HEADERS = ['Datum','Tagesform','Kompetenz','Kompetenz_erledigt','Fortschritt','Fortschritt_erledigt','Reserve','Reserve_erledigt','Resonanz','Resonanz_erledigt','Feststecken_Anzahl','Abend_Fortschritt','Abend_Resonanz','Abend_Reserve','Abgeschlossen_um','Aktualisiert_um'];
const CONTENT_DEFAULT = { lists: { P: [], A: [], C: [], E: [] }, stuck: [], loadedAt: '' };
let content = loadJSON(KEYS.content, null) || loadJSON(KEYS.legacyContent, CONTENT_DEFAULT);
saveJSON(KEYS.content, content);
let energy = loadValue(KEYS.energy, null) || loadValue(KEYS.legacyEnergy, null) || 'normal';
saveValue(KEYS.energy, energy);

function blankDay() {
  return { date: dateKey(), selections: {}, done: {}, stuckCount: 0, rescue: '', smallDay: { active: false, focus: '', release: '' }, evening: { progress: '', resonance: '', reserve: '', closedAt: '' }, updatedAt: nowIso() };
}

let state = (() => {
  const stored = loadJSON(KEYS.day, null) || loadJSON(KEYS.legacyDay, null);
  const current = stored?.date === dateKey() ? { ...blankDay(), ...stored } : blankDay();
  saveJSON(KEYS.day, current);
  return current;
})();

function visible(key) {
  const list = content.lists[key] || [];
  return energy === 'low' ? list.slice(0, 6) : list;
}

function saveDay(sync = true) {
  state.updatedAt = nowIso();
  saveJSON(KEYS.day, state);
  if (sync) markDirty('day');
}

function dayRow() {
  return [
    state.date, energy,
    state.selections.P || '', Boolean(state.done.P),
    state.selections.A || '', Boolean(state.done.A),
    state.selections.C || '', Boolean(state.done.C),
    state.selections.E || '', Boolean(state.done.E),
    state.stuckCount || 0,
    state.evening.progress || '', state.evening.resonance || '', state.evening.reserve || '',
    state.evening.closedAt || '', state.updatedAt || nowIso()
  ];
}

export async function syncDay() {
  await upsertRow('Tage', DAY_HEADERS, 0, state.date, dayRow());
}

export async function loadPrivateSuggestions() {
  if (!isConnected()) return;
  const tables = await loadTables({
    Vorschlaege: ['Bereich', 'Vorschlag'],
    Feststecken: ['Vorschlag']
  });
  const proposalRows = tables.Vorschlaege || [];
  const stuckRows = tables.Feststecken || [];
  const lists = { P: [], A: [], C: [], E: [] };
  for (const row of proposalRows) {
    const key = String(row[0] || '').trim().toUpperCase();
    const text = String(row[1] || '').trim();
    if (lists[key] && text) lists[key].push(text);
  }
  content = {
    lists,
    stuck: stuckRows.map(row => String(row[0] || '').trim()).filter(Boolean),
    loadedAt: nowIso()
  };
  saveJSON(KEYS.content, content);
  renderAll();
}

export async function importPrivateTSV(file) {
  const lines = (await file.text()).split(/\r?\n/).filter(Boolean);
  if (!lines.length) throw new Error('Die TSV-Datei ist leer.');
  const rows = lines.map(line => line.split('\t'));
  const header = rows.shift().map(value => value.trim().toLowerCase());
  const typeIndex = header.indexOf('typ');
  const areaIndex = header.indexOf('bereich');
  const textIndex = header.indexOf('text');
  if (typeIndex < 0 || textIndex < 0) throw new Error('Erwartete Spalten: Typ, Bereich, Text.');
  const proposals = [];
  const stuck = [];
  for (const row of rows) {
    const type = String(row[typeIndex] || '').trim().toUpperCase();
    const area = areaIndex >= 0 ? String(row[areaIndex] || '').trim().toUpperCase() : '';
    const text = String(row[textIndex] || '').trim();
    if (!text) continue;
    if (type === 'VORSCHLAG' && ['P','A','C','E'].includes(area)) proposals.push([area, text]);
    if (type === 'FESTSTECKEN') stuck.push([text]);
  }
  await replaceTables({
    Vorschlaege: { headers: ['Bereich', 'Vorschlag'], rows: proposals },
    Feststecken: { headers: ['Vorschlag'], rows: stuck }
  });
  await loadPrivateSuggestions();
  return { proposals: proposals.length, stuck: stuck.length };
}

function choose(key, text) {
  state.selections[key] = text;
  state.done[key] = false;
  saveDay();
  renderAll();
}

function renderEnergy() {
  $$('[data-energy]').forEach(button => button.classList.toggle('active', button.dataset.energy === energy));
  const hints = {
    low: 'Wenig Energie: weniger Auswahl, mehr Schutz. Du musst den Tag nicht auf Normalmaß bringen.',
    normal: 'Normaler Tag: kleine reale Schritte reichen.',
    good: 'Viel Energie: nutze sie, aber verplane sie nicht vollständig.'
  };
  $('energyHint').textContent = hints[energy];
}

function renderReserve() {
  const box = $('reserveFirstChoices');
  box.innerHTML = '';
  const choices = visible('C').slice(0, 4);
  if (!choices.length) box.appendChild(emptyMessage('Noch keine privaten Reserve-Ideen geladen.'));
  for (const text of choices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `quick-choice${state.selections.C === text ? ' selected' : ''}`;
    button.textContent = text;
    button.addEventListener('click', () => choose('C', text));
    box.appendChild(button);
  }
  $('reserveFirst').classList.toggle('done', Boolean(state.selections.C));
  $('reserveFirstTitle').textContent = state.selections.C ? 'Reserve ist eingeplant.' : 'Was muss heute nicht auch noch sein?';
}

function renderSummary() {
  const box = $('todaySummary');
  box.innerHTML = '';
  const keys = ['P','A','C','E'].filter(key => state.selections[key]);
  if (!keys.length) box.appendChild(emptyMessage('Nichts muss vollständig geplant sein. Wähle nur, was gerade hilfreich ist.'));
  for (const key of keys) {
    const wrapper = document.createElement('div');
    wrapper.className = 'summary-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(state.done[key]);
    checkbox.addEventListener('change', () => { state.done[key] = checkbox.checked; saveDay(); });
    const label = document.createElement('label');
    const badge = document.createElement('span');
    badge.className = 'summary-key';
    badge.textContent = key;
    label.append(badge, document.createTextNode(state.selections[key]));
    wrapper.append(checkbox, label);
    box.appendChild(wrapper);
  }
  $$('[data-chosen]').forEach(el => {
    const key = el.dataset.chosen;
    el.textContent = state.selections[key] || ((content.lists[key] || []).length ? 'Vorschläge anzeigen' : 'Noch keine Inhalte');
    el.classList.toggle('has-choice', Boolean(state.selections[key]));
  });
}

function renderRescue() {
  const el = $('rescueCurrent');
  el.hidden = !state.rescue;
  if (state.rescue) el.textContent = `Feststecken-Hilfe: ${state.rescue}`;
}

function renderEvening() {
  $('eveningStatus').textContent = state.evening.closedAt ? 'Abgeschlossen. Der Tag darf jetzt zu sein.' : '';
}

function renderSmallDay() {
  const small = state.smallDay || { active: false, focus: '', release: '' };
  const note = $('smallDayNote');
  note.hidden = !small.active;
  document.body.classList.toggle('small-day-active', Boolean(small.active));
  if (!small.active) return;
  const parts = [];
  if (small.focus) parts.push(`Fokus: ${small.focus}`);
  if (small.release) parts.push(`Dafür darf weg: ${small.release}`);
  $('smallDayCopy').textContent = parts.join(' · ') || 'Alles außer dem Nötigen ist heute optional.';
}

function renderAll() {
  renderEnergy();
  renderReserve();
  renderSummary();
  renderRescue();
  renderEvening();
  renderSmallDay();
}

function renderSuggestions(key) {
  const panel = $(`suggestions-${key}`);
  panel.innerHTML = '';
  const options = visible(key);
  if (!options.length) {
    panel.appendChild(emptyMessage('Keine privaten Vorschläge geladen. Öffne die Einstellungen und synchronisiere Google Sheets.'));
    return;
  }
  const tools = document.createElement('div');
  tools.className = 'suggestion-tools';
  const random = document.createElement('button');
  random.type = 'button';
  random.textContent = 'Einen Vorschlag';
  random.addEventListener('click', () => openChoice(key, options[Math.floor(Math.random() * options.length)]));
  tools.appendChild(random);
  const grid = document.createElement('div');
  grid.className = 'suggestion-grid';
  for (const text of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `suggestion${state.selections[key] === text ? ' selected' : ''}`;
    button.textContent = text;
    button.addEventListener('click', () => openChoice(key, text));
    grid.appendChild(button);
  }
  panel.append(tools, grid);
}

function openChoice(key, text) {
  $('choiceMicro').textContent = META[key].title.toUpperCase();
  $('choiceTitle').textContent = text;
  $('choiceHint').textContent = META[key].intro;
  $('choiceUse').onclick = () => { choose(key, text); $('choiceDialog').close(); };
  $('choiceAnother').onclick = () => {
    const options = visible(key).filter(item => item !== text);
    if (options.length) openChoice(key, options[Math.floor(Math.random() * options.length)]);
  };
  openDialog('choiceDialog');
}

function openStuck() {
  const box = $('stuckChoices');
  box.innerHTML = '';
  if (!content.stuck.length) box.appendChild(emptyMessage('Noch keine Feststecken-Hilfen aus dem privaten Sheet geladen.'));
  for (const text of content.stuck) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.addEventListener('click', () => {
      state.stuckCount += 1;
      state.rescue = text;
      saveDay();
      renderRescue();
      $('stuckDialog').close();
    });
    box.appendChild(button);
  }
  openDialog('stuckDialog');
}

function resetDay() {
  if (!confirm('Heutige Auswahl, Häkchen und Abendnotizen löschen?')) return;
  state = blankDay();
  saveDay();
  $$('.pace-row').forEach(row => {
    $(`suggestions-${row.dataset.key}`).hidden = true;
    row.setAttribute('aria-expanded', 'false');
  });
  renderAll();
}

export function initDayFeature() {
  registerSync('day', { push: syncDay, full: googleConnectedDay });
  renderAll();
  $$('[data-energy]').forEach(button => button.addEventListener('click', () => {
    energy = button.dataset.energy;
    saveValue(KEYS.energy, energy);
    saveDay();
    renderAll();
  }));

  $$('.pace-row').forEach(row => row.addEventListener('click', () => {
    const key = row.dataset.key;
    const panel = $(`suggestions-${key}`);
    const opening = panel.hidden;
    $$('.pace-row').forEach(other => {
      const otherPanel = $(`suggestions-${other.dataset.key}`);
      if (other !== row) {
        other.setAttribute('aria-expanded', 'false');
        otherPanel.hidden = true;
      }
    });
    row.setAttribute('aria-expanded', String(opening));
    panel.hidden = !opening;
    if (opening) renderSuggestions(key);
  }));

  $('moreReserve').addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('pace:navigate', { detail: { page: 'tools', focus: 'paceSuggestionsDetails' } }));
    const details = $('paceSuggestionsDetails');
    if (details) details.open = true;
    const row = document.querySelector('[data-key="C"]');
    const panel = $('suggestions-C');
    row.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
    renderSuggestions('C');
    window.requestAnimationFrame(() => row.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  });
  $('stuckButton').addEventListener('click', openStuck);
  $('resetDay').addEventListener('click', resetDay);
  $('smallDayClear').addEventListener('click', () => {
    state.smallDay = { active: false, focus: '', release: '' };
    saveDay();
    renderAll();
  });
  $('eveningButton').addEventListener('click', () => {
    $('eveningProgress').value = state.evening.progress || '';
    $('eveningResonance').value = state.evening.resonance || '';
    $('eveningReserve').value = state.evening.reserve || '';
    openDialog('eveningDialog');
  });
  $('eveningForm').addEventListener('submit', event => {
    event.preventDefault();
    state.evening = {
      progress: $('eveningProgress').value.trim(),
      resonance: $('eveningResonance').value.trim(),
      reserve: $('eveningReserve').value.trim(),
      closedAt: nowIso()
    };
    saveDay();
    renderEvening();
    $('eveningDialog').close();
  });
}

export function googleConnectedDay() {
  return loadPrivateSuggestions().then(syncDay);
}

export function getDayState() { return structuredClone(state); }
export function setSmallDay(next) {
  state.smallDay = { active: Boolean(next?.active), focus: next?.focus || '', release: next?.release || '' };
  saveDay();
  renderAll();
}
export function getSuggestions(key) { return [...(content.lists[key] || [])]; }
export function addProgressSelection(text) { choose('A', text); }
