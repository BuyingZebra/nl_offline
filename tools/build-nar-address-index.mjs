#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createRuntime, evaluate } from '../tests/runtime-harness.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [locationsPath, addressesPath, outputArg = 'addresspoints.js'] = process.argv.slice(2);

if (!locationsPath || !addressesPath) {
  console.error('Usage: node tools/build-nar-address-index.mjs Location_10.csv Address_10.csv [output.js]');
  process.exit(1);
}

const outputPath = path.resolve(projectRoot, outputArg);
const runtime = createRuntime({ addresses: true, addressPoints: false });
const data = runtime.NL_DATA;
const communities = Array.from(data.communities || []);
const legacyEdgeNames = Array.from(evaluate(runtime, `Array.from({ length: DATA.edges.length }, (_, edgeId) => streetNameForEdge(edgeId))`));

function normalize(text) {
  return String(text || '')
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

function parseCsvLine(line) {
  const values = [];
  let value = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') { value += '"'; i++; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { values.push(value); value = ''; }
    else value += char;
  }
  values.push(value);
  return values;
}

async function readCsv(file, onRow) {
  const input = fs.createReadStream(file, { encoding: 'utf8' });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let headers = null;
  for await (let line of lines) {
    if (!headers) {
      line = line.replace(/^\uFEFF/, '');
      headers = parseCsvLine(line);
      continue;
    }
    if (!line) continue;
    const values = parseCsvLine(line);
    const row = {};
    for (let i = 0; i < headers.length; i++) row[headers[i]] = values[i] || '';
    await onRow(row);
  }
}

function titleCase(value) {
  return String(value || '').toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, lead, letter) => lead + letter.toUpperCase())
    .replace(/\bSt\b/g, 'St.').replace(/\bNl\b/g, 'NL');
}

const streetTypes = Object.freeze({
  ST: 'Street', RD: 'Road', DR: 'Drive', AVE: 'Avenue', AV: 'Avenue', PL: 'Place', PLACE: 'Place',
  CRES: 'Crescent', LANE: 'Lane', HWY: 'Highway', LINE: 'Line', HTS: 'Heights', BLVD: 'Boulevard',
  HILL: 'Hill', CRT: 'Court', EXTEN: 'Extension', TERR: 'Terrace', PATH: 'Path', CLOSE: 'Close', LOOP: 'Loop',
  SQ: 'Square', PK: 'Park', ESTATE: 'Estate', WAY: 'Way', RUN: 'Run', CIR: 'Circle', ROW: 'Row', PT: 'Point',
  RIDGE: 'Ridge', TRAIL: 'Trail', TURN: 'Turn', GDNS: 'Gardens', ACRES: 'Acres', COVE: 'Cove',
  LANDNG: 'Landing', MEADOW: 'Meadow', SUBDIV: 'Subdivision', DRUNG: 'Drung', WOODS: 'Woods', FIELD: 'Field',
  GROVE: 'Grove', CRSSNG: 'Crossing', BEND: 'Bend', RTE: 'Route', END: 'End', LKOUT: 'Lookout', VIEW: 'View',
  HOLLOW: 'Hollow', RISE: 'Rise', PLAZA: 'Plaza', RG: 'Range', BROOK: 'Brook', BEACH: 'Beach', LMTS: 'Limits',
  CDS: 'Cul-de-sac', GLEN: 'Glen', TRNPKE: 'Turnpike', FWY: 'Freeway', GRNDS: 'Grounds', CRNRS: 'Corners',
  VILLGE: 'Village', SIDERD: 'Side Road', ISLAND: 'Island', MEWS: 'Mews',
});

