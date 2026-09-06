import { dateKey, loadJSON, nowIso, saveJSON } from '../core/storage.js';
import { $, announce, openDialog } from '../core/ui.js';

const KEY = 'pace-horizon-v1';

const HORIZONS = [
  { id: 'hours', label: 'die nächsten Stunden', button: 'Nächste Stunden' },
  { id: 'today', label: 'dieser Tag', button: 'Heute' },
  { id: 'months', label: 'die nächsten Wochen oder Monate', button: 'Wochen / Monate' },
  { id: 'life', label: 'mein weiteres Leben', button: 'Mein weiteres Leben' },
  { id: 'world', label: 'Gesellschaft / Welt', button: 'Gesellschaft / Welt' }
];

const MODES = [
  { id: 'stay', title: 'Dabei bleiben', text: 'Ich will mich gerade wirklich mit diesem Horizont beschäftigen.' },
  { id: 'closer', title: 'Näher heranholen', text: 'Das Thema darf bleiben, aber nicht den nächsten Abschnitt bestimmen.' },
  { id: 'both', title: 'Beides halten', text: 'Der große Horizont ist real und wichtig – und der kleine auch.' }
];

const TARGETS = [
  { id: '30m', label: 'die nächsten 30 Minuten', button: 'Nächste 30 Minuten' },
  { id: 'evening', label: 'bis heute Abend', button: 'Bis heute Abend' },
  { id: 'tomorrow', label: 'bis morgen', button: 'Bis morgen' },
  { id: 'custom', label: '', button: 'Eigener Zeitraum' }
];

let state = loadJSON(KEY, null);
if (!state || state.date !== dateKey()) {
  state = { date: dateKey(), current: '', mode: '', working: '', updatedAt: '' };
  saveJSON(KEY, state);
}

let draft = { current: '', mode: '', working: '' };
let parkTopic = null;
let openHolding = null;

function horizon(id) {
  return HORIZONS.find(item => item.id === id);
}

function mode(id) {
  return MODES.find(item => item.id === id);
}

function target(id) {
  return TARGETS.find(item => item.id === id);
}

function setStep(id) {
  ['horizonStepCurrent','horizonStepMode','horizonStepTarget','horizonStepResult'].forEach(stepId => {
    $(stepId).hidden = stepId !== id;
  });
}

function renderCurrentChoices() {
  const box = $('horizonCurrentChoices');
  box.innerHTML = '';
  for (const item of HORIZONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'horizon-choice';
    button.textContent = item.button;
    button.addEventListener('click', () => chooseCurrent(item.id));
    box.appendChild(button);
  }
}

function renderModeChoices() {
  const box = $('horizonModeChoices');
  box.innerHTML = '';
  for (const item of MODES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'horizon-choice horizon-choice-rich';
    const title = document.createElement('strong');
    title.textContent = item.title;
    const text = document.createElement('small');
    text.textContent = item.text;
    button.append(title, text);
    button.addEventListener('click', () => chooseMode(item.id));
    box.appendChild(button);
  }
}

function renderTargetChoices() {
  const box = $('horizonTargetChoices');
  box.innerHTML = '';
  for (const item of TARGETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'horizon-choice';
    button.textContent = item.button;
    button.addEventListener('click', () => chooseTarget(item.id));
    box.appendChild(button);
  }
}

function resetFlow() {
  draft = { current: '', mode: '', working: '' };
  $('horizonCustomForm').hidden = true;
  $('horizonCustomInput').value = '';
  $('horizonParkForm').hidden = true;
  $('horizonParkText').value = '';
  $('horizonParkSaved').hidden = true;
  renderCurrentChoices();
  renderModeChoices();
  renderTargetChoices();
  setStep('horizonStepCurrent');
}

function openFlow() {
  resetFlow();
  openDialog('horizonDialog');
}

function chooseCurrent(id) {
  draft.current = id;
  $('horizonModeContext').textContent = `Gerade sehr präsent: ${horizon(id)?.label || id}.`;
  setStep('horizonStepMode');
}

