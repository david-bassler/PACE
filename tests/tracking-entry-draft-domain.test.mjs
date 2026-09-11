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

test('unfinished drafts are not discarded merely because they are old', () => {
  const next = pruneTrackingDrafts({
    recent: { updatedAt: '2026-09-10T12:00:00.000Z' },
    old: { updatedAt: '2026-07-01T12:00:00.000Z' }
  });
  assert.deepEqual(Object.keys(next), ['recent', 'old']);
});

test('unfinished drafts are not capped at twenty entries', () => {
  const drafts = Object.fromEntries(
    Array.from({ length: 25 }, (_, index) => [
      `draft-${index}`,
      { updatedAt: '2026-09-11T10:00:00.000Z' }
    ])
  );
  assert.equal(Object.keys(pruneTrackingDrafts(drafts)).length, 25);
});

test('malformed draft entries are ignored', () => {
  const next = pruneTrackingDrafts({ good: { updatedAt: '2026-09-11T10:00:00.000Z' }, bad: null });
  assert.deepEqual(Object.keys(next), ['good']);
});
