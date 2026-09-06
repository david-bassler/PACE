import test from 'node:test';
import assert from 'node:assert/strict';

import { actionableProgressEntries } from '../js/features/progress-domain.js';
import { buildTrackingWritePlan } from '../js/features/tracking-domain.js';
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
