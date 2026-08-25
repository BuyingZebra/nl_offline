let lastResumeRecoveryAt = 0;

function trackJourneyDistance(pos, now) {
  if (!gpsRunning || !pos || (pos.accuracy || 0) > 120) return;
  const point = [pos.lon, pos.lat];
  if (journeyLastGpsPoint && journeyLastGpsAt) {
    const dt = Math.max(.2, (now - journeyLastGpsAt) / 1000), d = kmBetween(journeyLastGpsPoint, point);
    const maxKm = dt / 3600 * 180 + .12;
    if (d >= 0 && d <= maxKm) journeyCompletedKm += d;
  }
  journeyLastGpsPoint = point; journeyLastGpsAt = now;
}
function canAutoReroute() {
  return gpsRunning && !!currentDestination && routeProgressReliable && !currentTripHasFerry && !rerouteInFlight;
}
function maybeAutoReroute(s, p, state) {
  if (!state.off || !canAutoReroute() || (p.coords.accuracy || 0) > 150) return false;
  const now = Date.now(); if (now - lastRerouteAt < 25000) return false;
  const sustained = offRouteSince && now - offRouteSince >= 8000;
  const severe = s.distanceKm >= .80 && offRouteBadFixes >= 3;
  if (!sustained && !severe) return false;
  lastRerouteAt = now;
  const reason = sustained ? 'sustained_off_route' : 'far_off_route';
  logRoadEvent('reroute_requested', { reason, snapKm: +s.distanceKm.toFixed(3), accuracyM: Math.round(p.coords.accuracy || 0), lat: +p.coords.latitude.toFixed(6), lon: +p.coords.longitude.toFixed(6) }, true);
  rerouteFromGpsPosition(p.coords.longitude, p.coords.latitude, reason).then(ok => {
    if (!ok) lastRerouteAt = Date.now() - 15000;
  });
  return true;
}

function applyGpsFix(p, options = {}) {
  const now = p.timestamp || Date.now(); gpsLastFixAt = Date.now();
  const previousPosition = gpsPosition;
  let heading = p.coords.heading != null && isFinite(p.coords.heading) && p.coords.heading >= 0 ? (p.coords.heading + 360) % 360 : null;
  if (heading == null && previousPosition) {
    const movedKm = kmBetween([previousPosition.lon, previousPosition.lat], [p.coords.longitude, p.coords.latitude]);
    if (movedKm >= .012 && typeof bearingDegrees === 'function') heading = bearingDegrees([previousPosition.lon, previousPosition.lat], [p.coords.longitude, p.coords.latitude]);
  }
  if (heading != null) latestHeadingDeg = heading;
  gpsPosition = { lon: p.coords.longitude, lat: p.coords.latitude, accuracy: p.coords.accuracy || 0, heading: latestHeadingDeg };
  latestAccuracyM = gpsPosition.accuracy;
  if (p.coords.speed != null && isFinite(p.coords.speed) && p.coords.speed >= 0) latestSpeedKmh = p.coords.speed * 3.6;
  trackJourneyDistance(gpsPosition, now);
  const matchHeading = latestSpeedKmh != null && latestSpeedKmh >= 7 ? latestHeadingDeg : null;
  const s = snapGpsFix(gpsPosition.lon, gpsPosition.lat, now, matchHeading), acc = Math.round(gpsPosition.accuracy || 0);
  $('gpsPill').textContent = 'GPS live'; $('gpsPill').className = 'gpspill live';
  if (!s) { $('gpsDetail').textContent = `GPS fix ±${acc}m · waiting for route match`; renderOverlay(); return; }
  const state = updateOffRoute(s.distanceKm, gpsPosition.accuracy), reliableFix = (gpsPosition.accuracy || 0) <= 150;
  if (state.entered) logRoadEvent('off_route_entered', { snapKm: +s.distanceKm.toFixed(3), accuracyM: acc, progress: +progress.toFixed(5) }, true);
  if (state.exited) logRoadEvent('off_route_cleared', { snapKm: +s.distanceKm.toFixed(3), accuracyM: acc, progress: +progress.toFixed(5) }, true);

  if (!options.skipAutoReroute && maybeAutoReroute(s, p, state)) {
    $('routeStatus').textContent = 'Recalculating'; $('gpsDetail').textContent = `OFF ROUTE · ${s.distanceKm.toFixed(2)} km from path · recalculating locally…`; $('gpsDetail').classList.add('offroute'); renderOverlay(); return;
  }

  if (routeProgressReliable && reliableFix && !state.off) {
    let next = Math.max(progress, Math.min(1, s.fraction));
    if (lastGpsAppliedAt && next > progress && routePolylineKm > 0) {
      const dt = Math.max(1, (now - lastGpsAppliedAt) / 1000), maxGeomKm = dt / 3600 * 175 + 2.0, maxJump = maxGeomKm / routePolylineKm;
      if (next - progress > maxJump) next = progress;
    }
    trackPace(next, now, p.coords.speed); progress = next; lastGpsAppliedAt = now; update();
  } else renderOverlay();
  $('routeStatus').textContent = state.off ? 'Off route' : reliableFix ? (currentTripHasFerry ? 'Mixed' : liveRerouteCount ? 'Rerouted' : 'On route') : 'GPS uncertain';
  $('gpsDetail').textContent = state.off ? `OFF ROUTE · ${s.distanceKm.toFixed(2)} km from path · GPS ±${acc}m${offRouteBadFixes < 3 ? ' · confirming…' : ''}` : reliableFix ? `On route · GPS ±${acc}m${etaModel.speedKmh ? ` · pace ${Math.round(etaModel.speedKmh)} km/h` : ''}` : `GPS ±${acc}m · waiting for a more accurate fix`;
  $('gpsDetail').classList.toggle('offroute', state.off); updateDrivingHud();
  if (Date.now() - lastLoggedFixAt >= 4000) {
    lastLoggedFixAt = Date.now(); logRoadEvent('gps_fix', { lat: +gpsPosition.lat.toFixed(6), lon: +gpsPosition.lon.toFixed(6), accuracyM: acc, speedKmh: latestSpeedKmh == null ? null : +latestSpeedKmh.toFixed(1), headingDeg: latestHeadingDeg == null ? null : +latestHeadingDeg.toFixed(1), headingMatchDeg: s.headingDifference == null ? null : +s.headingDifference.toFixed(1), snapKm: +s.distanceKm.toFixed(3), progress: +progress.toFixed(5), offRoute: state.off, offRouteBadFixes, etaMin: +remainingMinutes().toFixed(1), reroutes: liveRerouteCount, journeyKm: +journeyCompletedKm.toFixed(2) });
  }
}

