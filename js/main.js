import { storageReady } from './core/storage.js';

function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      registration.update().catch(() => {});
    } catch {}
  };

  // Ein aktiviertes Update darf eine laufende Erfassung nicht durch einen
  // erzwungenen Reload unterbrechen. Die neue Version wird beim nächsten
  // normalen Laden bzw. Navigieren verwendet.
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
    quickCapture,
    quickCaptureToolbar,
    journeyUx,
    trackingIntegrityV2,
    trackingEntryDrafts,
    sunTimes,
    breath,
    holding,
    horizon,
    navigation,
    setupTransfer
  ] = await Promise.all([
    import('./features/day.js'),
    import('./features/settings.js'),
    import('./features/progress.js'),
    import('./features/wellbeing.js'),
    import('./features/space.js'),
    import('./features/share.js'),
    import('./features/tracking.js'),
    import('./features/quick-capture.js'),
    import('./features/quick-capture-toolbar.js'),
    import('./features/journey-ux.js'),
    import('./features/tracking-integrity-v2.js'),
    import('./features/tracking-entry-drafts.js'),
    import('./features/sun-times.js'),
    import('./features/breath.js'),
    import('./features/holding.js'),
    import('./features/horizon.js'),
    import('./features/navigation.js'),
    import('./features/setup-transfer.js')
  ]);

  day.initDayFeature();
  progress.initProgressFeature();
  wellbeing.initWellbeingFeature();
  space.initSpaceFeature();
  share.initShareFeature();
  tracking.initTrackingFeature();
  quickCapture.initQuickCaptureFeature();
  quickCaptureToolbar.initQuickCaptureToolbarFeature();
  journeyUx.initJourneyUxFeature();
  trackingIntegrityV2.initTrackingIntegrityV2();
  trackingEntryDrafts.initTrackingEntryDraftFeature();
  sunTimes.initSunTimesFeature();
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
  setupTransfer.initSetupTransferFeature();
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
