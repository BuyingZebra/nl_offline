import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCanvasUI} from '../canvas-ui.js';
import {createActionController} from '../action-controller.js';
import {createScreenManager,SCREENS} from '../screen-manager.js';

test('solid button gradient is visible, but its top remains the original fill',()=>{
 const gradients=[],fills=[],borders=[],regions=[];
 const g={
  beginPath(){},roundRect(){},
  fill(){fills.push(this.fillStyle);},
  stroke(){borders.push(this.strokeStyle);},
  createLinearGradient(...coords){
   const v={coords,stops:[],addColorStop(at,color){this.stops.push([at,color]);}};
   gradients.push(v);return v;
  },
  measureText(s){return {width:String(s).length*8,
   actualBoundingBoxAscent:8,actualBoundingBoxDescent:2}},
  fillText(){}
 };
 const ui=createCanvasUI({
  getContext:()=>g,getRegions:()=>regions,
  C:{panel:'#1d1d1d',border:'#777777',button:'#080808',ink:'#e3e3e3'},
  FONT:'monospace',LETTER_SPACING_EM:.13,MAIN_ACTION_LABELS:new Set(['DROP']),
  BUTTON_ICON_LABELS:new Set(),MAIN_ACTION_FONT_SIZE:16,
  BUTTON_FONT_SIZE:14,BUTTON_ICON_FONT_SIZE:18
 });
 ui.key('DROP',4,6,100,50,'soft',{light:true});
 ui.key('PAUSE',110,6,80,50,'pause');
 assert.equal(gradients.length,1);
 assert.deepEqual(gradients[0].coords,[4,56,4,6]);
 assert.deepEqual(gradients[0].stops,[
  [0,'rgb(166,166,166)'],[1,'rgb(206,206,206)']]);
 assert.equal(borders[0],'rgb(206,206,206)');
 assert.equal(fills[1],'#080808','unfilled controls stay unchanged');
 assert.deepEqual(regions.map(r=>[r.x,r.y,r.w,r.h]),
  [[4,6,100,50],[110,6,80,50]]);
});
test('Restart is immediate and preserves old score before reset',()=>{
 let resetCount=0,startCount=0,closeCount=0,records=0;
 const game={
  score:188,lines:6,level:2,status:'paused',
  reset(){resetCount++;this.status='ready';this.score=0;this.lines=0;},
  start(){startCount++;this.status='playing';}
 };
 const controller=createActionController({
  game,storage:{},settings:{},
  scores:{read:()=>({score:0}),update:()=>{records++;return {score:188};}},
  screens:{close(){closeCount++;},requestRestart(){throw Error('Dialog must not open');}},
  getLineClearActive:()=>false,clearLineClear(){},markLayers(){},invalidate(){},
  tone(){},onCopyDebug(){},onResetSettingsUI(){}
 });
 controller.dispatch('restart');
 assert.equal(resetCount,1);
 assert.equal(startCount,1);
 assert.equal(closeCount,1);
 assert.equal(records,1);
 assert.equal(game.status,'playing');
 const screens=createScreenManager({
  getGameStatus:()=>game.status,pauseGame(){},onChange(){}
 });
 assert.equal(screens.requestRestart,undefined);
 assert.equal(SCREENS.RESTART,undefined);
});
test('blur has its own sharp overlaid inset shadow; no old dialog remains',()=>{
 const renderer=fs.readFileSync(new URL('../three-v027.js',import.meta.url),'utf8');
 const modal=fs.readFileSync(new URL('../modal-ui.js',import.meta.url),'utf8');
 const hud=fs.readFileSync(new URL('../hud-drawing.js',import.meta.url),'utf8');
 assert.match(renderer,/function drawSharpBoardInsetShadow\(r\)/);
 assert.match(renderer,/if\(!screenManager\.isScores\)drawSharpBoardInsetShadow\(r\)/);
 assert.match(renderer,/g=boardPopupContext;/);
 assert.match(renderer,/key\('RESTART'.*'restart'\)/);
 assert.doesNotMatch(renderer,/key\('NEW GAME'/);
 assert.doesNotMatch(modal,/START NEW GAME\?|YES, RESTART|drawRestart/);
 assert.match(hud,/panel\(x\+rim,y\+rim,w-rim\*2,h-rim\*2,0,null,C\.bright\)/);
 assert.match(renderer,/rect\(titleX-5,r\.hy\+r\.hh\*\.27,1,r\.hh\*\.46,C\.bright\)/);
});