function streetLabel(row) {
  const name = String(row.OFFICIAL_STREET_NAME || row.MAIL_STREET_NAME || '').trim();
  if (!name) return '';
  const typeRaw = String(row.OFFICIAL_STREET_TYPE || row.MAIL_STREET_TYPE || '').trim().toUpperCase();
  const direction = String(row.OFFICIAL_STREET_DIR || row.MAIL_STREET_DIR || '').trim().toUpperCase();
  const type = streetTypes[typeRaw] || (typeRaw ? titleCase(typeRaw) : '');
  return [name, type, direction].filter(Boolean).join(' ');
}

const communityByNorm = new Map();
for (const label of communities) {
  const key = normalize(label);
  if (!communityByNorm.has(key)) communityByNorm.set(key, label);
}

function officialCommunity(value) {
  return communityByNorm.get(normalize(value)) || null;
}

function isGenericCsd(value) {
  return !value || /^division no\./i.test(String(value).trim()) || /\bsubd\./i.test(String(value));
}

function displayPlace(row) {
  const mail = String(row.MAIL_MUN_NAME || '').trim();
  const csd = String(row.CSD_ENG_NAME || '').trim();
  return officialCommunity(mail) || officialCommunity(csd) || (isGenericCsd(csd) && mail ? titleCase(mail) : csd || titleCase(mail));
}

const locations = new Map();
await readCsv(locationsPath, row => {
  const lat = Number(row.BG_LATITUDE || row.BF_REPPOINT_LATITUDE);
  const lon = Number(row.BG_LONGITUDE || row.BF_REPPOINT_LONGITUDE);
  if (row.LOC_GUID && Number.isFinite(lat) && Number.isFinite(lon) && lat >= 46 && lat <= 57 && lon >= -68 && lon <= -52)
    locations.set(row.LOC_GUID, [lon, lat]);
});
console.log(`Loaded ${locations.size.toLocaleString()} georeferenced NL locations`);

const cellSize = 0.025;
const grid = new Map();
const nodeGrid = new Map();
const edgeStreetNorm = legacyEdgeNames.map(normalize);

function cellKey(x, y) { return `${x}|${y}`; }
function cellX(lon) { return Math.floor((lon + 68) / cellSize); }
function cellY(lat) { return Math.floor((lat - 46) / cellSize); }

let segmentId = 0;
for (let edgeId = 0; edgeId < data.edges.length; edgeId++) {
  const edge = data.edges[edgeId];
  if ((edge[4] || 'road') !== 'road') continue;
  const coords = edge[3] || [];
  for (let segment = 1; segment < coords.length; segment++) {
    const a = coords[segment - 1], b = coords[segment];
    const minX = cellX(Math.min(a[0], b[0])), maxX = cellX(Math.max(a[0], b[0]));
    const minY = cellY(Math.min(a[1], b[1])), maxY = cellY(Math.max(a[1], b[1]));
    const item = { id: segmentId++, edgeId, a, b };
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
      const key = cellKey(x, y);
      let bucket = grid.get(key);
      if (!bucket) grid.set(key, bucket = []);
      bucket.push(item);
    }
  }
}
for (let node = 0; node < data.nodes.length; node++) {
  const point = data.nodes[node], key = cellKey(cellX(point[0]), cellY(point[1]));
  let bucket = nodeGrid.get(key);
  if (!bucket) nodeGrid.set(key, bucket = []);
  bucket.push(node);
}
console.log(`Indexed ${data.edges.length.toLocaleString()} graph edges into ${grid.size.toLocaleString()} spatial cells`);

function projectSegment(a, b, point) {
  const lat = point[1], scaleLon = 111.32 * Math.cos(lat * Math.PI / 180);
  const ax = a[0] * scaleLon, ay = a[1] * 111.32;
  const bx = b[0] * scaleLon, by = b[1] * 111.32;
  const px = point[0] * scaleLon, py = point[1] * 111.32;
  const vx = bx - ax, vy = by - ay, length2 = vx * vx + vy * vy;
  const t = Math.max(0, Math.min(1, length2 ? ((px - ax) * vx + (py - ay) * vy) / length2 : 0));
  const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const dx = (point[0] - q[0]) * scaleLon, dy = (point[1] - q[1]) * 111.32;
  return { point: q, distanceKm: Math.hypot(dx, dy) };
}

