import { KEYS, loadJSON, saveJSON } from './storage.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const BASE_SHEETS = {
  Vorschlaege: ['Bereich', 'Vorschlag'],
  Feststecken: ['Vorschlag'],
  Tage: ['Datum','Tagesform','Kompetenz','Kompetenz_erledigt','Fortschritt','Fortschritt_erledigt','Reserve','Reserve_erledigt','Resonanz','Resonanz_erledigt','Feststecken_Anzahl','Abend_Fortschritt','Abend_Resonanz','Abend_Reserve','Abgeschlossen_um','Aktualisiert_um']
};

function migrateConfig() {
  const current = loadJSON(KEYS.config, null);
  if (current?.clientId || current?.sheetId) return { clientId: '', sheetId: '', ...current };
  for (const key of KEYS.legacyConfig) {
    const legacy = loadJSON(key, null);
    if (legacy?.clientId || legacy?.sheetId) {
      const migrated = { clientId: '', sheetId: '', ...legacy };
      saveJSON(KEYS.config, migrated);
      return migrated;
    }
  }
  return { clientId: '', sheetId: '' };
}

let config = migrateConfig();
let accessToken = '';
let tokenClient = null;
let statusListener = () => {};
let connectionListener = () => {};

// All Google API traffic goes through one queue. This prevents feature modules
// from accidentally producing parallel request bursts against the Sheets API.
let requestTail = Promise.resolve();

// Sheet metadata/header checks are cached for the current spreadsheet. A
// repeated read/write must not rediscover the same tabs and headers.
let knownSheetId = '';
let knownTitles = null;
const ensuredHeaders = new Map();

export function getConfig() { return { ...config }; }
export function isConnected() { return Boolean(accessToken); }

export function onGoogleStatus(listener) { statusListener = listener || (() => {}); }
export function onGoogleConnection(listener) { connectionListener = listener || (() => {}); }

function resetSheetCache() {
  knownSheetId = config.sheetId || '';
  knownTitles = null;
  ensuredHeaders.clear();
}

export function setConfig(next) {
  const rawSheet = (next.sheetId || '').trim();
  const match = rawSheet.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  const previousSheetId = config.sheetId;
  config = {
    clientId: (next.clientId || '').trim(),
    sheetId: match ? match[1] : rawSheet
  };
  saveJSON(KEYS.config, config);
  if (config.sheetId !== previousSheetId) resetSheetCache();
  return getConfig();
}

function gisReady() {
  return Boolean(window.google?.accounts?.oauth2);
}

export function connectGoogle() {
  if (!config.clientId) throw new Error('Bitte zuerst eine OAuth Client-ID speichern.');
  if (!gisReady()) throw new Error('Google Identity ist noch nicht geladen. Bitte kurz warten und erneut versuchen.');

  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: config.clientId,
      scope: SCOPE,
      callback: async response => {
        if (response.error) {
          statusListener(`Google-Anmeldung fehlgeschlagen: ${response.error}`, 'bad');
          return;
        }
        accessToken = response.access_token || '';
        connectionListener(true);
        statusListener('Verbunden. Der Access Token bleibt nur im Arbeitsspeicher.', 'good');
      }
    });
  }
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function retryDelay(response, attempt) {
  const retryAfter = response.headers.get('Retry-After');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(1000, seconds * 1000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(1000, date - Date.now());
  }
  return Math.min(12000, 1000 * (2 ** attempt));
}

