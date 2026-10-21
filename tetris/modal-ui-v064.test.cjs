/* V064: behavioral tests for extracted modal painter, independent of WebGL. */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,n),'utf8');
const factory=new Function(read('modal-ui.js').replace(/export function /g,'function ')+
 '\nreturn createModalUI;')();
const catalog=new Function(read('display-settings-catalog.js')
 .replace(/export const /g,'const ').replace(/export function /g,'function ')+
 '\nreturn {DISPLAY_EFFECTS,scanlineChoices,effectSettingValue};')();
function context(){
 const dummy=()=>{};
 const g={};
 for(const name of ['save','restore','beginPath','roundRect','rect','clip',
  'drawImage','stroke','strokeRect','fillRect','fill','moveTo','lineTo',
  'translate','rotate','ellipse','strokeRect','fillText','setTransform'])
  g[name]=dummy;
 g.createRadialGradient=()=>({addColorStop:dummy});
 return g;
}
function setup(){
 const events=[],g=context(),FX={phosphor:true,bloom:true,bloomStrength:.21,
  scanlines:true,scanlinePreset:'aperture',scanlineOpacity:39,
  ghost:false,ghostX:2,ghostY:0,ghostStrength:22,
  softness:false,softnessStrength:.64,softnessRadius:3,vignette:true,vignetteAmount:.56};
 let regions=[],modal='options',changes=0;
 const C={bg:'#080808',panel:'#1d1d1d',button:'#080808',border:'#6a6a6a',bright:'#cecece',
  weak:'#aeaeae',ink:'#e3e3e3'};
 const UI_SPACE={unit:6,padX:11,headRightPad:6,headIconGap:6,
  headTitleInset:17,overlayButtonWidthScale:.85,appMax:520};
 const document={createElement:()=>({width:0,height:0,getContext:()=>context()})};
 const r={headerButtonH:46,hh:80,hx:11,hy:59,landscape:false,
  width:393,off:0,boardW:234.5,extraH:46};
 const layouts=[];
 const note=(type,...args)=>{events.push({type,args});};
 let scrollVelocity=null;
 const ui=factory({
  document,SHAPES:{T:[[0,'T',0],['T','T','T']]},
  DISPLAY_EFFECTS:catalog.DISPLAY_EFFECTS,
  SCANLINE_CHOICES:catalog.scanlineChoices([
   {id:'original',name:'ORIGINAL'},{id:'horizontal',name:'HORIZONTAL'},
   {id:'aperture',name:'APERTURE'},{id:'slot',name:'SLOT MASK'},
   {id:'dot',name:'DOT MASK'}]),
  getViewport:()=>({W:393,H:852,DPR:2}),
  layout:()=>r,insets:()=>({top:59,bottom:34,left:0,right:0}),
  clearRegions:()=>{regions=[];},getContext:()=>g,
  panel:(...a)=>note('panel',...a),text:(...a)=>note('text',...a),
  rect:(...a)=>note('rect',...a),
  region:(...a)=>{regions.push(a);note('region',...a);},
  key:(...a)=>{regions.push([a[1],a[2],a[3],a[4],a[5]]);note('key',...a);},
  gray:n=>'rgb('+n+','+n+','+n+')',
  clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),
  fmt:(n,k=6)=>String(n).padStart(k,'0'),C,UI_SPACE,BUTTON_ICON_FONT_SIZE:18,
  getFX:()=>FX,activeScanlinePreset:id=>({id}),
  settingValue:k=>catalog.effectSettingValue(k,FX,{ghost:true,sound:false}),
  persist:()=>{changes++;},invalidate:()=>note('invalidate'),
  setScrollVelocity:v=>{scrollVelocity=v;},
  getHighs:()=>[{name:'AAA',score:9999,lines:12,level:2}],
  getGame:()=>({score:822}),
  getInitialsInput:()=>({value:'XYZ'}),
  getModal:()=>modal
 });
 return {ui,events,FX,regions:()=>regions,setModal:v=>{modal=v;},
  changes:()=>changes,scrollVelocity:()=>scrollVelocity,r};
}
test('settings modal bounds remain fullscreen and respect safe areas',()=>{
 const {ui}=setup();
 const q=ui.modalBounds('options');
 assert.equal(q.w,393);assert.equal(q.h,852);
 assert.equal(q.safeTop,59);assert.equal(q.safeBottom,34);
 assert.equal(q.buttonH,46);
 const dialog=ui.modalBounds('restart');
 assert.ok(dialog.x>0&&dialog.y>59&&dialog.h<852);
});
test('DISPLAY SYSTEM keeps exact title, header buttons and restore action',()=>{
 const {ui,events}=setup();ui.paintModal(ui.modalBounds('options'));
 assert.ok(events.some(v=>v.type==='text'&&v.args[0]==='DISPLAY SYSTEM'));
 const actions=events.filter(v=>v.type==='key').map(v=>v.args[5]);
 assert.deepEqual(actions,['copyDebug','close','resetFX']);
 assert.ok(events.some(v=>v.type==='region'&&v.args[4]==='scroll'));
 assert.ok(ui.view&&ui.view.h>0);
 assert.ok(ui.maxScroll>0);
});
test('settings preserve eight effect controls and slider hitboxes',()=>{
 const {ui,events}=setup();const q=ui.modalBounds('options');
 // Each viewport draws only visible rows; test across the entire list.
 ui.paintModal(q);const scrollMax=ui.maxScroll;
 const toggles=new Set(),sliders=new Set();
 for(let i=0;i<=10;i++){
  events.length=0;ui.scroll=scrollMax*i/10;ui.paintModal(q);
  for(const v of events){
   if(v.type==='region'&&v.args[4]==='toggle')toggles.add(v.args[5].field);
   if(v.type==='region'&&v.args[4]==='slider')sliders.add(v.args[5].field);
  }
 }
 assert.deepEqual([...toggles].sort(),
  ['phosphor','scanlines','vignette','bloom','ghost','softness','pieceGhost','sound'].sort());
 assert.ok(sliders.size>=7);
 assert.ok(sliders.has('bloomStrength'));
 assert.ok(sliders.has('ghostX'));
});
test('scanline picker expands choices and persists a valid choice only',()=>{
 const t=setup(),q=t.ui.modalBounds('options');
 t.ui.paintModal(q);
 const before=t.ui.maxScroll;
 t.ui.toggleScanlineMenu();t.ui.paintModal(q);
 assert.equal(t.ui.scanlineMenuOpen,true);
 assert.ok(t.ui.maxScroll>before);
 assert.equal(t.scrollVelocity(),0);
 assert.equal(t.events.filter(v=>v.type==='region'&&v.args[4]==='scanlineChoice').length,6);
 t.ui.chooseScanline('dot');
 assert.equal(t.FX.scanlinePreset,'dot');
 assert.equal(t.FX.scanlines,true);
 assert.equal(t.ui.scanlineMenuOpen,false);
 assert.equal(t.changes(),1);
 t.ui.chooseScanline('INVALID');
 assert.equal(t.changes(),1);
 t.ui.chooseScanline('off');
 assert.equal(t.FX.scanlines,false);
 assert.equal(t.changes(),2);
});
test('modal reset and restore reset scroll and picker without losing state',()=>{
 const t=setup();
 t.ui.paintModal(t.ui.modalBounds('options'));
 t.ui.scroll=999;t.ui.toggleScanlineMenu();
 t.ui.resetSettings();
 assert.equal(t.ui.scroll,0);assert.equal(t.ui.scanlineMenuOpen,false);
 t.ui.debugCopyState='copied';
 t.ui.reset();
 assert.equal(t.ui.debugCopyState,'idle');assert.equal(t.ui.view,null);
});
test('high scores, restart and initials retain original button actions',()=>{
 const t=setup();
 for(const [mode,actions] of [
  ['scores',['close']],
  ['restart',['close','restartYes']],
  ['entry',['typeInitials','skipScore','saveScore']]
 ]){
  t.events.length=0;t.setModal(mode);
  t.ui.paintModal(t.ui.modalBounds(mode));
  const actual=t.events.filter(x=>x.type==='key').map(x=>x.args[5]);
  assert.deepEqual(actual,actions,mode);
 }
 assert.ok(t.events.some(x=>x.type==='text'&&String(x.args[0]).includes('822')));
});
test('copy-debug status glyph and key remain in dedicated modal module',()=>{
 const t=setup();
 t.ui.debugCopyState='copied';
 t.ui.paintModal(t.ui.modalBounds('options'));
 assert.ok(t.events.some(e=>e.type==='text'&&e.args[0]==='✓'));
 assert.ok(t.events.some(e=>e.type==='key'&&e.args[5]==='copyDebug'));
});
test('V064 module extraction leaves WebGL and game core separate',()=>{
 const main=read('three-v027.js');
 const modal=read('modal-ui.js');
 assert.ok(main.includes("from './modal-ui.js?v064'"));
 assert.ok(main.includes("const THREE_BUILD_VERSION='064'"));
 assert.ok(main.includes("const q=modalUI.modalBounds(modal);"));
 assert.ok(main.includes('try{modalUI.paintModal(q);}'));
 assert.ok(!main.includes('function drawOptions(q)'));
 assert.ok(!main.includes('function drawScores(q)'));
 assert.ok(!modal.includes('WebGLRenderer('));
 assert.ok(!modal.includes('compositor.render()'));
 assert.ok(read('three-v027.html').includes('Tetris System V064'));
});
