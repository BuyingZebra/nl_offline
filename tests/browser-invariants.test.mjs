// FIELD ATLAS browser regression guards.
// Run: node --test tests/browser-invariants.test.mjs
// The presentation hashes intentionally match the archived v0.26 baseline.
// Update them only for an explicitly approved visible design change.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {Script} from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const html=readFileSync(resolve(root,'index.html'),'utf8');
const style=html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
const shell=html.slice(html.indexOf('</style>')+8,html.indexOf('<script>'));
// Compare the established v0.30 presentation after subtracting only the
// explicit v0.31 attribution and experimental protocol import.
const originalStyle=style.replace(/\/\* v0\.31 VFX experiment:[\s\S]*?(?=#mapAttribution\{)/,'').replace(
 '#mapAttribution{font-size:8px;text-align:right;margin-top:3px}\n#mapAttribution a{color:var(--weak);text-decoration:none}\n','');
const originalShell=shell.replace(
 '    <div id="mapAttribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a></div>\n','')
 .replace('<script src="./experiments/osm-phosphor-protocol.js"></script>\n','');
function fnv1a(text){
 let h=2166136261;
 for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);
 return (h>>>0).toString(16).padStart(8,'0');
}

test('browser script parses without third-party build steps',()=>{
 assert.ok(js,'inline browser program exists');
 assert.doesNotThrow(()=>new Script(js,{filename:'index.html'}));
});
test('v0.30 visual styles remain unchanged except explicit attribution',()=>{
 assert.equal(fnv1a(originalStyle),'347f62f1');
});
test('v0.30 DOM controls remain unchanged except attribution and renderer import',()=>{
 assert.equal(fnv1a(originalShell),'65a1e34d');
});
test('gesture and map geometry settings remain enabled',()=>{
 for(const key of ['renderWorldCopies:true','touchPitch:true','touchZoomRotate:true',
                    'dragRotate:false','maxPitch:60'])assert.ok(js.includes(key),key);
 assert.match(js,/m\.on\('move',updateReadout\)/);
 assert.doesNotMatch(js,/\bautoPitchForZoom\b|\bmoveToPerspective\b/);
});
test('console reports genuine map state instead of a fake terminal',()=>{
 assert.ok(js.includes('const consoleHistory=[]'));
 assert.ok(js.includes("MAP_RENDERER_NAMES[state.mapRenderer]+' / ONLINE'"));
 assert.ok(js.includes('if(consoleHistory.length>50)consoleHistory.shift()'));
});
test('geographic pin placement and persistence remain available',()=>{
 for(const marker of ["function togglePin(){","function savePin(){",
    "function cancelPinPlacement(){","function setSavedPinsGeoJSON(){",
    "localStorage.setItem('fieldAtlasPinsV02'","id:'saved-pin-points'"])
  assert.ok(js.includes(marker),marker);
});
test('the four independent gradients still retain their original boundaries',()=>{
 for(const k of ["key:'screenTop'","key:'screenBottom'",
                 "key:'mapTop'","key:'mapBottom'"])
  assert.ok(js.includes(k),k);
 assert.ok(js.includes('const MERCATOR_LIMIT=85.05112878;'));
 assert.ok(js.includes("Math.max(0,Math.min(420,g.length))"));
});
test('glow controls continue to affect MapLibre and screen UI',()=>{
 for(const marker of ["'saved-pin-glow'","const MAP_GLOW_LAYERS=",
    "const MAP_LABEL_HALOS=","--glow-strength","--glow-radius"])
  assert.ok(js.includes(marker),marker);
});

test('release version advances to v0.31 while retaining console status format',()=>{
 assert.match(js,/const APP_VERSION='0\.31';/);
 assert.match(js,/\$\('consolePrefix'\)\.textContent='CONSOLE v'\+APP_VERSION\+':'/);
 assert.match(js,/\$\('statusMessage'\)\.textContent='> \['\+entry\.channel\+'\] '\+entry\.message/);
});
