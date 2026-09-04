import { isConnected } from './google.js';

const handlers = new Map();
const dirtyVersions = new Map();
const listeners = new Set();

let version = 0;
let timer = null;
let running = null;
let rerunAll = false;
let currentState = 'local';
let currentError = null;

function emit(state, error = null) {
  currentState = state;
  currentError = error;
  for (const listener of listeners) listener({ state, error, connected: isConnected() });
}

export function onSyncState(listener) {
  if (!listener) return () => {};
  listeners.add(listener);
  listener({ state: currentState, error: currentError, connected: isConnected() });
  return () => listeners.delete(listener);
}

export function registerSync(name, handlersForFeature) {
  handlers.set(name, {
    push: handlersForFeature.push,
    full: handlersForFeature.full || handlersForFeature.push
  });
}

export function markDirty(name) {
  version += 1;
  dirtyVersions.set(name, version);
  emit('pending');
  clearTimeout(timer);
  if (isConnected()) {
    timer = setTimeout(() => {
      syncPending().catch(() => {});
    }, 1400);
  }
}

async function run(full) {
  if (!isConnected()) {
    emit(dirtyVersions.size ? 'pending' : 'local');
    return;
  }

  if (running) {
    rerunAll = rerunAll || full;
    return running;
  }

  running = (async () => {
    emit('syncing');
    const names = full ? [...handlers.keys()] : [...dirtyVersions.keys()];

    for (const name of names) {
      const handler = handlers.get(name);
      if (!handler) continue;
      const capturedVersion = dirtyVersions.get(name);
      await (full ? handler.full : handler.push)();

      // Only clear the dirty flag if nothing changed while this feature was
      // being written. A newer local edit remains queued for another pass.
      if (dirtyVersions.get(name) === capturedVersion || full) {
        dirtyVersions.delete(name);
      }
    }

    emit(dirtyVersions.size ? 'pending' : 'synced');
  })();

  try {
    await running;
  } catch (error) {
    emit('error', error);
    throw error;
  } finally {
    running = null;
    if (rerunAll || dirtyVersions.size) {
      const shouldRunAll = rerunAll;
      rerunAll = false;
      clearTimeout(timer);
      if (isConnected()) {
        timer = setTimeout(() => {
          (shouldRunAll ? syncAll() : syncPending()).catch(() => {});
        }, 900);
      }
    }
  }
}

export function syncPending() {
  return run(false);
}

export function syncAll() {
  return run(true);
}

export function refreshSyncState() {
  emit(dirtyVersions.size ? 'pending' : (isConnected() ? 'synced' : 'local'));
}
