const TRANSFER_VERSION = 1;
const MAX_ENCODED_LENGTH = 6000;

function clean(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

export function transferableConfig(config = {}) {
  return {
    clientId: clean(config.clientId, 300),
    sheetId: clean(config.sheetId, 300),
    pickerApiKey: clean(config.pickerApiKey, 300),
    pickerAppId: clean(config.pickerAppId, 120),
    trackingSheetId: clean(config.trackingSheetId, 300),
    trackingSheetName: clean(config.trackingSheetName, 500)
  };
}

export function hasTransferableConfig(config = {}) {
  return Object.values(transferableConfig(config)).some(Boolean);
}

export function encodeSetupConfig(config = {}) {
  const safe = transferableConfig(config);
  if (!hasTransferableConfig(safe)) throw new Error('Keine gespeicherten PACE-Einstellungen zum Übertragen vorhanden.');

  const payload = {
    v: TRANSFER_VERSION,
    c: {
      c: safe.clientId,
      s: safe.sheetId,
      k: safe.pickerApiKey,
      p: safe.pickerAppId,
      t: safe.trackingSheetId,
      n: safe.trackingSheetName
    }
  };

  return encodeURIComponent(JSON.stringify(payload));
}

export function decodeSetupConfig(encoded) {
  const raw = String(encoded || '');
  if (!raw || raw.length > MAX_ENCODED_LENGTH) throw new Error('Der Einrichtungs-QR ist ungültig oder zu groß.');

  let payload;
  try {
    payload = JSON.parse(decodeURIComponent(raw));
  } catch {
    throw new Error('Der Einrichtungs-QR konnte nicht gelesen werden.');
  }

  if (payload?.v !== TRANSFER_VERSION || !payload.c || typeof payload.c !== 'object') {
    throw new Error('Diese PACE-Einrichtungsversion wird nicht unterstützt.');
  }

  const config = transferableConfig({
    clientId: payload.c.c,
    sheetId: payload.c.s,
    pickerApiKey: payload.c.k,
    pickerAppId: payload.c.p,
    trackingSheetId: payload.c.t,
    trackingSheetName: payload.c.n
  });

  if (!hasTransferableConfig(config)) throw new Error('Der Einrichtungs-QR enthält keine PACE-Einstellungen.');
  return config;
}
