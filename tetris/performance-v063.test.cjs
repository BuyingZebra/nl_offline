/* V063: behavior-based module contracts and architecture regressions.
 * Builds on V062 without altering gameplay or CRT output.
 */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
const from=name=>new Function(read(name).replace(/export (function|const) /g,'$1 ')+
 '\nreturn {'+(name==='render-invalidation.js'?'createRenderInvalidation':
 name==='hud-drawing.js'?'createHudDrawing':
 'DEFAULT_EFFECTS,DISPLAY_EFFECTS,scanlineChoices,effectSettingValue,effectSettingToStored')+'};')();
const invalidation=from('render-invalidation.js');
const hud=from('hud-drawing.js');
const settings=from('display-settings-catalog.js');
const main=read('three-v027.js');
const html=read('three-v027.html');

test('render invalidation starts with all layers dirty and startup attribution',()=>{
 const l=invalidation.createRenderInvalidation();
 assert.deepEqual(l.snapshot().pending,['base','board','sidebar','controls']);
 assert.ok(l.needsRender());
 assert.deepEqual(l.beginRender(),['startup']);
 assert.equal(l.needsRender(),false);
 for(const key of ['base','board','sidebar','controls'])assert.equal(l.consume(key),true);
 assert.deepEqual(l.snapshot().pending,[]);
});
test('a board-only gravity update never dirties full-screen base or unrelated HUD',()=>{
 const l=invalidation.createRenderInvalidation([]);
 l.beginRender();
 l.mark('board');l.reason('gravity');
 assert.deepEqual(l.beginRender(),['gravity']);
 assert.equal(l.consume('base'),false);
 assert.equal(l.consume('controls'),false);
 assert.equal(l.consume('sidebar'),false);
 assert.equal(l.consume('board'),true);
 assert.equal(l.needsRender(),false);
});
test('repeated invalidations coalesce per layer and preserve resize reason',()=>{
 const l=invalidation.createRenderInvalidation([]);
 l.beginRender();
 l.mark('controls','controls','sidebar');
 l.reason('input');l.reason('input');l.reason('resize');
 assert.deepEqual(l.beginRender(),['input','resize']);
 assert.deepEqual(l.snapshot().pending,['controls','sidebar']);
 assert.equal(l.consume('controls'),true);
 assert.equal(l.consume('controls'),false);
 assert.throws(()=>l.mark('bogus'),/Unknown render layer/);
});
test('effect defaults and user-facing option order match established display system',()=>{
 assert.deepEqual(settings.DISPLAY_EFFECTS.map(e=>e.id),[
  'phosphor','scanlines','vignette','bloom','ghost','softness','piece','sound'
 ]);
 assert.equal(settings.DEFAULT_EFFECTS.phosphor,true);
 assert.equal(settings.DEFAULT_EFFECTS.bloomStrength,.30);
 assert.equal(settings.DEFAULT_EFFECTS.scanlinePreset,'original');
 assert.equal(settings.DEFAULT_EFFECTS.softnessRadius,3);
 assert.equal(settings.DEFAULT_EFFECTS.vignetteAmount,.39);
 assert.equal(settings.DEFAULT_EFFECTS.ghostStrength,22);
});
test('effect setting model keeps hundred-based sliders and special toggles',()=>{
 const fx={...settings.DEFAULT_EFFECTS,bloomStrength:.21,softnessStrength:.64,ghostX:-8};
 assert.equal(settings.effectSettingValue('bloomStrength',fx,{ghost:true,sound:false}),21);
 assert.equal(settings.effectSettingValue('ghostX',fx,{ghost:true,sound:false}),-8);
 assert.equal(settings.effectSettingValue('pieceGhost',fx,{ghost:false,sound:true}),false);
 assert.equal(settings.effectSettingValue('sound',fx,{ghost:false,sound:true}),true);
 assert.equal(settings.effectSettingToStored('bloomStrength',75),.75);
 assert.equal(settings.effectSettingToStored('ghostY',-7),-7);
 assert.deepEqual(settings.scanlineChoices([{id:'dot',name:'DOT'}]),[
  {id:'off',name:'OFF'},{id:'dot',name:'DOT'}
 ]);
});
test('HUD rendering retains exact labels, scores, buttons and live state access',()=>{
 const logs=[],games={level:2,score:1234,lines:11,hold:'T',queue:['I','J','L'],pieces:5};
 const h=hud.createHudDrawing({
  getGame:()=>games,getHighs:()=>[{score:3000}],
  C:{panel:'p',weak:'w',ink:'i',border:'b'},UI_SPACE:{scoreHeight:45,padGap:6,buttonWidthScale:.75,extrasGap:6},
  fmt:(n,k=6)=>String(n).padStart(k,'0'),
  panel:(...args)=>logs.push(['panel',...args]),text:(...args)=>logs.push(['text',...args]),
  rect:(...args)=>logs.push(['rect',...args]),key:(...args)=>logs.push(['key',...args]),
  smallPiece:(...args)=>logs.push(['piece',...args])
 });
 const r={short:false,compactControls:false,holdPanel:{x:300,y:120,w:80,h:88},
  nextPanel:{x:300,y:214,w:80,h:164},statsPanel:{x:300,y:384,w:80,h:92},
  dx:0,dy:620,dw:390,dh:195,deckPad:6,deckGap:6,buttonH:53,extraH:46};
 h.drawSidebar(r);h.drawControls(r);
 const labels=logs.filter(x=>x[0]==='text').map(x=>String(x[1]));
 const buttons=logs.filter(x=>x[0]==='key').map(x=>x[6]);
 for(const label of ['HOLD','NEXT','BEST','PIECES','LEVEL','SCORE','LINES','001234','11','3000'])
  assert.ok(labels.includes(label),'missing HUD label '+label);
 assert.ok(logs.filter(x=>x[0]==='piece').length===4);
 for(const action of ['left','right','cw','hard','hold','pause'])assert.ok(buttons.includes(action),action);
 games.score=4500;logs.length=0;h.drawSidebar(r);
 assert.ok(logs.some(x=>x[0]==='text'&&x[1]===4500),'HUD must read updated game state');
});
test('module boundaries keep game rules and GPU compositor independent',()=>{
 assert.ok(!read('core.js').includes('createCompositor('));
 assert.ok(!read('render-invalidation.js').includes('document.'));
 assert.ok(!read('hud-drawing.js').includes('THREE.'));
 assert.ok(!read('display-settings-catalog.js').includes('CanvasTexture'));
 for(const module of ['render-invalidation.js','hud-drawing.js','display-settings-catalog.js'])
  assert.ok(main.includes("'./"+module+"?v063'"),'missing '+module);
});
test('HTML title and accessibility label share one authoritative JS version',()=>{
 assert.ok(main.includes("const THREE_BUILD_VERSION='063'"));
 assert.ok(main.includes("document.title='NOMAD — Tetris System V'+THREE_BUILD_VERSION"));
 assert.ok(main.includes("display.setAttribute('aria-label','Tetris System — Three.js V'+THREE_BUILD_VERSION)"));
 assert.ok(html.includes('<title>NOMAD — Tetris System</title>'));
 assert.ok(!html.includes('Tetris System V062'));
});
