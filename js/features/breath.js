import { loadJSON, saveJSON } from '../core/storage.js';
import { $, openDialog } from '../core/ui.js';

const SETTINGS_KEY = 'pace-breath-settings-v1';
const DEFAULT_SECONDS = 4.6;

let running = false;
let phase = 'rest';
let timerId = 0;

function clampSeconds(value) {
  const parsed = Number.parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed)) return DEFAULT_SECONDS;
  return Math.min(12, Math.max(2, Math.round(parsed * 10) / 10));
}

function loadSettings() {
  const stored = loadJSON(SETTINGS_KEY, {});
  return {
    inhale: clampSeconds(stored.inhale ?? DEFAULT_SECONDS),
    exhale: clampSeconds(stored.exhale ?? DEFAULT_SECONDS)
  };
}

function saveSettings(settings) {
  saveJSON(SETTINGS_KEY, settings);
}

function settingsFromForm() {
  return {
    inhale: clampSeconds($('breathInhaleSeconds').value),
    exhale: clampSeconds($('breathExhaleSeconds').value)
  };
}

function renderSettings() {
  const settings = loadSettings();
  $('breathInhaleSeconds').value = settings.inhale.toFixed(1);
  $('breathExhaleSeconds').value = settings.exhale.toFixed(1);
}

function clearPhaseTimer() {
  if (timerId) window.clearTimeout(timerId);
  timerId = 0;
}

function setPhase(nextPhase) {
  phase = nextPhase;
  const orb = $('breathOrb');
  const cue = $('breathCue');
  const settings = loadSettings();
  const seconds = nextPhase === 'inhale' ? settings.inhale : settings.exhale;

  orb.classList.toggle('inhale', nextPhase === 'inhale');
  orb.classList.toggle('exhale', nextPhase === 'exhale');
  orb.style.setProperty('--breath-duration', `${seconds}s`);
  cue.textContent = nextPhase === 'inhale' ? 'Einatmen' : 'Ausatmen';

  clearPhaseTimer();
  timerId = window.setTimeout(() => {
    if (!running) return;
    setPhase(nextPhase === 'inhale' ? 'exhale' : 'inhale');
  }, seconds * 1000);
}

function startBreathing() {
  if (running) return;
  const settings = settingsFromForm();
  saveSettings(settings);
  running = true;
  $('breathStart').hidden = true;
  $('breathStop').hidden = false;
  $('breathTempo').open = false;
  setPhase('inhale');
}

function stopBreathing() {
  running = false;
  phase = 'rest';
  clearPhaseTimer();
  const orb = $('breathOrb');
  orb.classList.remove('inhale', 'exhale');
  orb.style.removeProperty('--breath-duration');
  $('breathCue').textContent = 'Bereit';
  $('breathStart').hidden = false;
  $('breathStart').textContent = 'Start';
  $('breathStop').hidden = true;
}

function openBreathing() {
  stopBreathing();
  renderSettings();
  openDialog('breathDialog');
}

function saveTempo() {
  const settings = settingsFromForm();
  saveSettings(settings);
  renderSettings();
}

export function initBreathFeature() {
  $('openBreath').addEventListener('click', openBreathing);
  $('openBreathFromStuck').addEventListener('click', () => {
    $('stuckDialog').close();
    openBreathing();
  });
  $('breathStart').addEventListener('click', startBreathing);
  $('breathStop').addEventListener('click', stopBreathing);
  $('breathInhaleSeconds').addEventListener('change', saveTempo);
  $('breathExhaleSeconds').addEventListener('change', saveTempo);
  $('breathDialog').addEventListener('close', stopBreathing);
}
