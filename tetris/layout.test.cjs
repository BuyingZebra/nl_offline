/* Run from repository root: node --test tetris/layout.test.cjs */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {computeLayout}=require('./layout.js');

const ui={
 unit:6,buttonWidthScale:.75,overlayButtonWidthScale:.85,appMax:520,
 padX:11,stackGap:6,side:93,sideGap:6,headHeight:80,headIcons:46,
 headIconGap:6,headRightPad:6,headTitleInset:17,deckBottom:30,
 deckPad:6,scoreHeight:45,deckGap:6,padGap:6,padHeight:53,
 extrasHeight:44,extrasGap:6,holdHeight:88,nextHeight:162,statsHeight:92
};
const phones=[
 ['current portrait',393,852,{top:59,bottom:34}],
 ['small portrait',320,568,{top:20}],
 ['short portrait',360,480,{top:20}],
 ['tall portrait',430,932,{top:62,bottom:34}],
 ['narrow portrait',280,600,{top:20,bottom:20}],
 ['notched landscape',844,390,{left:59,right:59,bottom:21}],
 ['small landscape',667,375,{left:44,right:44}],
 ['older landscape',568,320,{left:44,right:44}],
 ['wide Android landscape',915,412,{}],
 ['narrow landscape',480,320,{left:24,right:24}]
];
const within=(x,min,max)=>x>=min-.01&&x<=max+.01;
function checkPanel(panel,edges,label){
 assert.ok(panel.w>=0&&panel.h>=0,label+' dimensions');
 assert.ok(within(panel.x,edges.left,edges.right),label+' left');
 assert.ok(within(panel.x+panel.w,edges.left,edges.right),label+' right');
 assert.ok(within(panel.y,edges.top,edges.bottom),label+' top');
 assert.ok(within(panel.y+panel.h,edges.top,edges.bottom),label+' bottom');
}
for(const [name,w,h,safe] of phones){
 test(name+': all panels respect viewport, safe areas and board ratio',()=>{
  const r=computeLayout(w,h,safe,ui);
  const edges={left:r.safe.left,right:w-r.safe.right,top:r.safe.top,bottom:h-r.safe.bottom};
  assert.ok(Math.abs(r.boardH-2*r.boardW)<.00001,'10x20 board ratio');
  checkPanel({x:r.boardX,y:r.boardY,w:r.boardW,h:r.boardH},edges,'board');
  checkPanel(r.holdPanel,edges,'hold');
  checkPanel(r.nextPanel,edges,'next');
  checkPanel(r.statsPanel,edges,'stats');
  checkPanel({x:r.hx,y:r.hy,w:r.hw,h:r.hh},edges,'header');
  checkPanel({x:r.dx,y:r.dy,w:r.dw,h:r.dh},edges,'controls');
  assert.ok(r.nextPanel.y+r.nextPanel.h<=r.statsPanel.y+.01,'next/stats overlap');
  assert.ok(r.statsPanel.y+r.statsPanel.h<=r.holdPanel.y+.01,'stats/hold overlap');
  if(r.compactControls){
   const target=(r.dw-2*r.deckPad-2*ui.padGap)/3;
   assert.ok(target>0,'landscape button target width');
   const rowsBottom=r.dy+r.deckPad+2*r.buttonH+2*ui.padGap+r.extraH;
   assert.ok(rowsBottom<=r.dy+r.dh+.01,'stacked controls fit deck');
  }
 });
}
test('portrait moves statistics to sidebar without moving the control buttons',()=>{
 const r=computeLayout(393,852,{top:59,bottom:34},ui);
 assert.equal(r.landscape,false);
 assert.equal(r.compactControls,false);
 assert.equal(r.boardW,234.5,'V108 portrait board width');
 assert.equal(r.boardH,469,'V108 portrait board height');
 assert.equal(r.boardY,170.5,'unchanged board height, centred vertically');
 const topGap=r.boardY-(r.hy+r.hh),bottomGap=r.dy-(r.boardY+r.boardH);
 assert.ok(Math.abs(topGap-bottomGap)<.00001,'even header/controls spacing');
 assert.equal(r.dy+r.deckPad,677,'old first button y');
 assert.equal(r.dy+r.deckPad+r.buttonH+r.deckGap,736,'old hold/pause y');
 assert.equal(r.nextPanel.y,r.boardY,'NEXT top aligned with board');
 assert.equal(r.holdPanel.y+r.holdPanel.h,r.boardY+r.boardH,
  'HOLD bottom aligned with board');
 assert.ok(Math.abs(r.statsPanel.y+r.statsPanel.h/2-r.boardY-r.boardH/2)<.01,
  'statistics centered between previews');
 assert.ok(r.nextPanel.y<r.statsPanel.y&&r.statsPanel.y<r.holdPanel.y);
});
test('tall portrait also retains its V108 playfield dimensions',()=>{
 const r=computeLayout(430,932,{top:62,bottom:34},ui);
 assert.equal(r.boardW,273);
 assert.equal(r.boardH,546);
 assert.equal(r.boardY,173.5,'tall board is centered in playable gap');
 assert.equal(r.dy+r.deckPad,757,'V109 button position stays unchanged');
});
test('portrait board and entire sidebar are vertically centered between header and controls',()=>{
 for(const [name,w,h,safe] of phones.filter(x=>x[1]<x[2])){
  const r=computeLayout(w,h,safe,ui);
  const above=r.boardY-(r.hy+r.hh),below=r.dy-(r.boardY+r.boardH);
  assert.ok(Math.abs(above-below)<.01,name+' symmetric header-to-controls whitespace');
  assert.ok(Math.abs(r.nextPanel.y-r.boardY)<.01,
   name+' NEXT top aligns with board');
  assert.ok(Math.abs(r.holdPanel.y+r.holdPanel.h-r.boardY-r.boardH)<.01,
   name+' HOLD bottom aligns with board');
  assert.ok(Math.abs(r.statsPanel.y+r.statsPanel.h/2-r.boardY-r.boardH/2)<.01,
   name+' stats remain centered vertically');
  assert.ok(Math.abs(r.nextPanel.h-r.holdPanel.h)<.01,
   name+' matching preview heights');
  const upperGap=r.statsPanel.y-(r.nextPanel.y+r.nextPanel.h);
  const lowerGap=r.holdPanel.y-(r.statsPanel.y+r.statsPanel.h);
  assert.ok(upperGap>=ui.unit-.01&&lowerGap>=ui.unit-.01,
   name+' adequate gaps between panels');
  assert.ok(Math.abs(upperGap-lowerGap)<.01,
   name+' symmetric score-to-preview spacing');
 }
});
test('landscape anchors sidebar previews to board edges without collisions',()=>{
 for(const [name,w,h,safe] of phones.filter(x=>x[1]>x[2])){
  const r=computeLayout(w,h,safe,ui);
  assert.ok(Math.abs(r.nextPanel.y-r.boardY)<.01,name+' NEXT aligned');
  assert.ok(Math.abs(r.holdPanel.y+r.holdPanel.h-r.boardY-r.boardH)<.01,
   name+' HOLD aligned');
  assert.ok(Math.abs(r.statsPanel.y+r.statsPanel.h/2-r.boardY-r.boardH/2)<.01,
   name+' statistics centered');
  assert.ok(r.statsPanel.y>=r.nextPanel.y+r.nextPanel.h+ui.unit-.01,
   name+' NEXT/statistics separation');
  assert.ok(r.holdPanel.y>=r.statsPanel.y+r.statsPanel.h+ui.unit-.01,
   name+' statistics/HOLD separation');
 }
});
test('narrow landscape reflows buttons, without changing portrait',()=>{
 assert.equal(computeLayout(667,375,{left:44,right:44},ui).compactControls,true);
 assert.equal(computeLayout(375,667,{},ui).compactControls,false);
});
test('HTML loads layout ahead of the Three.js module',()=>{
 const html=fs.readFileSync(path.join(__dirname,'three-v027.html'),'utf8');
 const renderer=fs.readFileSync(path.join(__dirname,'three-v027.js'),'utf8');
 assert.ok(html.includes('layout.js?three=v129'));
 assert.ok(html.indexOf('layout.js?three=v129')<html.indexOf('<script type="module">'));
 assert.ok(renderer.includes('ScreenLayout.computeLayout(W,H,insets(),UI_SPACE)'));
 assert.ok(/const THREE_BUILD_VERSION=getBuildVersion\(document\);/.test(renderer));
});
