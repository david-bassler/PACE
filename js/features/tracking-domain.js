export function buildTrackingWritePlan(fields = [], valuesById = {}) {
  return fields
    .map(field => ({
      fieldId: field.id,
      title: field.title,
      sheetTab: field.sheetTab || '',
      columnId: field.columnId || '',
      writeMode: field.writeMode || 'append_newline',
      value: String(valuesById[field.id] ?? '').trim()
    }))
    .filter(item => item.value);
}

function cellValue(row) {
  return Array.isArray(row) ? row[0] : row;
}

function normalizedCell(value) {
  return String(value ?? '').trim();
}

export function findTrackingIdRow(firstColumnValues = []) {
  const matches = [];

  firstColumnValues.forEach((row, index) => {
    if (normalizedCell(cellValue(row)).toLocaleLowerCase('de-DE') === 'id') matches.push(index + 1);
  });

  if (!matches.length) {
    throw new Error('Keine eindeutige ID-Zeile gefunden: In der ersten Spalte fehlt eine Zelle mit exakt „ID“.');
  }
  if (matches.length > 1) {
    throw new Error('Mehrere ID-Zeilen gefunden. PACE schreibt erst, wenn die ID-Zeile eindeutig ist.');
  }

  return matches[0];
}

export function resolveTrackingColumns(idRow = [], requiredIds = []) {
  const positions = new Map();
  const duplicates = new Set();

  idRow.forEach((value, index) => {
    if (index === 0) return;
    const id = normalizedCell(value);
    if (!id) return;
    if (positions.has(id)) duplicates.add(id);
    else positions.set(id, index + 1);
  });

  if (duplicates.size) {
    throw new Error(`Spalten-ID mehrfach vorhanden: ${[...duplicates].join(', ')}. PACE schreibt nicht, solange IDs doppelt sind.`);
  }

  const resolved = {};
  for (const rawId of requiredIds) {
    const id = normalizedCell(rawId);
    if (!id) throw new Error('Eine konfigurierte Spalten-ID ist leer.');
    if (!positions.has(id)) {
      throw new Error(`Konfigurierte Spalten-ID ${id} fehlt in der ID-Zeile. PACE verwendet keine Ersatzspalte.`);
    }
    resolved[id] = positions.get(id);
  }

  return resolved;
}

export function dateKeyInTimeZone(date = new Date(), timeZone = 'UTC') {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function serialForDateKey(dateKey) {
  const match = String(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return NaN;
  const [, year, month, day] = match;
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((Date.UTC(Number(year), Number(month) - 1, Number(day)) - epoch) / 86400000);
}

function stringDateKey(value) {
  const raw = normalizedCell(value);
  let match = raw.match(/^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})$/);
  if (match) {
    return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
  }

  match = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (match) {
    return `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
  }

  return '';
}

export function trackingDateMatches(value, dateKey) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value + 1e-9) === serialForDateKey(dateKey);
  }

  const raw = normalizedCell(value);
  if (!raw) return false;
  if (/^-?\d+(?:\.\d+)?$/.test(raw) && Number.isFinite(Number(raw))) {
    return Math.floor(Number(raw) + 1e-9) === serialForDateKey(dateKey);
  }

  return stringDateKey(raw) === dateKey;
}

export function findTrackingDateRow(firstColumnValues = [], dateKey, { afterRow = 0 } = {}) {
  const matches = [];

  firstColumnValues.forEach((row, index) => {
    const rowNumber = index + 1;
    if (rowNumber <= afterRow) return;
    if (trackingDateMatches(cellValue(row), dateKey)) matches.push(rowNumber);
  });

  if (!matches.length) {
    throw new Error(`Für ${dateKey} wurde keine Datenzeile in der ersten Spalte gefunden.`);
  }
  if (matches.length > 1) {
    throw new Error(`Für ${dateKey} wurden mehrere Datenzeilen gefunden. PACE schreibt erst, wenn das Datum eindeutig ist.`);
  }

  return matches[0];
}

export function applyTrackingWriteMode(existingValue, newValue, writeMode = 'append_newline') {
  const existing = String(existingValue ?? '');
  const incoming = String(newValue ?? '');

  if (writeMode === 'replace') return incoming;
  if (writeMode !== 'append_newline') throw new Error(`Unbekannter Schreibmodus: ${writeMode}`);
  if (!existing) return incoming;
  if (!incoming) return existing;
  return `${existing}\n${incoming}`;
}
