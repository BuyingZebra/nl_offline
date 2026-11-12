import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectDeviceAdapter} from '../tetris/platform.js';
function fakeWindow(navigator,standalone=false){
 const callbacks=new Map();
 const visualViewport={addEventListener:(name,fn)=>callbacks.set(name,fn),removeEventListener:name=>callbacks.delete(name)};
 return {navigator,visualViewport,matchMedia:()=>({matches:standalone}),callbacks};
}
test('iPhone and modern touch-enabled iPadOS select Apple adapter',()=>{
 assert.equal(selectDeviceAdapter(fakeWindow({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4)'})).id,'ios');
 assert.equal(selectDeviceAdapter(fakeWindow({userAgent:'Macintosh',platform:'MacIntel',maxTouchPoints:5})).id,'ios');
});
test('Android and generic platforms remain independent of game rules',()=>{
 assert.equal(selectDeviceAdapter(fakeWindow({userAgent:'Android 15; Pixel 9'})).id,'android');
 assert.equal(selectDeviceAdapter(fakeWindow({userAgent:'Windows NT 10.0'})).id,'generic');
});
test('Apple Home Screen class is restored and resize observer detaches',()=>{
 const added=[],win=fakeWindow({userAgent:'iPhone',standalone:true});
 const adapter=selectDeviceAdapter(win);
 adapter.applyRootMode(win.navigator,win,{documentElement:{classList:{add:s=>added.push(s)}}});
 assert.deepEqual(added,['ios-standalone']);
 const noop=()=>{},detach=adapter.attach(win,noop);
 assert.equal(win.callbacks.get('resize'),noop);
 detach();assert.equal(win.callbacks.has('resize'),false);
});
test('Android standalone mode and viewport resize are handled separately',()=>{
 const added=[],win=fakeWindow({userAgent:'Android 15'},true);
 const adapter=selectDeviceAdapter(win);
 adapter.applyRootMode(win.navigator,win,{documentElement:{classList:{add:s=>added.push(s)}}});
 assert.deepEqual(added,['android-standalone']);
 const detach=adapter.attach(win,()=>{});
 assert.equal(win.callbacks.has('resize'),true);
 detach();assert.equal(win.callbacks.has('resize'),false);
});

import fs from 'node:fs';
test('published entry delegates to platform while remaining a stable URL',()=>{
 const source=fs.readFileSync(new URL('../tetris/three-v027.js',import.meta.url),'utf8');
 const platform=fs.readFileSync(new URL('../tetris/platform.js',import.meta.url),'utf8');
 assert.match(source,/startNOMAD/);
 assert.match(platform,/export function startNOMAD\(\)/);
 assert.ok(source.length<500,'the historical entry is no longer an application monolith');
});

test('device adapters live inside platform and share a viewport observer',()=>{
 const source=fs.readFileSync(new URL('../tetris/platform.js',import.meta.url),'utf8');
 assert.match(source,/function observeVisualViewport/);
 assert.match(source,/const appleAdapter=Object.freeze/);
 assert.match(source,/const androidAdapter=Object.freeze/);
 assert.match(source,/const genericAdapter=Object.freeze/);
 assert.equal(source.includes("from './platform/ios.js'"),false);
 assert.equal(source.includes("from './platform/android.js'"),false);
 assert.equal(source.includes("from './platform/generic.js'"),false);
});

test('visual input geometry and device event handling have distinct owners',()=>{
 const platform=fs.readFileSync(new URL('../tetris/platform.js',import.meta.url),'utf8');
 const visual=fs.readFileSync(new URL('../tetris/render.js',import.meta.url),'utf8');
 assert.match(platform,/export \{createInputController\} from '\.\/input\.js\?v212'/);
 const input=fs.readFileSync(new URL('../tetris/input.js',import.meta.url),'utf8');
 assert.match(input,/export function createInputController/);
 assert.match(input,/import \{findRegionAt,sliderValueAt\} from '\.\/render\.js\?v212'/);
 assert.match(visual,/const InteractionGeometry=/);
 assert.match(visual,/export \{instrumentCompositorPasses,makeRegion,makeButtonControl,makeSliderControl,findRegionAt,sliderValueAt\}/);
});
test('render diagnostics and browser clipboard have distinct owners',()=>{
 const platform=fs.readFileSync(new URL('../tetris/platform.js',import.meta.url),'utf8');
 const visual=fs.readFileSync(new URL('../tetris/render.js',import.meta.url),'utf8');
 assert.match(platform,/export function createDebugClipboard/);
 const diag=fs.readFileSync(new URL('../tetris/diagnostics.js',import.meta.url),'utf8');
 assert.match(diag,/function createPerfMonitor/);
 assert.match(diag,/function instrumentCompositorPasses/);
 assert.match(visual,/from '\.\/diagnostics\.js\?v212'/);
 assert.doesNotMatch(visual,/const RenderDiagnostics=/);
});
