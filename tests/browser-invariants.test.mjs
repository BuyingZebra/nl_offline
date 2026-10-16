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
function fnv1a(text){
 let h=2166136261;
 for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);
 return (h>>>0).toString(16).padStart(8,'0');
}

test('browser script parses without third-party build steps',()=>{
 assert.ok(js,'inline browser program exists');
 assert.doesNotThrow(()=>new Script(js,{filename:'index.html'}));
});
test('visual styles remain byte-identical to approved v0.26',()=>{
 assert.equal(fnv1a(style),'347f62f1');
});
test('DOM and control layout remain byte-identical to approved v0.26',()=>{
 assert.equal(fnv1a(shell),'65a1e34d');
});
test('gesture and map geometry settings remain enabled',()=>{
 for(const key of ['renderWorldCopies:true','touchPitch:true','touchZoomRotate:true',
                    'dragRotate:false','maxPitch:60'])assert.ok(js.includes(key),key);
 assert.match(js,/m\.on\('move',updateReadout\)/);
 assert.doesNotMatch(js,/\bautoPitchForZoom\b|\bmoveToPerspective\b/);
});
test('console reports genuine map state instead of a fake terminal',()=>{
 assert.ok(js.includes('const consoleHistory=[]'));
 assert.ok(js.includes("'VECTOR DATA / ONLINE'"));
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

test('release version is displayed beside CONSOLE without changing status messages',()=>{
 assert.match(js,/const APP_VERSION='0\.30';/);
 assert.match(js,/\$\('consolePrefix'\)\.textContent='CONSOLE v'\+APP_VERSION\+':'/);
 assert.match(js,/\$\('statusMessage'\)\.textContent='> \['\+entry\.channel\+'\] '\+entry\.message/);
});