function beginGpsWatch(restart = false) {
  if (!navigator.geolocation || !gpsRunning) return;
  if (restart && gpsWatch != null) { try { navigator.geolocation.clearWatch(gpsWatch); } catch (_) {} gpsWatch = null; }
  if (gpsWatch != null) return;
  gpsWatch = navigator.geolocation.watchPosition(p => applyGpsFix(p), e => {
    if (e?.code === 1) { setStatus(geoErrorText(e), true); stopGPS(false); refreshGpsPermission(); return; }
    $('gpsPill').textContent = 'GPS waiting'; $('gpsPill').className = 'gpspill warn'; $('gpsDetail').textContent = `${geoErrorText(e)} The tracker will keep trying while the app is open.`;
  }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
}

async function recoverGpsTracking(source = 'resume') {
  if (!gpsRunning || gpsRecoveryInFlight || Date.now() - lastResumeRecoveryAt < 2500) return;
  gpsRecoveryInFlight = true; lastResumeRecoveryAt = Date.now(); lastGpsRecoveryAt = Date.now();
  const gapMs = gpsLastFixAt ? Date.now() - gpsLastFixAt : 0;
  try {
    requestWake(); if (gapMs > 15000) beginGpsWatch(true);
    $('gpsDetail').textContent = 'Reacquiring GPS after app resume…';
    const p = await obtainFix(); if (!gpsRunning) return;
    const global = snapGlobal(p.coords.longitude, p.coords.latitude), acc = p.coords.accuracy || 0;
    logRoadEvent('gps_resume_fix', { source, gapSec: +(gapMs / 1000).toFixed(1), accuracyM: Math.round(acc), snapKm: global ? +global.distanceKm.toFixed(3) : null }, true);
    if (gapMs > 30000) lastGpsAppliedAt = 0;
    if (gapMs > 30000 && acc <= 150 && global && global.distanceKm > Math.max(.45, acc / 1000 * 4) && canAutoReroute() && Date.now() - lastRerouteAt > 15000) {
      lastRerouteAt = Date.now();
      const ok = await rerouteFromGpsPosition(p.coords.longitude, p.coords.latitude, 'resume_recovery');
      if (ok) { gpsPosition = { lon: p.coords.longitude, lat: p.coords.latitude, accuracy: acc }; renderOverlay(); return; }
    }
    applyGpsFix(p);
  } catch (e) { logRoadEvent('gps_resume_failed', { source, gapSec: +(gapMs / 1000).toFixed(1), error: geoErrorText(e) }, true); }
  finally { gpsRecoveryInFlight = false; }
}
window.recoverGpsTracking = recoverGpsTracking;

async function captureLocation() {
  await refreshGpsPermission(); const blocked = gpsBlockReason(); if (blocked) { setStatus(blocked, true); updateGpsEnvironment(); return; }
  $('useLocation').disabled = true; $('useLocation').textContent = 'Locating…'; setStatus('Requesting a GPS fix…');
  try {
    const p = await obtainFix(); originGPS = { lon: p.coords.longitude, lat: p.coords.latitude, accuracy: p.coords.accuracy || 0, capturedAt: Date.now() }; originMode = 'gps'; currentOriginIndex = -1; currentOriginAddress = null; $('from').value = 'Current location';
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
    if (originMode === 'gps' && currentDestination) {
      originGPS = { lon: first.coords.longitude, lat: first.coords.latitude, accuracy: first.coords.accuracy || 0, capturedAt: Date.now() }; $('from').value = 'Current location'; loadedOriginLabel = 'Current location';
      const nc = nearestCommunity(originGPS.lon, originGPS.lat); $('locationHint').textContent = nc.index >= 0 ? `near ${names[nc.index]} · GPS ±${Math.round(originGPS.accuracy)}m` : `GPS ±${Math.round(originGPS.accuracy)}m`;
      const ok = await buildGpsEndpoint(currentDestination); if (!ok || !routeProgressReliable) throw new Error('route refresh failed');
    }
  } catch (e) { setStatus(geoErrorText(e) || 'Could not refresh GPS start position.', true); $('gpsStart').disabled = !routeProgressReliable; return; }
  gpsRunning = true; setFollow(true, true); lastGpsAppliedAt = 0; offRouteState = false; offRouteSince = 0; offRouteBadFixes = 0; offRouteGoodFixes = 0;
  journeyCompletedKm = 0; journeyLastGpsPoint = null; journeyLastGpsAt = 0;
  $('gpsStart').disabled = true; $('gpsStop').disabled = false; $('slider').disabled = true; $('gpsDetail').textContent = 'Live GPS active · automatic route recovery armed.';
  $('gpsPill').textContent = 'GPS starting'; $('gpsPill').className = 'gpspill'; resetEta(); startEtaTracking(Date.now()); latestSpeedKmh = null; latestAccuracyM = null; gpsLastFixAt = 0; startStaleTimer(); requestWake(); logRoadEvent('drive_started', currentTripSnapshot(), true);
  if (first && gpsRunning) applyGpsFix(first); if (!gpsRunning) return;
  beginGpsWatch(false); setStatus('Live trip running · route, distance, ETA and rerouting operate locally.');
}
function stopGPS(clear = true) {
  const wasRunning = gpsRunning || gpsWatch != null; gpsRunning = false; lastGpsAppliedAt = 0; if (gpsWatch != null && navigator.geolocation) navigator.geolocation.clearWatch(gpsWatch); gpsWatch = null;
  stopStaleTimer(); releaseWake(); if (wasRunning) logRoadEvent('drive_stopped', { ...currentTripSnapshot(), journeyKm: +journeyCompletedKm.toFixed(2) }, true); latestSpeedKmh = null; latestAccuracyM = null; latestHeadingDeg = null; updateDrivingHud(); setFollow(false); $('gpsStart').disabled = !routeProgressReliable || !currentTripLoaded || routeCoords.length < 2; $('gpsStop').disabled = true; $('slider').disabled = false;
  if (clear) { gpsPosition = null; offRouteState = false; offRouteSince = 0; offRouteBadFixes = 0; offRouteGoodFixes = 0; $('gpsDetail').textContent = 'Slider simulates driving. Tap Follow to preview the moving map; live GPS requires HTTPS.'; $('gpsDetail').classList.remove('offroute'); renderOverlay(); }
  updateGpsEnvironment();
}

$('prepareRoad').addEventListener('click', prepareForRoad);
$('applyUpdate')?.addEventListener('click', reloadForAppUpdate);
$('exportLog')?.addEventListener('click', exportRoadLog);
$('clearLog')?.addEventListener('click', clearRoadLog);
$('go').addEventListener('click', makeTrip);
$('useLocation').addEventListener('click', captureLocation);
let locationSuggestionTimer = null;
function refreshLocationSuggestions(input) {
  clearTimeout(locationSuggestionTimer);
  locationSuggestionTimer = setTimeout(() => {
    const value = input.value.trim(), suggestions = [...townSuggestions(value, 9)];
    if (typeof addressSuggestions === 'function') suggestions.push(...addressSuggestions(value, 9));
    updateLocationOptions([...new Set(suggestions)].slice(0, 14));
  }, 70);
}
for (const input of [$('from'), $('to')]) {
  input.addEventListener('focus', () => refreshLocationSuggestions(input));
  input.addEventListener('input', () => refreshLocationSuggestions(input));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); makeTrip(); } });
}
$('from').addEventListener('input', () => { if (townNorm($('from').value) !== 'current location') { originMode = 'town'; originGPS = null; currentOriginAddress = null; $('locationHint').textContent = ''; } });
$('swap').addEventListener('click', () => { if (originMode === 'gps') { originMode = 'town'; originGPS = null; $('locationHint').textContent = ''; } const x = $('from').value; $('from').value = $('to').value; $('to').value = x; makeTrip(); });
$('slider').addEventListener('input', () => { gpsPosition = null; progress = +$('slider').value / 1000; latestSpeedKmh = null; latestAccuracyM = null; resetEta(); update(); if (followGPS) { $('gpsDetail').textContent = 'Simulation follow active · drag the slider to preview the moving map.'; $('routeStatus').textContent = 'Simulating'; } });
$('gpsStart').addEventListener('click', startGPS);
$('gpsStop').addEventListener('click', () => stopGPS(true));
$('follow').addEventListener('click', () => {
  if (followGPS) {
    setFollow(false, false, { preserveView: true, keepImmersive: true });
    $('gpsDetail').textContent = gpsRunning ? 'Recentring paused · live GPS continues.' : 'Free map view · tap Recenter to resume simulation follow.';
  } else {
    setFollow(true, true);
    if (!gpsRunning) $('gpsDetail').textContent = 'Simulation follow active · drag the slider to preview the moving map.';
  }
});
$('fitRoute').addEventListener('click', () => {
  setFollow(false, false, { preserveView: true, keepImmersive: gpsRunning }); fit(routeCoords);
  updateRouteQuality(routeHasSchematicSegments() || currentTripHasFerry);
  $('gpsDetail').textContent = gpsRunning ? 'Full route shown · live GPS continues · tap Recenter when ready.' : routeProgressReliable ? 'Full route shown. Tap Follow to preview the moving map.' : 'Level 2 is schematic for this ferry trip.';
});
$('zoomIn').addEventListener('click', () => zoom(.65));
$('zoomOut').addEventListener('click', () => zoom(1.55));

