import { isConnected } from './google.js';

const handlers = new Map();
const dirtyVersions = new Map();
const listeners = new Set();

let version = 0;
let timer = null;
let running = null;
let requestedFull = false;
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

async function performPass(full) {
  emit('syncing');
  const names = full ? [...handlers.keys()] : [...dirtyVersions.keys()];

  for (const name of names) {
    const handler = handlers.get(name);
    if (!handler) continue;
    const capturedVersion = dirtyVersions.get(name);
    await (full ? handler.full : handler.push)();

    // Do not erase a newer local edit that happened while this feature was
    // being written. It will be handled by the next pass in the same queue.
    if (dirtyVersions.get(name) === capturedVersion) dirtyVersions.delete(name);
  }
}

async function run(full) {
  if (!isConnected()) {
    emit(dirtyVersions.size ? 'pending' : 'local');
    return;
  }

  requestedFull = requestedFull || full;
  if (running) return running;

  running = (async () => {
    try {
      do {
        const doFull = requestedFull;
        requestedFull = false;
        await performPass(doFull);

        // If data changed during the pass, immediately flush the remaining
        // dirty features instead of starting a parallel or overlapping sync.
      } while (requestedFull || dirtyVersions.size);

      emit('synced');
    } catch (error) {
      emit('error', error);
      throw error;
    } finally {
      running = null;
    }
  })();

  return running;
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
