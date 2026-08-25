async function swMessage(type, timeout = 45000) {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return null;
  const reg = await navigator.serviceWorker.ready, worker = reg.active || reg.waiting || reg.installing; if (!worker) return null;
  return await new Promise(resolve => {
    const ch = new MessageChannel(), timer = setTimeout(() => resolve(null), timeout);
    ch.port1.onmessage = e => { clearTimeout(timer); resolve(e.data); }; worker.postMessage({ type }, [ch.port2]);
  });
}
let updateRegistration = null, controllerChangeHandled = false;
function showUpdateReady(message = 'Reload to use the newest offline map package.') {
  const banner = $('updateBanner'), copy = $('updateMessage'); if (!banner || !copy) return;
  copy.textContent = message; banner.hidden = false;
}
function reloadForAppUpdate() {
  try { sessionStorage.setItem('nl-offline-update-reload', '1'); } catch (_) {}
  if (updateRegistration?.waiting) { updateRegistration.waiting.postMessage({ type: 'SKIP_WAITING' }); return; }
  location.reload();
}
function armAppUpdateFlow(registration) {
  if (!registration || !navigator.serviceWorker) return; updateRegistration = registration;
  if (registration.waiting && navigator.serviceWorker.controller) showUpdateReady();
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing; if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateReady('The new package is complete and will activate safely.');
    });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controllerChangeHandled) return; controllerChangeHandled = true;
    if (gpsRunning) { showUpdateReady('Update activated. Reload after stopping navigation.'); return; }
    showUpdateReady('Update activated. Reloading the app…'); setTimeout(() => location.reload(), 350);
  });
}
async function verifyOfflinePackage(force = false) {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) { offlinePackageReady = false; updateRoadReadiness(); return false; }
  try { const r = await swMessage(force ? 'PREPARE_OFFLINE' : 'CACHE_STATUS', 60000); offlinePackageReady = !!r?.ready; updateRoadReadiness(r); return offlinePackageReady; }
  catch (e) { offlinePackageReady = false; updateRoadReadiness({ error: e.message }); return false; }
}
async function refreshStoragePersistence() {
  try { storagePersistent = navigator.storage?.persisted ? await navigator.storage.persisted() : null; }
  catch (_) { storagePersistent = null; }
  return storagePersistent;
}
async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return await refreshStoragePersistence();
    storagePersistent = await navigator.storage.persist(); return storagePersistent;
  } catch (_) { storagePersistent = false; return false; }
}
function installInstructions() {
  if (standaloneMode()) return 'Installed on Home Screen.'; if (deferredInstall) return 'Install is available on this device.';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent); return ios ? 'On iPhone/iPad: Share → Add to Home Screen after this page is on HTTPS.' : 'Install from your browser menu after this page is on HTTPS.';
}
function updateRoadReadiness(cacheResult = null) {
  const secure = window.isSecureContext, cache = offlinePackageReady, standalone = standaloneMode(); let text = '', cls = '';
  if (!secure) { text = 'Needs HTTPS before phone GPS can work.'; cls = 'warn'; }
  else if (!cache) { text = cacheResult?.error ? `Offline package incomplete: ${cacheResult.error}` : 'Offline package is still being verified.'; cls = 'warn'; }
  else if (gpsPermission === 'denied') { text = 'Offline data is ready, but Location permission is denied.'; cls = 'warn'; }
  else { text = `Offline package ready · GPS ${gpsPermission === 'granted' ? 'permission granted' : 'available'}${standalone ? ' · installed' : ''}${storagePersistent === true ? ' · storage protected' : storagePersistent === false ? ' · browser-managed storage' : ''}.`; cls = 'good'; }
  $('roadReadyDetail').textContent = text; $('roadReadyDetail').className = `readydetail ${cls}`; $('installHint').textContent = installInstructions();
  $('prepareRoad').textContent = secure && cache ? 'Verify offline map' : 'Prepare offline map';
  if (secure && cache && gpsPermission !== 'denied') { $('appBadge').textContent = navigator.onLine ? '● ROAD READY' : '● OFFLINE READY'; $('appBadge').classList.remove('warn'); }
}
async function prepareForRoad() {
  const b = $('prepareRoad'); b.disabled = true; b.textContent = 'Verifying…'; setStatus('Verifying the complete offline map package…');
  try {
    await requestPersistentStorage(); const cache = await verifyOfflinePackage(true); await refreshGpsPermission();
    if (!cache) { setStatus('Offline package did not finish caching. The previous complete offline version was kept; stay online and try again.', true); return; }
    const blocked = gpsBlockReason(); if (blocked) { setStatus(blocked, true); return; }
    setStatus('Offline package ready. Testing one GPS fix…');
    try { const p = await obtainFix(); gpsLastFixAt = Date.now(); setStatus(`ROAD READY · offline files verified · GPS fix ±${Math.round(p.coords.accuracy || 0)} m.`); $('gpsPill').textContent = 'GPS verified'; $('gpsPill').className = 'gpspill live'; }
    catch (e) { setStatus(`Offline package is ready. GPS test: ${geoErrorText(e)}`, true); }
  } finally { b.disabled = false; updateRoadReadiness(); }
}
function standaloneMode() { return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
function gpsBlockReason() {
  if (!navigator.geolocation) return 'This browser does not expose GPS/geolocation.';
  if (!window.isSecureContext) return `GPS is blocked because ${location.hostname || 'this address'} is being served over HTTP. Use HTTPS for live GPS.`;
  if (gpsPermission === 'denied') return 'Location permission is denied. Enable Location access for this site/app in your browser or phone settings.'; return '';
}
function updateGpsEnvironment() {
  const secure = window.isSecureContext, standalone = standaloneMode(), proto = location.protocol.replace(':', '').toUpperCase(), host = location.hostname || 'local file';
  const perm = gpsPermission === 'unknown' ? 'permission not checked' : `permission ${gpsPermission}`;
  $('gpsEnv').textContent = `${secure ? 'Secure GPS context' : 'GPS blocked'} · ${standalone ? 'Home Screen / standalone' : 'browser tab'} · ${proto} ${host} · ${perm}`;
  $('gpsEnv').classList.toggle('warn', !secure || gpsPermission === 'denied');
  if (!secure) { $('gpsPill').textContent = 'GPS needs HTTPS'; $('gpsPill').className = 'gpspill warn'; }
  else if (!gpsRunning) { $('gpsPill').textContent = gpsPermission === 'denied' ? 'GPS denied' : 'GPS ready'; $('gpsPill').className = `gpspill${gpsPermission === 'denied' ? ' warn' : ''}`; }
  if (!(secure && offlinePackageReady && gpsPermission !== 'denied')) { $('appBadge').textContent = !secure ? '● HTTPS REQUIRED' : navigator.onLine ? '● PREPARING' : '● OFFLINE'; $('appBadge').classList.toggle('warn', !secure || !offlinePackageReady); }
  updateRoadReadiness();
}
async function refreshGpsPermission() {
  if (!navigator.permissions || !navigator.permissions.query) { updateGpsEnvironment(); return gpsPermission; }
  try { const q = await navigator.permissions.query({ name: 'geolocation' }); gpsPermission = q.state; q.onchange = () => { gpsPermission = q.state; updateGpsEnvironment(); }; }
  catch (_) { gpsPermission = 'unknown'; }
  updateGpsEnvironment(); return gpsPermission;
}
function geoErrorText(e) { if (!e) return 'Location unavailable.'; if (e.code === 1) return 'Location permission was denied.'; if (e.code === 2) return 'The phone could not determine a GPS position.'; if (e.code === 3) return 'GPS is taking longer than expected.'; return e.message || 'Location unavailable.'; }
function getOneFix(high = true) { return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: high, maximumAge: high ? 8000 : 30000, timeout: high ? 25000 : 12000 })); }
async function obtainFix() { try { return await getOneFix(true); } catch (first) { if (first && first.code === 1) throw first; return await getOneFix(false); } }
async function requestWake() { if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return; try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch (_) {} }
function releaseWake() { if (wakeLock) { try { wakeLock.release(); } catch (_) {} wakeLock = null; } }
function startStaleTimer() {
  if (gpsStaleTimer) clearInterval(gpsStaleTimer);
  gpsStaleTimer = setInterval(() => { if (!gpsRunning) return; const age = gpsLastFixAt ? Date.now() - gpsLastFixAt : Infinity; if (age > 30000) { $('gpsPill').textContent = 'GPS waiting'; $('gpsPill').className = 'gpspill warn'; $('gpsDetail').textContent = 'GPS signal paused or stale. NL Offline will reacquire it when iOS allows location updates again.'; if (document.visibilityState === 'visible' && age > 45000 && typeof recoverGpsTracking === 'function' && Date.now() - lastGpsRecoveryAt > 30000) recoverGpsTracking('stale'); } }, 5000);
}
function stopStaleTimer() { if (gpsStaleTimer) clearInterval(gpsStaleTimer); gpsStaleTimer = null; }
function updateOffRoute(distanceKm, accuracyM) {
  const accKm = Math.max(0, accuracyM || 0) / 1000;
  const reliable = (accuracyM || 0) <= 150;
  const enter = Math.min(.75, Math.max(.22, accKm * 3.0));
  const exit = Math.min(.45, Math.max(.12, accKm * 1.8));
  let entered = false, exited = false;
  if (!reliable) return { off: offRouteState, enter, exit, entered, exited, reliable: false };
  if (!offRouteState) {
    if (distanceKm > enter) { offRouteBadFixes += 1; if (offRouteBadFixes === 1) offRouteSince = Date.now(); } else { offRouteBadFixes = 0; offRouteSince = 0; }
    offRouteGoodFixes = 0;
    if (offRouteBadFixes >= 3) { offRouteState = true; offRouteSince = Date.now(); entered = true; offRouteGoodFixes = 0; }
  } else {
    offRouteBadFixes = distanceKm > enter ? Math.min(99, offRouteBadFixes + 1) : offRouteBadFixes;
    offRouteGoodFixes = distanceKm < exit ? offRouteGoodFixes + 1 : 0;
    if (offRouteGoodFixes >= 2) { offRouteState = false; offRouteSince = 0; offRouteBadFixes = 0; offRouteGoodFixes = 0; exited = true; }
  }
  return { off: offRouteState, enter, exit, entered, exited, reliable: true, badFixes: offRouteBadFixes, goodFixes: offRouteGoodFixes };
}