const mw = $('mapwrap');
function localPointer(e) { const r = mw.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function beginPinchGesture() {
  if (mapPointers.size < 2) { pinchGesture = null; return; }
  const entries = [...mapPointers.entries()].slice(0, 2), a = entries[0][1], b = entries[1][1];
  pinchGesture = {
    ids: [entries[0][0], entries[1][0]], view: { ...view },
    mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
  };
  drag = null;
}
mw.addEventListener('pointerdown', e => {
  if (e.target.closest?.('button')) return;
  e.preventDefault(); pauseMapFollowForGesture();
  const p = localPointer(e); mapPointers.set(e.pointerId, p);
  try { mw.setPointerCapture(e.pointerId); } catch (_) {}
  if (mapPointers.size >= 2) beginPinchGesture();
  else drag = { pointerId: e.pointerId, x: p.x, y: p.y, v: { ...view } };
});
mw.addEventListener('pointermove', e => {
  if (!mapPointers.has(e.pointerId)) return;
  e.preventDefault(); const p = localPointer(e); mapPointers.set(e.pointerId, p);
  if (mapPointers.size >= 2) {
    if (!pinchGesture || !pinchGesture.ids.every(id => mapPointers.has(id))) beginPinchGesture();
    if (!pinchGesture) return;
    const a = mapPointers.get(pinchGesture.ids[0]), b = mapPointers.get(pinchGesture.ids[1]);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    view = viewForGesture(pinchGesture.view, pinchGesture.mid, mid, pinchGesture.distance / distance); queueMapRender(); return;
  }
  if (!drag || drag.pointerId !== e.pointerId) return;
  const dx = p.x - drag.x, dy = p.y - drag.y, w = mw.clientWidth, h = mw.clientHeight;
  const lon = (drag.v.maxx - drag.v.minx) * dx / Math.max(w, 1), lat = (drag.v.maxy - drag.v.miny) * dy / Math.max(h, 1);
  view = clampViewToNL({ minx: drag.v.minx - lon, maxx: drag.v.maxx - lon, miny: drag.v.miny + lat, maxy: drag.v.maxy + lat }); queueMapRender();
});
function endMapPointer(e) {
  mapPointers.delete(e.pointerId); pinchGesture = null;
  if (mapPointers.size === 1) {
    const [id, p] = mapPointers.entries().next().value; drag = { pointerId: id, x: p.x, y: p.y, v: { ...view } };
  } else drag = null;
}
mw.addEventListener('pointerup', endMapPointer); mw.addEventListener('pointercancel', endMapPointer);
mw.addEventListener('wheel', e => {
  if (e.target.closest?.('button')) return;
  e.preventDefault(); pauseMapFollowForGesture(); const p = localPointer(e); zoomAt(e.deltaY < 0 ? .78 : 1.28, p.x, p.y);
}, { passive: false });
mw.addEventListener('dblclick', e => {
  if (e.target.closest?.('button')) return;
  e.preventDefault(); pauseMapFollowForGesture(); const p = localPointer(e); zoomAt(.55, p.x, p.y);
});
mw.addEventListener('keydown', e => {
  const spanX = view.maxx - view.minx, spanY = view.maxy - view.miny, stepX = spanX * .12, stepY = spanY * .12;
  if (e.key === '+' || e.key === '=') { e.preventDefault(); pauseMapFollowForGesture(); zoomAt(.72); return; }
  if (e.key === '-' || e.key === '_') { e.preventDefault(); pauseMapFollowForGesture(); zoomAt(1.38); return; }
  let dx = 0, dy = 0;
  if (e.key === 'ArrowLeft') dx = -stepX; else if (e.key === 'ArrowRight') dx = stepX; else if (e.key === 'ArrowUp') dy = stepY; else if (e.key === 'ArrowDown') dy = -stepY; else return;
  e.preventDefault(); pauseMapFollowForGesture(); view = clampViewToNL({ minx: view.minx + dx, maxx: view.maxx + dx, miny: view.miny + dy, maxy: view.maxy + dy }); queueMapRender();
});

if ('ResizeObserver' in window) new ResizeObserver(() => size()).observe(mw);
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; updateRoadReadiness(); });
window.addEventListener('appinstalled', () => { deferredInstall = null; updateRoadReadiness(); });
window.addEventListener('resize', size);
window.addEventListener('online', () => { updateGpsEnvironment(); verifyOfflinePackage(false); });
window.addEventListener('offline', updateGpsEnvironment);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const hiddenSec = lifecycleHiddenAt ? (Date.now() - lifecycleHiddenAt) / 1000 : 0; logRoadEvent('visibility_visible', { hiddenSec: +hiddenSec.toFixed(1), gpsRunning }, true); lifecycleHiddenAt = 0;
    if (gpsRunning) recoverGpsTracking('visibilitychange'); updateGpsEnvironment();
  } else {
    lifecycleHiddenAt = Date.now(); logRoadEvent('visibility_hidden', { gpsRunning }, true); saveRoadLog(); if (gpsRunning) $('gpsDetail').textContent = 'App is in the background. iOS may pause live GPS; NL Offline will reacquire and recover the route when visible again.';
  }
});
window.addEventListener('pagehide', () => { logRoadEvent('pagehide', { gpsRunning }, true); saveRoadLog(); });
window.addEventListener('pageshow', e => { logRoadEvent('pageshow', { gpsRunning, persisted: !!e.persisted }, true); updateGpsEnvironment(); if (gpsRunning) recoverGpsTracking('pageshow'); });

