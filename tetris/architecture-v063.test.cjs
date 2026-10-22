/* V063 — behavioral contract for modular HUD, settings and render state.
 * Runnable with node --test tetris/*.test.cjs.
 */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,n),'utf8');
const pure=source=>source.replace(/export function /g,'function ')
 .replace(/export const /g,'const ');
const invalidator=new Function(pure(read('render-invalidation.js'))+
 '\nreturn createRenderInvalidation;')();
const settings=new Function(pure(read('display-settings-catalog.js'))+
 '\nreturn {DEFAULT_EFFECTS,DISPLAY_EFFECTS,scanlineChoices,effectSettingValue,effectSettingToStored};')();
const hudFactory=new Function(pure(read('hud-drawing.js'))+
 '\nreturn createHudDrawing;')();
const main=read('three-v027.js');
const metrics=[];
const C={panel:'#1d1d1d',weak:'#aeaeae',ink:'#e3e3e3',border:'#6a6a6a',bright:'#cecece'};
const UI_SPACE={unit:6,padGap:6,extrasGap:6,buttonWidthScale:.75,deckGap:6,scoreHeight:45};
const game={hold:'T',queue:['I','J','L'],score:1234,lines:8,level:1,pieces:17};
const r={short:false,holdPanel:{x:270,y:130,w:95,h:86},
 nextPanel:{x:270,y:222,w:95,h:266},
 statsPanel:{x:270,y:494,w:95,h:100},
 dx:10,dy:610,dw:375,dh:183,deckPad:6,buttonH:53,extraH:46,compactControls:false};
