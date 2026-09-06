import { dateKey, nowIso, uid } from '../core/storage.js';

export const EXAMPLE_HEADERS = ['ID','Bereich','Datum','Titel','Text','Aktualisiert'];
export const CHANCE_HEADERS = ['ID','Titel','Text','Aktiv','Aktualisiert'];
export const RESONANCE_HEADERS = ['Typ','ID','Datum','Titel','Kontext','Schlagworte','SchlagwortName','Beschreibung','MatchModus','Aktiv','Evidenz','Quelle','Aktualisiert'];

export const wellbeingSheetSpecs = {
  Beispiele: EXAMPLE_HEADERS,
  Resonanzchancen: CHANCE_HEADERS,
  Resonanzbibliothek: RESONANCE_HEADERS
};

export function exampleFromRow(row) {
  return {
    id: row[0] || uid('example'),
    area: row[1] || 'E',
    date: row[2] || dateKey(),
    title: row[3] || '',
    text: row[4] || '',
    updatedAt: row[5] || nowIso()
  };
}

export function exampleToRow(item) {
  return [item.id, item.area, item.date, item.title, item.text, item.updatedAt];
}

export function chanceFromRow(row) {
  return {
    id: row[0] || uid('chance'),
    title: row[1] || '',
    text: row[2] || '',
    active: String(row[3] ?? 'true') !== 'false',
    updatedAt: row[4] || nowIso()
  };
}

export function chanceToRow(item) {
  return [item.id, item.title, item.text, item.active, item.updatedAt];
}

function splitTagIds(value) {
  return String(value || '').split(';').map(item => item.trim()).filter(Boolean);
}

function joinTagIds(values) {
  return [...new Set((values || []).filter(Boolean))].join(';');
}

function rowActive(value) {
  return String(value ?? 'true').trim().toLowerCase() !== 'false';
}

export function resonanceRecordFromRow(row) {
  const type = String(row[0] || '').trim().toLowerCase();
  if (!type) return null;

  const common = {
    id: row[1] || uid('resonance'),
    active: rowActive(row[9]),
    updatedAt: row[12] || nowIso()
  };

  if (type === 'ereignis' || type === 'event') {
    return {
      type: 'event',
      ...common,
      date: row[2] || '',
      title: row[3] || '',
      context: row[4] || '',
      tagIds: splitTagIds(row[5]),
      evidence: row[10] || '',
      source: row[11] || ''
    };
  }

  if (type === 'tag' || type === 'schlagwort') {
    return {
      type: 'tag',
      ...common,
      name: row[6] || row[3] || '',
      description: row[7] || ''
    };
  }

  if (type === 'anker' || type === 'anchor') {
    return {
      type: 'anchor',
      ...common,
      title: row[3] || '',
      description: row[7] || row[4] || '',
      tagIds: splitTagIds(row[5]),
      matchMode: row[8] === 'all' ? 'all' : 'any'
    };
  }

  return null;
}

export function resonanceRecordToRow(record) {
  if (record.type === 'event') {
    return ['Ereignis', record.id, record.date || '', record.title || '', record.context || '', joinTagIds(record.tagIds), '', '', '', record.active !== false, record.evidence || '', record.source || '', record.updatedAt || nowIso()];
  }

  if (record.type === 'tag') {
    return ['Schlagwort', record.id, '', '', '', '', record.name || '', record.description || '', '', record.active !== false, '', '', record.updatedAt || nowIso()];
  }

  return ['Anker', record.id, '', record.title || '', '', joinTagIds(record.tagIds), '', record.description || '', record.matchMode === 'all' ? 'all' : 'any', record.active !== false, '', '', record.updatedAt || nowIso()];
}

export function wellbeingTables(data) {
  return {
    Beispiele: { headers: EXAMPLE_HEADERS, rows: data.examples.map(exampleToRow) },
    Resonanzchancen: { headers: CHANCE_HEADERS, rows: data.chances.map(chanceToRow) },
    Resonanzbibliothek: {
      headers: RESONANCE_HEADERS,
      rows: [
        ...data.resonanceTags.map(item => resonanceRecordToRow({ ...item, type: 'tag' })),
        ...data.anchors.map(item => resonanceRecordToRow({ ...item, type: 'anchor' })),
        ...data.resonanceEvents.map(item => resonanceRecordToRow({ ...item, type: 'event' }))
      ]
    }
  };
}
