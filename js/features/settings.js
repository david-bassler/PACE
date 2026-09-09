import { $, openDialog } from '../core/ui.js';
import {
  connectGoogle,
  createSpreadsheet,
  ensureSheets,
  getAccessToken,
  getConfig,
  inferPickerAppId,
  isConnected,
  onGoogleConnection,
  onGoogleStatus,
  setConfig,
  setTrackingSpreadsheet,
  sheetUrl,
  trackingSheetUrl
} from '../core/google.js';
import { pickSpreadsheet } from '../core/google-picker.js';
import { onSyncState, refreshSyncState, syncAll } from '../core/sync.js';
import { importPrivateTSV } from './day.js';

let extraSheetsProvider = () => ({});
let installPrompt = null;

function renderConnection() {
  const connected = isConnected();
  const config = getConfig();

  $('createSheet').disabled = !connected;
  $('setupSheet').disabled = !connected || !config.sheetId;
  $('syncNow').disabled = !connected || !config.sheetId;
  $('importPrivate').disabled = !connected || !config.sheetId;
  $('pickTrackingSheet').disabled = !connected;

  const link = $('sheetLink');
  const url = sheetUrl();
  link.hidden = !url;
  if (url) link.href = url;

  const trackingLink = $('trackingSheetLink');
  const trackingUrl = trackingSheetUrl();
  trackingLink.hidden = !trackingUrl;
  if (trackingUrl) trackingLink.href = trackingUrl;

  const choice = $('trackingSheetChoice');
  choice.textContent = config.trackingSheetId
    ? `${config.trackingSheetName || 'Tracking-Tabelle'} · ${config.trackingSheetId}`
    : 'Noch keine Tracking-Tabelle ausgewählt.';
  choice.className = `status-box${config.trackingSheetId ? ' good' : ''}`;
}

function status(text, kind = '') {
  const el = $('googleStatus');
  el.textContent = text;
  el.className = `status-box${kind ? ` ${kind}` : ''}`;
}

function renderHomeGoogle({ state = 'local', error = null, connected = isConnected() } = {}) {
  const button = $('homeGoogleConnect');
  const label = $('homeGoogleLabel');
  if (!button || !label) return;

  let text = 'Google verbinden';
  let title = getConfig().clientId
    ? 'Mit Google verbinden'
    : 'Google-Verbindung einrichten';

  if (connected) {
    text = 'Google verbunden';
    title = getConfig().sheetId
      ? 'Mit Google verbunden · klicken, um jetzt zu synchronisieren'
      : 'Mit Google verbunden · PACE-Backend noch nicht eingerichtet';
  }

  if (state === 'syncing') {
    text = 'Synchronisiere …';
    title = 'Synchronisierung läuft';
  } else if (state === 'pending' && connected) {
    text = 'Sync ausstehend';
    title = 'Lokale Änderungen warten auf Synchronisierung · klicken, um jetzt zu synchronisieren';
  } else if (state === 'synced' && connected) {
    text = 'Synchronisiert';
    title = 'Mit Google Sheets synchronisiert · klicken, um jetzt zu synchronisieren';
  } else if (state === 'error') {
    text = connected ? 'Sync-Fehler' : 'Google verbinden';
    title = error?.message || 'Synchronisierung fehlgeschlagen';
  }

  label.textContent = text;
  button.title = title;
  button.setAttribute('aria-label', title);
  button.disabled = state === 'syncing';
}

export function setExtraSheetsProvider(provider) { extraSheetsProvider = provider || (() => ({})); }

function inputConfig() {
  const clientId = $('clientIdInput').value.trim();
  const pickerAppId = $('pickerAppIdInput').value.trim() || inferPickerAppId(clientId);

  return {
    clientId,
    sheetId: $('sheetIdInput').value,
    pickerApiKey: $('pickerApiKeyInput').value,
    pickerAppId
  };
}

function fillConfigInputs(config = getConfig()) {
  $('clientIdInput').value = config.clientId || '';
  $('sheetIdInput').value = config.sheetId || '';
  $('pickerApiKeyInput').value = config.pickerApiKey || '';
  $('pickerAppIdInput').value = config.pickerAppId || inferPickerAppId(config.clientId);
}

async function fullSync() {
  await ensureSheets(extraSheetsProvider());
  await syncAll();
}

