import { dateKey, nowIso, uid } from '../core/storage.js';

export const AREA_HEADERS = ['ID','Name','Warum','Wunschzustand','IstStand','Ressourcen','Status','Aktualisiert'];
export const ITEM_HEADERS = ['ID','Typ','Text','Details','ZielbereichIDs','ElternIDs','Status','Aktualisiert','Aufgabenmodus','KlaerungszyklenJSON'];
export const EVENT_HEADERS = ['ID','Datum','Text','ZielbereichIDs','BezugsIDs','Aktualisiert'];

export const progressSheetSpecs = {
  Zielbereiche: AREA_HEADERS,
  Fortschritt: ITEM_HEADERS,
  FortschrittEreignisse: EVENT_HEADERS
};

function splitIds(value) {
  return String(value || '').split(';').map(value => value.trim()).filter(Boolean);
}

function joinIds(values) {
  return [...new Set((values || []).filter(Boolean))].join(';');
}

function parseJSON(value, fallback) {
  try {
    return value ? JSON.parse(value) : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

export function areaFromRow(row) {
  return {
    id: row[0] || uid('area'),
    name: row[1] || '',
    why: row[2] || '',
    desired: row[3] || '',
    current: row[4] || '',
    resources: row[5] || '',
    status: row[6] || 'active',
    updatedAt: row[7] || nowIso()
  };
}

export function areaToRow(area) {
  return [area.id, area.name, area.why, area.desired, area.current, area.resources, area.status, area.updatedAt];
}

export function itemFromRow(row) {
  return {
    id: row[0] || uid('progress'),
    type: row[1] || 'Aufgabe',
    text: row[2] || '',
    details: row[3] || '',
    areaIds: splitIds(row[4]),
    parentIds: splitIds(row[5]),
    status: row[6] || 'active',
    updatedAt: row[7] || nowIso(),
    taskMode: row[8] || 'ready',
    clarificationCycles: parseJSON(row[9], [])
  };
}

export function itemToRow(item) {
  return [
    item.id,
    item.type,
    item.text,
    item.details,
    joinIds(item.areaIds),
    joinIds(item.parentIds),
    item.status,
    item.updatedAt,
    item.taskMode || 'ready',
    JSON.stringify(item.clarificationCycles || [])
  ];
}

export function eventFromRow(row) {
  return {
    id: row[0] || uid('event'),
    date: row[1] || dateKey(),
    text: row[2] || '',
    areaIds: splitIds(row[3]),
    referenceIds: splitIds(row[4]),
    updatedAt: row[5] || nowIso()
  };
}

export function eventToRow(event) {
  return [event.id, event.date, event.text, joinIds(event.areaIds), joinIds(event.referenceIds), event.updatedAt];
}

export function progressTables(data) {
  return {
    Zielbereiche: { headers: AREA_HEADERS, rows: data.areas.map(areaToRow) },
    Fortschritt: { headers: ITEM_HEADERS, rows: data.items.map(itemToRow) },
    FortschrittEreignisse: { headers: EVENT_HEADERS, rows: data.events.map(eventToRow) }
  };
}
