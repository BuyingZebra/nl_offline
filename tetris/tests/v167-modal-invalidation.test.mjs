/* NOMAD V167 — modal uploads are governed by their own render dirtiness.
 * Node: node --test tetris/tests/v167-modal-invalidation.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRenderInvalidation} from '../render-invalidation.js';

const source=()=>fs.readFileSync(new URL('../three-v027.js',import.meta.url),'utf8');

test('modal can be marked and consumed independently of terminal and controls',()=>{
 const layers=createRenderInvalidation([]);
 assert.equal(layers.needs('modal'),false);
 layers.mark('modal');
 assert.equal(layers.needsRender(),true);
 assert.equal(layers.needs('base'),false);
 const reasons=layers.beginRender();
 assert.deepEqual(reasons,['startup']);
 assert.equal(layers.consume('modal'),true);
 assert.equal(layers.needs('modal'),false);
 layers.mark('controls');layers.reason('terminal-log');
 assert.deepEqual(layers.beginRender(),['terminal-log']);
 assert.equal(layers.needs('modal'),false,
  'typing behind menu does not dirtify its texture');
 assert.equal(layers.consume('controls'),true);
 assert.equal(layers.needsRender(),false);
});

test('twenty terminal updates require zero modal redraws after initial paint',()=>{
 const layers=createRenderInvalidation([]);
 layers.mark('modal');layers.beginRender();
 let modalPaints=0;
 if(layers.consume('modal'))modalPaints++;
 for(let i=0;i<20;i++){
  layers.mark('controls');layers.reason('terminal-log');
  layers.beginRender();
  if(layers.consume('modal'))modalPaints++;
  layers.consume('controls');
 }
 assert.equal(modalPaints,1);
});

test('renderer only repaints modal on dirty state, first show or base repaint',()=>{
 const s=source();
 const paint=s.slice(s.indexOf('function paintGame(){'),s.indexOf('const SCANLINE_CHOICES='));
 assert.match(paint,/if\(paintedBase\)layers\.mark\('modal'\)/);
 assert.match(paint,/if\(layers\.consume\('modal'\)\|\|!modalPlane\.visible\)/);
 assert.match(paint,/paintModalOverlay\(\)/);
 assert.match(paint,/layers\.consume\('modal'\);/);
 assert.doesNotMatch(paint,/if\(screenManager\.paintsModalLayer\)\{\s*const started=performance\.now\(\)/);
 assert.match(s,/const canvasDirty=\['base','board','sidebar','controls','modal'\]/);
});

test('settings, presses, viewport changes and asynchronous clipboard results mark modal',()=>{
 const s=source();
 const invalidate=s.slice(s.indexOf("function invalidate(reason='input')"),
  s.indexOf('// The core owns piece locking',s.indexOf("function invalidate(reason='input')")));
 assert.match(invalidate,/screenManager\.paintsModalLayer/);
 for(const event of ['input','button-press','button-release','resize',
  'resume','context-restored','font-ready'])
  assert.ok(invalidate.includes("'"+event+"'"),event+' must trigger menu refresh');
 assert.doesNotMatch(invalidate,/'(?:terminal-log|terminal-event|gravity|phosphor-history)'/);
 assert.match(invalidate,/layers\.mark\('modal'\)/);
 assert.match(s,/modalUI\.debugCopyState=success\?'copied':'failed';invalidate\(\)/);
 assert.match(s,/setOptionsScroll:v=>\{modalUI\.scroll=v;\}/);
 assert.match(s,/else\{layers\.mark\('modal'\);layers\.reason\('scroll'\);\}/);
});

test('menu button luminance targets modal, never hidden base, while visible',()=>{
 const s=source();
 const paint=s.slice(s.indexOf('const previousButtonSparks=buttonSparks;'),
  s.indexOf('if(layers.needsRender())',s.indexOf('const previousButtonSparks=buttonSparks;')));
 assert.match(paint,/if\(screenManager\.paintsModalLayer\)/);
 assert.match(paint,/if\(buttonSparks\.length\|\|previousButtonSparks\.length\)layers\.mark\('modal'\)/);
 assert.match(paint,/else\{\s*const affected=buttonFeedbackLayers\(/);
 assert.match(s,/if\(previous==='options'&&next!=='options'\)layers\.mark\('base','controls'\)/);
 assert.match(s,/if\(previous==='options'\|\|next==='options'\)layers\.mark\('modal'\)/);
});

test('modal texture upload occurs only when marked and never forces unrelated GPU readback',()=>{
 const s=source();
 const paint=s.slice(s.indexOf('function paintModalOverlay(){'),
  s.indexOf('inputController=createInputController(',s.indexOf('function paintModalOverlay(){')));
 assert.match(paint,/modalTexture\.needsUpdate=true/);
 assert.match(paint,/perf\.textureChanged\('modal'\)/);
 assert.match(s,/if\(modalPlane\.visible\)textureUploads\.upload\(modalTexture,'modal'\)/);
 assert.doesNotMatch(paint,/readPixels|toDataURL|getImageData/);
});
