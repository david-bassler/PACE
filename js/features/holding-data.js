import { nowIso, uid } from '../core/storage.js';

export const HOLDING_HEADERS = [
  'Typ','ID','Text','Titel','Art','Inhalt','BildURL','PersoenlicheBedeutung',
  'Schlagworte','AussageID','HaltepunktID','Aktiv','Reihenfolge','Aktualisiert'
];

export const SITUATION_HEADERS = [
  'ID','Erstellt','AussageID','HaltepunktID','Situation','Status',
  'Abgeschlossen','Rueckblick','Aktualisiert'
];

export const holdingSheetSpecs = {
  Haltepunkte: HOLDING_HEADERS,
  HaltepunktSituationen: SITUATION_HEADERS
};

function activeValue(value) {
  return String(value ?? 'true').trim().toLowerCase() !== 'false';
}

function splitWords(value) {
  return String(value || '').split(';').map(item => item.trim()).filter(Boolean);
}

function joinWords(values) {
  return [...new Set(values || [])].join(';');
}

export function holdingFromRow(row) {
  const type = String(row[0] || '').trim().toLowerCase();
  const common = {
    id: row[1] || uid('holding'),
    active: activeValue(row[11]),
    order: Number(row[12] || 0),
    updatedAt: row[13] || nowIso()
  };

  if (type === 'aussage' || type === 'statement') {
    return { type: 'statement', ...common, text: row[2] || '' };
  }

  if (type === 'haltepunkt' || type === 'point') {
    return {
      type: 'point',
      ...common,
      title: row[3] || '',
      kind: row[4] || '',
      content: row[5] || '',
      imageUrl: row[6] || '',
      personalMeaning: row[7] || '',
      keywords: splitWords(row[8])
    };
  }

  if (type === 'zuordnung' || type === 'link') {
    return {
      type: 'link',
      ...common,
      statementId: row[9] || '',
      pointId: row[10] || ''
    };
  }

  return null;
}

export function holdingToRow(item) {
  if (item.type === 'statement') {
    return ['Aussage', item.id, item.text || '', '', '', '', '', '', '', '', '', item.active !== false, Number(item.order || 0), item.updatedAt || nowIso()];
  }

  if (item.type === 'point') {
    return ['Haltepunkt', item.id, '', item.title || '', item.kind || '', item.content || '', item.imageUrl || '', item.personalMeaning || '', joinWords(item.keywords), '', '', item.active !== false, Number(item.order || 0), item.updatedAt || nowIso()];
  }

  return ['Zuordnung', item.id, '', '', '', '', '', '', '', item.statementId || '', item.pointId || '', item.active !== false, Number(item.order || 0), item.updatedAt || nowIso()];
}

export function situationFromRow(row) {
  return {
    id: row[0] || uid('holding-situation'),
    createdAt: row[1] || nowIso(),
    statementId: row[2] || '',
    pointId: row[3] || '',
    text: row[4] || '',
    status: row[5] === 'abgeschlossen' ? 'abgeschlossen' : 'offen',
    completedAt: row[6] || '',
    review: row[7] || '',
    updatedAt: row[8] || nowIso()
  };
}

export function situationToRow(item) {
  return [
    item.id,
    item.createdAt || nowIso(),
    item.statementId || '',
    item.pointId || '',
    item.text || '',
    item.status === 'abgeschlossen' ? 'abgeschlossen' : 'offen',
    item.completedAt || '',
    item.review || '',
    item.updatedAt || nowIso()
  ];
}

export function holdingTables(data) {
  return {
    Haltepunkte: {
      headers: HOLDING_HEADERS,
      rows: [
        ...data.statements.map(item => holdingToRow({ ...item, type: 'statement' })),
        ...data.points.map(item => holdingToRow({ ...item, type: 'point' })),
        ...data.links.map(item => holdingToRow({ ...item, type: 'link' }))
      ]
    },
    HaltepunktSituationen: {
      headers: SITUATION_HEADERS,
      rows: data.situations.map(situationToRow)
    }
  };
}
