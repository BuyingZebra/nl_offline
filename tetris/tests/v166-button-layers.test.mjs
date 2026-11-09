import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buttonFeedbackLayers} from '../crt.js';
import {createButtonFeedback,BUTTON_BASE_LEVEL,BUTTON_PEAK_LEVEL}
 from '../crt.js';

const bounds={dx:30,dy:630,dw:333,dh:140};
const box=(x,y,w=58,h=34)=>({x,y,w,h});
const deck=box(45,649),header=box(315,81,30,30),
 popup=box(88,300,155,40);

test('deck-only press changes only cropped controls, not the full-screen base',()=>{
 assert.deepEqual(buttonFeedbackLayers([], [deck],bounds),['controls']);
 assert.deepEqual(buttonFeedbackLayers([deck],[deck],bounds),['controls']);
 assert.deepEqual(buttonFeedbackLayers([deck],[],bounds),['controls'],
  'last illuminated frame gets repainted after release');
});

test('header and board-status popup buttons still repaint the base',()=>{
 assert.deepEqual(buttonFeedbackLayers([], [header],bounds),['base']);
 assert.deepEqual(buttonFeedbackLayers([], [popup],bounds),['base']);
 assert.deepEqual(buttonFeedbackLayers([], [deck,header],bounds),['base','controls']);
 assert.deepEqual(buttonFeedbackLayers([deck], [header],bounds),['base','controls']);
});

test('unknown or out-of-bounds button rectangles conservatively redraw base',()=>{
 assert.deepEqual(buttonFeedbackLayers([], [box(360,645,14,40)],bounds),['base']);
 assert.deepEqual(buttonFeedbackLayers([], [deck],null),['base']);
 assert.deepEqual(buttonFeedbackLayers([], [box(NaN,0)],bounds),['base']);
 assert.deepEqual(buttonFeedbackLayers([], [],bounds),[]);
});

test('actual button afterglow is tracked through fade and final disappearance',()=>{
 const b=createButtonFeedback();
 assert.equal(BUTTON_BASE_LEVEL,206);
 assert.equal(BUTTON_PEAK_LEVEL,255);
 b.press({...deck,act:'soft'},0,true);
 let first=b.sample(0);
 assert.deepEqual(buttonFeedbackLayers([],first,bounds),['controls']);
 b.release({...deck,act:'soft'},50);
 let after=b.sample(100);
 assert.ok(after.length&&after[0].power>0&&after[0].power<1);
 assert.deepEqual(buttonFeedbackLayers(first,after,bounds),['controls']);
 const gone=b.sample(1000);
 assert.equal(gone.length,0);
 assert.deepEqual(buttonFeedbackLayers(after,gone,bounds),['controls']);
});

test('renderer asks for affected layers instead of always marking base',()=>{
 const src=fs.readFileSync(new URL('../three-v027.js',import.meta.url),'utf8');
 const start=src.indexOf('const previousButtonSparks=buttonSparks;');
 const end=src.indexOf("if(layers.needsRender())",start);
 assert.ok(start>0&&end>start);
 const part=src.slice(start,end);
 assert.match(part,/buttonFeedbackLayers\(/);
 assert.match(part,/previousButtonSparks,buttonSparks,layoutInfo\|\|layout\(\)/);
 assert.match(part,/const canvasAffected=controlsGpuEnabled\?/);
 assert.match(part,/affected\.filter\(name=>name!=='controls'\):affected/);
 assert.match(part,/layers\.mark\(\.\.\.canvasAffected\)/);
 assert.doesNotMatch(part,/layers\.mark\('base','controls'\)/);
 assert.match(src,/key\('◐'.*'theme'\)/);
 assert.match(src,/drawControls\(r\)/);
});
