// NL Offline v0.18 — compact offline civic-address resolver and suggestion index.
// Source: civic address ranges embedded in the Newfoundland & Labrador National Road Network.
// These are range/interpolation estimates, not exact building/entrance points.

const ADDRESS_META = window.NL_ADDRESS_META || {};
const ADDRESS_STREETS = ADDRESS_META.streets || [];
const ADDRESS_PLACES = ADDRESS_META.places || [];
const ADDRESS_RECORD_BYTES = ADDRESS_META.recordBytes || 14;

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

function decodeAddressRecords() {
  const count = ADDRESS_META.recordCount || 0;
  const out = new Array(count);
  if (!ADDRESS_META.recordsB64 || !count) return out.fill(null);
  const bin = atob(ADDRESS_META.recordsB64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const dv = new DataView(bytes.buffer);
  for (let i = 0; i < count; i++) {
    const o = i * ADDRESS_RECORD_BYTES;
    out[i] = {
      streetId: dv.getUint16(o, true), placeId: dv.getUint16(o + 2, true),
      from: dv.getUint16(o + 4, true), to: dv.getUint16(o + 6, true),
      edgeId: dv.getUint16(o + 8, true), fallbackNode: dv.getUint16(o + 10, true),
      flags: dv.getUint8(o + 12),
    };
  }
  return out;
}

const ADDRESS_RECORDS = decodeAddressRecords();
const ADDRESS_LOOKUP = new Map();
const ADDRESS_PAIR_OPTIONS = [];
const ADDRESS_EDGE_STREET_ID = new Int32Array(DATA.edges.length); ADDRESS_EDGE_STREET_ID.fill(-1);
const ADDRESS_PLACE_NORM = ADDRESS_PLACES.map(normalizeAddressText);
const ADDRESS_PLACE_BY_NORM = new Map(ADDRESS_PLACE_NORM.map((p, i) => [p, i]));
const ADDRESS_STREET_NORM = ADDRESS_STREETS.map(normalizeAddressText);

function addressPlaceId(placeRaw, placeNorm) {
  let id = ADDRESS_PLACE_BY_NORM.get(placeNorm);
  if (id != null) return id;
  const paren = String(placeRaw || '').match(/\(([^)]+)\)/);
  if (paren) { id = ADDRESS_PLACE_BY_NORM.get(normalizeAddressText(paren[1])); if (id != null) return id; }
  // Accept an official community label that embeds the broader municipality name,
  // e.g. "Upper Gullies (Conception Bay South)".
  let best = -1, bestLen = 0;
  for (let i = 0; i < ADDRESS_PLACE_NORM.length; i++) {
    const p = ADDRESS_PLACE_NORM[i]; if (!p || p.length < 6) continue;
    if (placeNorm.includes(p) || p.includes(placeNorm)) { if (p.length > bestLen) { best = i; bestLen = p.length; } }
  }
  return best >= 0 ? best : null;
}

for (let i = 0; i < ADDRESS_RECORDS.length; i++) {
  const r = ADDRESS_RECORDS[i]; if (!r) continue;
  const key = `${ADDRESS_STREET_NORM[r.streetId]}|${ADDRESS_PLACE_NORM[r.placeId]}`;
  let a = ADDRESS_LOOKUP.get(key);
  if (!a) { ADDRESS_LOOKUP.set(key, a = []); ADDRESS_PAIR_OPTIONS.push({ key, streetId: r.streetId, placeId: r.placeId, streetNorm: ADDRESS_STREET_NORM[r.streetId], placeNorm: ADDRESS_PLACE_NORM[r.placeId] }); }
  a.push(i);
  if (r.edgeId !== 65535 && r.edgeId < ADDRESS_EDGE_STREET_ID.length && ADDRESS_EDGE_STREET_ID[r.edgeId] < 0) ADDRESS_EDGE_STREET_ID[r.edgeId] = r.streetId;
}

