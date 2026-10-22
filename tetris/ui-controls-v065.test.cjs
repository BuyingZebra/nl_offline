/* V065 — pure reusable UI control model behavioral contracts.
 * Buttons, sliders and pointer dispatch share the same geometry.
 */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,n),'utf8');
const ui=new Function(read('ui-controls.js').replace(/export function /g,'function ')+
 '\nreturn {makeRegion,makeButtonControl,makeSliderControl,findRegionAt,sliderValueAt};')();
test('button descriptor uses exactly the same bounds for drawing and hits',()=>{
 for(const [label,x,y,w,h,action,opts] of [
  ['PAUSE',100,200,90,46,'pause',{}],
  ['◀',12,654,60,53,'left',{light:true,repeat:true}],
  ['DROP',78,654,125,53,'hard',{light:true}],
  ['X',327,65,46,46,'close',{modalControl:true}]
 ]){
  const b=ui.makeButtonControl(label,x,y,w,h,action,opts);
  assert.equal(b.kind,'button');
  assert.equal(b.label,label);
  assert.deepEqual([b.hitbox.x,b.hitbox.y,b.hitbox.w,b.hitbox.h,b.hitbox.act],
   [b.x,b.y,b.w,b.h,b.act]);
  assert.equal(b.hitbox.repeat,b.repeat);
  assert.equal(b.hitbox.modalControl,b.modalControl);
 }
});
test('each button holds no unrelated modal or gameplay state',()=>{
 const a=ui.makeButtonControl('HOLD',3,4,50,40,'hold',{light:false,arrow:true});
 const b=ui.makeButtonControl('PAUSE',3,4,50,40,'pause',{modalControl:true});
 assert.equal(a.hitbox.modalControl,false);
 assert.equal(b.hitbox.modalControl,true);
 assert.equal(a.arrow,true);
 assert.equal(b.arrow,false);
});
test('slider describes painted track, handle and hit region as one geometry',()=>{
 const a=ui.makeSliderControl(100,200,220,['','bloomStrength',0,100,1,'%'],25);
 assert.equal(a.size,15);
 assert.equal(a.valueText,'25%');
 assert.equal(a.trackX,107.5);
 assert.equal(a.trackW,169);
 assert.equal(a.fraction,.25);
 assert.deepEqual([a.hitbox.x,a.hitbox.y,a.hitbox.w,a.hitbox.h],
  [a.trackX-a.size/2,186,a.trackW+a.size,28]);
 assert.equal(a.hitbox.act,'slider');
 assert.equal(a.hitbox.modalControl,true);
 assert.equal(a.hitbox.trackX,a.trackX);
 assert.equal(a.hitbox.trackW,a.trackW);
});
test('slider label widths and decimals match approved setting values',()=>{
 const x=100,y=200,w=220;
 for(const [setting,value,width,digits] of [
  [['X','ghostX',-32,32,1,'px'],2,12,'2px'],
  [['Y','ghostY',-32,32,1,'px'],-2,12,'-2px'],
  [['RADIUS','softnessRadius',0,10,.5,'px'],3.5,51,'3.5px'],
  [['STRENGTH','softnessStrength',0,100,1,'%'],64,65,'64%']
 ]){
  const s=ui.makeSliderControl(x,y,w,setting,value);
  assert.equal(s.labelW,width);
  assert.equal(s.valueText,digits);
  assert.equal(s.hitbox.field,setting[1]);
 }
});
test('slider input maps the identical model track to persisted values',()=>{
 const s=ui.makeSliderControl(22,120,284,['','opacity',0,100,5,'%'],50);
 assert.equal(ui.sliderValueAt(s.hitbox,s.trackX),0);
 assert.equal(ui.sliderValueAt(s.hitbox,s.trackX+s.trackW*.51),50);
 assert.equal(ui.sliderValueAt(s.hitbox,s.trackX+s.trackW),100);
 assert.equal(ui.sliderValueAt(s.hitbox,s.trackX-999),0);
 assert.equal(ui.sliderValueAt(s.hitbox,s.trackX+s.trackW+999),100);
});
test('input hit-tests select newest overlay and preserve inclusive boundaries',()=>{
 const a=ui.makeRegion(0,0,300,600,'board',{board:true});
 const b=ui.makeButtonControl('PAUSE',10,10,70,44,'pause');
 const c=ui.makeButtonControl('X',10,10,70,44,'close');
 assert.equal(ui.findRegionAt([a,b.hitbox,c.hitbox],{x:30,y:30}).act,'close');
 assert.equal(ui.findRegionAt([a,b.hitbox],{x:10,y:10}).act,'pause');
 assert.equal(ui.findRegionAt([a,b.hitbox],{x:80,y:54}).act,'pause');
 assert.equal(ui.findRegionAt([a,b.hitbox],{x:90,y:60}).act,'board');
 assert.equal(ui.findRegionAt([a],{x:-1,y:3}),undefined);
});
test('options controls are vertically clipped to scroll viewport',()=>{
 const toggle=ui.makeRegion(20,50,180,60,'toggle',{field:'bloom',modalControl:true});
 const ordinary=ui.makeRegion(20,50,180,60,'scroll',{scroll:true});
 const view={x:20,y:80,w:180,h:200};
 assert.equal(ui.findRegionAt([ordinary,toggle],{x:30,y:65},'options',view).act,'scroll');
 assert.equal(ui.findRegionAt([ordinary,toggle],{x:30,y:90},'options',view).act,'toggle');
 assert.equal(ui.findRegionAt([ordinary,toggle],{x:30,y:65},null,view).act,'toggle');
});
test('modules depend on the same helper without changing CRT compositor',()=>{
 const source=read('three-v027.js');
 const canvas=read('canvas-ui.js'),input=read('input-controller.js'),modal=read('modal-ui.js');
 assert.ok(canvas.includes("from './ui-controls.js?v065'"));
 assert.ok(input.includes("from './ui-controls.js?v065'"));
 assert.ok(modal.includes("from './ui-controls.js?v065'"));
 assert.ok(canvas.includes('makeButtonControl(label,x,y,w,h,act,opts)'));
 assert.ok(input.includes('findRegionAt(getRegions(),p,getModal(),getModalView())'));
 assert.ok(input.includes('sliderValueAt(r,x)'));
 assert.ok(modal.includes('makeSliderControl(x,y,w,setting,Number(settingValue(setting[1]))'));
 assert.ok(source.includes("const THREE_BUILD_VERSION='065'"));
 assert.ok(read('compositor.js').includes('composer.addPass(new OutputPass())'));
 assert.ok(read('three-v027.html').includes('Tetris System V065'));
});
