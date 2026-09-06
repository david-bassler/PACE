import { nowIso, uid } from '../core/storage.js';

export const CONFIG_HEADERS = ['ID','Typ','Titel','Icon','GruppeID','Tabellenblatt','SpaltenID','Eingabetyp','Schreibmodus','Reihenfolge','Status','Aktualisiert'];

export const trackingSheetSpecs = {
  ErfassungKonfig: CONFIG_HEADERS
};

export const INPUT_TYPES = {
  text: 'Text',
  time_text: 'Uhrzeit + Text',
  time: 'Uhrzeit',
  number: 'Zahl',
  yes_no: 'Ja / Nein'
};

export const WRITE_MODES = {
  append_newline: 'mit Zeilenumbruch anhängen',
  replace: 'Zellinhalt ersetzen'
};

function normalizeType(value) {
  return value === 'Gruppe' || value === 'group' ? 'group' : 'field';
}

export function trackingFromRow(row) {
  return {
    id: row[0] || uid('track'),
    kind: normalizeType(row[1]),
    title: row[2] || '',
    icon: row[3] || '',
    groupId: row[4] || '',
    sheetTab: row[5] || '',
    columnId: String(row[6] ?? '').trim(),
    inputType: row[7] || 'text',
    writeMode: row[8] || 'append_newline',
    order: Number(row[9] || 0),
    status: row[10] || 'active',
    updatedAt: row[11] || nowIso()
  };
}

export function trackingToRow(item) {
  return [
    item.id,
    item.kind === 'group' ? 'Gruppe' : 'Feld',
    item.title,
    item.icon || '',
    item.groupId || '',
    item.sheetTab || '',
    item.columnId || '',
    item.inputType || '',
    item.writeMode || '',
    Number(item.order || 0),
    item.status || 'active',
    item.updatedAt || nowIso()
  ];
}

export function sortTrackingItems(a, b) {
  return Number(a.order || 0) - Number(b.order || 0) || String(a.title).localeCompare(String(b.title), 'de');
}

export function trackingRows(data) {
  return [...data.groups, ...data.fields]
    .sort((a, b) => a.kind.localeCompare(b.kind) || sortTrackingItems(a, b))
    .map(trackingToRow);
}
