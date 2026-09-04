import { $, openDialog } from '../core/ui.js';
import { connectGoogle, createSpreadsheet, getConfig, isConnected, onGoogleConnection, onGoogleStatus, setConfig, sheetUrl } from '../core/google.js';
import { googleConnectedDay, importPrivateTSV } from './day.js';

let extraSheetsProvider = () => ({});
let onConnected = async () => {};
let installPrompt = null;

function renderConnection() {
  const connected = isConnected();
  $('createSheet').disabled = !connected;
  $('setupSheet').disabled = !connected || !getConfig().sheetId;
  $('syncNow').disabled = !connected || !getConfig().sheetId;
  $('importPrivate').disabled = !connected || !getConfig().sheetId;
  const link = $('sheetLink');
  const url = sheetUrl();
  link.hidden = !url;
  if (url) link.href = url;
}

function status(text, kind = '') {
  const el = $('googleStatus');
  el.textContent = text;
  el.className = `status-box${kind ? ` ${kind}` : ''}`;
}

export function setExtraSheetsProvider(provider) { extraSheetsProvider = provider || (() => ({})); }
export function setConnectedHandler(handler) { onConnected = handler || (async () => {}); }

export function initSettings() {
  onGoogleStatus(status);
  onGoogleConnection(connected => {
    renderConnection();
    if (connected) {
      Promise.resolve()
        .then(() => googleConnectedDay())
        .then(() => onConnected())
        .catch(error => status(error.message, 'bad'));
    }
  });

  const config = getConfig();
  $('clientIdInput').value = config.clientId || '';
  $('sheetIdInput').value = config.sheetId || '';
  renderConnection();

  $('settingsButton').addEventListener('click', () => {
    const current = getConfig();
    $('clientIdInput').value = current.clientId || '';
    $('sheetIdInput').value = current.sheetId || '';
    renderConnection();
    openDialog('settingsDialog');
  });

  $('saveGoogleConfig').addEventListener('click', () => {
    const saved = setConfig({ clientId: $('clientIdInput').value, sheetId: $('sheetIdInput').value });
    $('sheetIdInput').value = saved.sheetId;
    status('Einstellungen gespeichert. Client-ID und Sheet-ID bleiben lokal erhalten.');
    renderConnection();
  });

  $('googleConnect').addEventListener('click', () => {
    try {
      setConfig({ clientId: $('clientIdInput').value, sheetId: $('sheetIdInput').value });
      connectGoogle();
    } catch (error) { status(error.message, 'bad'); }
  });

  $('createSheet').addEventListener('click', async () => {
    try {
      const saved = setConfig({ clientId: $('clientIdInput').value, sheetId: $('sheetIdInput').value });
      if (saved.sheetId && !confirm('Es ist bereits eine Spreadsheet-ID eingetragen. Wirklich ein neues PACE-Sheet anlegen?')) return;
      const created = await createSpreadsheet(extraSheetsProvider());
      $('sheetIdInput').value = created.sheetId;
      renderConnection();
      status('Neues privates PACE-Sheet angelegt.', 'good');
      await onConnected();
    } catch (error) { status(error.message, 'bad'); }
  });

  $('setupSheet').addEventListener('click', async () => {
    try {
      await onConnected();
      await googleConnectedDay();
      status('Sheet eingerichtet und geladen.', 'good');
    } catch (error) { status(error.message, 'bad'); }
  });

  $('syncNow').addEventListener('click', async () => {
    try {
      await googleConnectedDay();
      await onConnected();
      status('Synchronisiert.', 'good');
    } catch (error) { status(error.message, 'bad'); }
  });

  $('importPrivate').addEventListener('click', () => $('privateTsvInput').click());
  $('privateTsvInput').addEventListener('change', async () => {
    const file = $('privateTsvInput').files?.[0];
    if (!file) return;
    try {
      const result = await importPrivateTSV(file);
      status(`${result.proposals} PACE-Vorschläge und ${result.stuck} Feststecken-Hilfen importiert.`, 'good');
      $('privateTsvInput').value = '';
    } catch (error) { status(error.message, 'bad'); }
  });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    $('installButton').hidden = false;
  });
  $('installButton').addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    $('installButton').hidden = true;
  });
}