function nearestRoad(point, streetNorm) {
  const x0 = cellX(point[0]), y0 = cellY(point[1]);
  const candidates = [], seen = new Set();
  const collect = radius => {
    for (let x = x0 - radius; x <= x0 + radius; x++) for (let y = y0 - radius; y <= y0 + radius; y++) {
      if (radius > 1 && x !== x0 - radius && x !== x0 + radius && y !== y0 - radius && y !== y0 + radius) continue;
      for (const segment of grid.get(cellKey(x, y)) || []) if (!seen.has(segment.id)) { seen.add(segment.id); candidates.push(segment); }
    }
  };
  collect(1);
  for (let radius = 2; radius <= 12 && !candidates.length; radius++) collect(radius);
  let same = null, unnamed = null, any = null;
  for (const segment of candidates) {
    const projected = projectSegment(segment.a, segment.b, point);
    const result = { ...projected, edgeId: segment.edgeId };
    if (!any || result.distanceKm < any.distanceKm) any = result;
    const edgeName = edgeStreetNorm[segment.edgeId];
    if (edgeName && edgeName === streetNorm && (!same || result.distanceKm < same.distanceKm)) same = result;
    if (!edgeName && (!unnamed || result.distanceKm < unnamed.distanceKm)) unnamed = result;
  }
  if (same && same.distanceKm <= 0.4) return same;
  if (unnamed && unnamed.distanceKm <= 0.2 && (!any || unnamed.distanceKm <= any.distanceKm + 0.075)) return unnamed;
  return any;
}

function pointDistanceKm(a, b) {
  const scaleLon = 111.32 * Math.cos((a[1] + b[1]) * Math.PI / 360);
  return Math.hypot((a[0] - b[0]) * scaleLon, (a[1] - b[1]) * 111.32);
}

function nearestNode(point) {
  const x0 = cellX(point[0]), y0 = cellY(point[1]);
  let candidates = [];
  for (let radius = 0; radius <= 80 && !candidates.length; radius++) {
    for (let x = x0 - radius; x <= x0 + radius; x++) for (let y = y0 - radius; y <= y0 + radius; y++) {
      if (radius && x !== x0 - radius && x !== x0 + radius && y !== y0 - radius && y !== y0 + radius) continue;
      candidates.push(...(nodeGrid.get(cellKey(x, y)) || []));
    }
  }
  let bestNode = 65535, bestDistance = Infinity;
  for (const node of candidates) {
    const distance = pointDistanceKm(point, data.nodes[node]);
    if (distance < bestDistance) { bestNode = node; bestDistance = distance; }
  }
  return bestNode;
}

const rawRecords = [];
const aliasesByPlace = new Map();
const dedupe = new Set();
const quality = { sourceRows: 0, missingLocation: 0, invalidNumber: 0, invalidStreetOrPlace: 0, duplicateUnits: 0, distantRoad: 0 };

