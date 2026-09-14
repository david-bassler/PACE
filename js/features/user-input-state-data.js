import { nowIso, uid } from '../core/storage.js';

export const USER_INPUT_HEADERS = [
  'ID','Bereich','Text','Status','Zusatz','Erstellt','Aktualisiert'
];

export const userInputStateSheetSpecs = {
  Nutzereingaben: USER_INPUT_HEADERS
};

export function userInputRecordFromRow(row) {
  const area = String(row[1] || '').trim();
  if (!area) return null;
  return {
    id: row[0] || uid('user-input'),
    area,
    text: row[2] || '',
    status: row[3] || '',
    extra: row[4] || '',
    createdAt: row[5] || nowIso(),
    updatedAt: row[6] || nowIso()
  };
}

export function userInputRecordToRow(item) {
  return [
    item.id,
    item.area || '',
    item.text || '',
    item.status || '',
    item.extra || '',
    item.createdAt || nowIso(),
    item.updatedAt || nowIso()
  ];
}

export function userInputStateTables(records) {
  return {
    Nutzereingaben: {
      headers: USER_INPUT_HEADERS,
      rows: records.map(userInputRecordToRow)
    }
  };
}
