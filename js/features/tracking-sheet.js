import {
  batchGetSpreadsheetValues,
  batchUpdateSpreadsheet,
  columnName,
  getConfig,
  getSpreadsheetMetadata
} from '../core/google.js';
import {
  applyTrackingWriteMode,
  dateKeyInTimeZone,
  findTrackingIdRow,
  planTrackingDateBackfill,
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

function targetCell(item, layout, sheetProperties) {
  const column = layout.columns[item.columnId];
  return {
    range: sheetRange(item.sheetTab, `${columnName(column)}${layout.dateRow}`),
    sheetId: sheetProperties.sheetId,
    row: layout.dateRow,
    column
  };
}

function cellGridRange(sheetId, row, column) {
  return {
    sheetId,
    startRowIndex: row - 1,
    endRowIndex: row,
    startColumnIndex: column - 1,
    endColumnIndex: column
  };
}

function updateCellRequest(sheetId, row, column, userEnteredValue) {
  return {
    updateCells: {
      range: cellGridRange(sheetId, row, column),
      rows: [{ values: [{ userEnteredValue }] }],
      fields: 'userEnteredValue'
    }
  };
}

function hasFormula(valueRange) {
  return (valueRange?.values || []).some(row =>
    (row || []).some(value => typeof value === 'string' && value.startsWith('='))
  );
}

export async function writeTrackingPlan(plan, { now = new Date() } = {}) {
  validatePlan(plan);

  const config = getConfig();
  if (!config.trackingSheetId) {
    throw new Error('Bitte zuerst in den Einstellungen eine Tracking-Tabelle auswählen.');
  }

  const metadata = await getSpreadsheetMetadata(config.trackingSheetId);
  const sheetByTitle = new Map(
    (metadata.sheets || [])
      .map(sheet => sheet.properties)
      .filter(properties => properties?.title)
      .map(properties => [properties.title, properties])
  );
  const tabs = unique(plan.map(item => item.sheetTab));

  for (const tab of tabs) {
    if (!sheetByTitle.has(tab)) {
      throw new Error(`Tabellenblatt „${tab}“ existiert in der ausgewählten Tracking-Tabelle nicht.`);
    }
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
  const backfills = new Map();
  tabs.forEach((tab, index) => {
    const rows = firstColumns[index]?.values || [];
    const idRow = findTrackingIdRow(rows);
    const datePlan = planTrackingDateBackfill(rows, dateKey, { afterRow: idRow });
    layouts.set(tab, { idRow, dateRow: datePlan.dateRow, columns: {} });
    backfills.set(tab, datePlan);
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

  const fillTabs = tabs.filter(tab => backfills.get(tab).missingDates.length);
  if (fillTabs.length) {
    const fillRanges = fillTabs.map(tab => {
      const missing = backfills.get(tab).missingDates;
      return sheetRange(tab, `A${missing[0].row}:A${missing.at(-1).row}`);
    });
    const formulaChecks = await batchGetSpreadsheetValues(config.trackingSheetId, fillRanges, {
      valueRenderOption: 'FORMULA',
      dateTimeRenderOption: 'SERIAL_NUMBER'
    });

    formulaChecks.forEach((valueRange, index) => {
      if (hasFormula(valueRange)) {
        throw new Error(`In ${fillRanges[index]} liegt bereits mindestens eine Formel. PACE überschreibt dort keine Zellen.`);
      }
    });
  }

  const targetByField = new Map();
  const targetMetaByRange = new Map();
  for (const item of plan) {
    const target = targetCell(item, layouts.get(item.sheetTab), sheetByTitle.get(item.sheetTab));
    targetByField.set(item.fieldId, target);
    targetMetaByRange.set(target.range, target);
  }
  const targetRanges = unique([...targetMetaByRange.keys()]);

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
    const target = targetByField.get(item.fieldId);
    const nextValue = applyTrackingWriteMode(currentByRange.get(target.range), item.value, item.writeMode);
    currentByRange.set(target.range, nextValue);
    results.push({
      fieldId: item.fieldId,
      title: item.title,
      sheetTab: item.sheetTab,
      columnId: item.columnId,
      range: target.range,
      writeMode: item.writeMode
    });
  }

  const requests = [];

  for (const tab of fillTabs) {
    const properties = sheetByTitle.get(tab);
    const datePlan = backfills.get(tab);
    const firstMissing = datePlan.missingDates[0];
    const lastMissing = datePlan.missingDates.at(-1);
    const rowCount = Number(properties.gridProperties?.rowCount || 0);

    if (lastMissing.row > rowCount) {
      requests.push({
        appendDimension: {
          sheetId: properties.sheetId,
          dimension: 'ROWS',
          length: lastMissing.row - rowCount
        }
      });
    }

    requests.push({
      copyPaste: {
        source: cellGridRange(properties.sheetId, datePlan.previousDateRow, 1),
        destination: {
          sheetId: properties.sheetId,
          startRowIndex: firstMissing.row - 1,
          endRowIndex: lastMissing.row,
          startColumnIndex: 0,
          endColumnIndex: 1
        },
        pasteType: 'PASTE_FORMAT',
        pasteOrientation: 'NORMAL'
      }
    });

    requests.push({
      updateCells: {
        range: {
          sheetId: properties.sheetId,
          startRowIndex: firstMissing.row - 1,
          endRowIndex: lastMissing.row,
          startColumnIndex: 0,
          endColumnIndex: 1
        },
        rows: datePlan.missingDates.map(item => ({
          values: [{ userEnteredValue: { numberValue: item.serial } }]
        })),
        fields: 'userEnteredValue'
      }
    });
  }

  for (const range of targetRanges) {
    const target = targetMetaByRange.get(range);
    requests.push(
      updateCellRequest(
        target.sheetId,
        target.row,
        target.column,
        { stringValue: String(currentByRange.get(range) ?? '') }
      )
    );
  }

  await batchUpdateSpreadsheet(config.trackingSheetId, requests);

  const filledDateCount = fillTabs.reduce(
    (sum, tab) => sum + backfills.get(tab).missingDates.length,
    0
  );

  return {
    dateKey,
    timeZone,
    fieldCount: plan.length,
    cellCount: targetRanges.length,
    filledDateCount,
    results
  };
}