await readCsv(addressesPath, row => {
  quality.sourceRows++;
  const number = Number(row.CIVIC_NO);
  if (!Number.isInteger(number) || number < 1 || number > 65535) { quality.invalidNumber++; return; }
  const location = locations.get(row.LOC_GUID);
  if (!location) { quality.missingLocation++; return; }
  const street = streetLabel(row), place = displayPlace(row);
  if (!street || !place) { quality.invalidStreetOrPlace++; return; }
  const suffix = String(row.CIVIC_NO_SUFFIX || '').trim().toUpperCase();
  const streetNorm = normalize(street), placeNorm = normalize(place);
  const key = `${streetNorm}|${placeNorm}|${number}|${suffix}`;
  if (dedupe.has(key)) { quality.duplicateUnits++; return; }
  dedupe.add(key);
  const aliases = aliasesByPlace.get(place) || new Set([placeNorm]);
  for (const alias of [row.CSD_ENG_NAME, row.MAIL_MUN_NAME]) {
    const normalized = normalize(alias);
    if (normalized) aliases.add(normalized);
  }
  aliasesByPlace.set(place, aliases);
  const road = nearestRoad(location, streetNorm);
  if (!road || road.distanceKm > 2) quality.distantRoad++;
  const edgeId = road && road.distanceKm <= 2 ? road.edgeId : 65535;
  const edge = edgeId !== 65535 ? data.edges[edgeId] : null;
  const point = edge ? road.point : location;
  const fallbackNode = edge
    ? (pointDistanceKm(point, data.nodes[edge[0]]) <= pointDistanceKm(point, data.nodes[edge[1]]) ? edge[0] : edge[1])
    : road
      ? (pointDistanceKm(point, data.nodes[data.edges[road.edgeId][0]]) <= pointDistanceKm(point, data.nodes[data.edges[road.edgeId][1]]) ? data.edges[road.edgeId][0] : data.edges[road.edgeId][1])
      : nearestNode(point);
  rawRecords.push({ street, streetNorm, place, placeNorm, number, suffix, edgeId, fallbackNode, point, roadDistanceKm: road?.distanceKm ?? Infinity });
});

const streets = [...new Set(rawRecords.map(record => record.street))].sort((a, b) => a.localeCompare(b));
const places = [...new Set(rawRecords.map(record => record.place))].sort((a, b) => a.localeCompare(b));
const suffixes = [...new Set(rawRecords.map(record => record.suffix))].sort((a, b) => a.localeCompare(b));
const streetId = new Map(streets.map((value, index) => [value, index]));
const placeId = new Map(places.map((value, index) => [value, index]));
const suffixId = new Map(suffixes.map((value, index) => [value, index]));

rawRecords.sort((a, b) => streetId.get(a.street) - streetId.get(b.street) || placeId.get(a.place) - placeId.get(b.place) || a.number - b.number || suffixId.get(a.suffix) - suffixId.get(b.suffix));

const pairs = [];
for (let start = 0; start < rawRecords.length;) {
  const record = rawRecords[start], sid = streetId.get(record.street), pid = placeId.get(record.place);
  let end = start + 1;
  while (end < rawRecords.length && streetId.get(rawRecords[end].street) === sid && placeId.get(rawRecords[end].place) === pid) end++;
  pairs.push({ streetId: sid, placeId: pid, start, count: end - start });
  start = end;
}

const BASE_LON = -68, BASE_LAT = 46, COORDINATE_SCALE = 100000, RECORD_BYTES = 14, PAIR_BYTES = 12;
const recordsBuffer = Buffer.alloc(rawRecords.length * RECORD_BYTES);
function writeUint24(buffer, offset, value) {
  buffer[offset] = value & 255; buffer[offset + 1] = (value >>> 8) & 255; buffer[offset + 2] = (value >>> 16) & 255;
}
for (let index = 0; index < rawRecords.length; index++) {
  const record = rawRecords[index], offset = index * RECORD_BYTES;
  recordsBuffer.writeUInt16LE(record.number, offset);
  recordsBuffer.writeUInt8(suffixId.get(record.suffix), offset + 2);
  recordsBuffer.writeUInt8(record.edgeId === 65535 ? 1 : 0, offset + 3);
  recordsBuffer.writeUInt16LE(record.edgeId, offset + 4);
  recordsBuffer.writeUInt16LE(record.fallbackNode, offset + 6);
  writeUint24(recordsBuffer, offset + 8, Math.round((record.point[0] - BASE_LON) * COORDINATE_SCALE));
  writeUint24(recordsBuffer, offset + 11, Math.round((record.point[1] - BASE_LAT) * COORDINATE_SCALE));
}