function addressCoverageText() {
  return `${(ADDRESS_META.recordCount || 0).toLocaleString()} civic-range sides · ${(ADDRESS_META.segmentCount || 0).toLocaleString()} address-bearing road segments · ${ADDRESS_PLACES.length} places`;
}

function parseAddressQuery(text) {
  const raw = String(text || '').trim();
  const m = raw.match(/^\s*(\d{1,5})([a-zA-Z]?)\s+(.+?)\s*$/);
  if (!m) return null;
  const number = +m[1], suffix = (m[2] || '').toUpperCase();
  let rest = m[3].trim(), street = '', place = '';
  if (rest.includes(',')) {
    const parts = rest.split(','); place = parts.pop().trim(); street = parts.join(',').trim();
  } else {
    const nr = normalizeAddressText(rest);
    // Prefer the longest known municipality/place suffix.
    let best = null;
    for (let i = 0; i < ADDRESS_PLACE_NORM.length; i++) {
      const p = ADDRESS_PLACE_NORM[i]; if (!p) continue;
      if (nr === p || nr.endsWith(` ${p}`)) {
        if (!best || p.length > best.norm.length) best = { id: i, norm: p, label: ADDRESS_PLACES[i] };
      }
    }
    if (best) {
      place = best.label;
      // Work from the normalized suffix instead of the display spelling so inputs such as
      // “100 Topsail Rd St John's” still match the official “St. John's” label.
      street = nr === best.norm ? '' : nr.slice(0, Math.max(0, nr.length - best.norm.length)).trim();
    }
  }
  if (!number || !street || !place) return null;
  return { raw, number, suffix, street, place, streetNorm: normalizeAddressText(street), placeNorm: normalizeAddressText(place) };
}

