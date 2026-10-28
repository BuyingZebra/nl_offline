/* Run: node --test tetris/modules.test.cjs
 * Tests the V052 Canvas2D primitives and pointer/keyboard integration.
 */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const controlSource=fs.readFileSync(path.join(__dirname,'ui-controls.js'),'utf8')
 .replace(/export function /g,'function ');
const controls=new Function(controlSource+
 '\nreturn {makeRegion,makeButtonControl,makeSliderControl,findRegionAt,sliderValueAt};')();
function factory(filename,exportName,deps={}){
 const source=fs.readFileSync(path.join(__dirname,filename),'utf8')
  .replace(/^import .*;\s*$/gm,'')
  .replace('export function '+exportName,'function '+exportName);
 const injected={...controls,...deps};
 return new Function(...Object.keys(injected),source+'\nreturn '+exportName+';')(...Object.values(injected));
}
function target(){
 const handlers={};
 return {
  handlers,
  addEventListener:(name,fn)=>{handlers[name]=fn;},
  dispatch(type,opts={}){
   const evt={type,pointerId:1,pointerType:'touch',button:0,clientX:0,
    clientY:0,timeStamp:100,preventDefault(){this.prevented=true;},...opts};
   if(handlers[type])handlers[type](evt);
   return evt;
  },
  getBoundingClientRect:()=>({left:0,top:0,width:300,height:600}),
  setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){}
 };
}
function harness(){
 const screen=target(),document=target(),window=target(),initialsInput={};
 let regions=[],modal=null,modalView=null,scroll=0,maxScroll=500,velocity=0,baseDirty=false;
 const actions=[],settings=[],moves=[],patterns=[],toggles=[];
 const createInputController=factory('input-controller.js','createInputController',{
  performance:{now:()=>100}
 });
 const ctrl=createInputController({
  screen,document,window,initialsInput,getViewport:()=>({width:300,height:600}),
  getRegions:()=>regions,getModal:()=>modal,getModalView:()=>modalView,
  getOptionsScroll:()=>scroll,setOptionsScroll:v=>{scroll=v;},
  getOptionsMaxScroll:()=>maxScroll,setScrollVelocity:v=>{velocity=v;},
  setBaseDirty:()=>{baseDirty=true;},handleAction:v=>actions.push(v),
  perform:v=>moves.push(v),setSetting:(k,v)=>settings.push([k,v]),
  settingValue:k=>k==='bloom'?false:true,
  toggleScanlineMenu:()=>toggles.push('open'),chooseScanline:v=>patterns.push(v),
  openModal:v=>{modal=v;},invalidate:()=>{},
  clamp:(v,min,max)=>Math.min(max,Math.max(min,v))
 });
 return {screen,document,window,ctrl,actions,settings,moves,patterns,toggles,
  regions:v=>{regions=v;},modal:v=>{modal=v;},
  view:v=>{modalView=v;},scroll:()=>scroll,velocity:()=>velocity,
  dirty:()=>baseDirty,input:initialsInput};
}
test('shared UI draws to current canvas and records hitboxes',()=>{
 const a=[],b=[],regions=[],active={action:'pause',box:{x:1}};
 const ctx=(list)=>({
  beginPath(){list.push('begin');},roundRect(){list.push('rounded');},
  fill(){list.push('fill');},stroke(){list.push('stroke');},
  fillRect(){list.push('rect');},
  fillText(s){list.push(String(s));},
  measureText:s=>({width:String(s).length*7})
 });
 let current=ctx(a);
 const createCanvasUI=factory('canvas-ui.js','createCanvasUI');
 const ui=createCanvasUI({
  getContext:()=>current,getRegions:()=>regions,getPressed:()=>active,
  C:{panel:'#111',border:'#666',solid:'#222',bright:'#ccc',button:'#080',ink:'#fff',dark:'#000'},
  FONT:'monospace',LETTER_SPACING_EM:.13,
  MAIN_ACTION_LABELS:new Set(['START GAME']),BUTTON_ICON_LABELS:new Set(['◀']),
  MAIN_ACTION_FONT_SIZE:16,BUTTON_FONT_SIZE:14,BUTTON_ICON_FONT_SIZE:18
 });
 ui.key('PAUSE',1,2,70,44,'pause');
 assert.equal(regions.length,1);
 assert.equal(regions[0].act,'pause');
 assert.ok(a.includes('PAUSE'));
 current=ctx(b);
 ui.text('NEXT',20,30);
 ui.rect(0,0,5,5,'#fff');
 assert.ok(b.includes('NEXT')&&b.includes('rect'));
 assert.ok(!a.includes('NEXT'));
});
test('UI keeps wrapped text and overlay input priority',()=>{
 const a=[],r=[],ctx={
  beginPath(){},roundRect(){},fill(){},stroke(){},fillRect(){},
  fillText(t){a.push(t);},measureText:t=>({width:t.length*10})
 };
 const ui=factory('canvas-ui.js','createCanvasUI')({
  getContext:()=>ctx,getRegions:()=>r,getPressed:()=>null,
  C:{panel:'#1',border:'#2',solid:'#3',bright:'#4',button:'#5',ink:'#6',dark:'#7'},
  FONT:'monospace',LETTER_SPACING_EM:.13,MAIN_ACTION_LABELS:new Set(),
  BUTTON_ICON_LABELS:new Set(),MAIN_ACTION_FONT_SIZE:16,BUTTON_FONT_SIZE:14,BUTTON_ICON_FONT_SIZE:18
 });
 ui.text('HELLO WORLD',10,10,12,'#fff','left',52);
 assert.deepEqual(a,['HELLO','WORLD']);
});
test('game buttons invoke action on pointer down, not twice on release',()=>{
 const h=harness();
 h.regions([{x:0,y:0,w:80,h:80,act:'pause'}]);
 h.screen.dispatch('pointerdown',{clientX:30,clientY:30});
 assert.equal(h.ctrl.pressed.action,'pause');
 assert.deepEqual(h.actions,['pause']);
 h.screen.dispatch('pointerup',{clientX:30,clientY:30});
 assert.equal(h.ctrl.pressed,null);
 assert.deepEqual(h.actions,['pause']);
 assert.equal(h.dirty(),true);
});
test('board gestures remain rotate, move and hard drop',()=>{
 const h=harness();h.regions([{x:0,y:0,w:300,h:600,act:'board',board:true}]);
 for(const [endX,endY,expected] of [[40,40,'cw'],[75,40,'right'],[40,100,'hard']]){
  h.screen.dispatch('pointerdown',{clientX:40,clientY:40,timeStamp:100});
  h.screen.dispatch('pointerup',{clientX:endX,clientY:endY,timeStamp:160});
  assert.equal(h.moves.at(-1),expected);
 }
});
test('settings toggle and slider are activated on release',()=>{
 const h=harness();h.modal('options');h.view({x:0,y:0,w:300,h:600});
 h.regions([{x:0,y:0,w:140,h:70,act:'toggle',field:'bloom',modalControl:true}]);
 h.screen.dispatch('pointerdown',{clientX:20,clientY:20});
 assert.equal(h.settings.length,0);
 h.screen.dispatch('pointerup',{clientX:20,clientY:20});
 assert.deepEqual(h.settings,[['bloom',true]]);
 h.regions([{x:0,y:100,w:300,h:55,act:'slider',field:'strength',
  trackX:20,trackW:200,min:0,max:100,step:5,modalControl:true}]);
 h.screen.dispatch('pointerdown',{clientX:30,clientY:120});
 h.screen.dispatch('pointermove',{clientX:120,clientY:120,timeStamp:140});
 h.screen.dispatch('pointerup',{clientX:120,clientY:120,timeStamp:170});
 assert.deepEqual(h.settings.at(-1),['strength',50]);
});
test('vertical motion scrolls options instead of activating switch',()=>{
 const h=harness();h.modal('options');h.view({x:0,y:0,w:300,h:600});
 h.regions([{x:0,y:0,w:200,h:200,act:'toggle',field:'bloom',modalControl:true}]);
 h.screen.dispatch('pointerdown',{clientX:70,clientY:160,timeStamp:100});
 h.screen.dispatch('pointermove',{clientX:70,clientY:60,timeStamp:150});
 h.screen.dispatch('pointerup',{clientX:70,clientY:60,timeStamp:180});
 assert.equal(h.scroll(),100);
 assert.deepEqual(h.settings,[]);
});
test('scroll wheel is active only while settings are open',()=>{
 const h=harness();
 h.screen.dispatch('wheel',{deltaY:90});
 assert.equal(h.scroll(),0);
 h.modal('options');
 const e=h.screen.dispatch('wheel',{deltaY:90});
 assert.equal(h.scroll(),90);
 assert.equal(e.prevented,true);
});
test('menu touch cancels and blocks commands outside viewport',()=>{
 const h=harness();h.modal('options');h.view({x:0,y:70,w:300,h:300});
 h.regions([{x:0,y:0,w:300,h:70,act:'toggle',field:'bloom',modalControl:true}]);
 h.screen.dispatch('pointerdown',{clientX:30,clientY:40});
 h.screen.dispatch('pointerup',{clientX:30,clientY:40});
 assert.deepEqual(h.settings,[]);
 h.regions([{x:0,y:90,w:300,h:50,act:'patternSelect',modalControl:true}]);
 h.screen.dispatch('pointerdown',{clientX:30,clientY:100});
 h.screen.dispatch('pointercancel',{clientX:30,clientY:100});
 assert.deepEqual(h.toggles,[]);
});
test('keyboard preserves movement and modal Escape',()=>{
 const h=harness();
 h.document.dispatch('keydown',{code:'ArrowLeft'});
 assert.deepEqual(h.moves,['left']);
 h.modal('options');
 h.document.dispatch('keydown',{code:'ArrowRight'});
 assert.deepEqual(h.moves,['left']);
 h.document.dispatch('keydown',{code:'Escape'});
 h.document.dispatch('keydown',{code:'ArrowUp'});
 assert.deepEqual(h.moves,['left','cw']);
});
test('cancel clears active pointer so a new touch can start',()=>{
 const h=harness();h.regions([{x:0,y:0,w:100,h:80,act:'pause'}]);
 h.screen.dispatch('pointerdown',{clientX:30,clientY:30});
 h.ctrl.cancel();
 assert.equal(h.ctrl.pressed,null);
 h.screen.dispatch('pointerdown',{clientX:30,clientY:30,pointerId:2});
 assert.equal(h.ctrl.pressed.id,2);
});
test('version imports controllers and does not duplicate pointer listeners',()=>{
 const js=fs.readFileSync(path.join(__dirname,'three-v027.js'),'utf8');
 assert.ok(js.includes("from './canvas-ui.js?v079'"));
 assert.ok(js.includes("from './input-controller.js?v065'"));
 assert.ok(/const THREE_BUILD_VERSION=getBuildVersion\(document\);/.test(js));
 assert.ok(!js.includes("screen.addEventListener('pointerdown'"));
});


