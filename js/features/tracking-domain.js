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

function utcMsForDateKey(dateKey) {
  const match = String(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return NaN;
  const [, year, month, day] = match;
  const ms = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const actual = new Date(ms).toISOString().slice(0, 10);
  return actual === dateKey ? ms : NaN;
}

export function trackingDateSerial(dateKey) {
  const ms = utcMsForDateKey(dateKey);
  if (!Number.isFinite(ms)) return NaN;
  return Math.round((ms - Date.UTC(1899, 11, 30)) / 86400000);
}

function dateKeyForSerial(serial) {
  const value = Number(serial);
  if (!Number.isFinite(value)) return '';
  const wholeDays = Math.floor(value + 1e-9);
  return new Date(Date.UTC(1899, 11, 30) + wholeDays * 86400000).toISOString().slice(0, 10);
}

function stringDateKey(value) {
  const raw = normalizedCell(value);
  let match = raw.match(/^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})$/);
  if (match) {
    const key = `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
    return Number.isFinite(utcMsForDateKey(key)) ? key : '';
  }

  match = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (match) {
    const key = `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
    return Number.isFinite(utcMsForDateKey(key)) ? key : '';
  }

  return '';
}

export function trackingDateKey(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return dateKeyForSerial(value);

  const raw = normalizedCell(value);
  if (!raw) return '';
  if (/^-?\d+(?:\.\d+)?$/.test(raw) && Number.isFinite(Number(raw))) {
    return dateKeyForSerial(Number(raw));
  }

  return stringDateKey(raw);
}

export function trackingDateMatches(value, dateKey) {
  return trackingDateKey(value) === dateKey;
}

function nextDateKey(dateKey) {
  const ms = utcMsForDateKey(dateKey);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms + 86400000).toISOString().slice(0, 10);
}

function matchingDayPlaceholder(value, dateKey) {
  const raw = normalizedCell(value);
  if (!/^\d{1,2}$/.test(raw)) return false;

  const day = Number(dateKey.slice(8, 10));
  return Number(raw) === day;
}

export function planTrackingDateBackfill(firstColumnValues = [], dateKey, { afterRow = 0 } = {}) {
  if (!Number.isFinite(utcMsForDateKey(dateKey))) {
    throw new Error(`Ungültiges Zieldatum: ${dateKey}`);
  }

  const datedRows = [];
  firstColumnValues.forEach((row, index) => {
    const rowNumber = index + 1;
    if (rowNumber <= afterRow) return;
    const key = trackingDateKey(cellValue(row));
    if (key) datedRows.push({ row: rowNumber, dateKey: key });
  });

  const todayMatches = datedRows.filter(item => item.dateKey === dateKey);
  if (todayMatches.length > 1) {
    throw new Error(`Für ${dateKey} wurden mehrere Datenzeilen gefunden. PACE schreibt erst, wenn das Datum eindeutig ist.`);
  }
  if (todayMatches.length === 1) {
    return {
      dateRow: todayMatches[0].row,
      previousDateRow: null,
      previousDateKey: '',
      missingDates: []
    };
  }

  const earlier = datedRows.filter(item => item.dateKey < dateKey);
  if (!earlier.length) {
    throw new Error(`Für ${dateKey} fehlt eine frühere Datenzeile, an die PACE anschließen könnte.`);
  }

  const previousDateKey = earlier.reduce(
    (latest, item) => item.dateKey > latest ? item.dateKey : latest,
    earlier[0].dateKey
  );
  const previousMatches = earlier.filter(item => item.dateKey === previousDateKey);
  if (previousMatches.length > 1) {
    throw new Error(`Das letzte vorhandene Datum ${previousDateKey} kommt mehrfach vor. PACE ergänzt keine Tage, solange es nicht eindeutig ist.`);
  }

  const previous = previousMatches[0];
  const missingDates = [];
  let nextKey = nextDateKey(previousDateKey);
  let row = previous.row + 1;

  while (nextKey && nextKey <= dateKey) {
    const existing = normalizedCell(cellValue(firstColumnValues[row - 1]));
    if (existing && !matchingDayPlaceholder(existing, nextKey)) {
      throw new Error(`PACE müsste A${row} für ${nextKey} verwenden, dort steht aber bereits Inhalt. Es wurde nichts ergänzt.`);
    }

    missingDates.push({
      row,
      dateKey: nextKey,
      serial: trackingDateSerial(nextKey)
    });
    row += 1;
    nextKey = nextDateKey(nextKey);
  }

  return {
    dateRow: previous.row + missingDates.length,
    previousDateRow: previous.row,
    previousDateKey,
    missingDates
  };
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
