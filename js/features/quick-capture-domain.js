function normalize(value) {
  return String(value ?? '').trim().toLocaleLowerCase('de-DE');
}

export function findQuickCaptureCommand(text, caretPosition) {
  const source = String(text ?? '');
  const numericCaret = Number(caretPosition);
  const caret = Number.isFinite(numericCaret)
    ? Math.max(0, Math.min(source.length, numericCaret))
    : source.length;

  const lineStart = source.lastIndexOf('\n', Math.max(0, caret - 1)) + 1;
  let lineEnd = source.indexOf('\n', caret);
  if (lineEnd < 0) lineEnd = source.length;

  // The command itself still has to be on the current line. Its payload,
  // however, deliberately reaches all the way back to the start of the
  // textarea so a multi-line note can be dispatched in one action.
  if (source.slice(caret, lineEnd).trim()) return null;

  const beforeCaret = source.slice(lineStart, caret);
  const relativeTrigger = beforeCaret.lastIndexOf(',,');
  if (relativeTrigger < 0) return null;

  const triggerStart = lineStart + relativeTrigger;
  const query = normalize(beforeCaret.slice(relativeTrigger + 2));
  const payload = source.slice(0, triggerStart).trim();

  return {
    mode: 'prefix',
    lineStart,
    lineEnd,
    triggerStart,
    caret,
    query,
    payload
  };
}

export function createSelectionQuickCaptureCommand(text, selectionStart, selectionEnd) {
  const source = String(text ?? '');
  const numericStart = Number(selectionStart);
  const numericEnd = Number(selectionEnd);
  const start = Number.isFinite(numericStart) ? Math.max(0, Math.min(source.length, numericStart)) : 0;
  const end = Number.isFinite(numericEnd) ? Math.max(start, Math.min(source.length, numericEnd)) : start;
  if (start === end) return null;

  return {
    mode: 'selection',
    selectionStart: start,
    selectionEnd: end,
    query: '',
    payload: source.slice(start, end)
  };
}

export function insertQuickCaptureText(text, insertion, caretPosition = null) {
  const source = String(text ?? '');
  const value = String(insertion ?? '');
  const numericCaret = Number(caretPosition);
  const hasCaret = caretPosition !== null && caretPosition !== undefined && Number.isFinite(numericCaret);

  let position;
  let prefix = '';

  if (hasCaret) {
    position = Math.max(0, Math.min(source.length, numericCaret));
  } else if (!source) {
    position = 0;
  } else {
    position = source.length;
    if (!source.endsWith('\n')) prefix = '\n';
  }

  const inserted = `${prefix}${value}`;
  return {
    text: source.slice(0, position) + inserted + source.slice(position),
    cursor: position + inserted.length
  };
}

function matchScore(title, query) {
  if (!query) return 4;
  const normalized = normalize(title);
  if (normalized === query) return 0;
  if (normalized.startsWith(query)) return 1;
  if (normalized.split(/\s+/).some(part => part.startsWith(query))) return 2;
  if (normalized.includes(query)) return 3;
  return Number.POSITIVE_INFINITY;
}

export function quickCaptureMatches(fields = [], query = '', limit = 8) {
  const normalizedQuery = normalize(query);
  const max = Math.max(1, Number(limit) || 8);

  return fields
    .filter(field => field && field.status !== 'archived' && String(field.title || '').trim())
    .map((field, index) => ({
      field,
      index,
      score: matchScore(field.title, normalizedQuery),
      order: Number(field.order || 0)
    }))
    .filter(item => Number.isFinite(item.score))
    .sort((left, right) =>
      left.score - right.score ||
      left.order - right.order ||
      String(left.field.title).localeCompare(String(right.field.title), 'de-DE', { sensitivity: 'base' }) ||
      left.index - right.index
    )
    .slice(0, max)
    .map(item => item.field);
}

export function removeQuickCapturePrefix(text, command) {
  const source = String(text ?? '');
  if (!command) return { text: source, cursor: source.length };

  let end = Math.max(0, Number(command.lineEnd) || 0);
  if (end < source.length && source[end] === '\n') end += 1;

  return {
    text: source.slice(end),
    cursor: 0
  };
}

export function removeQuickCaptureSelection(text, command) {
  const source = String(text ?? '');
  if (!command) return { text: source, cursor: source.length };

  const start = Math.max(0, Math.min(source.length, Number(command.selectionStart) || 0));
  const end = Math.max(start, Math.min(source.length, Number(command.selectionEnd) || start));

  return {
    text: source.slice(0, start) + source.slice(end),
    cursor: start
  };
}
