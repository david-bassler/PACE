import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeUpdatedById } from '../js/core/collections.js';

test('mergeUpdatedById keeps the newest item', () => {
  const local = [{ id: 'a', value: 'local', updatedAt: '2026-09-06T12:00:00Z' }];
  const remote = [{ id: 'a', value: 'remote', updatedAt: '2026-09-06T13:00:00Z' }];
  assert.equal(mergeUpdatedById(local, remote)[0].value, 'remote');
});

test('mergeUpdatedById keeps local data on equal timestamps', () => {
  const local = [{ id: 'a', value: 'local', updatedAt: 'same' }];
  const remote = [{ id: 'a', value: 'remote', updatedAt: 'same' }];
  assert.equal(mergeUpdatedById(local, remote)[0].value, 'local');
});

test('mergeUpdatedById ignores records without stable IDs', () => {
  assert.deepEqual(mergeUpdatedById([{ value: 1 }], [{ id: 'a', value: 2 }]), [{ id: 'a', value: 2 }]);
});
