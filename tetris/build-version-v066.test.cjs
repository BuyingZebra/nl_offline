/* V066 — behavior-first tests for single-source build metadata & release safety. */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,n),'utf8');
const versionFns=new Function(read('build-version.js')
 .replace(/export const /g,'const ').replace(/export function /g,'function ')+
 '\nreturn {BUILD_META_NAME,getBuildVersion,parsePublishedBuild,shouldReloadBuild};')();
const {getBuildVersion,parsePublishedBuild,shouldReloadBuild}=versionFns;
const html=read('three-v027.html'),main=read('three-v027.js');
const documentWithVersion=v=>({querySelector:s=>s==='meta[name="tetris-build"]'&&v!==null?
 {getAttribute:attr=>attr==='content'?v:null}:null});
test('single metadata marker publishes 066 without a hard-coded JS constant',()=>{
 assert.equal((html.match(/<meta name="tetris-build" content="[0-9]{3}">/g)||[]).length,1);
 assert.equal(getBuildVersion(documentWithVersion('066')),'066');
 assert.equal(parsePublishedBuild(html),'066');
 assert.equal(versionFns.BUILD_META_NAME,'tetris-build');
 assert.ok(main.includes('const THREE_BUILD_VERSION=getBuildVersion(document);'));
 assert.ok(!/const THREE_BUILD_VERSION=['"][0-9]{3}['"]/.test(main));
});
test('footer, browser title, accessible title and debug use same runtime value',()=>{
 assert.ok(main.includes("'Version: '+THREE_BUILD_VERSION"));
 assert.ok(main.includes("document.title='NOMAD — Tetris System V'+THREE_BUILD_VERSION"));
 assert.ok(main.includes("'Tetris System — Three.js V'+THREE_BUILD_VERSION"));
 assert.ok(main.includes('version:THREE_BUILD_VERSION,createdAt:'));
 assert.ok(!/<title>[^<]*V[0-9]{3}<\/title>/.test(html));
 assert.ok(!/aria-label="Tetris System — Three.js V[0-9]{3}"/.test(html));
});
test('HTML parser is tolerant of a valid XML-style meta tag and safe on malformed input',()=>{
 assert.equal(parsePublishedBuild('<meta name="tetris-build" content="072" />'),'072');
 assert.equal(parsePublishedBuild('<META name=\'tetris-build\' content=\'070\'>'),'070');
 for(const invalid of [null,'',42,'<meta name="theme-color" content="066">',
  '<meta name="tetris-build" content="banana">',
  '<meta name="tetris-build" content="9999">']){
  assert.equal(parsePublishedBuild(invalid),null);
 }
});
test('invalid or missing initial metadata is explicit, not a silent wrong version',()=>{
 for(const value of [null,'','66','0999','v066',' 066 ']){
  assert.throws(()=>getBuildVersion(documentWithVersion(value)),/invalid Tetris build metadata/);
 }
});
test('a strictly newer release reloads only while the game is ready and uncovered',()=>{
 assert.equal(shouldReloadBuild('065','066'),true);
 assert.equal(shouldReloadBuild('066','067',{gameStatus:'ready'}),true);
 for(const status of ['playing','paused','over'])
  assert.equal(shouldReloadBuild('066','067',{gameStatus:status}),false);
 assert.equal(shouldReloadBuild('066','067',{modalOpen:true}),false);
 assert.equal(shouldReloadBuild('066','067',{hidden:true}),false);
});
test('stale, equal, offline or invalid published versions never reload',()=>{
 for(const v of ['066','065','001',null,undefined,'', 'x66','9999'])
  assert.equal(shouldReloadBuild('066',v),false);
 assert.equal(shouldReloadBuild('', '067'),false);
 assert.equal(shouldReloadBuild('065','064'),false);
});
test('live update polling fetches uncached HTML, not JS source or gameplay files',()=>{
 assert.ok(main.includes("new URL('./three-v027.html?update-check='+now,import.meta.url)"));
 assert.ok(main.includes("fetch(url,{cache:'no-store'})"));
 assert.ok(main.includes('parsePublishedBuild(await reply.text())'));
 assert.ok(main.includes('shouldReloadBuild(THREE_BUILD_VERSION,published,'));
 assert.ok(main.includes("if(document.hidden||checkingBuild||modal||game.status!=='ready')return;"));
 assert.ok(!main.includes("new URL('./three-v027.js?update-check="));
});
test('release keeps permanent link and always imports main module freshly',()=>{
 const index=read('index.html');
 assert.ok(index.includes("location.replace(new URL('./three-v027.html'"));
 assert.ok(html.includes("const freshModule='./three-v027.js?live='+Date.now()"));
 assert.ok(main.includes("from './build-version.js?v066'"));
});
