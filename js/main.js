import { storageReady } from './core/storage.js';

function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      registration.update().catch(() => {});
    } catch {}
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

async function boot() {
  await storageReady;

  const [
    day,
    settings,
    progress,
    wellbeing,
    space,
    share,
    tracking,
    breath,
    holding,
    horizon,
    navigation
  ] = await Promise.all([
    import('./features/day.js'),
    import('./features/settings.js'),
    import('./features/progress.js'),
    import('./features/wellbeing.js'),
    import('./features/space.js'),
    import('./features/share.js'),
    import('./features/tracking.js'),
    import('./features/breath.js'),
    import('./features/holding.js'),
    import('./features/horizon.js'),
    import('./features/navigation.js')
  ]);

  day.initDayFeature();
  progress.initProgressFeature();
  wellbeing.initWellbeingFeature();
  space.initSpaceFeature();
  share.initShareFeature();
  tracking.initTrackingFeature();
  breath.initBreathFeature();
  holding.initHoldingFeature();
  horizon.initHorizonFeature({
    parkTopic: space.addParkedFromTool,
    openHolding: holding.openHoldingChooser
  });
  navigation.initNavigation();

  settings.setExtraSheetsProvider(() => ({
    ...progress.progressSheetSpecs,
    ...wellbeing.wellbeingSheetSpecs,
    ...space.spaceSheetSpecs,
    ...tracking.trackingSheetSpecs,
    ...holding.holdingSheetSpecs
  }));
  settings.initSettings();
  initServiceWorker();
}

boot().catch(error => {
  console.error('PACE could not start.', error);
  const notice = document.getElementById('appNotice');
  if (notice) {
    notice.hidden = false;
    notice.className = 'app-notice bad';
    notice.textContent = 'PACE konnte nicht vollständig gestartet werden. Bitte Seite neu laden.';
  }
});
