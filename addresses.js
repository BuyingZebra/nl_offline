// NL Offline v0.20 — exact offline civic-address resolver.
// Primary source: Statistics Canada National Address Register, June 2026.
// NRN civic ranges remain available only as a fallback for a missing exact point.

const ADDRESS_POINT_META = window.NL_ADDRESS_POINTS || {};
const ADDRESS_META = window.NL_ADDRESS_META || {};
const ADDRESS_STREETS = ADDRESS_META.streets || [];
const ADDRESS_PLACES = ADDRESS_META.places || [];
const ADDRESS_RECORD_BYTES = ADDRESS_META.recordBytes || 14;
const POINT_STREETS = ADDRESS_POINT_META.streets || [];
const POINT_PLACES = ADDRESS_POINT_META.places || [];
const POINT_SUFFIXES = ADDRESS_POINT_META.suffixes || [''];
const POINT_RECORD_BYTES = ADDRESS_POINT_META.recordBytes || 14;
const POINT_PAIR_BYTES = ADDRESS_POINT_META.pairBytes || 12;

function normalizeAddressText(s) {
  return String(s || '')
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

function base64View(value) {
  if (!value) return new DataView(new ArrayBuffer(0));
  const binary = atob(value), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new DataView(bytes.buffer);
}

function readUint24(view, offset) {
  return view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
}

const POINT_RECORD_VIEW = base64View(ADDRESS_POINT_META.recordsB64);
const POINT_PAIR_VIEW = base64View(ADDRESS_POINT_META.pairsB64);
const POINT_EDGE_NAME_VIEW = base64View(ADDRESS_POINT_META.edgeNamesB64);
const POINT_STREET_NORM = POINT_STREETS.map(normalizeAddressText);
const POINT_PLACE_NORM = POINT_PLACES.map(normalizeAddressText);
const POINT_ALIAS_IDS = new Map(Object.entries(ADDRESS_POINT_META.aliases || {}));
const POINT_PAIR_LOOKUP = new Map();
const POINT_PAIR_OPTIONS = [];

function pointPair(index) {
  const offset = index * POINT_PAIR_BYTES;
  return {
    streetId: POINT_PAIR_VIEW.getUint16(offset, true),
    placeId: POINT_PAIR_VIEW.getUint16(offset + 2, true),
    start: POINT_PAIR_VIEW.getUint32(offset + 4, true),
    count: POINT_PAIR_VIEW.getUint32(offset + 8, true),
  };
}

for (let i = 0; i < (ADDRESS_POINT_META.pairCount || 0); i++) {
  const pair = pointPair(i), streetNorm = POINT_STREET_NORM[pair.streetId], placeNorm = POINT_PLACE_NORM[pair.placeId];
  POINT_PAIR_LOOKUP.set(`${streetNorm}|${pair.placeId}`, i);
  POINT_PAIR_OPTIONS.push({ ...pair, pairId: i, streetNorm, placeNorm });
}

function pointRecord(index) {
  const offset = index * POINT_RECORD_BYTES;
  return {
    number: POINT_RECORD_VIEW.getUint16(offset, true),
    suffixId: POINT_RECORD_VIEW.getUint8(offset + 2),
    flags: POINT_RECORD_VIEW.getUint8(offset + 3),
    edgeId: POINT_RECORD_VIEW.getUint16(offset + 4, true),
    fallbackNode: POINT_RECORD_VIEW.getUint16(offset + 6, true),
    point: [
      (ADDRESS_POINT_META.baseLon || -68) + readUint24(POINT_RECORD_VIEW, offset + 8) / (ADDRESS_POINT_META.coordinateScale || 100000),
      (ADDRESS_POINT_META.baseLat || 46) + readUint24(POINT_RECORD_VIEW, offset + 11) / (ADDRESS_POINT_META.coordinateScale || 100000),
    ],
  };
}

function decodeAddressRecords() {
  const count = ADDRESS_META.recordCount || 0, out = new Array(count);
  if (!ADDRESS_META.recordsB64 || !count) return out.fill(null);
  const view = base64View(ADDRESS_META.recordsB64);
  for (let i = 0; i < count; i++) {
    const offset = i * ADDRESS_RECORD_BYTES;
    out[i] = {
      streetId: view.getUint16(offset, true), placeId: view.getUint16(offset + 2, true),
      from: view.getUint16(offset + 4, true), to: view.getUint16(offset + 6, true),
      edgeId: view.getUint16(offset + 8, true), fallbackNode: view.getUint16(offset + 10, true),
      flags: view.getUint8(offset + 12),
    };
  }
  return out;
}

const ADDRESS_RECORDS = decodeAddressRecords();
const ADDRESS_LOOKUP = new Map();
const ADDRESS_PAIR_OPTIONS = [];
const ADDRESS_EDGE_STREET_ID = new Int32Array(DATA.edges.length); ADDRESS_EDGE_STREET_ID.fill(-1);
const ADDRESS_EDGE_STREET_LABEL = new Array(DATA.edges.length).fill('');
const ADDRESS_PLACE_NORM = ADDRESS_PLACES.map(normalizeAddressText);
const ADDRESS_PLACE_BY_NORM = new Map(ADDRESS_PLACE_NORM.map((place, index) => [place, index]));
const ADDRESS_STREET_NORM = ADDRESS_STREETS.map(normalizeAddressText);

for (let i = 0; i < ADDRESS_RECORDS.length; i++) {
  const record = ADDRESS_RECORDS[i]; if (!record) continue;
  const key = `${ADDRESS_STREET_NORM[record.streetId]}|${ADDRESS_PLACE_NORM[record.placeId]}`;
  let records = ADDRESS_LOOKUP.get(key);
  if (!records) {
    ADDRESS_LOOKUP.set(key, records = []);
    ADDRESS_PAIR_OPTIONS.push({ streetId: record.streetId, placeId: record.placeId, streetNorm: ADDRESS_STREET_NORM[record.streetId], placeNorm: ADDRESS_PLACE_NORM[record.placeId] });
  }
  records.push(i);
  if (record.edgeId !== 65535 && record.edgeId < ADDRESS_EDGE_STREET_ID.length && ADDRESS_EDGE_STREET_ID[record.edgeId] < 0)
    ADDRESS_EDGE_STREET_ID[record.edgeId] = record.streetId;
}

for (let offset = 0; offset + 3 < POINT_EDGE_NAME_VIEW.byteLength; offset += 4) {
  const edgeId = POINT_EDGE_NAME_VIEW.getUint16(offset, true), streetId = POINT_EDGE_NAME_VIEW.getUint16(offset + 2, true);
  if (edgeId < ADDRESS_EDGE_STREET_LABEL.length && POINT_STREETS[streetId]) ADDRESS_EDGE_STREET_LABEL[edgeId] = POINT_STREETS[streetId];
}

const QUERY_PLACE_SUFFIXES = (() => {
  const values = new Set([...POINT_ALIAS_IDS.keys(), ...POINT_PLACE_NORM, ...ADDRESS_PLACE_NORM].filter(Boolean));
  return [...values].sort((a, b) => b.length - a.length || a.localeCompare(b));
})();

function addressCoverageText() {
  if (ADDRESS_POINT_META.recordCount)
    return `${ADDRESS_POINT_META.recordCount.toLocaleString()} exact civic addresses · ${POINT_STREETS.length.toLocaleString()} streets · ${POINT_PLACES.length.toLocaleString()} localities · fully offline`;
  return `${(ADDRESS_META.recordCount || 0).toLocaleString()} civic-range sides · ${ADDRESS_PLACES.length} places`;
}

function splitStreetAndPlace(rest) {
  if (rest.includes(',')) {
    const parts = rest.split(','), place = parts.pop().trim(), street = parts.join(',').trim();
    return { street, place, streetNorm: normalizeAddressText(street), placeNorm: normalizeAddressText(place) };
  }
  const normalized = normalizeAddressText(rest);
  let placeNorm = '';
  for (const candidate of QUERY_PLACE_SUFFIXES) {
    if (normalized === candidate || normalized.endsWith(` ${candidate}`)) { placeNorm = candidate; break; }
  }
  if (!placeNorm) return { street: rest.trim(), place: '', streetNorm: normalized, placeNorm: '' };
  const streetNorm = normalized === placeNorm ? '' : normalized.slice(0, normalized.length - placeNorm.length).trim();
  return { street: streetNorm, place: placeNorm, streetNorm, placeNorm };
}

function parseAddressQuery(text) {
  const raw = String(text || '').trim();
  const match = raw.match(/^\s*(\d{1,6})([a-zA-Z])?(?:\s+(1\/2|1\/4))?\s+(.+?)\s*$/);
  if (!match) return null;
  const number = +match[1], suffix = String(match[2] || match[3] || '').toUpperCase();
  const split = splitStreetAndPlace(match[4]);
  if (!number || !split.streetNorm) return null;
  return { raw, number, suffix, ...split };
}

function parseStreetQuery(text) {
  const raw = String(text || '').trim();
  if (!raw || /^\d/.test(raw)) return null;
  const split = splitStreetAndPlace(raw);
  if (!split.streetNorm) return null;
  return { raw, ...split };
}

function exactPlaceIds(placeNorm) {
  if (!placeNorm) return [];
  const aliases = POINT_ALIAS_IDS.get(placeNorm);
  if (aliases?.length) return aliases;
  const direct = POINT_PLACE_NORM.indexOf(placeNorm);
  return direct >= 0 ? [direct] : [];
}

function pointPairRecordIndex(pair, number, suffix = '') {
  let low = pair.start, high = pair.start + pair.count;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (pointRecord(middle).number < number) low = middle + 1; else high = middle;
  }
  let fallback = -1;
  for (let index = low; index < pair.start + pair.count; index++) {
    const record = pointRecord(index); if (record.number !== number) break;
    const recordSuffix = POINT_SUFFIXES[record.suffixId] || '';
    if (recordSuffix === suffix) return index;
    if (!recordSuffix) fallback = index;
    else if (fallback < 0) fallback = index;
  }
  return suffix ? -1 : fallback;
}

