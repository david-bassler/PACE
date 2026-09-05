import { initDayFeature } from './features/day.js';
import { initSettings, setExtraSheetsProvider } from './features/settings.js';
import { initProgressFeature, progressSheetSpecs } from './features/progress.js';
import { initWellbeingFeature, wellbeingSheetSpecs } from './features/wellbeing.js';
import { initSpaceFeature, spaceSheetSpecs } from './features/space.js';
import { initShareFeature } from './features/share.js';
import { initTrackingFeature, trackingSheetSpecs } from './features/tracking.js';

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
initSpaceFeature();
initShareFeature();
initTrackingFeature();
setExtraSheetsProvider(() => ({ ...progressSheetSpecs, ...wellbeingSheetSpecs, ...spaceSheetSpecs, ...trackingSheetSpecs }));
initSettings();
initServiceWorker();
