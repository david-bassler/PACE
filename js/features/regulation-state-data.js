import { nowIso, uid } from '../core/storage.js';

export const TOOL_DATA_HEADERS = [
  'ID','Werkzeug','Text','Status','Zusatz','Reihenfolge','Erstellt','Aktualisiert'
];

export const regulationStateSheetSpecs = {
  Werkzeugdaten: TOOL_DATA_HEADERS
};

export function regulationRecordFromRow(row) {
  const tool = String(row[1] || '').trim();
  if (!tool) return null;
  return {
    id: row[0] || uid('tool-data'),
    tool,
    text: row[2] || '',
    status: row[3] || '',
    note: row[4] || '',
    order: Number(row[5] || 0),
    createdAt: row[6] || nowIso(),
    updatedAt: row[7] || nowIso()
  };
}

export function regulationRecordToRow(item) {
  return [
    item.id,
    item.tool || '',
    item.text || '',
    item.status || '',
    item.note || '',
    Number(item.order || 0),
    item.createdAt || nowIso(),
    item.updatedAt || nowIso()
  ];
}

export function regulationStateTables(records) {
  return {
    Werkzeugdaten: {
      headers: TOOL_DATA_HEADERS,
      rows: records.map(regulationRecordToRow)
    }
  };
}
