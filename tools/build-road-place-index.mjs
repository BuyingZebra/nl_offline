#!/usr/bin/env node

// Derive a compact street/locality index from the NAR build without shipping
// individual civic numbers or address coordinates in the road-navigation MVP.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceFile = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'addresspoints.js');
const outputFile = process.argv[3] ? path.resolve(process.argv[3]) : path.join(root, 'roadindex.js');
const sandbox = { window: {}, atob };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(sourceFile, 'utf8'), sandbox, { filename: sourceFile });

const source = sandbox.NL_ADDRESS_POINTS;
if (!source?.pairsB64 || !source?.recordsB64) throw new Error('NAR address-point package is unavailable');

function base64View(value) {
  const binary = atob(value), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new DataView(bytes.buffer);
}

const pairView = base64View(source.pairsB64);
const recordView = base64View(source.recordsB64);
const edgeNameView = base64View(source.edgeNamesB64 || '');
const pairBytes = source.pairBytes || 12;
const recordBytes = source.recordBytes || 14;
const pairs = [];
let mappedPairCount = 0;
let pairEdgeLinks = 0;

for (let pairIndex = 0; pairIndex < source.pairCount; pairIndex++) {
  const offset = pairIndex * pairBytes;
  const streetId = pairView.getUint16(offset, true);
  const placeId = pairView.getUint16(offset + 2, true);
  const start = pairView.getUint32(offset + 4, true);
  const count = pairView.getUint32(offset + 8, true);
  const edges = new Set(), fallbackNodes = new Set();
  for (let recordIndex = start; recordIndex < start + count; recordIndex++) {
    const recordOffset = recordIndex * recordBytes;
    const edgeId = recordView.getUint16(recordOffset + 4, true);
    const fallbackNode = recordView.getUint16(recordOffset + 6, true);
    if (edgeId !== 65535) edges.add(edgeId);
    else if (fallbackNode !== 65535) fallbackNodes.add(fallbackNode);
  }
  const edgeIds = [...edges].sort((a, b) => a - b);
  const nodeIds = edgeIds.length ? [] : [...fallbackNodes].sort((a, b) => a - b);
  if (edgeIds.length || nodeIds.length) mappedPairCount++;
  pairEdgeLinks += edgeIds.length;
  pairs.push(nodeIds.length ? [streetId, placeId, edgeIds, nodeIds] : [streetId, placeId, edgeIds]);
}

const edgeNames = [];
for (let offset = 0; offset + 3 < edgeNameView.byteLength; offset += 4)
  edgeNames.push([edgeNameView.getUint16(offset, true), edgeNameView.getUint16(offset + 2, true)]);

const output = {
  version: '0.22.0-road-place-index',
  source: `${source.source}; civic numbers and address coordinates intentionally excluded`,
  referenceDate: source.referenceDate,
  streets: source.streets,
  places: source.places,
  aliases: source.aliases || {},
  pairs,
  edgeNames,
  quality: {
    roadPlacePairs: pairs.length,
    mappedRoadPlacePairs: mappedPairCount,
    pairEdgeLinks,
    namedRoadEdges: edgeNames.length,
    civicRecordsExcluded: source.recordCount || 0,
  },
};

fs.writeFileSync(outputFile, `window.NL_ROAD_INDEX=${JSON.stringify(output)};\n`);
console.log(JSON.stringify({ outputFile, bytes: fs.statSync(outputFile).size, ...output.quality }, null, 2));
