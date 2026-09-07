import test from 'node:test';
import assert from 'node:assert/strict';

import { actionableProgressEntries } from '../js/features/progress-domain.js';
import {
  applyTrackingWriteMode,
  buildTrackingWritePlan,
  dateKeyInTimeZone,
  findTrackingDateRow,
  findTrackingIdRow,
  planTrackingDateBackfill,
  resolveTrackingColumns,
  trackingDateSerial
} from '../js/features/tracking-domain.js';
import { holdingPointsForStatement, completedHoldingSituations } from '../js/features/holding-domain.js';
import { matchingResonanceEvents, chooseAnchorEvent } from '../js/features/wellbeing-domain.js';

test('progress clarification actions become actionable instead of the task itself', () => {
  const item = {
    id: 'task',
    type: 'Aufgabe',
    text: 'Etwas klären',
    taskMode: 'clarify',
    areaIds: ['a'],
    clarificationCycles: [{
      status: 'active',
      question: 'Was fehlt?',
      actions: [
        { id: 'x', text: 'Nachsehen', status: 'open' },
        { id: 'y', text: 'Schon getan', status: 'done' }
      ]
    }]
  };

  const entries = actionableProgressEntries([item]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, 'clarification');
  assert.equal(entries[0].text, 'Nachsehen');
});

test('completed clarification cycle produces a review action', () => {
  const item = {
    type: 'Aufgabe',
    text: 'Etwas klären',
    taskMode: 'clarify',
    clarificationCycles: [{
      status: 'active',
      question: 'Was fehlt?',
      actions: [{ text: 'Nachsehen', status: 'done' }]
    }]
  };

  assert.equal(actionableProgressEntries([item])[0].kind, 'clarification-review');
});

test('tracking write plan trims values and omits empty inputs', () => {
  const plan = buildTrackingWritePlan(
    [
      { id: 'a', title: 'A', sheetTab: 'Tabelle', columnId: 'x' },
      { id: 'b', title: 'B', sheetTab: 'Tabelle', columnId: 'y', writeMode: 'replace' }
    ],
    { a: '  Wert  ', b: '   ' }
  );

  assert.deepEqual(plan, [{
    fieldId: 'a',
    title: 'A',
    sheetTab: 'Tabelle',
    columnId: 'x',
    writeMode: 'append_newline',
    value: 'Wert'
  }]);
});

test('tracking layout resolves the ID row and stable columns fail closed', () => {
  assert.equal(findTrackingIdRow([['Kopf'], [' id '], ['07.09.2026']]), 2);
  assert.deepEqual(
    resolveTrackingColumns(['ID', '10', '20', '30'], ['20', '10']),
    { 10: 2, 20: 3 }
  );

  assert.throws(
    () => resolveTrackingColumns(['ID', '10', '10'], ['10']),
    /mehrfach/
  );
  assert.throws(
    () => resolveTrackingColumns(['ID', '10'], ['99']),
    /fehlt/
  );
});

test('tracking finds today from Google date serials and spreadsheet timezone', () => {
  assert.equal(
    dateKeyInTimeZone(new Date('2026-09-07T22:30:00Z'), 'Europe/Berlin'),
    '2026-09-08'
  );
  assert.equal(
    findTrackingDateRow([['ID'], ['Kopf'], [46272], ['08.09.2026']], '2026-09-07', { afterRow: 1 }),
    3
  );
  assert.throws(
    () => findTrackingDateRow([['ID'], [46272], ['7.9.2026']], '2026-09-07', { afterRow: 1 }),
    /mehrere/
  );
});

test('tracking fills every missing calendar day through today', () => {
  const fill = planTrackingDateBackfill(
    [
      ['ID'],
      ['Kopf'],
      [trackingDateSerial('2026-09-05')],
      [],
      []
    ],
    '2026-09-07',
    { afterRow: 1 }
  );

  assert.equal(fill.dateRow, 5);
  assert.equal(fill.previousDateRow, 3);
  assert.deepEqual(fill.missingDates, [
    { row: 4, dateKey: '2026-09-06', serial: trackingDateSerial('2026-09-06') },
    { row: 5, dateKey: '2026-09-07', serial: trackingDateSerial('2026-09-07') }
  ]);
});

test('tracking date backfill leaves an existing today row untouched', () => {
  const fill = planTrackingDateBackfill(
    [['ID'], [trackingDateSerial('2026-09-06')], [trackingDateSerial('2026-09-07')]],
    '2026-09-07',
    { afterRow: 1 }
  );

  assert.equal(fill.dateRow, 3);
  assert.deepEqual(fill.missingDates, []);
});

test('tracking date backfill refuses to overwrite content in column A', () => {
  assert.throws(
    () => planTrackingDateBackfill(
      [['ID'], [trackingDateSerial('2026-09-05')], ['Notiz']],
      '2026-09-07',
      { afterRow: 1 }
    ),
    /bereits Inhalt/
  );
});

test('tracking append mode preserves the existing cell and adds a newline', () => {
  assert.equal(applyTrackingWriteMode('08:10 Kaffee', '11:35 Kaffee'), '08:10 Kaffee\n11:35 Kaffee');
  assert.equal(applyTrackingWriteMode('', '11:35 Kaffee'), '11:35 Kaffee');
  assert.equal(applyTrackingWriteMode('alt', 'neu', 'replace'), 'neu');
});

test('holding selectors follow active links, active points and order', () => {
  const data = {
    statements: [],
    points: [
      { id: 'p1', active: true },
      { id: 'p2', active: false },
      { id: 'p3', active: true }
    ],
    links: [
      { id: 'l3', statementId: 's', pointId: 'p3', active: true, order: 20 },
      { id: 'l2', statementId: 's', pointId: 'p2', active: true, order: 5 },
      { id: 'l1', statementId: 's', pointId: 'p1', active: true, order: 10 }
    ],
    situations: [
      { id: 'old', statementId: 's', status: 'abgeschlossen', text: 'vorbei', completedAt: '2026-01-01' },
      { id: 'open', statementId: 's', status: 'offen', text: 'noch da' }
    ]
  };

  assert.deepEqual(holdingPointsForStatement(data, 's').map(item => item.id), ['p1', 'p3']);
  assert.deepEqual(completedHoldingSituations(data, 's').map(item => item.id), ['old']);
});

test('resonance matching supports any/all and ignores inactive events', () => {
  const events = [
    { id: 'a', tagIds: ['warm', 'nature'], active: true, context: 'reich' },
    { id: 'b', tagIds: ['warm'], active: true },
    { id: 'c', tagIds: ['warm', 'nature'], active: false }
  ];

  assert.deepEqual(
    matchingResonanceEvents(events, { tagIds: ['warm', 'nature'], matchMode: 'all' }).map(item => item.id),
    ['a']
  );
  assert.deepEqual(
    matchingResonanceEvents(events, { tagIds: ['nature'], matchMode: 'any' }).map(item => item.id),
    ['a']
  );

  const chosen = chooseAnchorEvent(events, { tagIds: ['warm'], matchMode: 'any' }, '', () => 0);
  assert.equal(chosen.id, 'a');
});
