import { getConfig, inferPickerAppId, setConfig } from '../core/google.js';
import { $, announce, emptyMessage, openDialog } from '../core/ui.js';
import { decodeSetupConfig, encodeSetupConfig, hasTransferableConfig } from './setup-transfer-domain.js';

const HASH_PREFIX = '#pace-setup=';
let pendingImport = null;

function baseAppUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

function currentTransferConfig() {
  const existing = getConfig();
  const clientId = $('clientIdInput')?.value.trim() || existing.clientId;
  const pickerAppId = $('pickerAppIdInput')?.value.trim() || existing.pickerAppId || inferPickerAppId(clientId);

  return setConfig({
    clientId,
    sheetId: $('sheetIdInput')?.value.trim() || existing.sheetId,
    pickerApiKey: $('pickerApiKeyInput')?.value.trim() || existing.pickerApiKey,
    pickerAppId
  });
}

function setupUrl(config) {
  return `${baseAppUrl()}${HASH_PREFIX}${encodeSetupConfig(config)}`;
}

function renderSetupQr(config) {
  const target = $('setupQrCode');
  target.innerHTML = '';

  if (!window.QRCode) {
    target.appendChild(emptyMessage('Der QR-Code-Generator ist noch nicht geladen. Bitte kurz online neu laden.'));
    return false;
  }

  new window.QRCode(target, {
    text: setupUrl(config),
    width: 288,
    height: 288,
    correctLevel: window.QRCode.CorrectLevel.M
  });

  const parts = [];
  if (config.sheetId) parts.push('PACE-Backend');
  if (config.trackingSheetId) parts.push(config.trackingSheetName || 'Tracking-Tabelle');
  if (config.clientId) parts.push('Google-Konfiguration');
  $('setupQrSummary').textContent = parts.join(' · ');
  return true;
}

function openTransferQr() {
  try {
    const config = currentTransferConfig();
    if (!hasTransferableConfig(config)) throw new Error('Noch keine gespeicherten PACE-Einstellungen zum Übertragen vorhanden.');

    if ($('settingsDialog')?.open) $('settingsDialog').close();
    renderSetupQr(config);
    openDialog('setupTransferDialog');
  } catch (error) {
    announce(error?.message || 'Einrichtungs-QR konnte nicht erstellt werden.', 'bad');
  }
}

function scrubTransferHash() {
  if (!window.location.hash.startsWith(HASH_PREFIX)) return;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

function renderImportSummary(config) {
  const box = $('setupImportSummary');
  box.innerHTML = '';

  const items = [
    ['PACE-Backend', config.sheetId ? 'enthalten' : 'nicht enthalten'],
    ['Tracking-Tabelle', config.trackingSheetId ? (config.trackingSheetName || 'enthalten') : 'nicht enthalten'],
    ['OAuth Client-ID', config.clientId ? 'enthalten' : 'nicht enthalten'],
    ['Picker API-Key', config.pickerApiKey ? 'enthalten' : 'nicht enthalten'],
    ['Cloud-Projektnummer', config.pickerAppId ? 'enthalten' : 'nicht enthalten']
  ];

  for (const [label, value] of items) {
    const row = document.createElement('div');
    row.className = 'setup-import-row';
    const strong = document.createElement('strong');
    strong.textContent = label;
    const span = document.createElement('span');
    span.textContent = value;
    row.append(strong, span);
    box.appendChild(row);
  }
}

function detectIncomingSetup() {
  if (!window.location.hash.startsWith(HASH_PREFIX)) return;

  try {
    pendingImport = decodeSetupConfig(window.location.hash.slice(HASH_PREFIX.length));
    renderImportSummary(pendingImport);
    openDialog('setupImportDialog');
  } catch (error) {
    scrubTransferHash();
    announce(error?.message || 'Der Einrichtungs-QR konnte nicht gelesen werden.', 'bad');
  }
}

function applyIncomingSetup() {
  if (!pendingImport) return;
  const saved = setConfig(pendingImport);
  pendingImport = null;
  scrubTransferHash();
  $('setupImportDialog').close();
  window.dispatchEvent(new CustomEvent('pace:config-imported', { detail: saved }));
  announce('PACE-Einstellungen übernommen. Bitte auf diesem Gerät einmal mit Google verbinden.', 'good');
}

function cancelIncomingSetup() {
  pendingImport = null;
  scrubTransferHash();
}

export function initSetupTransferFeature() {
  $('openSetupTransfer').addEventListener('click', openTransferQr);
  $('setupImportApply').addEventListener('click', applyIncomingSetup);
  $('setupImportCancel').addEventListener('click', cancelIncomingSetup);
  $('setupImportDialog').addEventListener('cancel', cancelIncomingSetup);
  $('setupImportDialog').addEventListener('close', () => {
    if (pendingImport) cancelIncomingSetup();
  });
  detectIncomingSetup();
}