function recordParityScore(r, number) {
  if (!r.from || !r.to) return 0;
  if ((r.from & 1) === (r.to & 1)) return (number & 1) === (r.from & 1) ? 0 : 0.75;
  return 0;
}
function rangeGap(r, number) {
  const lo = Math.min(r.from, r.to), hi = Math.max(r.from, r.to);
  return number < lo ? lo - number : number > hi ? number - hi : 0;
}
function addressFraction(r, number) {
  if (!r.from || !r.to || r.from === r.to) return .5;
  let t = (number - r.from) / (r.to - r.from);
  t = Math.max(0, Math.min(1, t));
  if (r.flags & 1) t = 1 - t; // compact graph edge runs opposite the original NRN segment
  return t;
}
function pointAlongPolyline(coords, fraction) {
  if (!coords?.length) return null; if (coords.length === 1) return [coords[0][0], coords[0][1]];
  const cum = [0]; let total = 0;
  for (let i = 1; i < coords.length; i++) { total += kmBetween(coords[i - 1], coords[i]); cum.push(total); }
  if (total <= 1e-9) return [coords[0][0], coords[0][1]];
  const target = total * Math.max(0, Math.min(1, fraction)); let i = 1;
  while (i < cum.length && cum[i] < target) i++;
  if (i >= cum.length) return [coords.at(-1)[0], coords.at(-1)[1]];
  const a = coords[i - 1], b = coords[i], span = Math.max(1e-9, cum[i] - cum[i - 1]), t = (target - cum[i - 1]) / span;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function closestAddressNode(r, point) {
  if (r.edgeId !== 65535 && DATA.edges[r.edgeId]) {
    const e = DATA.edges[r.edgeId], a = DATA.nodes[e[0]], b = DATA.nodes[e[1]];
    return kmBetween(point, a) <= kmBetween(point, b) ? e[0] : e[1];
  }
  return r.fallbackNode;
}

function resolveAddress(text) {
  const q = parseAddressQuery(text); if (!q) return null;
  const placeId = addressPlaceId(q.place, q.placeNorm); if (placeId == null) return null;
  const resolvedPlaceNorm = ADDRESS_PLACE_NORM[placeId];
  const key = `${q.streetNorm}|${resolvedPlaceNorm}`, ids = ADDRESS_LOOKUP.get(key); if (!ids?.length) return null;
  let best = null;
  for (const ri of ids) {
    const r = ADDRESS_RECORDS[ri];
    const gap = rangeGap(r, q.number), parity = recordParityScore(r, q.number), span = Math.abs(r.to - r.from);
    const score = gap * 10 + parity + Math.min(span, 9999) / 100000;
    if (!best || score < best.score) best = { r, ri, score, gap };
  }
  if (!best) return null;
  // A very distant number is likely a typo or the wrong municipality rather than a useful range estimate.
  if (best.gap > 300) return null;
  const r = best.r, fraction = addressFraction(r, q.number);
  let point = null;
  if (r.edgeId !== 65535 && DATA.edges[r.edgeId]) point = pointAlongPolyline(DATA.edges[r.edgeId][3], fraction);
  if (!point && DATA.nodes[r.fallbackNode]) point = [DATA.nodes[r.fallbackNode][0], DATA.nodes[r.fallbackNode][1]];
  if (!point) return null;
  const node = closestAddressNode(r, point), inRange = best.gap === 0;
  return {
    kind: 'address', number: q.number, suffix: q.suffix, street: ADDRESS_STREETS[r.streetId], place: ADDRESS_PLACES[r.placeId],
    label: `${q.number}${q.suffix ? q.suffix : ''} ${ADDRESS_STREETS[r.streetId]}, ${ADDRESS_PLACES[r.placeId]}`,
    edgeId: r.edgeId, node, point, fraction, approximate: true,
    confidence: inRange ? 'range' : 'near-range', gap: best.gap,
    source: 'NRN civic address range',
  };
}

function isAddressQuery(text) { return !!parseAddressQuery(text); }
function addressSuggestions(text, max = 4) {
  const raw = String(text || '').trim(), match = raw.match(/^\s*(\d{1,5})([a-zA-Z]?)\s+(.+?)\s*$/); if (!match) return [];
  const number = +match[1], suffix = (match[2] || '').toUpperCase(), rest = match[3];
  const comma = rest.lastIndexOf(','), streetInput = normalizeAddressText(comma >= 0 ? rest.slice(0, comma) : rest), placeInput = comma >= 0 ? normalizeAddressText(rest.slice(comma + 1)) : '';
  const tokens = normalizeAddressText(rest).split(' ').filter(Boolean), ranked = [];
  for (const option of ADDRESS_PAIR_OPTIONS) {
    if (!option.streetNorm || option.streetNorm === 'none') continue;
    const combined = `${option.streetNorm} ${option.placeNorm}`;
    if (comma >= 0) {
      if (streetInput && !option.streetNorm.includes(streetInput) && !streetInput.includes(option.streetNorm)) continue;
      if (placeInput && !option.placeNorm.includes(placeInput) && !placeInput.includes(option.placeNorm)) continue;
    } else if (!tokens.every(token => combined.includes(token))) continue;
    let score = 10;
    if (option.streetNorm === streetInput) score -= 6;
    else if (streetInput && option.streetNorm.startsWith(streetInput)) score -= 4;
    if (placeInput && option.placeNorm === placeInput) score -= 3;
    else if (placeInput && option.placeNorm.startsWith(placeInput)) score -= 2;
    score += Math.abs(combined.length - normalizeAddressText(rest).length) / 1000;
    ranked.push([score, `${number}${suffix} ${ADDRESS_STREETS[option.streetId]}, ${ADDRESS_PLACES[option.placeId]}`]);
  }
  ranked.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  const out = [], seen = new Set();
  for (const [, label] of ranked) { if (!seen.has(label)) { seen.add(label); out.push(label); if (out.length >= max) break; } }
  return out;
}
function streetNameForEdge(edgeId) { const id = ADDRESS_EDGE_STREET_ID[edgeId]; return id >= 0 ? ADDRESS_STREETS[id] : ''; }

window.resolveAddress = resolveAddress;
window.isAddressQuery = isAddressQuery;
window.addressCoverageText = addressCoverageText;
window.addressSuggestions = addressSuggestions;
window.streetNameForEdge = streetNameForEdge;