async function boot() {
  restoreTripPrefs(); loadRoadLog(); size(); await refreshGpsPermission(); await refreshStoragePersistence(); updateGpsEnvironment();
  if ('serviceWorker' in navigator && window.isSecureContext) {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js?v=0.21', { scope: './' }); armAppUpdateFlow(reg); await navigator.serviceWorker.ready; reg.update().catch(() => {}); await verifyOfflinePackage(false);
    } catch (e) { offlinePackageReady = false; updateRoadReadiness({ error: e.message }); }
  } else updateRoadReadiness();
  const addr = typeof addressCoverageText === 'function' ? addressCoverageText() : 'civic-address data unavailable';
  setStatus(`Ready · ${DATA.level1Count} official places · ${DATA.routeReady} road-mapped + ${Object.keys(DATA.specialRoutes || {}).length} remote/special · ${DATA.ferryPairCount || 0} ferry-aware pairs · ${addr}.`);
  logRoadEvent('app_ready', { online: navigator.onLine, standalone: standaloneMode(), calibratedAnchors: Object.keys(ROUTING_ANCHOR_OVERRIDES).length + (window.NL_V014_ANCHOR_COUNT || 0), routeModel: window.NL_ROUTING_PROFILE?.version || 'fallback', exactAddresses: window.NL_ADDRESS_POINTS?.recordCount || 0, addressRanges: window.NL_ADDRESS_META?.recordCount || 0 });
  makeTrip();
}
boot();
