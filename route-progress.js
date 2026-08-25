function geomProgressByKind(f) {
  if (routePolylineKm <= 0 || routeCoords.length < 2) return { road: f >= 1 ? 1 : 0, ferry: f >= 1 ? 1 : 0 };
  const target = routePolylineKm * Math.max(0, Math.min(1, f)); let roadDone = 0, ferryDone = 0;
  for (let i = 1; i < routeCoords.length; i++) {
    const a = routeCum[i - 1], b = routeCum[i]; if (target <= a) break;
    const d = Math.min(b, target) - a, kind = routeCoordKinds[i - 1]; if (kind === 'ferry') ferryDone += d; else roadDone += d;
    if (target <= b) break;
  }
  return {
    road: routeRoadGeomKm > 0 ? Math.min(1, roadDone / routeRoadGeomKm) : 1,
    ferry: routeFerryGeomKm > 0 ? Math.min(1, ferryDone / routeFerryGeomKm) : (routeFerryDistance || routeFerryTime ? 0 : 1),
  };
}
function officialDistanceAtProgress(f) {
  if (!routeProgressReliable) return routeDist * Math.max(0, Math.min(1, f));
  const g = geomProgressByKind(f); return routeRoadDistance * g.road + routeFerryDistance * g.ferry;
}
function officialMinutesAtProgress(f) {
  if (!routeProgressReliable) return routeTime * Math.max(0, Math.min(1, f));
  const g = geomProgressByKind(f); return routeRoadTime * g.road + routeFerryTime * g.ferry;
}
function fmtMin(m) { m = Math.round(Math.max(0, m)); const h = Math.floor(m / 60), mm = m % 60; return h ? `${h}h ${String(mm).padStart(2, '0')}m` : `${mm} min`; }
function resetEta() { etaModel = { movingKm: 0, speedKmh: null, lastOfficialDistance: null, lastTs: null, startedAt: null, startOfficialMinutes: 0, scheduleRatio: null, samples: 0 }; }
function startEtaTracking(ts = Date.now()) {
  etaModel.startedAt = ts; etaModel.startOfficialMinutes = officialMinutesAtProgress(progress); etaModel.lastOfficialDistance = officialDistanceAtProgress(progress); etaModel.lastTs = ts;
}
function trackPace(newProgress, ts, gpsSpeedMps = null) {
  const od = officialDistanceAtProgress(newProgress), om = officialMinutesAtProgress(newProgress);
  if (gpsSpeedMps != null && isFinite(gpsSpeedMps) && gpsSpeedMps >= 1.5 && gpsSpeedMps <= 55) {
    const gv = gpsSpeedMps * 3.6; etaModel.speedKmh = etaModel.speedKmh == null ? gv : etaModel.speedKmh * .80 + gv * .20;
  }
  if (etaModel.lastOfficialDistance != null && etaModel.lastTs != null) {
    const dk = od - etaModel.lastOfficialDistance, hours = (ts - etaModel.lastTs) / 3600000;
    if (dk > .02 && hours > 0) { const v = dk / hours; if (v >= 4 && v <= 150) { etaModel.movingKm += dk; etaModel.speedKmh = etaModel.speedKmh == null ? v : etaModel.speedKmh * .84 + v * .16; } }
  }
  if (etaModel.startedAt != null) {
    const actualMin = Math.max(0, (ts - etaModel.startedAt) / 60000), expectedMin = Math.max(0, om - etaModel.startOfficialMinutes);
    if (actualMin >= 2 && expectedMin >= 1.5) {
      const raw = Math.max(.65, Math.min(1.8, actualMin / expectedMin));
      etaModel.scheduleRatio = etaModel.scheduleRatio == null ? raw : etaModel.scheduleRatio * .82 + raw * .18; etaModel.samples++;
    }
  }
  etaModel.lastOfficialDistance = od; etaModel.lastTs = ts;
}
function etaConfidence() {
  const elapsed = etaModel.startedAt ? Math.max(0, (Date.now() - etaModel.startedAt) / 60000) : 0;
  return Math.min(.78, Math.max(0, etaModel.movingKm / 25 * .52 + elapsed / 18 * .26));
}
function remainingMinutes() {
  if (!currentTripLoaded) return 0;
  const g = geomProgressByKind(progress), roadRemainFrac = 1 - g.road, ferryRemainFrac = 1 - g.ferry;
  const baselineRoad = routeRoadTime * roadRemainFrac, baselineFerry = routeFerryTime * ferryRemainFrac;
  const confidence = etaConfidence(); if (confidence < .08) return baselineRoad + baselineFerry;
  const candidates = [];
  if (etaModel.speedKmh && etaModel.movingKm >= .8) candidates.push(routeRoadDistance * roadRemainFrac / etaModel.speedKmh * 60);
  if (etaModel.scheduleRatio && etaModel.samples >= 1) candidates.push(baselineRoad * etaModel.scheduleRatio);
  if (!candidates.length) return baselineRoad + baselineFerry;
  const liveRoad = candidates.reduce((a,b)=>a+b,0) / candidates.length;
  return baselineRoad * (1 - confidence) + liveRoad * confidence + baselineFerry;
}
function updateDrivingHud() {
  const speed = $('speedHud'), acc = $('accuracyHud'), heading = $('headingHud'); if (!speed || !acc) return;
  speed.textContent = latestSpeedKmh != null ? `${Math.round(latestSpeedKmh)} km/h` : gpsRunning ? '— km/h' : followGPS ? 'SIM' : '';
  acc.textContent = latestAccuracyM != null ? `GPS ±${Math.round(latestAccuracyM)}m` : gpsRunning ? 'GPS…' : '';
  if (heading) heading.textContent = latestHeadingDeg != null && typeof cardinalDirection === 'function' ? cardinalDirection(latestHeadingDeg).toUpperCase() : '';
}
function update() {
  if (!currentTripLoaded) { $('remaining').textContent = '—'; $('eta').textContent = '—'; return renderOverlay(); }
  const activeTravelledKm = officialDistanceAtProgress(progress), rem = Math.max(0, routeDist - activeTravelledKm), rm = remainingMinutes();
  $('remaining').textContent = `${Math.round(rem)} km`;
  $('eta').textContent = routeTime > 0 ? new Date(Date.now() + rm * 60000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Now';
  $('etaCaption').textContent = etaConfidence() >= .18 ? 'live arrival' : 'arrival'; updateDrivingHud(); if (typeof updateManeuverUI === 'function') updateManeuverUI();
  let shownTravelled = activeTravelledKm, pct = routeDist > 0 ? Math.min(100, activeTravelledKm / routeDist * 100) : 100;
  if (gpsRunning && liveRerouteCount > 0) {
    shownTravelled = Math.max(journeyCompletedKm, activeTravelledKm);
    const totalNow = shownTravelled + rem; pct = totalNow > 0 ? Math.min(100, shownTravelled / totalNow * 100) : 100;
    $('progressText').textContent = `${Math.round(pct)}% complete · rerouted`;
  } else $('progressText').textContent = `${Math.round(pct)}% complete`;
  $('travelled').textContent = `${Math.round(shownTravelled)} km`;
  $('fill').style.width = `${pct}%`; $('slider').value = Math.round(progress * 1000);
  if (followGPS) followViewAt(currentFollowPoint()); else renderOverlay();
}
