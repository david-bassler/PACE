import test from 'node:test';
import assert from 'node:assert/strict';

import { applyTrackingWriteMode } from '../js/features/tracking-domain.js';
import {
  canRecoverMissingNote,
  dedupeJournalEvents,
  formatPaceNote,
  journalEventFromRow,
  journalEventToRow,
  journalTargetKey,
  noteCoversEvents,
  parsePaceNote,
  replayJournalEvents,
  shouldRebaseExternalEdit
} from '../js/features/tracking-journal-domain.js';

function item(id, value, writeMode = 'append_newline', baselineValue = '') {
  return {
    eventId: id,
    operationId: id.split(':')[0],
    createdAt: '2026-09-11T10:00:00.000Z',
    eventType: 'item',
    targetDate: '2026-09-11',
    sheetTab: 'Tage',
    columnId: 'coffee',
    fieldId: 'coffee',
    title: 'Kaffee',
    writeMode,
    value,
    baselineValue,
    source: 'test'
  };
}

test('journal rows round-trip including baseline and source', () => {
  const original = item('op-1:0', '10:13', 'append_newline', '09:00');
  const row = journalEventToRow(original);
  const restored = journalEventFromRow(row, 7);
  assert.equal(restored.eventId, original.eventId);
  assert.equal(restored.baselineValue, '09:00');
  assert.equal(restored.source, 'test');
  assert.equal(restored.rowNumber, 7);
});

test('duplicate remote retries are deduplicated by event id', () => {
  const first = item('op-1:0', '10:13');
  const duplicate = { ...first, rowNumber: 9 };
  assert.deepEqual(dedupeJournalEvents([first, duplicate]).map(event => event.eventId), ['op-1:0']);
});

test('two identical intentional operations remain two journal events', () => {
  const events = [
    item('op-1:0', 'Kaffee', 'append_newline', ''),
    item('op-2:0', 'Kaffee', 'append_newline', '')
  ];
  assert.equal(replayJournalEvents(events, applyTrackingWriteMode), 'Kaffee\nKaffee');
});

test('replay starts from first baseline and preserves every append event', () => {
  const events = [
    item('op-1:0', '10:13', 'append_newline', '09:00'),
    item('op-2:0', '11:02', 'append_newline', 'ignored later baseline')
  ];
  assert.equal(replayJournalEvents(events, applyTrackingWriteMode), '09:00\n10:13\n11:02');
});

test('a rebase preserves a manual change before later events', () => {
  const events = [
    item('op-1:0', '10:13', 'append_newline', '09:00'),
    {
      ...item('rebase-1', 'manuell korrigiert', 'replace'),
      eventType: 'rebase'
    },
    item('op-2:0', '12:20')
  ];
  assert.equal(replayJournalEvents(events, applyTrackingWriteMode), 'manuell korrigiert\n12:20');
});

test('PACE note preserves an existing user note', () => {
  const note = formatPaceNote('eigene Notiz', {
    version: 2,
    appliedEventIds: ['op-1:0'],
    materializedValue: '10:13'
  });
  const parsed = parsePaceNote(note);
  assert.equal(parsed.userNote, 'eigene Notiz');
  assert.deepEqual(parsed.meta.appliedEventIds, ['op-1:0']);
});

test('manual edit is rebased only when note covered all known remote events', () => {
  const events = [item('op-1:0', '10:13')];
  const complete = { appliedEventIds: ['op-1:0'], materializedValue: '10:13' };
  assert.equal(shouldRebaseExternalEdit({ currentValue: '10:15', noteMeta: complete, existingEvents: events }), true);

  const incomplete = { appliedEventIds: [], materializedValue: '' };
  assert.equal(shouldRebaseExternalEdit({ currentValue: '10:15', noteMeta: incomplete, existingEvents: events }), false);
});

test('missing note is only auto-recoverable from baseline or fully replayed value', () => {
  const events = [item('op-1:0', '10:13', 'append_newline', '09:00')];
  assert.equal(canRecoverMissingNote({ currentValue: '09:00', existingEvents: events, applyWriteMode: applyTrackingWriteMode }), true);
  assert.equal(canRecoverMissingNote({ currentValue: '09:00\n10:13', existingEvents: events, applyWriteMode: applyTrackingWriteMode }), true);
  assert.equal(canRecoverMissingNote({ currentValue: 'manuelle Zwischenversion', existingEvents: events, applyWriteMode: applyTrackingWriteMode }), false);
});

test('target key separates days, sheets and columns', () => {
  const base = item('op-1:0', 'x');
  assert.notEqual(journalTargetKey(base), journalTargetKey({ ...base, targetDate: '2026-09-12' }));
  assert.notEqual(journalTargetKey(base), journalTargetKey({ ...base, columnId: 'tea' }));
});

test('note coverage requires every known event id', () => {
  const events = [item('op-1:0', 'a'), item('op-2:0', 'b')];
  assert.equal(noteCoversEvents({ appliedEventIds: ['op-1:0', 'op-2:0'] }, events), true);
  assert.equal(noteCoversEvents({ appliedEventIds: ['op-1:0'] }, events), false);
});
