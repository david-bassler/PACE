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

const DB_NAME = 'pace-local';
const DB_VERSION = 1;
const STORE_NAME = 'keyvalue';
const PACE_KEY_PREFIX = 'pace-';

let cache = new Map();
let db = null;
let localStorageFallback = false;
let writeQueue = Promise.resolve();

function cloneFallback(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error || new Error('IndexedDB transaction aborted.')), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error || new Error('IndexedDB transaction failed.')), { once: true });
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.addEventListener('upgradeneeded', () => {
      const nextDb = request.result;
      if (!nextDb.objectStoreNames.contains(STORE_NAME)) nextDb.createObjectStore(STORE_NAME);
    });

    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error || new Error('IndexedDB could not be opened.')), { once: true });
    request.addEventListener('blocked', () => reject(new Error('IndexedDB upgrade is blocked by another PACE tab.')), { once: true });
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error || new Error('IndexedDB request failed.')), { once: true });
  });
}

async function hydrateCache(nextDb) {
  const transaction = nextDb.transaction(STORE_NAME, 'readonly');
  const store = transaction.objectStore(STORE_NAME);
  const [keys, values] = await Promise.all([
    requestResult(store.getAllKeys()),
    requestResult(store.getAll())
  ]);
  await transactionDone(transaction);
  cache = new Map(keys.map((key, index) => [String(key), String(values[index] ?? '')]));
}

function legacyLocalStorageEntries() {
  const entries = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(PACE_KEY_PREFIX)) continue;
      const value = localStorage.getItem(key);
      if (value !== null) entries.push([key, value]);
    }
  } catch {}
  return entries;
}

async function migrateLegacyLocalStorage(nextDb) {
  const entries = legacyLocalStorageEntries();
  if (!entries.length) return;

  const transaction = nextDb.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  for (const [key, value] of entries) store.put(value, key);
  await transactionDone(transaction);

  for (const [key, value] of entries) cache.set(key, value);

  // Erst nach erfolgreichem IndexedDB-Commit löschen. So geht beim Upgrade nichts verloren.
  try {
    for (const [key] of entries) localStorage.removeItem(key);
  } catch {}
}

function hydrateLocalStorageFallback() {
  cache = new Map(legacyLocalStorageEntries());
}

async function initializeStorage() {
  if (!('indexedDB' in globalThis)) {
    localStorageFallback = true;
    hydrateLocalStorageFallback();
    return;
  }

  try {
    db = await openDatabase();
    await hydrateCache(db);
    await migrateLegacyLocalStorage(db);
  } catch (error) {
    console.warn('PACE: IndexedDB unavailable, using localStorage fallback.', error);
    localStorageFallback = true;
    hydrateLocalStorageFallback();
  }
}

function queueWrite(operation) {
  if (localStorageFallback) {
    try { operation(null); } catch (error) { console.error('PACE: local storage write failed.', error); }
    return;
  }

  writeQueue = writeQueue
    .then(async () => {
      if (!db) throw new Error('IndexedDB is not initialized.');
      await operation(db);
    })
    .catch(error => {
      console.error('PACE: IndexedDB write failed.', error);
    });
}

function persistValue(key, value) {
  if (localStorageFallback) {
    localStorage.setItem(key, value);
    return;
  }

  queueWrite(async nextDb => {
    const transaction = nextDb.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(value, key);
    await transactionDone(transaction);
  });
}

export function loadValue(key, fallback = null) {
  if (cache.has(key)) return cache.get(key);
  return fallback;
}

export function saveValue(key, value) {
  const normalized = String(value);
  cache.set(key, normalized);
  persistValue(key, normalized);
}

export function removeValue(key) {
  cache.delete(key);

  if (localStorageFallback) {
    try { localStorage.removeItem(key); } catch {}
    return;
  }

  queueWrite(async nextDb => {
    const transaction = nextDb.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(key);
    await transactionDone(transaction);
  });
}

export function loadJSON(key, fallback) {
  try {
    const raw = loadValue(key, null);
    return raw !== null ? JSON.parse(raw) : cloneFallback(fallback);
  } catch {
    return cloneFallback(fallback);
  }
}

export function saveJSON(key, value) {
  saveValue(key, JSON.stringify(value));
}

export async function flushStorage() {
  await writeQueue;
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

// Dieses Modul wird von den zustandsbehafteten Features importiert. Durch das
// top-level await ist der IndexedDB-Cache gefüllt, bevor deren loadJSON-Aufrufe
// auf Modulebene ausgeführt werden.
export const storageReady = initializeStorage();
await storageReady;
