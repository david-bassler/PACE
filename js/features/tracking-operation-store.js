import {
  listRedundantValues,
  listValuesByPrefix,
  nowIso,
  removeRedundantValue,
  removeValue,
  saveJSON,
  saveRedundantValue
} from '../core/storage.js';

export const REDUNDANT_OP_PREFIX = 'paceTrackingOperationV2:';
export const PRIMARY_OP_PREFIX = 'pace-tracking-operation-v2:';

function redundantOperationKey(id) {
  return `${REDUNDANT_OP_PREFIX}${id}`;
}

function primaryOperationKey(id) {
  return `${PRIMARY_OP_PREFIX}${id}`;
}

function parseOperation(raw) {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && value.id ? value : null;
  } catch {
    return null;
  }
}

function operationFreshness(operation) {
  const timestamp = new Date(operation?.updatedAt || operation?.confirmedAt || operation?.createdAt || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function listTrackingOperations() {
  const merged = new Map();
  const allRaw = [
    ...listValuesByPrefix(PRIMARY_OP_PREFIX),
    ...listRedundantValues(REDUNDANT_OP_PREFIX)
  ];

  for (const [, raw] of allRaw) {
    const operation = parseOperation(raw);
    if (!operation) continue;
    const existing = merged.get(operation.id);
    if (!existing || operationFreshness(operation) >= operationFreshness(existing)) {
      merged.set(operation.id, operation);
    }
  }

  return [...merged.values()]
    .sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')));
}

export function saveTrackingOperation(operation) {
  if (!operation?.id) throw new Error('Tracking-Operation ohne ID kann nicht gespeichert werden.');
  const normalized = {
    ...operation,
    updatedAt: operation.updatedAt || nowIso()
  };
  saveJSON(primaryOperationKey(normalized.id), normalized);
  const redundantSaved = saveRedundantValue(redundantOperationKey(normalized.id), JSON.stringify(normalized));
  if (!redundantSaved) {
    throw new Error('Die unabhängige lokale Sicherheitskopie der Tracking-Operation konnte nicht gespeichert werden.');
  }
  return normalized;
}

export function updateTrackingOperation(operation, patch) {
  return saveTrackingOperation({ ...operation, ...patch, updatedAt: nowIso() });
}

export function removeTrackingOperation(id) {
  const redundantRemoved = removeRedundantValue(redundantOperationKey(id));
  removeValue(primaryOperationKey(id));
  return redundantRemoved;
}
