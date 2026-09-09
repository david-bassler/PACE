import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findQuickCaptureCommand,
  quickCaptureMatches,
  removeQuickCaptureLine
} from '../js/features/quick-capture-domain.js';

test('finds a lower-case quick capture command at the end of a line', () => {
  const text = '10:13 Brötchen ,,e';
  assert.deepEqual(findQuickCaptureCommand(text, text.length), {
    lineStart: 0,
    lineEnd: text.length,
    triggerStart: 15,
    caret: text.length,
    query: 'e',
    payload: '10:13 Brötchen'
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

test('removes the selected middle line including its trailing newline', () => {
  const text = 'oben\n10:13 Brötchen ,,e\nunten';
  const caret = text.indexOf('\nunten');
  const command = findQuickCaptureCommand(text, caret);
  assert.deepEqual(removeQuickCaptureLine(text, command), {
    text: 'oben\nunten',
    cursor: 5
  });
});

test('removes the last line without leaving an extra trailing newline', () => {
  const text = 'oben\n10:13 Brötchen ,,e';
  const command = findQuickCaptureCommand(text, text.length);
  assert.deepEqual(removeQuickCaptureLine(text, command), {
    text: 'oben',
    cursor: 4
  });
});