async function apiAttempt(url, options = {}) {
  if (!accessToken) throw new Error('Bitte zuerst mit Google verbinden.');
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${accessToken}` };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      accessToken = '';
      connectionListener(false);
      throw new Error('Google-Zugriff ist abgelaufen. Bitte erneut verbinden.');
    }

    if (response.ok) {
      return response.status === 204 ? null : response.json();
    }

    const retryable = response.status === 429 || [500, 502, 503, 504].includes(response.status);
    if (retryable && attempt < 4) {
      const waitMs = retryDelay(response, attempt);
      statusListener(
        response.status === 429
          ? `Google begrenzt gerade die Anfragen. Neuer Versuch in etwa ${Math.ceil(waitMs / 1000)} s …`
          : 'Google ist vorübergehend nicht erreichbar. PACE versucht es erneut …'
      );
      await sleep(waitMs);
      continue;
    }

    const body = await response.text();
    throw new Error(`Google API: ${response.status} ${body.slice(0, 260)}`);
  }

  throw new Error('Google-Synchronisierung konnte nach mehreren Versuchen nicht abgeschlossen werden.');
}

function api(url, options = {}) {
  const run = requestTail.then(
    () => apiAttempt(url, options),
    () => apiAttempt(url, options)
  );
  requestTail = run.catch(() => {});
  return run;
}

function sheetsUrl(path = '') {
  return `https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}${path}`;
}

export async function createSpreadsheet(extraSheets = {}) {
  const specs = { ...BASE_SHEETS, ...extraSheets };
  const body = {
    properties: { title: 'PACE' },
    sheets: Object.keys(specs).map(title => ({ properties: { title } }))
  };
  const data = await api('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  config.sheetId = data.spreadsheetId;
  saveJSON(KEYS.config, config);
  resetSheetCache();
  await ensureSheets(specs);
  return getConfig();
}

function headerSignature(headers) {
  return headers.join('\u001f');
}

export async function ensureSheets(extraSheets = {}) {
  if (!config.sheetId) throw new Error('Keine Spreadsheet-ID eingetragen.');
  if (knownSheetId !== config.sheetId) resetSheetCache();

  const specs = { ...BASE_SHEETS, ...extraSheets };
  const pending = Object.entries(specs).filter(([title, headers]) => ensuredHeaders.get(title) !== headerSignature(headers));
  if (!pending.length) return;

  if (!knownTitles) {
    const meta = await api(sheetsUrl('?fields=sheets.properties.title'));
    knownTitles = new Set((meta.sheets || []).map(sheet => sheet.properties.title));
  }

  const missingTitles = pending.map(([title]) => title).filter(title => !knownTitles.has(title));
  if (missingTitles.length) {
    const requests = missingTitles.map(title => ({ addSheet: { properties: { title } } }));
    await api(sheetsUrl(':batchUpdate'), { method: 'POST', body: JSON.stringify({ requests }) });
    missingTitles.forEach(title => knownTitles.add(title));
  }

  const ranges = pending.map(([title, headers]) => `${title}!A1:${columnName(headers.length)}1`);
  const headerData = await batchGetValues(ranges);
  const missingHeaderWrites = [];

  pending.forEach(([title, headers], index) => {
    const values = headerData[index]?.values || [];
    if (!values.length) {
      missingHeaderWrites.push({
        range: `${title}!A1:${columnName(headers.length)}1`,
        majorDimension: 'ROWS',
        values: [headers]
      });
    }
  });

  if (missingHeaderWrites.length) await batchWriteValues(missingHeaderWrites);
  pending.forEach(([title, headers]) => ensuredHeaders.set(title, headerSignature(headers)));
}

export function columnName(count) {
  let n = count;
  let out = '';
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

export async function readValues(range) {
  return api(sheetsUrl(`/values/${encodeURIComponent(range)}?majorDimension=ROWS`));
}

export async function batchGetValues(ranges) {
  if (!ranges.length) return [];
  const query = ranges.map(range => `ranges=${encodeURIComponent(range)}`).join('&');
  const data = await api(sheetsUrl(`/values:batchGet?majorDimension=ROWS&${query}`));
  return data.valueRanges || [];
}

export async function writeValues(range, values) {
  return api(sheetsUrl(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`), {
    method: 'PUT',
    body: JSON.stringify({ range, majorDimension: 'ROWS', values })
  });
}

export async function batchWriteValues(data) {
  if (!data.length) return null;
  return api(sheetsUrl('/values:batchUpdate'), {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'RAW', data })
  });
}

export async function clearValues(range) {
  return api(sheetsUrl(`/values/${encodeURIComponent(range)}:clear`), { method: 'POST', body: '{}' });
}

export async function batchClearValues(ranges) {
  if (!ranges.length) return null;
  return api(sheetsUrl('/values:batchClear'), {
    method: 'POST',
    body: JSON.stringify({ ranges })
  });
}

export async function appendValues(range, values) {
  return api(sheetsUrl(`/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`), {
    method: 'POST',
    body: JSON.stringify({ majorDimension: 'ROWS', values })
  });
}

export async function replaceTables(tables) {
  const entries = Object.entries(tables);
  if (!entries.length) return;
  const specs = Object.fromEntries(entries.map(([title, table]) => [title, table.headers]));
  await ensureSheets(specs);

  // Write first, then clear only rows below the new data. If the second request
  // fails, the newly written data is still intact in the remote sheet.
  const writes = entries.map(([title, table]) => ({
    range: `${title}!A1:${columnName(table.headers.length)}${table.rows.length + 1}`,
    majorDimension: 'ROWS',
    values: [table.headers, ...table.rows]
  }));
  await batchWriteValues(writes);

  const trailingRanges = entries.map(([title, table]) => `${title}!A${table.rows.length + 2}:ZZ`);
  await batchClearValues(trailingRanges);
}

export async function replaceTable(title, headers, rows) {
  return replaceTables({ [title]: { headers, rows } });
}

export async function loadTables(specs) {
  const entries = Object.entries(specs);
  if (!entries.length) return {};
  await ensureSheets(specs);
  const ranges = entries.map(([title, headers]) => `${title}!A2:${columnName(headers.length)}`);
  const result = await batchGetValues(ranges);
  return Object.fromEntries(entries.map(([title], index) => [title, result[index]?.values || []]));
}

export async function loadTable(title, headers) {
  const result = await loadTables({ [title]: headers });
  return result[title] || [];
}

export async function upsertRow(title, headers, keyIndex, keyValue, row) {
  await ensureSheets({ [title]: headers });
  const data = await readValues(`${title}!A2:${columnName(headers.length)}`);
  const rows = data.values || [];
  const index = rows.findIndex(existing => String(existing[keyIndex] || '') === String(keyValue));
  if (index >= 0) {
    const sheetRow = index + 2;
    await writeValues(`${title}!A${sheetRow}:${columnName(headers.length)}${sheetRow}`, [row]);
  } else {
    await appendValues(`${title}!A:${columnName(headers.length)}`, [row]);
  }
}

export function sheetUrl() {
  return config.sheetId ? `https://docs.google.com/spreadsheets/d/${config.sheetId}/edit` : '';
}
