export const KEYS = {
  config: 'pace-google-config',
  legacyConfig: ['pace-google-config-v2', 'pace-google-config-v1'],
  day: 'pace-day-v5',
  legacyDay: 'pace-day-v4',
  energy: 'pace-energy-v5',
  legacyEnergy: 'pace-energy-v4',
  content: 'pace-private-content-v2',
  legacyContent: 'pace-private-content-v1'
};

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

export function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function dateKey(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function nowIso() {
  return new Date().toISOString();
}

export function uid(prefix = 'id') {
  if (crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
