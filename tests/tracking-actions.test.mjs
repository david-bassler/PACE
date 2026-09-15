import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyTrackingWriteMode,
  buildTrackingWritePlan,
  setTrackingWriteActions
} from '../js/features/tracking-domain.js';

const FIELD = {
  id: 'field-event',
  title: 'Ereignis',
  sheetTab: 'Tage',
  columnId: '42',
  writeMode: 'append_newline'
};

test.afterEach(() => setTrackingWriteActions([]));

test('a configured follow-up write is frozen into the capture plan', () => {
  setTrackingWriteActions([{
    id: 'action-score',
    triggerFieldId: FIELD.id,
    condition: 'nonempty',
    sheetTab: 'Tage',
    columnId: '43',
    operation: 'add_number',
    value: '30',
    order: 10,
    status: 'active'
  }]);

  const plan = buildTrackingWritePlan([FIELD], { [FIELD.id]: '  Beispiel  ' });

  assert.equal(plan.length, 1);
  assert.equal(plan[0].value, 'Beispiel');
  assert.deepEqual(plan[0].followUpWrites, [{
    fieldId: 'action:action-score',
    actionId: 'action-score',
    triggerFieldId: FIELD.id,
    title: 'Ereignis · Folgeaktion',
    sheetTab: 'Tage',
    columnId: '43',
    writeMode: 'add_number',
    value: '30'
  }]);

  setTrackingWriteActions([]);
  assert.equal(plan[0].followUpWrites[0].value, '30');
});

test('equals condition only attaches the action for the exact trimmed input', () => {
  const action = {
    id: 'action-yes',
    triggerFieldId: FIELD.id,
    condition: 'equals',
    conditionValue: 'Ja',
    sheetTab: 'Tage',
    columnId: '44',
    operation: 'replace',
    value: 'markiert',
    status: 'active'
  };

  assert.equal(buildTrackingWritePlan([FIELD], { [FIELD.id]: 'Nein' }, [action])[0].followUpWrites, undefined);
  assert.equal(buildTrackingWritePlan([FIELD], { [FIELD.id]: ' Ja ' }, [action])[0].followUpWrites.length, 1);
});

test('numeric add treats an empty target as zero and writes arithmetic results', () => {
  assert.equal(applyTrackingWriteMode('', '30', 'add_number'), 30);
  assert.equal(applyTrackingWriteMode('30', '30', 'add_number'), 60);
  assert.equal(applyTrackingWriteMode('1,5', '0,5', 'add_number'), 2);
  assert.throws(() => applyTrackingWriteMode('Text', '30', 'add_number'), /keine Zahl/);
});