function exactResult(pair, recordIndex, options = {}) {
  const record = pointRecord(recordIndex), suffix = POINT_SUFFIXES[record.suffixId] || '';
  const street = POINT_STREETS[pair.streetId], place = POINT_PLACES[pair.placeId];
  const numberLabel = options.streetOnly ? '' : `${record.number}${suffix}`;
  return {
    kind: 'address', number: options.streetOnly ? null : record.number, suffix: options.streetOnly ? '' : suffix,
    street, place, label: options.streetOnly ? `${street}, ${place}` : `${numberLabel} ${street}, ${place}`,
    edgeId: record.edgeId, node: record.fallbackNode, point: record.point,
    fraction: null, approximate: false, confidence: options.streetOnly ? 'street' : 'exact',
    source: 'Statistics Canada National Address Register (June 2026)', roadAccessFallback: !!(record.flags & 1),
  };
}

function resolveExactAddress(query) {
  if (!query.placeNorm) {
    const matches = [];
    for (const pair of POINT_PAIR_OPTIONS) {
      if (pair.streetNorm !== query.streetNorm) continue;
      const recordIndex = pointPairRecordIndex(pair, query.number, query.suffix);
      if (recordIndex >= 0) matches.push([pair, recordIndex]);
      if (matches.length > 1) return null;
    }
    return matches.length === 1 ? exactResult(matches[0][0], matches[0][1]) : null;
  }
  for (const placeId of exactPlaceIds(query.placeNorm)) {
    const pairId = POINT_PAIR_LOOKUP.get(`${query.streetNorm}|${placeId}`);
    if (pairId == null) continue;
    const pair = pointPair(pairId), recordIndex = pointPairRecordIndex(pair, query.number, query.suffix);
    if (recordIndex >= 0) return exactResult(pair, recordIndex);
  }
  return null;
}

