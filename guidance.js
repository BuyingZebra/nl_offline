// NL Offline v0.19 — local maneuver generation from packaged NRN route geometry.
// Instructions are intentionally road-level guidance; no lane, legal-turn or truck-restriction claims are made.

function bearingDegrees(a, b) {
  if (!a || !b) return 0;
  const lat1 = a[1] * Math.PI / 180, lat2 = b[1] * Math.PI / 180, dLon = (b[0] - a[0]) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2), x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function angleDifference(to, from) { return ((to - from + 540) % 360) - 180; }
function cardinalDirection(degrees) {
  const points = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  return points[Math.round(((degrees % 360) + 360) % 360 / 45) % 8];
}
function bearingFromPolyline(coords, fromStart = true, sampleKm = .06) {
  if (!coords?.length || coords.length < 2) return 0;
  if (fromStart) {
    let distance = 0;
    for (let i = 1; i < coords.length; i++) { distance += kmBetween(coords[i - 1], coords[i]); if (distance >= sampleKm || i === coords.length - 1) return bearingDegrees(coords[0], coords[i]); }
  } else {
    let distance = 0;
    for (let i = coords.length - 1; i > 0; i--) { distance += kmBetween(coords[i], coords[i - 1]); if (distance >= sampleKm || i === 1) return bearingDegrees(coords[i - 1], coords.at(-1)); }
  }
  return bearingDegrees(coords[0], coords.at(-1));
}
function guidanceRoadLabel(edgeId) {
  const edge = DATA.edges[edgeId], type = edge?.[4] || 'road';
  if (type === 'ferry') return 'the ferry';
  if (type === 'virtual') return 'the schematic connection';
  const route = typeof routeNumber === 'function' ? routeNumber(edgeId) : '';
  if (route && typeof routeDisplayName === 'function') return routeDisplayName(route);
  const street = typeof streetNameForEdge === 'function' ? streetNameForEdge(edgeId) : '';
  if (street && street !== 'None') return street;
  const roadClass = typeof roadClassName === 'function' ? roadClassName(edgeId) : '';
  return roadClass === 'Freeway' || roadClass === 'Expressway / Highway' ? roadClass : '';
}
function guidanceRoadKey(edgeId) {
  const edge = DATA.edges[edgeId], type = edge?.[4] || 'road'; if (type !== 'road') return type;
  const route = typeof routeNumber === 'function' ? routeNumber(edgeId) : ''; if (route) return `route:${route}`;
  const street = typeof streetNameForEdge === 'function' ? streetNameForEdge(edgeId) : ''; if (street && street !== 'None') return `street:${typeof normalizeAddressText === 'function' ? normalizeAddressText(street) : street.toLowerCase()}`;
  return '';
}
function guidanceIcon(type, side = '') {
  if (type === 'arrive') return '●'; if (type === 'ferry') return '⛴'; if (type === 'start' || type === 'continue') return '↑';
  if (type === 'ramp') return side === 'left' ? '↖' : '↗'; if (type === 'sharp') return side === 'left' ? '↶' : '↷';
  if (type === 'keep') return side === 'left' ? '↖' : '↗'; return side === 'left' ? '←' : '→';
}
function accessStartDistanceKm() {
  let km = 0;
  for (const segment of routeSegments) { if (segment.edgeCount) break; km += polylineKm(segment.coords); }
  return km;
}
function traversalGuidanceLegs() {
  const legs = []; let atKm = accessStartDistanceKm();
  for (const traversal of routeEdgeTraversals) {
    const edge = DATA.edges[traversal.edgeId]; if (!edge) continue;
    const coords = orientedEdgeCoords(edge, traversal.fromNode, traversal.toNode), km = polylineKm(coords), label = guidanceRoadLabel(traversal.edgeId), key = guidanceRoadKey(traversal.edgeId);
    legs.push({
      edgeId: traversal.edgeId, type: edge[4] || 'road', roadClass: typeof roadClassName === 'function' ? roadClassName(traversal.edgeId) : '',
      label, key, atKm, endKm: atKm + km, km, startBearing: bearingFromPolyline(coords, true), endBearing: bearingFromPolyline(coords, false),
    });
    atKm += km;
  }
  return legs;
}
function instructionForTransition(previous, current) {
  const delta = angleDifference(current.startBearing, previous.endBearing), magnitude = Math.abs(delta), side = delta < 0 ? 'left' : 'right';
  const suffix = current.label ? ` onto ${current.label}` : '';
  if (current.type === 'ferry') return { type: 'ferry', side, icon: guidanceIcon('ferry'), instruction: 'Board the ferry', delta };
  if (previous.type === 'ferry') return { type: 'continue', side, icon: guidanceIcon('continue'), instruction: `Leave the ferry${current.label ? ` and continue onto ${current.label}` : ''}`, delta };
  if (current.roadClass === 'Ramp' && current.key !== previous.key) return { type: 'ramp', side, icon: guidanceIcon('ramp', side), instruction: `Take the ramp${suffix}`, delta };
  if (magnitude < 18) return { type: 'continue', side, icon: guidanceIcon('continue'), instruction: `Continue${suffix}`, delta };
  if (magnitude < 45) return { type: 'keep', side, icon: guidanceIcon('keep', side), instruction: `Keep ${side}${suffix}`, delta };
  if (magnitude < 135) return { type: 'turn', side, icon: guidanceIcon('turn', side), instruction: `Turn ${side}${suffix}`, delta };
  return { type: 'sharp', side, icon: guidanceIcon('sharp', side), instruction: `Make a sharp ${side}${suffix}`, delta };
}
function pruneManeuvers(items) {
  const out = [];
  for (const item of items) {
    const previous = out.at(-1);
    if (previous && item.type !== 'arrive' && item.atKm - previous.atKm < .07) {
      const priority = { start: 0, continue: 1, keep: 2, turn: 3, sharp: 4, ramp: 5, ferry: 6, arrive: 7 };
      if ((priority[item.type] || 0) >= (priority[previous.type] || 0)) out[out.length - 1] = item;
      continue;
    }
    out.push(item);
  }
  return out;
}
function rebuildManeuvers() {
  routeManeuvers = [];
  if (routeCoords.length < 2 || routePolylineKm <= .001) { renderManeuverList(); return; }
  const legs = traversalGuidanceLegs(), firstLabel = legs[0]?.label || routeSegments.find(segment => segment.type === 'access')?.label || '';
  const startBearing = bearingFromPolyline(routeCoords, true);
  routeManeuvers.push({ type: 'start', icon: guidanceIcon('start'), atKm: 0, instruction: `Head ${cardinalDirection(startBearing)}${firstLabel ? ` on ${firstLabel}` : ''}` });
  for (let i = 1; i < legs.length; i++) {
    const previous = legs[i - 1], current = legs[i], keyChanged = current.key !== previous.key;
    const delta = Math.abs(angleDifference(current.startBearing, previous.endBearing));
    const importantUnnamedTurn = !current.key && delta >= 55;
    const ferryChange = current.type !== previous.type && (current.type === 'ferry' || previous.type === 'ferry');
    const ramp = current.roadClass === 'Ramp' && previous.roadClass !== 'Ramp' && current.key !== previous.key;
    if (!ferryChange && !ramp && !importantUnnamedTurn && (!keyChanged || !current.label)) continue;
    routeManeuvers.push({ ...instructionForTransition(previous, current), atKm: current.atKm, edgeId: current.edgeId });
  }
  routeManeuvers.push({ type: 'arrive', icon: guidanceIcon('arrive'), atKm: routePolylineKm, instruction: `Arrive at ${loadedDestLabel || $('destination')?.textContent || 'destination'}` });
  routeManeuvers = pruneManeuvers(routeManeuvers);
  renderManeuverList(); updateManeuverUI();
}
function formatGuidanceDistance(km) {
  km = Math.max(0, km || 0);
  if (km < .1) return `${Math.max(10, Math.round(km * 1000 / 10) * 10)} m`;
  if (km < 1) return `${Math.round(km * 1000 / 50) * 50} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}
function nextManeuverAtProgress(fraction = progress) {
  const alongKm = Math.max(0, Math.min(routePolylineKm, fraction * routePolylineKm));
  return routeManeuvers.find(item => item.atKm > alongKm + .025) || routeManeuvers.at(-1) || null;
}
function updateManeuverUI() {
  const instruction = $('maneuverInstruction'), distance = $('maneuverDistance'), icon = $('maneuverIcon'); if (!instruction || !distance || !icon) return;
  const next = nextManeuverAtProgress();
  if (!next) { instruction.textContent = currentTripLoaded ? 'Continue to destination' : 'Load a route'; distance.textContent = 'Offline guidance'; icon.textContent = '↑'; return; }
  const remaining = Math.max(0, next.atKm - progress * routePolylineKm);
  instruction.textContent = next.instruction; distance.textContent = next.type === 'arrive' && remaining < .03 ? 'Destination' : `In ${formatGuidanceDistance(remaining)}`; icon.textContent = next.icon;
  const list = $('directionList');
  if (list?.children) {
    const rows = Array.from(list.children), alongKm = progress * routePolylineKm + .025;
    let activeIndex = 0;
    for (let i = 0; i < rows.length; i++) if (Number(rows[i].dataset.atKm) <= alongKm) activeIndex = i;
    rows.forEach((row, index) => row.classList.toggle('active', index === activeIndex));
  }
}
function renderManeuverList() {
  const list = $('directionList'), summary = $('directionSummary'); if (!list || !summary) return;
  list.replaceChildren();
  for (const maneuver of routeManeuvers) {
    const row = document.createElement('li'); row.dataset.atKm = String(maneuver.atKm); row.className = 'directionStep';
    const icon = document.createElement('span'); icon.className = 'directionIcon'; icon.textContent = maneuver.icon;
    const copy = document.createElement('span'), instruction = document.createElement('strong'), distance = document.createElement('small');
    instruction.textContent = maneuver.instruction; distance.textContent = maneuver.type === 'start' ? 'Start' : maneuver.type === 'arrive' ? `${formatGuidanceDistance(routePolylineKm)} total` : formatGuidanceDistance(maneuver.atKm);
    copy.appendChild(instruction); copy.appendChild(distance); row.appendChild(icon); row.appendChild(copy); list.appendChild(row);
  }
  const counted = Math.max(0, routeManeuvers.length - 2); summary.textContent = routeManeuvers.length ? `${counted} maneuvers · ${formatGuidanceDistance(routePolylineKm)}` : 'No route loaded';
}
function routeBearingAtProgress(fraction = progress) {
  if (routeCoords.length < 2) return null;
  const target = Math.max(0, Math.min(routePolylineKm, fraction * routePolylineKm)); let index = 1;
  while (index < routeCum.length && routeCum[index] < target) index++;
  const from = Math.max(0, index - 1), to = Math.min(routeCoords.length - 1, index + 1);
  return bearingDegrees(routeCoords[from], routeCoords[to]);
}
function currentDisplayHeading() { return latestHeadingDeg != null ? latestHeadingDeg : routeBearingAtProgress(); }

window.rebuildManeuvers = rebuildManeuvers;
window.nextManeuverAtProgress = nextManeuverAtProgress;
