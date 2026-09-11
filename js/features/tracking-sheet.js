import {
  batchGetSpreadsheetValues,
  batchUpdateSpreadsheet,
  columnName,
  getAccessToken,
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
import {
  canRecoverMissingNote,
  dedupeJournalEvents,
  formatPaceNote,
  groupJournalEvents,
  journalEventFromRow,
  journalEventIds,
  journalEventsHash,
  journalEventToRow,
  journalTargetKey,
  journalValueHash,
  noteCoversEvents,
  noteMatchesMaterializedValue,
  operationItemId,
  parsePaceNote,
  replayJournalEvents,
  shouldRebaseExternalEdit
} from './tracking-journal-domain.js';

const JOURNAL_SHEET = '_PACE_Log';
const JOURNAL_HEADERS = [
  'Event ID', 'Operation ID', 'Created At', 'Event Type', 'Target Date',
  'Sheet', 'Column ID', 'Field ID', 'Title', 'Write Mode', 'Value',
  'Baseline', 'Source'
];
const WRITE_LOCK = 'pace-tracking-write-v2';
const GRID_RANGE_CHUNK = 60;
const VALUE_RANGE_CHUNK = 100;

let inProcessWriteTail = Promise.resolve();

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

function chunksOf(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function batchGetRangesChunked(spreadsheetId, ranges, options = {}) {
  const result = [];
  for (const rangesChunk of chunksOf(ranges, VALUE_RANGE_CHUNK)) {
    result.push(...await batchGetSpreadsheetValues(spreadsheetId, rangesChunk, options));
  }
  return result;
}

function validatePlan(plan) {
  if (!plan.length) throw new Error('Keine Eingabe zum Speichern vorhanden.');
  for (const item of plan) {
    if (!item.sheetTab) throw new Error(`Für „${item.title}“ fehlt das Ziel-Tabellenblatt.`);
    if (!item.columnId) throw new Error(`Für „${item.title}“ fehlt die stabile Spalten-ID.`);
    if (item.sheetTab === JOURNAL_SHEET) throw new Error(`${JOURNAL_SHEET} ist für PACE-Integritätsdaten reserviert.`);
  }
}

function uid(prefix = 'op') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function simpleHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function stableRebaseId(targetKey, currentValue, lastEventId = '') {
  return `rebase-${simpleHash(`${targetKey}\u001f${lastEventId}\u001f${currentValue}`)}`;
}

async function withTrackingWriteLock(task) {
  if (globalThis.navigator?.locks?.request) {
    return navigator.locks.request(WRITE_LOCK, { mode: 'exclusive' }, task);
  }

  const run = inProcessWriteTail.then(task, task);
  inProcessWriteTail = run.catch(() => {});
  return run;
}

function stringCell(value) {
  if (!value || typeof value !== 'object') return '';
  if (Object.prototype.hasOwnProperty.call(value, 'formulaValue')) {
    throw new Error('Eine Zielzelle enthält eine Formel. PACE überschreibt keine Formelzellen.');
  }
  if (Object.prototype.hasOwnProperty.call(value, 'stringValue')) return String(value.stringValue ?? '');
  if (Object.prototype.hasOwnProperty.call(value, 'numberValue')) return String(value.numberValue ?? '');
  if (Object.prototype.hasOwnProperty.call(value, 'boolValue')) return value.boolValue ? 'TRUE' : 'FALSE';
  return '';
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

function updateCellRequest(target, value, note) {
  return {
    updateCells: {
      range: cellGridRange(target.sheetId, target.row, target.column),
      rows: [{ values: [{ userEnteredValue: { stringValue: String(value ?? '') }, note: String(note ?? '') }] }],
      fields: 'userEnteredValue,note'
    }
  };
}

function hasFormula(valueRange) {
  return (valueRange?.values || []).some(row =>
    (row || []).some(value => typeof value === 'string' && value.startsWith('='))
  );
}

function journalRowData(row) {
  return {
    values: row.map(value => ({ userEnteredValue: { stringValue: String(value ?? '') } }))
  };
}

async function ensureJournalSheet(spreadsheetId, metadata) {
  let nextMetadata = metadata;
  let properties = (nextMetadata.sheets || [])
    .map(sheet => sheet.properties)
    .find(item => item?.title === JOURNAL_SHEET);

  if (!properties) {
    try {
      await batchUpdateSpreadsheet(spreadsheetId, [{
        addSheet: { properties: { title: JOURNAL_SHEET, hidden: true } }
      }]);
    } catch (error) {
      nextMetadata = await getSpreadsheetMetadata(spreadsheetId);
      properties = (nextMetadata.sheets || [])
        .map(sheet => sheet.properties)
        .find(item => item?.title === JOURNAL_SHEET);
      if (!properties) throw error;
    }
  }

  if (!properties) {
    nextMetadata = await getSpreadsheetMetadata(spreadsheetId);
    properties = (nextMetadata.sheets || [])
      .map(sheet => sheet.properties)
      .find(item => item?.title === JOURNAL_SHEET);
  }
  if (!properties) throw new Error('PACE konnte das Integritätsjournal nicht anlegen.');

  const [headerRange] = await batchGetSpreadsheetValues(
    spreadsheetId,
    [sheetRange(JOURNAL_SHEET, `A1:${columnName(JOURNAL_HEADERS.length)}1`)],
    { valueRenderOption: 'UNFORMATTED_VALUE' }
  );
  const existing = headerRange?.values?.[0] || [];
  const compatible = existing.every((value, index) => String(value ?? '') === JOURNAL_HEADERS[index]);
  if (existing.length && !compatible) {
    throw new Error(`${JOURNAL_SHEET} existiert bereits, aber seine Header stimmen nicht vollständig mit dem PACE-Integritätsjournal überein.`);
  }

  if (existing.length !== JOURNAL_HEADERS.length) {
    await batchUpdateSpreadsheet(spreadsheetId, [{
      updateCells: {
        range: {
          sheetId: properties.sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: JOURNAL_HEADERS.length
        },
        rows: [{ values: JOURNAL_HEADERS.map(value => ({ userEnteredValue: { stringValue: value } })) }],
        fields: 'userEnteredValue'
      }
    }]);
  }

  return { metadata: nextMetadata, properties };
}

async function readJournal(spreadsheetId) {
  const [range] = await batchGetSpreadsheetValues(
    spreadsheetId,
    [sheetRange(JOURNAL_SHEET, `A2:${columnName(JOURNAL_HEADERS.length)}`)],
    { valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' }
  );
  const rows = range?.values || [];
  return dedupeJournalEvents(
    rows.map((row, index) => journalEventFromRow(row, index + 2)).filter(Boolean)
  );
}

async function appendJournalEvents(spreadsheetId, journalSheetId, events) {
  if (!events.length) return;
  await batchUpdateSpreadsheet(spreadsheetId, [{
    appendCells: {
      sheetId: journalSheetId,
      rows: events.map(event => journalRowData(journalEventToRow(event))),
      fields: 'userEnteredValue'
    }
  }]);
}

async function fetchGridCellsChunk(spreadsheetId, targets) {
  const token = getAccessToken();
  if (!token) throw new Error('Bitte zuerst mit Google verbinden.');

  const params = new URLSearchParams();
  for (const target of targets) params.append('ranges', target.range);
  params.set('includeGridData', 'true');
  params.set('fields', 'sheets(properties(sheetId,title),data(startRow,startColumn,rowData(values(userEnteredValue,note))))');

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google API: ${response.status} ${body.slice(0, 260)}`);
  }

  const payload = await response.json();
  const cells = new Map();
  for (const sheet of payload.sheets || []) {
    const sheetId = sheet.properties?.sheetId;
    for (const block of sheet.data || []) {
      const row = Number(block.startRow || 0) + 1;
      const column = Number(block.startColumn || 0) + 1;
      const cell = block.rowData?.[0]?.values?.[0] || {};
      cells.set(`${sheetId}:${row}:${column}`, {
        value: stringCell(cell.userEnteredValue),
        note: String(cell.note || '')
      });
    }
  }
  return cells;
}

async function fetchGridCells(spreadsheetId, targets) {
  if (!targets.length) return new Map();
  const cells = new Map();

  for (const targetChunk of chunksOf(targets, GRID_RANGE_CHUNK)) {
    const chunkCells = await fetchGridCellsChunk(spreadsheetId, targetChunk);
    for (const [key, value] of chunkCells) cells.set(key, value);
  }

  for (const target of targets) {
    const key = `${target.sheetId}:${target.row}:${target.column}`;
    if (!cells.has(key)) cells.set(key, { value: '', note: '' });
  }
  return cells;
}

function targetCellState(cells, target) {
  return cells.get(`${target.sheetId}:${target.row}:${target.column}`) || { value: '', note: '' };
}

function sameCellState(left, right) {
  return String(left?.value ?? '') === String(right?.value ?? '') &&
    String(left?.note ?? '') === String(right?.note ?? '');
}

async function assertCellsUnchanged(spreadsheetId, targets, expectedCells) {
  const latestCells = await fetchGridCells(spreadsheetId, targets);
  const changed = targets.filter(target =>
    !sameCellState(targetCellState(expectedCells, target), targetCellState(latestCells, target))
  );
  if (changed.length) {
    throw new Error(
      `Mindestens ${changed.length === 1 ? 'eine Tracking-Zelle wurde' : `${changed.length} Tracking-Zellen wurden`} unmittelbar vor dem Schreiben verändert. ` +
      'PACE bricht vorsichtshalber ab und lässt Operation sowie Remote-Journal erhalten.'
    );
  }
}

async function resolveTargets(events, metadata, spreadsheetId) {
  const grouped = groupJournalEvents(events);
  const targetEvents = [...grouped.entries()].map(([key, items]) => ({ key, items, sample: items[0] }));
  if (!targetEvents.length) return { targets: new Map(), backfillRequests: [], filledDateCount: 0 };

  const sheetByTitle = new Map(
    (metadata.sheets || [])
      .map(sheet => sheet.properties)
      .filter(properties => properties?.title)
      .map(properties => [properties.title, properties])
  );
  const tabs = unique(targetEvents.map(item => item.sample.sheetTab));
  for (const tab of tabs) {
    if (!sheetByTitle.has(tab)) throw new Error(`Tabellenblatt „${tab}“ existiert in der ausgewählten Tracking-Tabelle nicht.`);
    if (tab === JOURNAL_SHEET) throw new Error(`${JOURNAL_SHEET} ist für PACE-Integritätsdaten reserviert.`);
  }

  const firstColumnRanges = tabs.map(tab => sheetRange(tab, 'A:A'));
  const firstColumns = await batchGetRangesChunked(spreadsheetId, firstColumnRanges, {
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'SERIAL_NUMBER'
  });

  const tabState = new Map();
  tabs.forEach((tab, index) => {
    const rows = (firstColumns[index]?.values || []).map(row => [...row]);
    const idRow = findTrackingIdRow(rows);
    tabState.set(tab, { rows, idRow, dateRows: new Map(), chunks: [] });
  });

  for (const tab of tabs) {
    const state = tabState.get(tab);
    const dates = unique(
      targetEvents.filter(item => item.sample.sheetTab === tab).map(item => item.sample.targetDate)
    ).sort();

    for (const targetDate of dates) {
      const datePlan = planTrackingDateBackfill(state.rows, targetDate, { afterRow: state.idRow });
      state.dateRows.set(targetDate, datePlan.dateRow);
      if (!datePlan.missingDates.length) continue;
      state.chunks.push(datePlan);
      for (const missing of datePlan.missingDates) {
        while (state.rows.length < missing.row) state.rows.push([]);
        state.rows[missing.row - 1] = [missing.serial];
      }
    }
  }

  const idRanges = tabs.map(tab => {
    const state = tabState.get(tab);
    return sheetRange(tab, `A${state.idRow}:ZZZ${state.idRow}`);
  });
  const idRows = await batchGetRangesChunked(spreadsheetId, idRanges, {
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'SERIAL_NUMBER'
  });

  tabs.forEach((tab, index) => {
    const requiredIds = unique(
      targetEvents.filter(item => item.sample.sheetTab === tab).map(item => item.sample.columnId)
    );
    tabState.get(tab).columns = resolveTrackingColumns(idRows[index]?.values?.[0] || [], requiredIds);
  });

  const formulaRanges = [];
  for (const tab of tabs) {
    for (const dateChunk of tabState.get(tab).chunks) {
      const first = dateChunk.missingDates[0];
      const last = dateChunk.missingDates.at(-1);
      formulaRanges.push(sheetRange(tab, `A${first.row}:A${last.row}`));
    }
  }
  if (formulaRanges.length) {
    const checks = await batchGetRangesChunked(spreadsheetId, formulaRanges, {
      valueRenderOption: 'FORMULA', dateTimeRenderOption: 'SERIAL_NUMBER'
    });
    checks.forEach((valueRange, index) => {
      if (hasFormula(valueRange)) {
        throw new Error(`In ${formulaRanges[index]} liegt bereits mindestens eine Formel. PACE überschreibt dort keine Zellen.`);
      }
    });
  }

  const backfillRequests = [];
  let filledDateCount = 0;
  for (const tab of tabs) {
    const properties = sheetByTitle.get(tab);
    let rowCount = Number(properties.gridProperties?.rowCount || 0);
    for (const dateChunk of tabState.get(tab).chunks) {
      const first = dateChunk.missingDates[0];
      const last = dateChunk.missingDates.at(-1);
      filledDateCount += dateChunk.missingDates.length;
      if (last.row > rowCount) {
        backfillRequests.push({
          appendDimension: { sheetId: properties.sheetId, dimension: 'ROWS', length: last.row - rowCount }
        });
        rowCount = last.row;
      }
      backfillRequests.push({
        copyPaste: {
          source: cellGridRange(properties.sheetId, dateChunk.previousDateRow, 1),
          destination: {
            sheetId: properties.sheetId,
            startRowIndex: first.row - 1,
            endRowIndex: last.row,
            startColumnIndex: 0,
            endColumnIndex: 1
          },
          pasteType: 'PASTE_FORMAT',
          pasteOrientation: 'NORMAL'
        }
      });
      backfillRequests.push({
        updateCells: {
          range: {
            sheetId: properties.sheetId,
            startRowIndex: first.row - 1,
            endRowIndex: last.row,
            startColumnIndex: 0,
            endColumnIndex: 1
          },
          rows: dateChunk.missingDates.map(item => ({ values: [{ userEnteredValue: { numberValue: item.serial } }] })),
          fields: 'userEnteredValue'
        }
      });
    }
  }

  const targets = new Map();
  for (const { key, sample } of targetEvents) {
    const state = tabState.get(sample.sheetTab);
    const properties = sheetByTitle.get(sample.sheetTab);
    const row = state.dateRows.get(sample.targetDate);
    const column = state.columns[sample.columnId];
    targets.set(key, {
      key,
      sheetTab: sample.sheetTab,
      columnId: sample.columnId,
      targetDate: sample.targetDate,
      sheetId: properties.sheetId,
      row,
      column,
      range: sheetRange(sample.sheetTab, `${columnName(column)}${row}`)
    });
  }

  return { targets, backfillRequests, filledDateCount };
}

function rebaseEvent(target, currentValue, existingEvents) {
  const lastEvent = existingEvents.at(-1);
  return {
    eventId: stableRebaseId(target.key, currentValue, lastEvent?.eventId || ''),
    operationId: '',
    createdAt: new Date().toISOString(),
    eventType: 'rebase',
    targetDate: target.targetDate,
    sheetTab: target.sheetTab,
    columnId: target.columnId,
    fieldId: '',
    title: 'Externe Änderung',
    writeMode: 'replace',
    value: String(currentValue ?? ''),
    baselineValue: '',
    source: 'external'
  };
}

function prepareMaterialization(target, events, cell) {
  const { userNote } = parsePaceNote(cell.note);
  const expected = replayJournalEvents(events, applyTrackingWriteMode);
  return {
    expected,
    note: formatPaceNote(userNote, {
      version: 2,
      targetKey: target.key,
      appliedEventIds: journalEventIds(events),
      appliedEventsHash: journalEventsHash(events),
      materializedHash: journalValueHash(expected)
    })
  };
}

async function verifyMaterialized(spreadsheetId, targets, expectedByKey) {
  const ranges = targets.map(target => target.range);
  const valueRanges = await batchGetRangesChunked(spreadsheetId, ranges, {
    valueRenderOption: 'FORMULA', dateTimeRenderOption: 'SERIAL_NUMBER'
  });
  const mismatches = targets.filter((target, index) =>
    String(firstValue(valueRanges[index]) ?? '') !== String(expectedByKey.get(target.key) ?? '')
  );
  if (mismatches.length) {
    throw new Error(
      `Google Sheets hat ${mismatches.length === 1 ? 'den Eintrag' : `${mismatches.length} Einträge`} nach dem Schreiben nicht bestätigt. ` +
      'Die lokale Operation und das Remote-Journal bleiben erhalten.'
    );
  }

  const cells = await fetchGridCells(spreadsheetId, targets);
  const noteMismatches = [];
  for (const target of targets) {
    const cell = targetCellState(cells, target);
    const meta = parsePaceNote(cell.note).meta;
    if (!meta || !noteMatchesMaterializedValue(meta, expectedByKey.get(target.key))) noteMismatches.push(target);
  }
  if (noteMismatches.length) {
    throw new Error('Der Zellwert wurde geschrieben, aber die Integritätsmarkierung konnte nicht bestätigt werden. Die lokale Operation bleibt erhalten.');
  }
}

async function materializeTargets(spreadsheetId, journalEvents, targetsMap, targetKeys) {
  const grouped = groupJournalEvents(journalEvents);
  let materializedCount = 0;

  for (const keyChunk of chunksOf(targetKeys, GRID_RANGE_CHUNK)) {
    const targets = keyChunk.map(key => targetsMap.get(key)).filter(Boolean);
    const cells = await fetchGridCells(spreadsheetId, targets);
    const requests = [];
    const expectedByKey = new Map();

    for (const target of targets) {
      const events = grouped.get(target.key) || [];
      const cell = targetCellState(cells, target);
      const materialized = prepareMaterialization(target, events, cell);
      expectedByKey.set(target.key, materialized.expected);
      requests.push(updateCellRequest(target, materialized.expected, materialized.note));
    }

    await assertCellsUnchanged(spreadsheetId, targets, cells);
    if (requests.length) await batchUpdateSpreadsheet(spreadsheetId, requests);
    await verifyMaterialized(spreadsheetId, targets, expectedByKey);
    materializedCount += targets.length;
  }

  return materializedCount;
}

async function writeTrackingPlanLocked(plan, { now = new Date(), operationId = '', source = 'tracking' } = {}) {
  validatePlan(plan);
  const config = getConfig();
  if (!config.trackingSheetId) throw new Error('Bitte zuerst in den Einstellungen eine Tracking-Tabelle auswählen.');

  let metadata = await getSpreadsheetMetadata(config.trackingSheetId);
  const journal = await ensureJournalSheet(config.trackingSheetId, metadata);
  metadata = journal.metadata;
  if (!(metadata.sheets || []).some(sheet => sheet.properties?.title === JOURNAL_SHEET)) {
    metadata = await getSpreadsheetMetadata(config.trackingSheetId);
  }

  const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const timeZone = metadata.properties?.timeZone || browserTimeZone;
  const targetDate = dateKeyInTimeZone(now, timeZone);
  const stableOperationId = operationId || uid('tracking-op');

  let journalEvents = await readJournal(config.trackingSheetId);
  const existingIds = new Set(journalEvents.map(event => event.eventId));
  const candidates = plan.map((item, index) => ({
    eventId: operationItemId(stableOperationId, index),
    operationId: stableOperationId,
    createdAt: now.toISOString(),
    eventType: 'item',
    targetDate,
    sheetTab: item.sheetTab,
    columnId: item.columnId,
    fieldId: item.fieldId,
    title: item.title,
    writeMode: item.writeMode || 'append_newline',
    value: String(item.value ?? ''),
    baselineValue: '',
    source
  }));
  const currentTargetKeys = unique(candidates.map(journalTargetKey));
  const existingForTargets = journalEvents.filter(event => currentTargetKeys.includes(journalTargetKey(event)));

  const provisionalEvents = [...existingForTargets, ...candidates];
  const resolved = await resolveTargets(provisionalEvents, metadata, config.trackingSheetId);
  if (resolved.backfillRequests.length) {
    await batchUpdateSpreadsheet(config.trackingSheetId, resolved.backfillRequests);
  }

  const currentTargets = currentTargetKeys.map(key => resolved.targets.get(key)).filter(Boolean);
  const cells = await fetchGridCells(config.trackingSheetId, currentTargets);
  const groupedExisting = groupJournalEvents(existingForTargets);
  const rebases = [];

  for (const target of currentTargets) {
    const events = groupedExisting.get(target.key) || [];
    const cell = targetCellState(cells, target);
    if (!events.length) continue;

    const parsed = parsePaceNote(cell.note);
    if (!parsed.meta) {
      if (!canRecoverMissingNote({ currentValue: cell.value, existingEvents: events, applyWriteMode: applyTrackingWriteMode })) {
        throw new Error(`Integritätsmetadaten für ${target.range} fehlen und der Zellinhalt ist nicht eindeutig rekonstruierbar. PACE überschreibt die Zelle vorsichtshalber nicht.`);
      }
      continue;
    }

    if (shouldRebaseExternalEdit({ currentValue: cell.value, noteMeta: parsed.meta, existingEvents: events })) {
      const event = rebaseEvent(target, cell.value, events);
      if (!existingIds.has(event.eventId)) rebases.push(event);
    }
  }

  const baselineByTarget = new Map(currentTargets.map(target => [target.key, targetCellState(cells, target).value]));
  for (const candidate of candidates) {
    candidate.baselineValue = baselineByTarget.get(journalTargetKey(candidate)) || '';
  }

  const toAppend = [...rebases, ...candidates].filter(event => !existingIds.has(event.eventId));
  await appendJournalEvents(config.trackingSheetId, journal.properties.sheetId, toAppend);
  journalEvents = await readJournal(config.trackingSheetId);

  const loggedIds = new Set(journalEvents.map(event => event.eventId));
  const missingLogged = candidates.filter(event => !loggedIds.has(event.eventId));
  if (missingLogged.length) {
    throw new Error('Das Remote-Integritätsjournal hat die Operation nicht bestätigt. Die lokale Kopie bleibt erhalten.');
  }

  let relevantEvents = journalEvents.filter(event => currentTargetKeys.includes(journalTargetKey(event)));
  let finalResolved = await resolveTargets(relevantEvents, metadata, config.trackingSheetId);
  if (finalResolved.backfillRequests.length) {
    await batchUpdateSpreadsheet(config.trackingSheetId, finalResolved.backfillRequests);
  }

  for (let round = 0; round < 3; round += 1) {
    await materializeTargets(config.trackingSheetId, relevantEvents, finalResolved.targets, currentTargetKeys);
    const latest = await readJournal(config.trackingSheetId);
    const latestRelevant = latest.filter(event => currentTargetKeys.includes(journalTargetKey(event)));
    const beforeSignature = journalEventIds(relevantEvents).join('\u001f');
    const afterSignature = journalEventIds(latestRelevant).join('\u001f');
    if (beforeSignature === afterSignature) break;
    relevantEvents = latestRelevant;
    finalResolved = await resolveTargets(relevantEvents, metadata, config.trackingSheetId);
    if (finalResolved.backfillRequests.length) {
      await batchUpdateSpreadsheet(config.trackingSheetId, finalResolved.backfillRequests);
    }
  }

  return {
    dateKey: targetDate,
    timeZone,
    fieldCount: plan.length,
    cellCount: currentTargetKeys.length,
    filledDateCount: resolved.filledDateCount,
    operationId: stableOperationId,
    results: candidates.map(event => ({
      fieldId: event.fieldId,
      title: event.title,
      sheetTab: event.sheetTab,
      columnId: event.columnId,
      range: finalResolved.targets.get(journalTargetKey(event))?.range || '',
      writeMode: event.writeMode
    }))
  };
}

export async function writeTrackingPlan(plan, options = {}) {
  return withTrackingWriteLock(() => writeTrackingPlanLocked(plan, options));
}

async function repairTrackingJournalLocked() {
  const config = getConfig();
  if (!config.trackingSheetId) return { repaired: 0, conflicts: [] };

  let metadata = await getSpreadsheetMetadata(config.trackingSheetId);
  const journal = await ensureJournalSheet(config.trackingSheetId, metadata);
  metadata = journal.metadata;
  if (!(metadata.sheets || []).some(sheet => sheet.properties?.title === JOURNAL_SHEET)) {
    metadata = await getSpreadsheetMetadata(config.trackingSheetId);
  }

  let events = await readJournal(config.trackingSheetId);
  if (!events.length) return { repaired: 0, conflicts: [] };

  let resolved = await resolveTargets(events, metadata, config.trackingSheetId);
  if (resolved.backfillRequests.length) await batchUpdateSpreadsheet(config.trackingSheetId, resolved.backfillRequests);
  const targets = [...resolved.targets.values()];
  const cells = await fetchGridCells(config.trackingSheetId, targets);
  const grouped = groupJournalEvents(events);
  const rebases = [];
  const conflicts = [];

  for (const target of targets) {
    const targetEvents = grouped.get(target.key) || [];
    const cell = targetCellState(cells, target);
    const parsed = parsePaceNote(cell.note);

    if (!parsed.meta) {
      if (!canRecoverMissingNote({ currentValue: cell.value, existingEvents: targetEvents, applyWriteMode: applyTrackingWriteMode })) {
        conflicts.push(target.range);
      }
      continue;
    }

    try {
      if (shouldRebaseExternalEdit({ currentValue: cell.value, noteMeta: parsed.meta, existingEvents: targetEvents })) {
        rebases.push(rebaseEvent(target, cell.value, targetEvents));
      } else if (!noteMatchesMaterializedValue(parsed.meta, cell.value) && !noteCoversEvents(parsed.meta, targetEvents)) {
        // Unvollständig materialisierte Remote-Ereignisse werden unten aus dem Journal neu aufgebaut.
      }
    } catch {
      conflicts.push(target.range);
    }
  }

  const existingIds = new Set(events.map(event => event.eventId));
  const missingRebases = rebases.filter(event => !existingIds.has(event.eventId));
  if (missingRebases.length) {
    await appendJournalEvents(config.trackingSheetId, journal.properties.sheetId, missingRebases);
    events = await readJournal(config.trackingSheetId);
    resolved = await resolveTargets(events, metadata, config.trackingSheetId);
    if (resolved.backfillRequests.length) await batchUpdateSpreadsheet(config.trackingSheetId, resolved.backfillRequests);
  }

  const conflictKeys = new Set(
    [...resolved.targets.values()].filter(target => conflicts.includes(target.range)).map(target => target.key)
  );
  const repairKeys = [...resolved.targets.keys()].filter(key => !conflictKeys.has(key));
  const repaired = await materializeTargets(config.trackingSheetId, events, resolved.targets, repairKeys);
  return { repaired, conflicts: unique(conflicts) };
}

export async function repairTrackingJournal() {
  return withTrackingWriteLock(repairTrackingJournalLocked);
}
