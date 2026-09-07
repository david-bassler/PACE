const PICKER_SCRIPT = 'https://apis.google.com/js/api.js';

let apiLoaderPromise = null;
let pickerLibraryPromise = null;

function loadApiLoader() {
  if (window.gapi?.load) return Promise.resolve();

  if (!apiLoaderPromise) {
    apiLoaderPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${PICKER_SCRIPT}"]`);
      const script = existing || document.createElement('script');

      const ready = () => {
        if (window.gapi?.load) resolve();
        else reject(new Error('Google Picker Loader wurde geladen, ist aber nicht verfügbar.'));
      };

      if (existing) {
        if (window.gapi?.load) {
          resolve();
          return;
        }
        existing.addEventListener('load', ready, { once: true });
        existing.addEventListener('error', () => reject(new Error('Google Picker Loader konnte nicht geladen werden.')), { once: true });
        return;
      }

      script.src = PICKER_SCRIPT;
      script.async = true;
      script.defer = true;
      script.addEventListener('load', ready, { once: true });
      script.addEventListener('error', () => reject(new Error('Google Picker Loader konnte nicht geladen werden.')), { once: true });
      document.head.appendChild(script);
    });
  }

  return apiLoaderPromise;
}

export async function ensurePickerLibrary() {
  if (window.google?.picker) return;

  if (!pickerLibraryPromise) {
    pickerLibraryPromise = loadApiLoader().then(() => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Google Picker hat beim Laden zu lange gebraucht.'));
      }, 15000);

      window.gapi.load('picker', {
        callback: () => {
          clearTimeout(timeout);
          if (window.google?.picker) resolve();
          else reject(new Error('Google Picker wurde nicht korrekt initialisiert.'));
        },
        onerror: () => {
          clearTimeout(timeout);
          reject(new Error('Google Picker konnte nicht initialisiert werden.'));
        }
      });
    }));
  }

  return pickerLibraryPromise;
}

export async function pickSpreadsheet({
  accessToken,
  apiKey,
  appId,
  origin = window.location.origin
}) {
  if (!accessToken) throw new Error('Bitte zuerst mit Google verbinden.');
  if (!apiKey) throw new Error('Für den Google Picker fehlt noch der API-Key.');
  if (!appId) throw new Error('Für den Google Picker fehlt noch die Cloud-Projektnummer.');

  await ensurePickerLibrary();

  return new Promise((resolve, reject) => {
    try {
      const view = new window.google.picker.DocsView(window.google.picker.ViewId.SPREADSHEETS);
      view.setMode(window.google.picker.DocsViewMode.LIST);

      const picker = new window.google.picker.PickerBuilder()
        .addView(view)
        .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
        .setOAuthToken(accessToken)
        .setDeveloperKey(apiKey)
        .setAppId(appId)
        .setOrigin(origin)
        .setLocale('de')
        .setCallback(data => {
          if (data.action === window.google.picker.Action.CANCEL) {
            resolve(null);
            return;
          }

          if (data.action !== window.google.picker.Action.PICKED) return;

          const documents = data[window.google.picker.Response.DOCUMENTS] || [];
          const document = documents[0];
          if (!document) {
            reject(new Error('Google Picker hat keine Tabelle zurückgegeben.'));
            return;
          }

          const id = document[window.google.picker.Document.ID] || document.id || '';
          const name = document[window.google.picker.Document.NAME] || document.name || '';
          const url = document[window.google.picker.Document.URL] || document.url || '';
          const mimeType = document[window.google.picker.Document.MIME_TYPE] || document.mimeType || '';

          if (!id) {
            reject(new Error('Die ausgewählte Tabelle hat keine verwertbare Datei-ID.'));
            return;
          }

          resolve({ id, name, url, mimeType });
        })
        .build();

      picker.setVisible(true);
    } catch (error) {
      reject(error);
    }
  });
}