const pairsBuffer = Buffer.alloc(pairs.length * PAIR_BYTES);
for (let index = 0; index < pairs.length; index++) {
  const pair = pairs[index], offset = index * PAIR_BYTES;
  pairsBuffer.writeUInt16LE(pair.streetId, offset);
  pairsBuffer.writeUInt16LE(pair.placeId, offset + 2);
  pairsBuffer.writeUInt32LE(pair.start, offset + 4);
  pairsBuffer.writeUInt32LE(pair.count, offset + 8);
}

const aliases = {};
for (const [place, values] of aliasesByPlace) {
  const id = placeId.get(place);
  if (id == null) continue;
  for (const alias of values) {
    if (!aliases[alias]) aliases[alias] = [];
    if (!aliases[alias].includes(id)) aliases[alias].push(id);
  }
}
for (const ids of Object.values(aliases)) ids.sort((a, b) => a - b);

const edgeVotes = new Map();
for (const record of rawRecords) {
  if (record.edgeId === 65535) continue;
  let votes = edgeVotes.get(record.edgeId);
  if (!votes) edgeVotes.set(record.edgeId, votes = new Map());
  const sid = streetId.get(record.street);
  votes.set(sid, (votes.get(sid) || 0) + 1);
}
const edgeNames = [];
for (const [edgeId, votes] of edgeVotes) {
  let bestStreet = -1, bestCount = -1;
  for (const [sid, count] of votes) if (count > bestCount) { bestStreet = sid; bestCount = count; }
  edgeNames.push([edgeId, bestStreet]);
}
edgeNames.sort((a, b) => a[0] - b[0]);
const edgeNameBuffer = Buffer.alloc(edgeNames.length * 4);
for (let i = 0; i < edgeNames.length; i++) { edgeNameBuffer.writeUInt16LE(edgeNames[i][0], i * 4); edgeNameBuffer.writeUInt16LE(edgeNames[i][1], i * 4 + 2); }

const distances = rawRecords.map(record => record.roadDistanceKm).filter(Number.isFinite).sort((a, b) => a - b);
const percentile = fraction => distances[Math.min(distances.length - 1, Math.floor(distances.length * fraction))] || 0;
const meta = {
  version: '0.19.0-nar-address-points',
  source: 'Statistics Canada National Address Register',
  referenceDate: 'June 2026',
  province: 'Newfoundland and Labrador',
  recordCount: rawRecords.length,
  streetCount: streets.length,
  placeCount: places.length,
  pairCount: pairs.length,
  edgeNameCount: edgeNames.length,
  recordBytes: RECORD_BYTES,
  pairBytes: PAIR_BYTES,
  baseLon: BASE_LON,
  baseLat: BASE_LAT,
  coordinateScale: COORDINATE_SCALE,
  streets,
  places,
  suffixes,
  aliases,
  pairsB64: pairsBuffer.toString('base64'),
  recordsB64: recordsBuffer.toString('base64'),
  edgeNamesB64: edgeNameBuffer.toString('base64'),
  quality: {
    ...quality,
    exactAddressRecords: rawRecords.length,
    snappedToRoad: rawRecords.filter(record => record.edgeId !== 65535).length,
    fallbackPoints: rawRecords.filter(record => record.edgeId === 65535).length,
    medianRoadDistanceM: Math.round(percentile(0.5) * 1000),
    p95RoadDistanceM: Math.round(percentile(0.95) * 1000),
  },
};

fs.writeFileSync(outputPath, `// Generated from Statistics Canada NAR June 2026. Do not edit by hand.\nwindow.NL_ADDRESS_POINTS=${JSON.stringify(meta)};\n`);
console.log(JSON.stringify({
  output: outputPath,
  bytes: fs.statSync(outputPath).size,
  records: rawRecords.length,
  streets: streets.length,
  places: places.length,
  pairs: pairs.length,
  quality: meta.quality,
}, null, 2));
