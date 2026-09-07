import {
  batchGetSpreadsheetValues,
  batchWriteSpreadsheetValues,
  columnName,
  getConfig,
  getSpreadsheetMetadata
} from '../core/google.js';
import {
  applyTrackingWriteMode,
  dateKeyInTimeZone,
  findTrackingDateRow,
  findTrackingIdRow,
  resolveTrackingColumns
} from './tracking-domain.js';

function quoteSheetTitle(title) {
  return `'${String(title).replace(/'/g, "''")}'`;
}

function sheetRange(title, range) {
  return `${quoteSheetTitle(title)}!${range}`;
}

function firstValue(valueRange) {
  return valueRange?.values?.[0]?.[0] ?? '';
}

function unique(values) {
  return [...new Set(values)];
}

function validatePlan(plan) {
  if (!plan.length) throw new Error('Keine Eingabe zum Speichern vorhanden.');

  for (const item of plan) {
    if (!item.sheetTab) throw new Error(`Für „${item.title}“ fehlt das Ziel-Tabellenblatt.`);
    if (!item.columnId) throw new Error(`Für „${item.title}“ fehlt die stabile Spalten-ID.`);
  }
}

function targetRange(item, layout) {
  const column = layout.columns[item.columnId];
  return sheetRange(item.sheetTab, `${columnName(column)}${layout.dateRow}`);
}

export async function writeTrackingPlan(plan, { now = new Date() } = {}) {
  validatePlan(plan);

  const config = getConfig();
  if (!config.trackingSheetId) {
    throw new Error('Bitte zuerst in den Einstellungen eine Tracking-Tabelle auswählen.');
  }

  const metadata = await getSpreadsheetMetadata(config.trackingSheetId);
  const knownTabs = new Set((metadata.sheets || []).map(sheet => sheet.properties?.title).filter(Boolean));
  const tabs = unique(plan.map(item => item.sheetTab));

  for (const tab of tabs) {
    if (!knownTabs.has(tab)) throw new Error(`Tabellenblatt „${tab}“ existiert in der ausgewählten Tracking-Tabelle nicht.`);
  }

  const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const timeZone = metadata.properties?.timeZone || browserTimeZone;
  const dateKey = dateKeyInTimeZone(now, timeZone);

  const firstColumnRanges = tabs.map(tab => sheetRange(tab, 'A:A'));
  const firstColumns = await batchGetSpreadsheetValues(config.trackingSheetId, firstColumnRanges, {
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'SERIAL_NUMBER'
  });

  const layouts = new Map();
  tabs.forEach((tab, index) => {
    const rows = firstColumns[index]?.values || [];
    const idRow = findTrackingIdRow(rows);
    const dateRow = findTrackingDateRow(rows, dateKey, { afterRow: idRow });
    layouts.set(tab, { idRow, dateRow, columns: {} });
  });

  const idRanges = tabs.map(tab => {
    const { idRow } = layouts.get(tab);
    return sheetRange(tab, `A${idRow}:ZZZ${idRow}`);
  });
  const idRows = await batchGetSpreadsheetValues(config.trackingSheetId, idRanges, {
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'SERIAL_NUMBER'
  });

  tabs.forEach((tab, index) => {
    const requiredIds = unique(plan.filter(item => item.sheetTab === tab).map(item => item.columnId));
    const row = idRows[index]?.values?.[0] || [];
    layouts.get(tab).columns = resolveTrackingColumns(row, requiredIds);
  });

  const rangeByField = new Map();
  for (const item of plan) rangeByField.set(item.fieldId, targetRange(item, layouts.get(item.sheetTab)));
  const targetRanges = unique([...rangeByField.values()]);

  const existingRanges = await batchGetSpreadsheetValues(config.trackingSheetId, targetRanges, {
    valueRenderOption: 'FORMULA',
    dateTimeRenderOption: 'SERIAL_NUMBER'
  });

  const currentByRange = new Map();
  targetRanges.forEach((range, index) => {
    const existing = firstValue(existingRanges[index]);
    if (typeof existing === 'string' && existing.startsWith('=')) {
      throw new Error(`Zielzelle ${range} enthält eine Formel. PACE überschreibt keine Formelzellen.`);
    }
    currentByRange.set(range, existing);
  });

  const results = [];
  for (const item of plan) {
    const range = rangeByField.get(item.fieldId);
    const nextValue = applyTrackingWriteMode(currentByRange.get(range), item.value, item.writeMode);
    currentByRange.set(range, nextValue);
    results.push({
      fieldId: item.fieldId,
      title: item.title,
      sheetTab: item.sheetTab,
      columnId: item.columnId,
      range,
      writeMode: item.writeMode
    });
  }

  const writes = targetRanges.map(range => ({
    range,
    majorDimension: 'ROWS',
    values: [[currentByRange.get(range)]]
  }));

  await batchWriteSpreadsheetValues(config.trackingSheetId, writes);

  return {
    dateKey,
    timeZone,
    fieldCount: plan.length,
    cellCount: writes.length,
    results
  };
}
