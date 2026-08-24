function applyGpsFix(p) {
  const now = p.timestamp || Date.now(); gpsLastFixAt = Date.now();
  gpsPosition = { lon: p.coords.longitude, lat: p.coords.latitude, accuracy: p.coords.accuracy || 0 };
  latestAccuracyM = gpsPosition.accuracy;
  if (p.coords.speed != null && isFinite(p.coords.speed) && p.coords.speed >= 0) latestSpeedKmh = p.coords.speed * 3.6;
  const s = snapGpsFix(gpsPosition.lon, gpsPosition.lat, now), acc = Math.round(gpsPosition.accuracy || 0);
  $('gpsPill').textContent = 'GPS live'; $('gpsPill').className = 'gpspill live';
  if (!s) { $('gpsDetail').textContent = `GPS fix ±${acc}m · waiting for route match`; renderOverlay(); return; }
  const state = updateOffRoute(s.distanceKm, gpsPosition.accuracy), reliableFix = (gpsPosition.accuracy || 0) <= 150;
  if (routeProgressReliable && reliableFix && !state.off) {
    let next = Math.max(progress, Math.min(1, s.fraction));
    if (lastGpsAppliedAt && next > progress && routePolylineKm > 0) {
      const dt = Math.max(1, (now - lastGpsAppliedAt) / 1000), maxGeomKm = dt / 3600 * 175 + 2.0, maxJump = maxGeomKm / routePolylineKm;
      if (next - progress > maxJump) next = progress;
    }
    trackPace(next, now, p.coords.speed); progress = next; lastGpsAppliedAt = now; update();
  } else renderOverlay();
  $('routeStatus').textContent = state.off ? 'Off route' : reliableFix ? (currentTripHasFerry ? 'Mixed' : 'On route') : 'GPS uncertain';
  $('gpsDetail').textContent = state.off ? `OFF ROUTE · ${s.distanceKm.toFixed(2)} km from path · GPS ±${acc}m` : reliableFix ? `On route · GPS ±${acc}m${etaModel.speedKmh ? ` · pace ${Math.round(etaModel.speedKmh)} km/h` : ''}` : `GPS ±${acc}m · waiting for a more accurate fix`;
  $('gpsDetail').classList.toggle('offroute', state.off); updateDrivingHud();
  if (Date.now() - lastLoggedFixAt >= 4000) {
    lastLoggedFixAt = Date.now(); logRoadEvent('gps_fix', { lat: +gpsPosition.lat.toFixed(6), lon: +gpsPosition.lon.toFixed(6), accuracyM: acc, speedKmh: latestSpeedKmh == null ? null : +latestSpeedKmh.toFixed(1), snapKm: +s.distanceKm.toFixed(3), progress: +progress.toFixed(5), offRoute: state.off, etaMin: +remainingMinutes().toFixed(1) });
  }
}
async function captureLocation() {
  await refreshGpsPermission(); const blocked = gpsBlockReason(); if (blocked) { setStatus(blocked, true); updateGpsEnvironment(); return; }
  $('useLocation').disabled = true; $('useLocation').textContent = 'Locating…'; setStatus('Requesting a GPS fix…');
  try {
    const p = await obtainFix(); originGPS = { lon: p.coords.longitude, lat: p.coords.latitude, accuracy: p.coords.accuracy || 0, capturedAt: Date.now() }; originMode = 'gps'; currentOriginIndex = -1; $('from').value = 'Current location';
    const nc = nearestCommunity(originGPS.lon, originGPS.lat); $('locationHint').textContent = nc.index >= 0 ? `near ${names[nc.index]} · GPS ±${Math.round(originGPS.accuracy)}m` : `GPS ±${Math.round(originGPS.accuracy)}m`;
    $('useLocation').textContent = '◎ Refresh location'; makeTrip();
  } catch (e) { setStatus(geoErrorText(e), true); $('useLocation').textContent = '◎ Use current location'; }
  finally { $('useLocation').disabled = false; refreshGpsPermission(); }
}
async function startGPS() {
  if (!routeCoords.length || !routeProgressReliable) { setStatus(routeProgressReliable ? 'Load a trip before starting GPS.' : 'This Level 2 ferry map is schematic, so live route progress is disabled for this trip.', true); return; }
  await refreshGpsPermission(); const blocked = gpsBlockReason(); if (blocked) { setStatus(blocked, true); updateGpsEnvironment(); return; } if (gpsWatch != null) return;
  $('gpsStart').disabled = true; $('gpsDetail').textContent = 'Getting a fresh start position…'; let first = null;
  try {
    first = await obtainFix();
    if (originMode === 'gps' && currentDestIndex >= 0) {
      originGPS = { lon: first.coords.longitude, lat: first.coords.latitude, accuracy: first.coords.accuracy || 0, capturedAt: Date.now() }; $('from').value = 'Current location';
      const nc = nearestCommunity(originGPS.lon, originGPS.lat); $('locationHint').textContent = nc.index >= 0 ? `near ${names[nc.index]} · GPS ±${Math.round(originGPS.accuracy)}m` : `GPS ±${Math.round(originGPS.accuracy)}m`;
      const ok = await buildGps(names[currentDestIndex], currentDestIndex); if (!ok || !routeProgressReliable) throw new Error('route refresh failed');
    }
  } catch (e) { setStatus(geoErrorText(e) || 'Could not refresh GPS start position.', true); $('gpsStart').disabled = !routeProgressReliable; return; }
  gpsRunning = true; setFollow(true, true); lastGpsAppliedAt = 0; offRouteState = false;
  $('gpsStart').disabled = true; $('gpsStop').disabled = false; $('slider').disabled = true; $('gpsDetail').textContent = 'Live GPS active · keep NL Offline open while driving.';
  $('gpsPill').textContent = 'GPS starting'; $('gpsPill').className = 'gpspill'; resetEta(); startEtaTracking(Date.now()); latestSpeedKmh = null; latestAccuracyM = null; gpsLastFixAt = 0; startStaleTimer(); requestWake(); logRoadEvent('drive_started', currentTripSnapshot(), true);
  if (first && gpsRunning) applyGpsFix(first); if (!gpsRunning) return;
  gpsWatch = navigator.geolocation.watchPosition(p => applyGpsFix(p), e => {
    if (e?.code === 1) { setStatus(geoErrorText(e), true); stopGPS(false); refreshGpsPermission(); return; }
    $('gpsPill').textContent = 'GPS waiting'; $('gpsPill').className = 'gpspill warn'; $('gpsDetail').textContent = `${geoErrorText(e)} The tracker will keep trying while the app is open.`;
  }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
  setStatus('Live trip running · map, route, distance and ETA are operating locally.');
}
function stopGPS(clear = true) {
  const wasRunning = gpsRunning || gpsWatch != null; gpsRunning = false; lastGpsAppliedAt = 0; if (gpsWatch != null && navigator.geolocation) navigator.geolocation.clearWatch(gpsWatch); gpsWatch = null;
  stopStaleTimer(); releaseWake(); if (wasRunning) logRoadEvent('drive_stopped', currentTripSnapshot(), true); latestSpeedKmh = null; latestAccuracyM = null; updateDrivingHud(); setFollow(false); $('gpsStart').disabled = !routeProgressReliable || !currentTripLoaded || routeCoords.length < 2; $('gpsStop').disabled = true; $('slider').disabled = false;
  if (clear) { gpsPosition = null; offRouteState = false; $('gpsDetail').textContent = 'Slider simulates driving. Tap Follow to preview the moving map; live GPS requires HTTPS.'; $('gpsDetail').classList.remove('offroute'); renderOverlay(); }
  updateGpsEnvironment();
}

$('prepareRoad').addEventListener('click', prepareForRoad);
$('exportLog')?.addEventListener('click', exportRoadLog);
$('clearLog')?.addEventListener('click', clearRoadLog);
$('go').addEventListener('click', makeTrip);
$('useLocation').addEventListener('click', captureLocation);
$('from').addEventListener('input', () => { if ($('from').value.trim().toLowerCase() !== 'current location') { originMode = 'town'; originGPS = null; $('locationHint').textContent = ''; } });
$('swap').addEventListener('click', () => { if (originMode === 'gps') { originMode = 'town'; originGPS = null; $('locationHint').textContent = ''; } const x = $('from').value; $('from').value = $('to').value; $('to').value = x; makeTrip(); });
$('slider').addEventListener('input', () => { gpsPosition = null; progress = +$('slider').value / 1000; latestSpeedKmh = null; latestAccuracyM = null; resetEta(); update(); if (followGPS) { $('gpsDetail').textContent = 'Simulation follow active · drag the slider to preview the moving map.'; $('routeStatus').textContent = 'Simulating'; } });
$('gpsStart').addEventListener('click', startGPS);
$('gpsStop').addEventListener('click', () => stopGPS(true));
$('follow').addEventListener('click', () => { setFollow(!followGPS, !followGPS); if (followGPS && !gpsRunning) $('gpsDetail').textContent = 'Simulation follow active · drag the slider to preview the moving map.'; });
$('fitRoute').addEventListener('click', () => { setFollow(false); fit(routeCoords); updateRouteQuality(routeSegments.some(s => s.type !== 'road')); $('gpsDetail').textContent = gpsRunning ? 'Live GPS active.' : routeProgressReliable ? 'Slider simulates driving. Tap Follow to preview the moving map.' : 'Level 2 is schematic for this ferry trip.'; });
$('zoomIn').addEventListener('click', () => zoom(.65));
$('zoomOut').addEventListener('click', () => zoom(1.55));

const mw = $('mapwrap');
mw.addEventListener('pointerdown', e => {
  if (followGPS) { setFollow(false); $('gpsDetail').textContent = 'Follow paused because you moved the map.'; }
  drag = { x: e.clientX, y: e.clientY, v: { ...view } }; mw.setPointerCapture(e.pointerId);
});
mw.addEventListener('pointermove', e => {
  if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y, w = mw.clientWidth, h = mw.clientHeight;
  const lon = (drag.v.maxx - drag.v.minx) * dx / Math.max(w, 1), lat = (drag.v.maxy - drag.v.miny) * dy / Math.max(h, 1);
  view = { minx: drag.v.minx - lon, maxx: drag.v.maxx - lon, miny: drag.v.miny + lat, maxy: drag.v.maxy + lat };
  if (!rafPan) rafPan = requestAnimationFrame(() => { rafPan = 0; renderBase(); renderOverlay(); });
});
mw.addEventListener('pointerup', () => drag = null); mw.addEventListener('pointercancel', () => drag = null);

if ('ResizeObserver' in window) new ResizeObserver(() => size()).observe(mw);
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; updateRoadReadiness(); });
window.addEventListener('appinstalled', () => { deferredInstall = null; updateRoadReadiness(); });
window.addEventListener('resize', size);
window.addEventListener('online', () => { updateGpsEnvironment(); verifyOfflinePackage(false); });
window.addEventListener('offline', updateGpsEnvironment);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { if (gpsRunning) { requestWake(); obtainFix().then(p => { if (gpsRunning) applyGpsFix(p); }).catch(() => {}); } updateGpsEnvironment(); }
  else { saveRoadLog(); if (gpsRunning) $('gpsDetail').textContent = 'App is in the background. Live GPS may pause until NL Offline is visible again.'; }
});
window.addEventListener('pageshow', () => { updateGpsEnvironment(); if (gpsRunning) obtainFix().then(p => { if (gpsRunning) applyGpsFix(p); }).catch(() => {}); });

async function boot() {
  restoreTripPrefs(); loadRoadLog(); size(); await refreshGpsPermission(); updateGpsEnvironment();
  if ('serviceWorker' in navigator && window.isSecureContext) {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js?v=0.12', { scope: './' }); await navigator.serviceWorker.ready; reg.update().catch(() => {}); await verifyOfflinePackage(false);
    } catch (e) { offlinePackageReady = false; updateRoadReadiness({ error: e.message }); }
  } else updateRoadReadiness();
  setStatus(`Ready · ${DATA.level1Count} official places · ${DATA.level2Count || DATA.routeReady} mapped locally · ${DATA.ferryPairCount || 0} ferry-aware pairs · ${Object.keys(ROUTING_ANCHOR_OVERRIDES).length} calibrated anchors.`); logRoadEvent('app_ready', { online: navigator.onLine, standalone: standaloneMode(), calibratedAnchors: Object.keys(ROUTING_ANCHOR_OVERRIDES).length });
  makeTrip();
}
boot();
