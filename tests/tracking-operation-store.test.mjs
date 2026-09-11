import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  get length() {
    return this.values.size;
  }

  key(index) {
    return [...this.values.keys()][index] ?? null;
  }

  getItem(key) {
    const normalized = String(key);
    return this.values.has(normalized) ? this.values.get(normalized) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(String(key));
  }
}

globalThis.localStorage = new MemoryStorage();

const {
  REDUNDANT_OP_PREFIX,
  PRIMARY_OP_PREFIX,
  listTrackingOperations,
  removeTrackingOperation,
  saveTrackingOperation,
  updateTrackingOperation
} = await import('../js/features/tracking-operation-store.js');

function operation(id = 'op-1') {
  return {
    id,
    createdAt: '2026-09-11T10:00:00.000Z',
    updatedAt: '2026-09-11T10:00:00.000Z',
    state: 'captured',
    source: 'quick',
    fieldTitle: 'Kaffee',
    value: '10:00',
    plan: [{ fieldId: 'coffee', title: 'Kaffee', sheetTab: 'Tage', columnId: 'coffee', value: '10:00' }]
  };
}

test('operation is stored on primary and redundant local tracks', () => {
  saveTrackingOperation(operation());

  assert.ok(localStorage.getItem(`${PRIMARY_OP_PREFIX}op-1`));
  assert.ok(localStorage.getItem(`${REDUNDANT_OP_PREFIX}op-1`));
  assert.equal(listTrackingOperations().length, 1);
  assert.equal(listTrackingOperations()[0].state, 'captured');
});

test('state update keeps one stable operation id', () => {
  const original = listTrackingOperations()[0];
  updateTrackingOperation(original, {
    state: 'pending',
    updatedAt: '2026-09-11T10:01:00.000Z'
  });

  const all = listTrackingOperations();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, 'op-1');
  assert.equal(all[0].state, 'pending');
});

test('removing a terminal operation clears both local tracks', () => {
  removeTrackingOperation('op-1');

  assert.equal(localStorage.getItem(`${PRIMARY_OP_PREFIX}op-1`), null);
  assert.equal(localStorage.getItem(`${REDUNDANT_OP_PREFIX}op-1`), null);
  assert.deepEqual(listTrackingOperations(), []);
});