function resolveExactStreet(query) {
  const placeIds = query.placeNorm ? new Set(exactPlaceIds(query.placeNorm)) : null;
  const matches = POINT_PAIR_OPTIONS.filter(option => option.streetNorm === query.streetNorm && (!placeIds || placeIds.has(option.placeId)));
  if (matches.length !== 1) return null;
  const pair = matches[0], recordIndex = pair.start + Math.floor(pair.count / 2);
  return exactResult(pair, recordIndex, { streetOnly: true });
}

function addressPlaceId(placeRaw, placeNorm) {
  let id = ADDRESS_PLACE_BY_NORM.get(placeNorm);
  if (id != null) return id;
  const paren = String(placeRaw || '').match(/\(([^)]+)\)/);
  if (paren) { id = ADDRESS_PLACE_BY_NORM.get(normalizeAddressText(paren[1])); if (id != null) return id; }
  let best = -1, bestLength = 0;
  for (let i = 0; i < ADDRESS_PLACE_NORM.length; i++) {
    const place = ADDRESS_PLACE_NORM[i]; if (!place || place.length < 6) continue;
    if (placeNorm.includes(place) || place.includes(placeNorm)) {
      if (place.length > bestLength) { best = i; bestLength = place.length; }
    }
  }
  return best >= 0 ? best : null;
}

