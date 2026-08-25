// NL Offline v0.22 — offline road/place resolver.
// Civic numbers and address coordinates are deliberately excluded from this MVP.

const ROAD_INDEX = window.NL_ROAD_INDEX || {};
const ROAD_STREETS = ROAD_INDEX.streets || [];
const ROAD_PLACES = ROAD_INDEX.places || [];

function normalizeRoadText(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[’']/g, '')
    .replace(/\bsaint\b/g, 'st')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\broad\b/g, 'rd')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bhighway\b/g, 'hwy')
    .replace(/\broute\b/g, 'rte')
    .replace(/\bboulevard\b/g, 'blvd')
    .replace(/\bcrescent\b/g, 'cres')
    .replace(/\bcourt\b/g, 'ct')
    .replace(/\blane\b/g, 'ln')
    .replace(/\bplace\b/g, 'pl')
    .replace(/\bterrace\b/g, 'terr')
    .replace(/\btrail\b/g, 'trl')
    .replace(/\bextension\b/g, 'ext')
    .replace(/\bmount\b/g, 'mt')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim().replace(/\s+/g, ' ');
}

const ROAD_STREET_NORM = ROAD_STREETS.map(normalizeRoadText);
const ROAD_PLACE_NORM = ROAD_PLACES.map(normalizeRoadText);
const ROAD_ALIAS_IDS = new Map(Object.entries(ROAD_INDEX.aliases || {}));
const ROAD_PAIR_OPTIONS = [];
const ROAD_PAIR_LOOKUP = new Map();

for (let pairId = 0; pairId < (ROAD_INDEX.pairs || []).length; pairId++) {
  const packed = ROAD_INDEX.pairs[pairId];
  const option = {
    pairId,
    streetId: packed[0],
    placeId: packed[1],
    edgeIds: packed[2] || [],
    fallbackNodes: packed[3] || [],
    streetNorm: ROAD_STREET_NORM[packed[0]] || '',
    placeNorm: ROAD_PLACE_NORM[packed[1]] || '',
  };
  if (!option.streetNorm || option.streetNorm === 'none') continue;
  ROAD_PAIR_OPTIONS.push(option);
  const key = `${option.streetNorm}|${option.placeId}`;
  let matches = ROAD_PAIR_LOOKUP.get(key);
  if (!matches) ROAD_PAIR_LOOKUP.set(key, matches = []);
  matches.push(option);
}

const ROAD_EDGE_STREET_LABEL = new Array(DATA.edges.length).fill('');
for (const packed of ROAD_INDEX.edgeNames || []) {
  const edgeId = packed[0], street = ROAD_STREETS[packed[1]];
  if (edgeId < ROAD_EDGE_STREET_LABEL.length && street) ROAD_EDGE_STREET_LABEL[edgeId] = street;
}

const ROAD_PLACE_SUFFIXES = (() => {
  const values = new Set([...ROAD_ALIAS_IDS.keys(), ...ROAD_PLACE_NORM].filter(Boolean));
  return [...values].sort((a, b) => b.length - a.length || a.localeCompare(b));
})();

function splitRoadAndPlace(value) {
  const raw = String(value || '').trim();
  if (raw.includes(',')) {
    const parts = raw.split(','), place = parts.pop().trim(), street = parts.join(',').trim();
    return { streetNorm: normalizeRoadText(street), placeNorm: normalizeRoadText(place) };
  }
  const normalized = normalizeRoadText(raw);
  let placeNorm = '';
  for (const candidate of ROAD_PLACE_SUFFIXES) {
    if (normalized === candidate || normalized.endsWith(` ${candidate}`)) { placeNorm = candidate; break; }
  }
  const streetNorm = placeNorm && normalized !== placeNorm
    ? normalized.slice(0, normalized.length - placeNorm.length).trim()
    : normalized === placeNorm ? '' : normalized;
  return { streetNorm, placeNorm };
}

function exactRoadPlaceIds(placeNorm) {
  if (!placeNorm) return null;
  const aliases = ROAD_ALIAS_IDS.get(placeNorm);
  if (aliases?.length) return new Set(aliases);
  const direct = ROAD_PLACE_NORM.indexOf(placeNorm);
  return direct >= 0 ? new Set([direct]) : new Set();
}