function chooseMode(id) {
  draft.mode = id;
  if (id === 'stay') {
    draft.working = '';
    showResult();
    return;
  }
  $('horizonTargetContext').textContent = `Der Horizont „${horizon(draft.current)?.button || draft.current}“ darf bleiben. Welcher Zeitraum soll den nächsten Abschnitt praktisch bestimmen?`;
  setStep('horizonStepTarget');
}

function chooseTarget(id) {
  if (id === 'custom') {
    $('horizonCustomForm').hidden = false;
    $('horizonCustomInput').focus();
    return;
  }
  draft.working = target(id)?.label || '';
  showResult();
}

function submitCustom(event) {
  event.preventDefault();
  const value = $('horizonCustomInput').value.trim();
  if (!value) return;
  draft.working = value;
  showResult();
}

function resultCopy() {
  if (draft.mode === 'stay') {
    return 'Dann darf dieser Horizont gerade für den nächsten Abschnitt maßgeblich sein. PACE versucht nicht, ihn kleiner zu machen.';
  }
  if (draft.mode === 'closer') {
    return 'Dieser größere Horizont darf wichtig bleiben. Für den nächsten Abschnitt muss er aber nicht der Maßstab für alles sein.';
  }
  return 'Der größere Horizont bleibt real und wichtig. Gleichzeitig darf der kleinere Horizont für den nächsten Abschnitt zählen.';
}

function showResult() {
  const current = horizon(draft.current);
  const selectedMode = mode(draft.mode);

  $('horizonResultCurrent').textContent = current ? `Gerade sehr präsent: ${current.label}` : '';
  $('horizonResultMode').textContent = selectedMode?.title || '';
  $('horizonResultCopy').textContent = resultCopy();

  const working = $('horizonResultWorking');
  if (draft.working) {
    working.hidden = false;
    working.textContent = `Für den nächsten Abschnitt zählt: ${draft.working}.`;
  } else {
    working.hidden = true;
    working.textContent = '';
  }

  state = {
    date: dateKey(),
    current: draft.current,
    mode: draft.mode,
    working: draft.working,
    updatedAt: nowIso()
  };
  saveJSON(KEY, state);
  renderSummary();

  $('horizonParkForm').hidden = true;
  $('horizonParkSaved').hidden = true;
  setStep('horizonStepResult');
}

function renderSummary() {
  const summary = $('horizonCurrentSummary');
  if (!summary) return;

  if (!state || state.date !== dateKey() || !state.current) {
    summary.textContent = 'Kein Horizont für den aktuellen Abschnitt gewählt.';
    return;
  }

  const current = horizon(state.current)?.button || state.current;
  if (state.working) {
    summary.textContent = `Im Hintergrund: ${current} · Für jetzt: ${state.working}`;
  } else {
    summary.textContent = `Für jetzt maßgeblich: ${current}`;
  }
}

function openHoldingPoint() {
  $('horizonDialog').close();
  if (typeof openHolding === 'function') openHolding();
}

function revealPark() {
  $('horizonParkForm').hidden = false;
  $('horizonParkText').focus();
}

function savePark(event) {
  event.preventDefault();
  const text = $('horizonParkText').value.trim();
  if (!text || typeof parkTopic !== 'function') return;

  parkTopic(text, {
    resume: 'Später bewusst wieder aufnehmen'
  });

  $('horizonParkText').value = '';
  $('horizonParkSaved').hidden = false;
  announce('Für später geparkt.', 'good');
}

export function initHorizonFeature(options = {}) {
  parkTopic = options.parkTopic || null;
  openHolding = options.openHolding || null;

  renderSummary();
  $('openHorizon').addEventListener('click', openFlow);
  $('openPerspectiveHorizon').addEventListener('click', () => {
    $('perspectiveDialog').close();
    openFlow();
  });
  $('horizonCustomForm').addEventListener('submit', submitCustom);
  $('horizonOpenHolding').addEventListener('click', openHoldingPoint);
  $('horizonOpenPark').addEventListener('click', revealPark);
  $('horizonParkForm').addEventListener('submit', savePark);
  $('horizonRestart').addEventListener('click', resetFlow);
}

export function getHorizonState() {
  return structuredClone(state);
}
