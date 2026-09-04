import { initDayFeature } from './features/day.js';
import { initSettings, setConnectedHandler, setExtraSheetsProvider } from './features/settings.js';
import { initProgressFeature, progressSheetSpecs, syncProgress } from './features/progress.js';
import { initWellbeingFeature, syncWellbeing, wellbeingSheetSpecs } from './features/wellbeing.js';

function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      registration.update().catch(() => {});
    } catch {}
  });
}

initDayFeature();
initProgressFeature();
initWellbeingFeature();
setExtraSheetsProvider(() => ({ ...progressSheetSpecs, ...wellbeingSheetSpecs }));
setConnectedHandler(async () => {
  await syncProgress();
  await syncWellbeing();
});
initSettings();
initServiceWorker();