function roadNodes(option) {
  const nodes = new Set(option.fallbackNodes || []);
  for (const edgeId of option.edgeIds || []) {
    const edge = DATA.edges[edgeId];
    if (!edge || (edge[4] || 'road') !== 'road') continue;
    nodes.add(edge[0]); nodes.add(edge[1]);
  }
  return [...nodes].filter(node => node >= 0 && DATA.nodes[node]);
}

function roadResult(option) {
  const nodeIds = roadNodes(option);
  if (!nodeIds.length) return null;
  const street = ROAD_STREETS[option.streetId], place = ROAD_PLACES[option.placeId];
  return {
    kind: 'road', street, place, label: `${street}, ${place}`,
    edgeIds: [...option.edgeIds], nodeIds,
    node: nodeIds[0], point: DATA.nodes[nodeIds[0]],
    confidence: 'road', source: ROAD_INDEX.source || 'packaged offline road/place index',
  };
}

function resolveRoad(value) {
  const raw = String(value || '').trim();
  if (!raw || /^\d/.test(raw)) return null;
  const query = splitRoadAndPlace(raw);
  if (!query.streetNorm) return null;
  const placeIds = exactRoadPlaceIds(query.placeNorm);
  const matches = ROAD_PAIR_OPTIONS.filter(option =>
    option.streetNorm === query.streetNorm && (!placeIds || placeIds.has(option.placeId))
  );
  if (matches.length !== 1) return null;
  return roadResult(matches[0]);
}

function roadSuggestions(value, max = 8) {
  let raw = String(value || '').trim();
  if (!raw) return [];
  raw = raw.replace(/^\s*\d{1,6}[a-zA-Z]?\s+/, '');
  const comma = raw.lastIndexOf(',');
  const streetInput = normalizeRoadText(comma >= 0 ? raw.slice(0, comma) : raw);
  const placeInput = normalizeRoadText(comma >= 0 ? raw.slice(comma + 1) : '');
  const tokens = normalizeRoadText(raw).split(' ').filter(Boolean), ranked = [];
  for (const option of ROAD_PAIR_OPTIONS) {
    if (comma >= 0) {
      if (streetInput && !option.streetNorm.includes(streetInput) && !streetInput.includes(option.streetNorm)) continue;
      if (placeInput && !option.placeNorm.includes(placeInput) && !placeInput.includes(option.placeNorm)) continue;
    } else if (!tokens.every(token => `${option.streetNorm} ${option.placeNorm}`.includes(token))) continue;
    let score = 10;
    if (option.streetNorm === streetInput) score -= 6;
    else if (streetInput && option.streetNorm.startsWith(streetInput)) score -= 4;
    if (placeInput && option.placeNorm === placeInput) score -= 3;
    else if (placeInput && option.placeNorm.startsWith(placeInput)) score -= 2;
    ranked.push([score, `${ROAD_STREETS[option.streetId]}, ${ROAD_PLACES[option.placeId]}`]);
  }
  ranked.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  const output = [], seen = new Set();
  for (const [, label] of ranked) {
    if (seen.has(label)) continue;
    seen.add(label); output.push(label);
    if (output.length >= max) break;
  }
  return output;
}

function roadCoverageText() {
  const quality = ROAD_INDEX.quality || {};
  return `${(quality.roadPlacePairs || ROAD_PAIR_OPTIONS.length).toLocaleString()} road/place entries · ${ROAD_STREETS.length.toLocaleString()} road names · ${ROAD_PLACES.length.toLocaleString()} localities · fully offline`;
}

function streetNameForEdge(edgeId) { return ROAD_EDGE_STREET_LABEL[edgeId] || ''; }

window.normalizeRoadText = normalizeRoadText;
window.resolveRoad = resolveRoad;
window.roadSuggestions = roadSuggestions;
window.roadCoverageText = roadCoverageText;
window.streetNameForEdge = streetNameForEdge;
window.roadIndexQuality = ROAD_INDEX.quality || null;
