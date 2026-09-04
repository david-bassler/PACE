import { KEYS, loadJSON, saveJSON } from './storage.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const BASE_SHEETS = {
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

export function getConfig() { return { ...config }; }
export function isConnected() { return Boolean(accessToken); }

export function onGoogleStatus(listener) { statusListener = listener || (() => {}); }
export function onGoogleConnection(listener) { connectionListener = listener || (() => {}); }

export function setConfig(next) {
  const rawSheet = (next.sheetId || '').trim();
  const match = rawSheet.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  config = {
    clientId: (next.clientId || '').trim(),
    sheetId: match ? match[1] : rawSheet
  };
  saveJSON(KEYS.config, config);
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

async function api(url, options = {}) {
  if (!accessToken) throw new Error('Bitte zuerst mit Google verbinden.');
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${accessToken}` };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    accessToken = '';
    connectionListener(false);
    throw new Error('Google-Zugriff ist abgelaufen. Bitte erneut verbinden.');
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google API: ${response.status} ${body.slice(0, 260)}`);
  }
  return response.status === 204 ? null : response.json();
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
  await ensureSheets(specs);
  return getConfig();
}

export async function ensureSheets(extraSheets = {}) {
  if (!config.sheetId) throw new Error('Keine Spreadsheet-ID eingetragen.');
  const specs = { ...BASE_SHEETS, ...extraSheets };
  const meta = await api(sheetsUrl('?fields=sheets.properties.title'));
  const titles = (meta.sheets || []).map(sheet => sheet.properties.title);
  const requests = Object.keys(specs)
    .filter(title => !titles.includes(title))
    .map(title => ({ addSheet: { properties: { title } } }));
  if (requests.length) {
    await api(sheetsUrl(':batchUpdate'), { method: 'POST', body: JSON.stringify({ requests }) });
  }
  for (const [title, headers] of Object.entries(specs)) {
    const first = await readValues(`${title}!A1:${columnName(headers.length)}1`).catch(() => ({ values: [] }));
    if (!(first.values?.length)) await writeValues(`${title}!A1:${columnName(headers.length)}1`, [headers]);
  }
}

function columnName(count) {
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

export async function writeValues(range, values) {
  return api(sheetsUrl(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`), {
    method: 'PUT',
    body: JSON.stringify({ range, majorDimension: 'ROWS', values })
  });
}

export async function clearValues(range) {
  return api(sheetsUrl(`/values/${encodeURIComponent(range)}:clear`), { method: 'POST', body: '{}' });
}

export async function appendValues(range, values) {
  return api(sheetsUrl(`/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`), {
    method: 'POST',
    body: JSON.stringify({ majorDimension: 'ROWS', values })
  });
}

export async function replaceTable(title, headers, rows) {
  await ensureSheets({ [title]: headers });
  await clearValues(`${title}!A:ZZ`);
  await writeValues(`${title}!A1:${columnName(headers.length)}${rows.length + 1}`, [headers, ...rows]);
}

export async function loadTable(title, headers) {
  await ensureSheets({ [title]: headers });
  const data = await readValues(`${title}!A2:${columnName(headers.length)}`);
  return data.values || [];
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
