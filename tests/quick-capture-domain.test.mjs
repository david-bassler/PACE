import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSelectionQuickCaptureCommand,
  findQuickCaptureCommand,
  insertQuickCaptureText,
  quickCaptureMatches,
  removeQuickCapturePrefix,
  removeQuickCaptureSelection
} from '../js/features/quick-capture-domain.js';

test('finds a lower-case quick capture command and captures everything before it', () => {
  const text = 'Erste Zeile\n10:13 Brötchen ,,e';
  assert.deepEqual(findQuickCaptureCommand(text, text.length), {
    mode: 'prefix',
    lineStart: 12,
    lineEnd: text.length,
    triggerStart: 27,
    caret: text.length,
    query: 'e',
    payload: 'Erste Zeile\n10:13 Brötchen'
  });
});

test('matches field titles case-insensitively and prefers prefixes', () => {
  const fields = [
    { id: '1', title: 'Energie', order: 20 },
    { id: '2', title: 'Essen', order: 10 },
    { id: '3', title: 'Notiz', order: 0 },
    { id: '4', title: 'Ehemalig', status: 'archived', order: 0 }
  ];

  assert.deepEqual(
    quickCaptureMatches(fields, 'e').map(field => field.title),
    ['Essen', 'Energie']
  );
  assert.deepEqual(
    quickCaptureMatches(fields, 'ESS').map(field => field.title),
    ['Essen']
  );
});

test('does not activate a command when text follows the caret on the same line', () => {
  const text = '10:13 Brötchen ,,e später';
  const caret = text.indexOf(' später');
  assert.equal(findQuickCaptureCommand(text, caret), null);
});

test('removes everything through the command line while preserving later text', () => {
  const text = 'Erste Zeile\n10:13 Brötchen ,,e\nSpäter';
  const caret = text.indexOf('\nSpäter');
  const command = findQuickCaptureCommand(text, caret);
  assert.deepEqual(removeQuickCapturePrefix(text, command), {
    text: 'Später',
    cursor: 0
  });
});

test('creates a command from exactly the selected text', () => {
  const text = 'vorher markierter Text nachher';
  const start = text.indexOf('markierter');
  const end = text.indexOf(' nachher');
  assert.deepEqual(createSelectionQuickCaptureCommand(text, start, end), {
    mode: 'selection',
    selectionStart: start,
    selectionEnd: end,
    query: '',
    payload: 'markierter Text'
  });
});

test('removes only the selected text after dispatch', () => {
  const text = 'vorher markierter Text nachher';
  const start = text.indexOf('markierter');
  const end = text.indexOf(' nachher');
  const command = createSelectionQuickCaptureCommand(text, start, end);
  assert.deepEqual(removeQuickCaptureSelection(text, command), {
    text: 'vorher  nachher',
    cursor: start
  });
});

test('inserts toolbar text exactly at the current caret', () => {
  assert.deepEqual(
    insertQuickCaptureText('Kaffee trinken', '06:47 ', 7),
    { text: 'Kaffee 06:47 trinken', cursor: 13 }
  );
});

test('inserts toolbar text at the beginning of an empty editor', () => {
  assert.deepEqual(
    insertQuickCaptureText('', '06:47 '),
    { text: '06:47 ', cursor: 6 }
  );
});

test('without an active caret toolbar text starts a new line', () => {
  assert.deepEqual(
    insertQuickCaptureText('Erste Zeile', '06:47 '),
    { text: 'Erste Zeile\n06:47 ', cursor: 18 }
  );
  assert.deepEqual(
    insertQuickCaptureText('Erste Zeile\n', '06:47 '),
    { text: 'Erste Zeile\n06:47 ', cursor: 18 }
  );
});
