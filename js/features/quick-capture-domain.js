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

  // Only treat the trigger as a command while the caret is at the effective
  // end of the line. This prevents a command in the middle of existing text
  // from accidentally consuming the whole line.
  if (source.slice(caret, lineEnd).trim()) return null;

  const beforeCaret = source.slice(lineStart, caret);
  const relativeTrigger = beforeCaret.lastIndexOf(',,');
  if (relativeTrigger < 0) return null;

  const query = normalize(beforeCaret.slice(relativeTrigger + 2));
  const payload = source.slice(lineStart, lineStart + relativeTrigger).trim();

  return {
    lineStart,
    lineEnd,
    triggerStart: lineStart + relativeTrigger,
    caret,
    query,
    payload
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

export function removeQuickCaptureLine(text, command) {
  const source = String(text ?? '');
  if (!command) return { text: source, cursor: source.length };

  let start = Math.max(0, Number(command.lineStart) || 0);
  let end = Math.max(start, Number(command.lineEnd) || start);

  if (end < source.length && source[end] === '\n') {
    end += 1;
  } else if (start > 0 && source[start - 1] === '\n') {
    start -= 1;
  }

  return {
    text: source.slice(0, start) + source.slice(end),
    cursor: start
  };
}
