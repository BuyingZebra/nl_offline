/* V066 — static dependency graph and app-contract smoke checks.
 * Helps catch missing files/cross-module wiring before phone testing.
 */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const modulePaths=[
 'three-v027.js','build-version.js','canvas-ui.js','input-controller.js',
 'ui-controls.js','modal-ui.js','hud-drawing.js','display-settings-catalog.js',
 'cropped-ui-layers.js','render-invalidation.js','game-visual-state.js',
 'compositor.js','perf-monitor.js','debug-report.js',
 'debug-clipboard.js','texture-upload-profiler.js','compositor-pass-profiler.js'
];
const source=filename=>fs.readFileSync(path.join(__dirname,filename),'utf8');
const dependencies=filename=>[...source(filename).matchAll(
 /^import\s+[^\n]+?\s+from\s+['"]([^'"]+)['"];?\s*$/gm
 )].map(match=>match[1]).filter(spec=>spec.startsWith('.'));
test('every relative ESM import resolves to an existing source file',()=>{
 let count=0;
 for(const filename of modulePaths){
  for(const spec of dependencies(filename)){
   const dep=spec.split('?')[0].split('#')[0];
   const resolved=path.resolve(__dirname,path.dirname(filename),dep);
   assert.ok(fs.existsSync(resolved),filename+' imports missing '+spec);
   assert.ok(resolved.startsWith(path.resolve(__dirname)+path.sep));
   count++;
  }
 }
 assert.ok(count>=12,'unexpectedly few app module imports: '+count);
});
test('no imported module is wired twice from a single source',()=>{
 for(const filename of modulePaths){
  const ids=dependencies(filename).map(s=>s.split('?')[0]);
  assert.equal(ids.length,new Set(ids).size,filename+' duplicates an import');
 }
});
test('entrypoint remains single-screen Three.js with no redundant framework',()=>{
 const s=source('three-v027.js'),html=source('three-v027.html');
 assert.ok(s.includes('compositor.render();'));
 assert.ok(s.includes("const THREE_BUILD_VERSION=getBuildVersion(document);"));
 assert.ok(s.includes("getBuildVersion,parsePublishedBuild,shouldReloadBuild"));
 assert.ok(s.includes('paintGame();'));
 assert.ok(html.includes('canvas id="screen"'));
 assert.ok(html.includes('const freshModule='));
 assert.ok(!html.includes('pixi.js'));
});
test('V066 release is metadata-only for next version bump',()=>{
 const html=source('three-v027.html');
 assert.equal((html.match(/<meta name="tetris-build" content="[0-9]{3}">/g)||[]).length,1);
 assert.ok(!source('three-v027.js').includes("const THREE_BUILD_VERSION='066'"));
 assert.ok(!/Tetris System V[0-9]{3}/.test(html));
 assert.ok(!/Three\.js V[0-9]{3}/.test(html));
});