function recordParityScore(record, number) {
  if (!record.from || !record.to) return 0;
  if ((record.from & 1) === (record.to & 1)) return (number & 1) === (record.from & 1) ? 0 : 0.75;
  return 0;
}
function rangeGap(record, number) {
  const low = Math.min(record.from, record.to), high = Math.max(record.from, record.to);
  return number < low ? low - number : number > high ? number - high : 0;
}
function addressFraction(record, number) {
  if (!record.from || !record.to || record.from === record.to) return .5;
  let fraction = (number - record.from) / (record.to - record.from);
  fraction = Math.max(0, Math.min(1, fraction));
  if (record.flags & 1) fraction = 1 - fraction;
  return fraction;
}
function pointAlongPolyline(coords, fraction) {
  if (!coords?.length) return null; if (coords.length === 1) return [coords[0][0], coords[0][1]];
  const cumulative = [0]; let total = 0;
  for (let i = 1; i < coords.length; i++) { total += kmBetween(coords[i - 1], coords[i]); cumulative.push(total); }
  if (total <= 1e-9) return [coords[0][0], coords[0][1]];
  const target = total * Math.max(0, Math.min(1, fraction)); let i = 1;
  while (i < cumulative.length && cumulative[i] < target) i++;
  if (i >= cumulative.length) return [coords.at(-1)[0], coords.at(-1)[1]];
  const a = coords[i - 1], b = coords[i], span = Math.max(1e-9, cumulative[i] - cumulative[i - 1]), t = (target - cumulative[i - 1]) / span;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
function closestAddressNode(record, point) {
  if (record.edgeId !== 65535 && DATA.edges[record.edgeId]) {
    const edge = DATA.edges[record.edgeId], a = DATA.nodes[edge[0]], b = DATA.nodes[edge[1]];
    return kmBetween(point, a) <= kmBetween(point, b) ? edge[0] : edge[1];
  }
  return record.fallbackNode;
}

function resolveRangeAddress(query) {
  if (!query.placeNorm) return null;
  const placeId = addressPlaceId(query.place, query.placeNorm); if (placeId == null) return null;
  const key = `${query.streetNorm}|${ADDRESS_PLACE_NORM[placeId]}`, ids = ADDRESS_LOOKUP.get(key); if (!ids?.length) return null;
  let best = null;
  for (const recordIndex of ids) {
    const record = ADDRESS_RECORDS[recordIndex], gap = rangeGap(record, query.number), parity = recordParityScore(record, query.number), span = Math.abs(record.to - record.from);
    const score = gap * 10 + parity + Math.min(span, 9999) / 100000;
    if (!best || score < best.score) best = { record, score, gap };
  }
  if (!best || best.gap > 300) return null;
  const record = best.record, fraction = addressFraction(record, query.number);
  let point = null;
  if (record.edgeId !== 65535 && DATA.edges[record.edgeId]) point = pointAlongPolyline(DATA.edges[record.edgeId][3], fraction);
  if (!point && DATA.nodes[record.fallbackNode]) point = [DATA.nodes[record.fallbackNode][0], DATA.nodes[record.fallbackNode][1]];
  if (!point) return null;
  return {
    kind: 'address', number: query.number, suffix: query.suffix, street: ADDRESS_STREETS[record.streetId], place: ADDRESS_PLACES[record.placeId],
    label: `${query.number}${query.suffix} ${ADDRESS_STREETS[record.streetId]}, ${ADDRESS_PLACES[record.placeId]}`,
    edgeId: record.edgeId, node: closestAddressNode(record, point), point, fraction, approximate: true,
    confidence: best.gap ? 'near-range' : 'range', gap: best.gap, source: 'NRN civic address range fallback',
  };
}

function resolveAddress(text) {
  const addressQuery = parseAddressQuery(text);
  if (addressQuery) return resolveExactAddress(addressQuery) || resolveRangeAddress(addressQuery);
  const streetQuery = parseStreetQuery(text);
  return streetQuery ? resolveExactStreet(streetQuery) : null;
}

function isAddressQuery(text) { return !!resolveAddress(text); }

function pairMatches(option, streetInput, placeInput, tokens, comma) {
  if (comma) {
    if (streetInput && !option.streetNorm.includes(streetInput) && !streetInput.includes(option.streetNorm)) return false;
    if (placeInput && !option.placeNorm.includes(placeInput) && !placeInput.includes(option.placeNorm)) return false;
    return true;
  }
  const combined = `${option.streetNorm} ${option.placeNorm}`;
  return tokens.every(token => combined.includes(token));
}

function pointAddressSuggestions(text, max) {
  const raw = String(text || '').trim(); if (!raw) return [];
  const numbered = raw.match(/^\s*(\d{1,6})([a-zA-Z])?(?:\s+(1\/2|1\/4))?\s+(.+?)\s*$/);
  const number = numbered ? +numbered[1] : null, suffix = numbered ? String(numbered[2] || numbered[3] || '').toUpperCase() : '';
  const rest = numbered ? numbered[4] : raw;
  const comma = rest.lastIndexOf(','), streetInput = normalizeAddressText(comma >= 0 ? rest.slice(0, comma) : rest), placeInput = comma >= 0 ? normalizeAddressText(rest.slice(comma + 1)) : '';
  const tokens = normalizeAddressText(rest).split(' ').filter(Boolean), ranked = [];
  for (const option of POINT_PAIR_OPTIONS) {
    if (!pairMatches(option, streetInput, placeInput, tokens, comma >= 0)) continue;
    let score = 10;
    if (option.streetNorm === streetInput) score -= 6;
    else if (streetInput && option.streetNorm.startsWith(streetInput)) score -= 4;
    if (placeInput && option.placeNorm === placeInput) score -= 3;
    else if (placeInput && option.placeNorm.startsWith(placeInput)) score -= 2;
    if (number != null) {
      const recordIndex = pointPairRecordIndex(option, number, suffix);
      if (recordIndex < 0) continue;
      ranked.push([score, exactResult(option, recordIndex).label]);
    } else ranked.push([score, `${POINT_STREETS[option.streetId]}, ${POINT_PLACES[option.placeId]}`]);
  }
  ranked.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  const output = [], seen = new Set();
  for (const [, label] of ranked) if (!seen.has(label)) { seen.add(label); output.push(label); if (output.length >= max) break; }
  return output;
}

function rangeAddressSuggestions(text, max) {
  const raw = String(text || '').trim(), match = raw.match(/^\s*(\d{1,6})([a-zA-Z])?\s+(.+?)\s*$/); if (!match) return [];
  const number = +match[1], suffix = String(match[2] || '').toUpperCase(), rest = match[3];
  const comma = rest.lastIndexOf(','), streetInput = normalizeAddressText(comma >= 0 ? rest.slice(0, comma) : rest), placeInput = comma >= 0 ? normalizeAddressText(rest.slice(comma + 1)) : '';
  const tokens = normalizeAddressText(rest).split(' ').filter(Boolean), ranked = [];
  for (const option of ADDRESS_PAIR_OPTIONS) {
    if (!option.streetNorm || option.streetNorm === 'none' || !pairMatches(option, streetInput, placeInput, tokens, comma >= 0)) continue;
    let score = 20;
    if (option.streetNorm === streetInput) score -= 6; else if (streetInput && option.streetNorm.startsWith(streetInput)) score -= 4;
    if (placeInput && option.placeNorm === placeInput) score -= 3; else if (placeInput && option.placeNorm.startsWith(placeInput)) score -= 2;
    ranked.push([score, `${number}${suffix} ${ADDRESS_STREETS[option.streetId]}, ${ADDRESS_PLACES[option.placeId]}`]);
  }
  ranked.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  return ranked.slice(0, max).map(item => item[1]);
}

function addressSuggestions(text, max = 6) {
  const output = [], seen = new Set();
  for (const label of [...pointAddressSuggestions(text, max), ...rangeAddressSuggestions(text, max)]) {
    if (!seen.has(label)) { seen.add(label); output.push(label); if (output.length >= max) break; }
  }
  return output;
}

function streetNameForEdge(edgeId) {
  if (ADDRESS_EDGE_STREET_LABEL[edgeId]) return ADDRESS_EDGE_STREET_LABEL[edgeId];
  const id = ADDRESS_EDGE_STREET_ID[edgeId];
  return id >= 0 ? ADDRESS_STREETS[id] : '';
}

window.resolveAddress = resolveAddress;
window.isAddressQuery = isAddressQuery;
window.addressCoverageText = addressCoverageText;
window.addressSuggestions = addressSuggestions;
window.streetNameForEdge = streetNameForEdge;
window.addressDataQuality = ADDRESS_POINT_META.quality || null;
