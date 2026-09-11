const NOTE_START = '[[PACE:v2]]';
const NOTE_END = '[[/PACE]]';

function text(value) {
  return String(value ?? '');
}

export function journalValueHash(value) {
  let hash = 2166136261;
  for (const char of text(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function journalTargetKey({ targetDate, sheetTab, columnId } = {}) {
  return [text(targetDate), text(sheetTab), text(columnId)].join('\u001f');
}

export function operationItemId(operationId, index) {
  return `${text(operationId)}:${Number(index)}`;
}

export function journalEventToRow(event) {
  return [
    text(event.eventId),
    text(event.operationId),
    text(event.createdAt),
    text(event.eventType || 'item'),
    text(event.targetDate),
    text(event.sheetTab),
    text(event.columnId),
    text(event.fieldId),
    text(event.title),
    text(event.writeMode),
    text(event.value),
    text(event.baselineValue),
    text(event.source)
  ];
}

export function journalEventFromRow(row = [], rowNumber = 0) {
  const [
    eventId,
    operationId,
    createdAt,
    eventType,
    targetDate,
    sheetTab,
    columnId,
    fieldId,
    title,
    writeMode,
    value,
    baselineValue,
    source
  ] = row;

  if (!eventId || !targetDate || !sheetTab || !columnId) return null;
  return {
    eventId: text(eventId),
    operationId: text(operationId),
    createdAt: text(createdAt),
    eventType: text(eventType || 'item'),
    targetDate: text(targetDate),
    sheetTab: text(sheetTab),
    columnId: text(columnId),
    fieldId: text(fieldId),
    title: text(title),
    writeMode: text(writeMode || 'append_newline'),
    value: text(value),
    baselineValue: text(baselineValue),
    source: text(source),
    rowNumber: Number(rowNumber || 0)
  };
}

export function dedupeJournalEvents(events = []) {
  const seen = new Set();
  const result = [];
  for (const event of events) {
    if (!event?.eventId || seen.has(event.eventId)) continue;
    seen.add(event.eventId);
    result.push(event);
  }
  return result;
}

export function groupJournalEvents(events = []) {
  const groups = new Map();
  for (const event of dedupeJournalEvents(events)) {
    const key = journalTargetKey(event);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  return groups;
}

export function replayJournalEvents(events = [], applyWriteMode) {
  const ordered = dedupeJournalEvents(events);
  if (!ordered.length) return '';

  let value = text(ordered[0].baselineValue);
  for (const event of ordered) {
    if (event.eventType === 'rebase') {
      value = text(event.value);
      continue;
    }
    value = applyWriteMode(value, event.value, event.writeMode || 'append_newline');
  }
  return value;
}

export function parsePaceNote(note = '') {
  const raw = text(note);
  const start = raw.indexOf(NOTE_START);
  const end = start >= 0 ? raw.indexOf(NOTE_END, start + NOTE_START.length) : -1;
  if (start < 0 || end < 0) {
    return { userNote: raw, meta: null };
  }

  const before = raw.slice(0, start).trimEnd();
  const after = raw.slice(end + NOTE_END.length).trimStart();
  const userNote = [before, after].filter(Boolean).join('\n\n');
  const json = raw.slice(start + NOTE_START.length, end).trim();
  try {
    const meta = JSON.parse(json);
    return { userNote, meta: meta && typeof meta === 'object' ? meta : null };
  } catch {
    return { userNote: raw, meta: null };
  }
}

export function formatPaceNote(userNote = '', meta = {}) {
  const cleanUser = text(userNote).trimEnd();
  const block = `${NOTE_START}\n${JSON.stringify(meta)}\n${NOTE_END}`;
  return cleanUser ? `${cleanUser}\n\n${block}` : block;
}

export function journalEventIds(events = []) {
  return dedupeJournalEvents(events).map(event => event.eventId);
}

export function noteCoversEvents(meta, events = []) {
  if (!meta || !Array.isArray(meta.appliedEventIds)) return false;
  const applied = new Set(meta.appliedEventIds.map(text));
  return journalEventIds(events).every(id => applied.has(id));
}

export function noteMatchesMaterializedValue(meta, currentValue) {
  if (!meta) return false;
  if (meta.materializedHash) return text(meta.materializedHash) === journalValueHash(currentValue);
  if (Object.prototype.hasOwnProperty.call(meta, 'materializedValue')) {
    return text(meta.materializedValue) === text(currentValue);
  }
  return false;
}

export function shouldRebaseExternalEdit({ currentValue, noteMeta, existingEvents } = {}) {
  if (!noteMeta) return false;
  const covers = noteCoversEvents(noteMeta, existingEvents);
  const matchesMaterialized = noteMatchesMaterializedValue(noteMeta, currentValue);

  // Wenn die Note älter als das Remote-Journal ist, ist ein unveränderter
  // Zellwert eindeutig: PACE darf die fehlenden Journal-Events nachziehen.
  // Weicht der Zellwert gleichzeitig ab, ist nicht unterscheidbar, ob eine
  // manuelle Änderung oder ein ungewöhnlicher Teilzustand vorliegt. Fail closed:
  // lieber sichtbar blockieren als einen fremden Zellinhalt überschreiben.
  if (!covers && !matchesMaterialized) {
    throw new Error('Die Tracking-Zelle wurde geändert, während noch nicht alle Remote-Ereignisse materialisiert waren. PACE überschreibt diesen mehrdeutigen Zustand nicht automatisch.');
  }

  return covers && !matchesMaterialized;
}

export function canRecoverMissingNote({ currentValue, existingEvents, applyWriteMode } = {}) {
  if (!existingEvents?.length) return true;
  const baseline = text(existingEvents[0].baselineValue);
  const expected = replayJournalEvents(existingEvents, applyWriteMode);
  const current = text(currentValue);
  return current === baseline || current === expected;
}