export function initSettings() {
  onGoogleStatus(status);
  onSyncState(({ state, error, connected }) => {
    renderHomeGoogle({ state, error, connected });
    const dot = $('syncDot');
    dot.className = `sync-dot${state === 'synced' ? ' synced' : state === 'error' ? ' error' : ['pending','syncing'].includes(state) ? ' pending' : ''}`;
    dot.title = state === 'synced'
      ? 'Mit Google Sheets synchronisiert'
      : state === 'syncing'
        ? 'Synchronisierung läuft'
        : state === 'pending'
          ? (connected ? 'Lokal gespeichert · Synchronisierung steht aus' : 'Lokal gespeichert · wartet auf Google')
          : state === 'error'
            ? 'Synchronisierung fehlgeschlagen'
            : 'Nur lokal gespeichert';
    if (state === 'syncing') status('Synchronisiere …');
    if (state === 'pending') status(connected ? 'Lokal gespeichert · Synchronisierung steht aus.' : 'Lokal gespeichert · wartet auf Google.');
    if (state === 'synced') status('Synchronisiert.', 'good');
    if (state === 'local') status('Nur lokal gespeichert. Für Google-Sync bitte verbinden.');
    if (state === 'error' && error) status(error.message, 'bad');
  });
  onGoogleConnection(connected => {
    renderConnection();
    refreshSyncState();
    if (connected) fullSync().catch(error => status(error.message, 'bad'));
  });

  fillConfigInputs();
  renderConnection();

  window.addEventListener('pace:config-imported', () => {
    fillConfigInputs();
    renderConnection();
    refreshSyncState();
    status('Einrichtung übernommen. Bitte auf diesem Gerät einmal mit Google verbinden.', 'good');
  });

  $('settingsButton').addEventListener('click', () => {
    fillConfigInputs();
    renderConnection();
    openDialog('settingsDialog');
  });

  $('saveGoogleConfig').addEventListener('click', () => {
    const saved = setConfig(inputConfig());
    fillConfigInputs(saved);
    status('Google-Einstellungen gespeichert. IDs und Picker-Konfiguration bleiben lokal erhalten.');
    renderConnection();
  });

  $('googleConnect').addEventListener('click', () => {
    try {
      const saved = setConfig(inputConfig());
      fillConfigInputs(saved);
      connectGoogle();
    } catch (error) { status(error.message, 'bad'); }
  });

  $('homeGoogleConnect').addEventListener('click', async () => {
    const config = getConfig();

    if (!config.clientId) {
      fillConfigInputs(config);
      renderConnection();
      status('Für die erste Google-Verbindung bitte einmal die OAuth Client-ID eintragen.', '');
      openDialog('settingsDialog');
      return;
    }

    try {
      if (!isConnected()) {
        connectGoogle();
        return;
      }

      if (!config.sheetId) {
        fillConfigInputs(config);
        renderConnection();
        status('Google ist verbunden. Bitte einmal das PACE-Backend einrichten.', '');
        openDialog('settingsDialog');
        return;
      }

      await fullSync();
      status('Synchronisiert.', 'good');
    } catch (error) {
      status(error.message, 'bad');
    }
  });


  $('pickTrackingSheet').addEventListener('click', async () => {
    try {
      let saved = setConfig(inputConfig());
      const appId = saved.pickerAppId || inferPickerAppId(saved.clientId);
      if (!saved.pickerAppId && appId) {
        saved = setConfig({ pickerAppId: appId });
        fillConfigInputs(saved);
      }

      const selected = await pickSpreadsheet({
        accessToken: getAccessToken(),
        apiKey: saved.pickerApiKey,
        appId
      });

      if (!selected) {
        status('Tabellenauswahl abgebrochen.');
        return;
      }

      const next = setTrackingSpreadsheet({ id: selected.id, name: selected.name });
      fillConfigInputs(next);
      renderConnection();
      status(`Tracking-Tabelle „${selected.name || selected.id}“ ausgewählt. Sie bleibt getrennt vom PACE-Backend.`, 'good');
    } catch (error) {
      status(error.message, 'bad');
    }
  });

  $('clientIdInput').addEventListener('change', () => {
    if ($('pickerAppIdInput').value.trim()) return;
    $('pickerAppIdInput').value = inferPickerAppId($('clientIdInput').value);
  });

  $('createSheet').addEventListener('click', async () => {
    try {
      const saved = setConfig(inputConfig());
      if (saved.sheetId && !confirm('Es ist bereits eine Spreadsheet-ID eingetragen. Wirklich ein neues PACE-Sheet anlegen?')) return;
      const created = await createSpreadsheet(extraSheetsProvider());
      $('sheetIdInput').value = created.sheetId;
      renderConnection();
      status('Neues privates PACE-Sheet angelegt.', 'good');
      await fullSync();
    } catch (error) { status(error.message, 'bad'); }
  });

  $('setupSheet').addEventListener('click', async () => {
    try {
      await fullSync();
      status('Sheet eingerichtet und geladen.', 'good');
    } catch (error) { status(error.message, 'bad'); }
  });

  $('syncNow').addEventListener('click', async () => {
    try {
      await fullSync();
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