function hud(){
 const calls=[];
 const note=(type,...props)=>calls.push({type,props});
 const drawing=hudFactory({
  panel:(...x)=>note('panel',...x),
  text:(...x)=>note('text',...x),
  rect:(...x)=>note('rect',...x),
  key:(...x)=>note('key',...x),
  smallPiece:(...x)=>note('piece',...x),
  getGame:()=>game,getHighs:()=>[{score:9000}],
  C,UI_SPACE,fmt:(v,n=6)=>String(v).padStart(n,'0')
 });
 return {drawing,calls};
}
test('new layer controller begins with exactly four pending layers and startup reason',()=>{
 const a=invalidator(),v=a.snapshot();
 assert.deepEqual(v.pending,['base','board','sidebar','controls']);
 assert.deepEqual(v.reasons,['startup']);
 assert.equal(v.renderNeeded,true);
});
test('each repaint is consumed once; no phantom full-screen dirty flags',()=>{
 const a=invalidator();
 for(const n of ['base','board','sidebar','controls'])assert.equal(a.consume(n),true);
 assert.equal(a.consume('base'),false);
 assert.deepEqual(a.beginRender(),['startup']);
 assert.equal(a.needsRender(),false);
 a.mark('controls','board','controls');
 assert.equal(a.needs('base'),false);
 assert.equal(a.needs('controls'),true);
 assert.equal(a.needs('board'),true);
 assert.deepEqual(a.snapshot().pending,['controls','board']);
});
test('reasons are deduplicated; a redraw without a full-screen layer remains possible',()=>{
 const a=invalidator();
 a.beginRender();
 for(const n of ['base','board','sidebar','controls'])a.consume(n);
 a.reason('input');a.reason('input');a.reason('scroll');
 assert.equal(a.needsRender(),true);
 assert.equal(a.needs('base'),false);
 assert.deepEqual(a.beginRender(),['input','scroll']);
 assert.equal(a.needsRender(),false);
});
test('same-frame layer repaint does not queue a redundant compositor frame',()=>{
 const a=invalidator();
 a.beginRender();
 for(const name of ['base','board','sidebar','controls'])a.consume(name);
 assert.equal(a.needsRender(),false);
 a.mark('base'); // popup status noticed while painting
 assert.equal(a.needsRender(),true);
 assert.equal(a.consume('base'),true);
 assert.equal(a.needsRender(),false);
});
test('illegal layer names are rejected rather than producing invisible stale UI',()=>{
 const a=invalidator();
 assert.throws(()=>a.mark('score'),/Unknown render layer/);
});
test('sidebar retains HOLD, 3 previews, best score and piece counter',()=>{
 const {drawing,calls}=hud();
 drawing.drawSidebar(r);
 assert.equal(calls.filter(c=>c.type==='panel').length,3);
 assert.deepEqual(calls.filter(c=>c.type==='piece').map(c=>c.props[0]),['T','I','J','L']);
 assert.ok(calls.some(c=>c.type==='text'&&c.props[0]==='BEST'));
 assert.ok(calls.some(c=>c.type==='text'&&c.props[0]===9000));
 assert.ok(calls.some(c=>c.type==='text'&&c.props[0]===17));
});
test('portrait controls retain original order and placement',()=>{
 const {drawing,calls}=hud();drawing.drawControls(r);
 const buttons=calls.filter(c=>c.type==='key');
 assert.deepEqual(buttons.map(c=>c.props[5]),['left','hard','right','cw','hold','pause']);
 assert.deepEqual(buttons.map(c=>c.props[0]),['◀','DROP','▶','↻','HOLD','PAUSE']);
 assert.equal(buttons[0].props[6].repeat,true);
 assert.equal(buttons[2].props[6].repeat,true);
 assert.equal(buttons[1].props[6].light,true);
 assert.ok(calls.some(c=>c.type==='text'&&c.props[0]==='001234'));
});
test('narrow landscape controls retain existing order and touch actions',()=>{
 const {drawing,calls}=hud();
 drawing.drawControls({...r,compactControls:true});
 assert.deepEqual(calls.filter(c=>c.type==='key').map(c=>c.props[5]),
 ['left','cw','right','hard','hold','pause']);
});
test('hud uses current game state rather than a stale captured object',()=>{
 const {drawing,calls}=hud();
 drawing.drawControls(r);
 game.score=1300;
 drawing.drawControls(r);
 const scores=calls.filter(c=>c.type==='text'&&c.props[0]==='001300');
 assert.equal(scores.length,1);
 game.score=1234;
});
test('settings defaults and order remain equal to approved system',()=>{
 assert.equal(settings.DEFAULT_EFFECTS.bloomStrength,.30);
 assert.equal(settings.DEFAULT_EFFECTS.scanlinePreset,'original');
 assert.deepEqual(settings.DISPLAY_EFFECTS.map(e=>e.id),
 ['phosphor','scanlines','vignette','bloom','ghost','softness','piece','sound']);
 assert.deepEqual(settings.scanlineChoices([{id:'original',name:'ORIGINAL'}]),
 [{id:'off',name:'OFF'},{id:'original',name:'ORIGINAL'}]);
});
test('settings transformation is round-trippable and preserves ghost and sound',()=>{
 const fx={bloomStrength:.21,softnessStrength:.64,vignetteAmount:.56,ghostX:2};
 assert.equal(settings.effectSettingValue('bloomStrength',fx,{ghost:true,sound:false}),21);
 assert.equal(settings.effectSettingValue('pieceGhost',fx,{ghost:true,sound:false}),true);
 assert.equal(settings.effectSettingValue('sound',fx,{ghost:true,sound:false}),false);
 assert.equal(settings.effectSettingToStored('bloomStrength',21),.21);
 assert.equal(settings.effectSettingToStored('ghostX',-12),-12);
 assert.equal(settings.effectSettingToStored('vignetteAmount',150),1);
});
test('V063 orchestrator imports modules and preserves original rendering pipeline',()=>{
 for(const name of ['render-invalidation','hud-drawing','display-settings-catalog'])
  assert.ok(main.includes("from './"+name+".js?v063'"));
 assert.ok(main.includes('layers.consume(\'base\')'));
 assert.ok(main.includes('layers.consume(\'board\')'));
 assert.ok(main.includes('layers.consume(\'sidebar\')'));
 assert.ok(main.includes('layers.consume(\'controls\')'));
 assert.ok(main.includes('paintBoardPopup(r);'));
 assert.ok(main.includes('compositor.render();'));
 assert.ok(main.includes('const MAX_RENDER_DPR=2;'));
 assert.ok(main.includes('const THREE_BUILD_VERSION=\'065\''));
 assert.ok(read('three-v027.html').includes('NOMAD — Tetris System'));
});