test('V071 loads both Fallout UI fonts and keeps the original button dimensions',()=>{
 const app=fs.readFileSync(path.join(__dirname,'three-v027.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'three-v027.html'),'utf8');
 assert.ok(html.includes('family=Roboto+Condensed:wght@700'));
 assert.ok(html.includes('family=Share+Tech+Mono'));
 assert.ok(!html.includes('family=Teko'));
 assert.ok(app.includes('"Roboto Condensed"'));
 assert.ok(app.includes('"Share Tech Mono"'));
 assert.ok(app.includes('Promise.allSettled('));
 assert.ok(app.includes('const BUTTON_FONT_SIZE=14,MAIN_ACTION_FONT_SIZE=16;'));
 assert.ok(app.includes('const BUTTON_ICON_FONT_SIZE=18;'));
});
test('V071 paints interface, terminal readouts and icons in correct fonts',()=>{
 const events=[];
 const g={beginPath(){},roundRect(){},fill(){},stroke(){},fillRect(){},
  measureText:s=>({width:String(s).length*6}),
  fillText:s=>events.push({text:s,font:g.font})};
 const ui=factory('canvas-ui.js','createCanvasUI')({
  getContext:()=>g,getRegions:()=>[],getPressed:()=>null,
  C:{panel:'#111',border:'#666',solid:'#222',bright:'#ccc',button:'#080',ink:'#fff',dark:'#000'},
  FONT:'"Roboto Condensed",sans-serif',TERMINAL_FONT:'"Share Tech Mono",monospace',
  ICON_FONT:'monospace',LETTER_SPACING_EM:.13,
  MAIN_ACTION_LABELS:new Set(),BUTTON_ICON_LABELS:new Set(['◀']),
  MAIN_ACTION_FONT_SIZE:16,BUTTON_FONT_SIZE:14,BUTTON_ICON_FONT_SIZE:18
 });
 ui.text('SCORE',5,6,12);
 ui.text('004120',5,24,12,'#fff','left',Infinity,'terminal');
 ui.text('◀',5,44,18);
 assert.deepEqual(events.map(e=>e.font),[
  '700 12px "Roboto Condensed",sans-serif',
  '400 12px "Share Tech Mono",monospace',
  '700 18px monospace'
 ]);
});

test('V072 ink-centers all three font roles at their existing anchor',()=>{
 const events=[];
 const g={beginPath(){},roundRect(){},fill(){},stroke(){},fillRect(){},
  measureText(str){
   const terminal=this.font.startsWith('400 ');
   const icon=this.font==='700 18px monospace';
   return {width:String(str).length*6,
    actualBoundingBoxAscent:terminal?8:icon?11:10,
    actualBoundingBoxDescent:terminal?3:icon?1:2};
  },
  fillText(str,x,y){events.push({str,x,y,baseline:this.textBaseline,font:this.font});}
 };
 const ui=factory('canvas-ui.js','createCanvasUI')({
  getContext:()=>g,getRegions:()=>[],getPressed:()=>null,
  C:{panel:'#111',border:'#666',solid:'#222',bright:'#ccc',button:'#080',ink:'#fff',dark:'#000'},
  FONT:'"Roboto Condensed",sans-serif',TERMINAL_FONT:'"Share Tech Mono",monospace',
  ICON_FONT:'monospace',LETTER_SPACING_EM:.13,
  MAIN_ACTION_LABELS:new Set(),BUTTON_ICON_LABELS:new Set(['◀']),
  MAIN_ACTION_FONT_SIZE:16,BUTTON_FONT_SIZE:14,BUTTON_ICON_FONT_SIZE:18
 });
 ui.text('RETURN',20,40,14,'#fff','center');
 ui.text('004120',20,60,14,'#fff','center',Infinity,'terminal');
 ui.text('◀',20,80,18,'#fff','center');
 assert.deepEqual(events.map(v=>v.y),[44,62.5,85]);
 assert.ok(events.every(v=>v.baseline==='alphabetic'));
});
test('V072 solid button text centers without changing the control hitbox',()=>{
 const draws=[],regions=[];
 const g={beginPath(){},roundRect(){},fill(){},stroke(){},fillRect(){},
  measureText:s=>({width:String(s).length*5,actualBoundingBoxAscent:9,actualBoundingBoxDescent:1}),
  fillText:(str,x,y)=>draws.push({str,x,y})};
 const ui=factory('canvas-ui.js','createCanvasUI')({
  getContext:()=>g,getRegions:()=>regions,getPressed:()=>null,
  C:{panel:'#111',border:'#666',solid:'#222',bright:'#ccc',button:'#080',ink:'#fff',dark:'#000'},
  FONT:'"Roboto Condensed",sans-serif',LETTER_SPACING_EM:.13,
  MAIN_ACTION_LABELS:new Set(['RESUME']),BUTTON_ICON_LABELS:new Set(['◀']),
  MAIN_ACTION_FONT_SIZE:16,BUTTON_FONT_SIZE:14,BUTTON_ICON_FONT_SIZE:18
 });
 ui.key('RESUME',10,20,120,42,'start',{light:true});
 assert.deepEqual([regions[0].x,regions[0].y,regions[0].w,regions[0].h],[10,20,120,42]);
 assert.equal(draws[0].y,45);
});
test('V072 retains width-only TextMetrics fallback for compatibility',()=>{
 const draws=[];
 const g={beginPath(){},roundRect(){},fill(){},stroke(){},fillRect(){},
  measureText:s=>({width:String(s).length*5}),
  fillText:(str,x,y)=>draws.push({str,y,baseline:g.textBaseline})};
 const ui=factory('canvas-ui.js','createCanvasUI')({
  getContext:()=>g,getRegions:()=>[],getPressed:()=>null,
  C:{panel:'#111',border:'#666',solid:'#222',bright:'#ccc',button:'#080',ink:'#fff',dark:'#000'},
  FONT:'monospace',LETTER_SPACING_EM:.13,MAIN_ACTION_LABELS:new Set(),
  BUTTON_ICON_LABELS:new Set(),MAIN_ACTION_FONT_SIZE:16,BUTTON_FONT_SIZE:14,BUTTON_ICON_FONT_SIZE:18
 });
 ui.text('ONE\nTWO',40,50,10);
 assert.deepEqual(draws.map(x=>x.y),[44,56]);
 assert.ok(draws.every(x=>x.baseline==='middle'));
});


test('V073 approved screenshot defaults preserve all eight effect roles and values',()=>{
 const src=fs.readFileSync(path.join(__dirname,'display-settings-catalog.js'),'utf8');
 const data=new Function(src.replace(/export const /g,'const ')
  .replace(/export function /g,'function ')+
  '\nreturn {DEFAULT_EFFECTS,DISPLAY_EFFECTS,effectSettingValue,effectSettingToStored};')();
 const d=data.DEFAULT_EFFECTS;
 assert.deepEqual({...d},{
  phosphor:true,bloom:true,bloomStrength:.22,
  ghost:false,ghostX:2,ghostY:0,ghostStrength:22,
  scanlines:true,scanlinePreset:'aperture',scanlineOpacity:49,
  softness:false,softnessStrength:.64,softnessRadius:3,
  vignette:true,vignetteAmount:.57
 });
 assert.equal(Object.isFrozen(d),true);
 assert.deepEqual(
  [data.effectSettingValue('scanlineOpacity',d,{ghost:true,sound:true}),
   data.effectSettingValue('vignetteAmount',d,{ghost:true,sound:true}),
   data.effectSettingValue('bloomStrength',d,{ghost:true,sound:true}),
   data.effectSettingValue('ghostStrength',d,{ghost:true,sound:true}),
   data.effectSettingValue('softnessStrength',d,{ghost:true,sound:true}),
   data.effectSettingValue('softnessRadius',d,{ghost:true,sound:true})],
  [49,57,22,22,64,3]
 );
 assert.deepEqual(data.DISPLAY_EFFECTS.map(x=>x.id),
  ['phosphor','scanlines','vignette','bloom','ghost','softness','piece','sound']);
});
test('V073 defaults reach both fresh sessions and Restore Defaults, without overwriting saved FX',()=>{
 const js=fs.readFileSync(path.join(__dirname,'three-v027.js'),'utf8');
 assert.ok(js.includes("from './display-settings-catalog.js?v073'"));
 assert.ok(js.includes('let FX={...DEFAULT};'));
 assert.ok(js.includes('if(typeof s[k]===typeof v)FX[k]=s[k]'));
 assert.ok(js.includes("if(act==='resetFX'){"));
 assert.ok(js.includes('FX={...DEFAULT};persist();'));
 assert.ok(js.includes("let theme=load('fieldAtlasThemeV06','green')"));
});

test('V079 shared canvas panels and every button use square corners without tint changes',()=>{
 const source=fs.readFileSync(path.join(__dirname,'canvas-ui.js'),'utf8');
 const main=fs.readFileSync(path.join(__dirname,'three-v027.js'),'utf8');
 assert.ok(source.includes('Math.max(1,h-1),0)'),'all panels have zero radius');
 assert.ok(source.includes('down?C.solid:(model.light?C.bright:C.button)'));
 assert.ok(main.includes("from './canvas-ui.js?v079'"));
});
