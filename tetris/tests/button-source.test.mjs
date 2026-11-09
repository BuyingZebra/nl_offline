import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCanvasUI} from '../ui.js';

function drawKey(light=false,power=0,arrow=false){
 const calls=[],regions=[];
 const g={
  fillStyle:'',strokeStyle:'',
  beginPath(){},roundRect(){},
  fill(){calls.push({type:'fill',color:this.fillStyle});},
  stroke(){calls.push({type:'stroke',color:this.strokeStyle});},
  measureText(label){return {width:String(label).length*8,
   actualBoundingBoxAscent:10,actualBoundingBoxDescent:3};},
  fillText(value){calls.push({type:'glyph',color:this.fillStyle,value});}
 };
 const ui=createCanvasUI({
  getContext:()=>g,getRegions:()=>regions,getButtonPower:()=>power,
  C:{panel:'#1d1d1d',button:'#080808',ink:'#e3e3e3',border:'#777777'},
  FONT:'sans-serif',ICON_FONT:'sans-serif',TERMINAL_FONT:'monospace',
  LETTER_SPACING_EM:0.13,
  MAIN_ACTION_LABELS:new Set(['DROP']),
  BUTTON_ICON_LABELS:new Set(['▶']),
  MAIN_ACTION_FONT_SIZE:16,BUTTON_FONT_SIZE:14,BUTTON_ICON_FONT_SIZE:18
 });
 ui.key('DROP',20,40,90,45,'hard',{light,arrow});
 return {calls,ui,regions};
}
test('unfilled buttons excite outlines, labels and optional icons without filling',()=>{
 for(const [power,lit] of [[0,206],[1,255]]){
  const {calls,regions}=drawKey(false,power,true);
  assert.deepEqual(calls.map(c=>c.type),['fill','stroke','glyph','glyph']);
  assert.equal(calls[0].color,'#080808','no filled pressed rectangle');
  for(const call of calls.slice(1))assert.equal(call.color,
   'rgb('+lit+','+lit+','+lit+')',call.type);
  assert.equal(regions[0].kind,'button');
 }
});
test('filled buttons excite face and stroke but preserve contrasting moving glyphs',()=>{
 for(const [power,lit,ink] of [[0,206,6],[1,255,30]]){
  const {calls}=drawKey(true,power,true);
  assert.equal(calls[0].color,'rgb('+lit+','+lit+','+lit+')');
  assert.equal(calls[1].color,calls[0].color);
  for(const call of calls.slice(2))
   assert.equal(call.color,'rgb('+ink+','+ink+','+ink+')');
 }
});
test('other screen buttons use the same source brightness helper',()=>{
 const {ui}=drawKey();
 assert.equal(ui.buttonLight(20,40,90,45),206);
 const {ui:hot}=drawKey(false,1);
 assert.equal(hot.buttonLight(20,40,90,45),255);
 const modal=fs.readFileSync(new URL('../ui.js',import.meta.url),'utf8');
 for(const control of ['debugLum','toggleLum','pickerLum','choiceLum'])
  assert.ok(modal.includes(control),'modal control missing brightness: '+control);
 const game=fs.readFileSync(new URL('../three-v027.js',import.meta.url),'utf8');
 assert.match(game,/getButtonPower:r=>\(g===controlsContext&&controlsGpuEnabled\)\?0:buttonSparks\.find/);
 assert.doesNotMatch(game,/syncButtonFeedback/);
});

test('PAUSE keeps its pressed luminance through immediate gameplay status changes',()=>{
 const game=fs.readFileSync(new URL('../three-v027.js',import.meta.url),'utf8');
 const actions=game.slice(game.indexOf('handleAction:act=>'),
  game.indexOf('setSetting:actions.setSetting'));
 // Both pointer controls and keyboard controls must preserve PAUSE even
 // though action dispatch changes game status within the pointerdown turn.
 assert.equal((actions.match(/if\(game\.status!==previous&&act!=='pause'\)buttonFeedback\.clear\(\)/g)||[]).length,2);
 assert.ok(game.includes('buttonSparks=buttonFeedback.sample(now,phosphorOn)'));
 assert.match(game,/else if\(act&&!controlsGpuEnabled\)layers\.mark\('controls'\)/);
});
