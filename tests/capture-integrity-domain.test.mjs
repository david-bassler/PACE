import test from 'node:test';
import assert from 'node:assert/strict';

import {
  needsRecovery,
  pruneCaptureJournal,
  reconcileCaptureJournal,
  sameCapture
} from '../js/features/capture-integrity-domain.js';

const captured = {
  id: 'safety-1',
  createdAt: '2026-09-11T10:00:00.000Z',
  fieldTitle: 'Kaffee',
  value: '12:03'
};

const queued = {
  id: 'queue-1',
  createdAt: '2026-09-11T10:00:00.100Z',
  fieldTitle: 'Kaffee',
  plan: { title: 'Kaffee', value: '12:03' }
};

test('matches a safety capture to its durable queue entry', () => {
  assert.equal(sameCapture(captured, queued), true);
  assert.equal(sameCapture(captured, { ...queued, plan: { ...queued.plan, value: '12:04' } }), false);
});

test('reconciliation remembers the queue id before considering an entry confirmed', () => {
  const now = Date.parse('2026-09-11T10:00:01.000Z');
  const [next] = reconcileCaptureJournal([{ ...captured, state: 'captured' }], [queued], now);
  assert.equal(next.state, 'queued');
  assert.equal(next.queueId, 'queue-1');
  assert.ok(next.queuedAt);
});

test('a previously observed queue entry becomes confirmed only after it disappears', () => {
  const first = reconcileCaptureJournal(
    [{ ...captured, state: 'captured' }],
    [queued],
    Date.parse('2026-09-11T10:00:01.000Z')
  );
  const [next] = reconcileCaptureJournal(first, [], Date.parse('2026-09-11T10:00:03.000Z'));
  assert.equal(next.state, 'confirmed');
  assert.ok(next.confirmedAt);
});

test('a capture that was never observed in the queue is not silently declared successful', () => {
  const [next] = reconcileCaptureJournal(
    [{ ...captured, state: 'captured' }],
    [],
    Date.parse('2026-09-11T10:00:10.000Z')
  );
  assert.equal(next.state, 'captured');
  assert.equal(needsRecovery(next, Date.parse('2026-09-11T10:00:10.000Z')), true);
});

test('two identical captures need two distinct queue entries', () => {
  const secondCapture = {
    ...captured,
    id: 'safety-2',
    createdAt: '2026-09-11T10:00:00.500Z'
  };
  const [first, second] = reconcileCaptureJournal(
    [
      { ...captured, state: 'captured' },
      { ...secondCapture, state: 'captured' }
    ],
    [queued],
    Date.parse('2026-09-11T10:00:01.000Z')
  );
  assert.equal(first.state, 'queued');
  assert.equal(first.queueId, 'queue-1');
  assert.equal(second.state, 'captured');
  assert.equal(second.queueId, undefined);
});

test('two identical captures are both tracked when two queue entries exist', () => {
  const secondCapture = {
    ...captured,
    id: 'safety-2',
    createdAt: '2026-09-11T10:00:00.500Z'
  };
  const secondQueue = {
    ...queued,
    id: 'queue-2',
    createdAt: '2026-09-11T10:00:00.600Z'
  };
  const next = reconcileCaptureJournal(
    [
      { ...captured, state: 'captured' },
      { ...secondCapture, state: 'captured' }
    ],
    [queued, secondQueue],
    Date.parse('2026-09-11T10:00:01.000Z')
  );
  assert.deepEqual(next.map(entry => entry.queueId), ['queue-1', 'queue-2']);
});

test('pruning keeps unconfirmed entries much longer than confirmed history', () => {
  const now = Date.parse('2026-09-11T12:00:00.000Z');
  const oldConfirmed = { ...captured, state: 'confirmed', confirmedAt: '2026-09-09T10:00:00.000Z' };
  const oldUnconfirmed = { ...captured, id: 'safety-2', state: 'captured', createdAt: '2026-09-01T10:00:00.000Z' };
  const next = pruneCaptureJournal([oldConfirmed, oldUnconfirmed], now);
  assert.deepEqual(next.map(entry => entry.id), ['safety-2']);
});
