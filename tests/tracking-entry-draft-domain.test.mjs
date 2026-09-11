import test from 'node:test';
import assert from 'node:assert/strict';

import {
  pruneTrackingDrafts,
  removeTrackingDraft,
  trackingDraftIdentity,
  upsertTrackingDraft
} from '../js/features/tracking-entry-draft-domain.js';

test('draft identity is stable regardless of field order', () => {
  assert.equal(trackingDraftIdentity(['b', 'a']), 'a|b');
  assert.equal(trackingDraftIdentity(['a', 'b']), 'a|b');
});

test('upsert stores values and timestamp', () => {
  const now = Date.parse('2026-09-11T10:00:00.000Z');
  const next = upsertTrackingDraft({}, {
    identity: 'a|b',
    title: 'Abendroutine',
    values: { a: { value: 'Ja' } }
  }, now);
  assert.equal(next['a|b'].title, 'Abendroutine');
  assert.equal(next['a|b'].updatedAt, '2026-09-11T10:00:00.000Z');
});

test('successful submission can remove exactly one draft', () => {
  const drafts = {
    a: { identity: 'a', updatedAt: '2026-09-11T10:00:00.000Z' },
    b: { identity: 'b', updatedAt: '2026-09-11T10:00:00.000Z' }
  };
  assert.deepEqual(Object.keys(removeTrackingDraft(drafts, 'a')), ['b']);
});

test('pruning drops drafts older than 30 days', () => {
  const now = Date.parse('2026-09-11T12:00:00.000Z');
  const next = pruneTrackingDrafts({
    recent: { updatedAt: '2026-09-10T12:00:00.000Z' },
    old: { updatedAt: '2026-07-01T12:00:00.000Z' }
  }, now);
  assert.deepEqual(Object.keys(next), ['recent']);
});
