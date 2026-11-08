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
 assert.equal(r.boardY,170.5,'board remains centred vertically');
 assert.ok(Math.abs(r.boardX-34.2875)<1e-8,'framed board begins at header/footer left edge');
 const topGap=r.boardY-(r.hy+r.hh),bottomGap=r.dy-(r.boardY+r.boardH);
 assert.ok(Math.abs(topGap-bottomGap)<.00001,'even header/controls spacing');
 assert.equal(r.dy+r.deckPad,677,'old first button y');
 assert.equal(r.dy+r.deckPad+r.buttonH+r.deckGap,736,'old hold/pause y');
 assert.equal(r.nextPanel.y-r.previewLabelSpace,r.boardY,'NEXT outside label aligned to board top');
 assert.equal(r.holdPanel.y+r.holdPanel.h,r.boardY+r.boardH,
  'HOLD bottom aligned with board');
 assert.ok(Math.abs(r.statsPanel.y+r.statsPanel.h/2-r.boardY-r.boardH/2)<.01,
  'statistics centered between previews');
 assert.ok(r.nextPanel.y<r.statsPanel.y&&r.statsPanel.y<r.holdPanel.y);
});
test('tall portrait makes a minimal width adjustment to fit the aligned brick frame',()=>{
 const r=computeLayout(430,932,{top:62,bottom:34},ui);
 assert.ok(r.boardW<273&&r.boardW>265,
  'slight reduction fits both full-width brick rails without overlap');
 assert.ok(Math.abs(r.boardH-2*r.boardW)<1e-7);
 assert.ok(Math.abs(r.boardY-(r.sy+(r.sh-r.boardH)/2))<1e-7,
  'board stays centered vertically');
 assert.ok(Math.abs(r.boardX-r.previewCell-r.brickGap-r.hx)<1e-7);
 assert.equal(r.dy+r.deckPad,757,'V109 button position stays unchanged');
});
test('portrait board and entire sidebar are vertically centered between header and controls',()=>{
 for(const [name,w,h,safe] of phones.filter(x=>x[1]<x[2])){
  const r=computeLayout(w,h,safe,ui);
  const above=r.boardY-(r.hy+r.hh),below=r.dy-(r.boardY+r.boardH);
  assert.ok(Math.abs(above-below)<.01,name+' symmetric header-to-controls whitespace');
  assert.ok(Math.abs(r.nextPanel.y-r.previewLabelSpace-r.boardY)<.01,
   name+' NEXT outside label aligns to board top');
  assert.ok(Math.abs(r.holdPanel.y+r.holdPanel.h-r.boardY-r.boardH)<.01,
   name+' HOLD bottom aligns with board');
  assert.ok(Math.abs(r.statsPanel.y+r.statsPanel.h/2-r.boardY-r.boardH/2)<.01,
   name+' stats remain centered vertically');
  assert.ok(Math.abs(r.nextPanel.h-r.holdPanel.h)<.01,
   name+' matching preview heights');
  const upperGap=r.statsPanel.y-(r.nextPanel.y+r.nextPanel.h);
  // HOLD now has an external heading, so measure its free space from
  // the heading rather than from the preview panel's top border.
  const lowerGap=r.holdPanel.y-r.previewLabelSpace-(r.statsPanel.y+r.statsPanel.h);
  assert.ok(upperGap>=ui.unit-.01&&lowerGap>=ui.unit-.01,
   name+' adequate gaps between panels');
  assert.ok(Math.abs(upperGap-lowerGap)<.01,
   name+' symmetric score-to-preview spacing');
 }
});
test('landscape anchors sidebar previews to board edges without collisions',()=>{
 for(const [name,w,h,safe] of phones.filter(x=>x[1]>x[2])){
  const r=computeLayout(w,h,safe,ui);
  assert.ok(Math.abs(r.nextPanel.y-r.previewLabelSpace-r.boardY)<.01,name+' NEXT label aligned');
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
 assert.ok(html.includes('layout.js?three=v150'));
 assert.ok(html.indexOf('layout.js?three=v150')<html.indexOf('<script type="module">'));
 assert.ok(renderer.includes('ScreenLayout.computeLayout(W,H,insets(),UI_SPACE)'));
 assert.ok(/const THREE_BUILD_VERSION=getBuildVersion\(document\);/.test(renderer));
});

test('sidebar panels share a compact right edge and retain room for external labels',()=>{
 for(const [name,w,h,safe] of phones){
  const r=computeLayout(w,h,safe,ui);
  const boxes=[r.nextPanel,r.statsPanel,r.holdPanel];
  const right=r.sideX+r.sideW;
  for(const box of boxes){
   assert.ok(Math.abs(box.x+box.w-right)<.00001,name+' panel right-aligned');
   assert.ok(box.w<=r.sideW+.00001,name+' compact width');
  }
  assert.ok(r.nextPanel.y-r.previewLabelSpace>=r.boardY-.001,
   name+' NEXT label stays inside game area');
  assert.ok(r.holdPanel.y-r.previewLabelSpace>=r.statsPanel.y+r.statsPanel.h-.01,
   name+' HOLD label does not overlap score');
  assert.ok(r.nextPanel.y+r.nextPanel.h<=r.statsPanel.y+.001,
   name+' NEXT and score stay separate');
  assert.ok(r.statsPanel.y+r.statsPanel.h<=r.holdPanel.y-r.previewLabelSpace+.001,
   name+' score and HOLD label stay separate');
  const cell=(r.boardW-4)/10;
  assert.ok(Math.abs(r.previewCell-cell*.75)<.00001);
  assert.ok(r.previewLabelSpace>=14);
 }
});

test('portrait framed board and panels align with both outer header/footer edges',()=>{
 const samples=phones.filter(([name,w,h])=>w<h);
 for(const [name,w,h,safe] of samples){
  const r=computeLayout(w,h,safe,ui);
  const headingRight=r.hx+r.hw;
  const footerRight=r.off+r.width-r.pad;
  assert.ok(Math.abs(headingRight-footerRight)<.00001,name+' header/footer right edge');
  for(const box of [r.nextPanel,r.statsPanel,r.holdPanel]){
   assert.ok(Math.abs(box.x+box.w-headingRight)<.00001,
    name+' preview/stats container right edge aligns with header and footer');
  }
  assert.ok(r.nextPanel.x>=r.boardX+r.boardW,
   name+' preview stays to right of the board');
  assert.ok(Math.abs(r.boardX-r.previewCell-r.brickGap-r.hx)<1e-6,
   name+' framed board left rail aligns with header and footer left edge');
  assert.ok(r.boardX+r.boardW+r.previewCell+r.brickGap<=r.nextPanel.x-2+1e-5,
   name+' right rail fits without entering the sidebar');
 }
 const r=computeLayout(393,852,{top:59,bottom:34},ui);
 assert.equal(r.boardW,234.5,'restored pre-brick board width unchanged');
 assert.ok(Math.abs(r.boardX-34.2875)<1e-8,'framed board left edge aligned');
 assert.equal(r.dy+r.deckPad,677,'controls unaffected');
});

test('V141 portrait gutters and header alignment remain exact',()=>{
 for(const [name,w,h,safe] of phones.filter(([,w,h])=>w<h)){
  const r=computeLayout(w,h,safe,ui);
  const rightRailEnd=r.boardX+r.boardW+r.brickGap+r.previewCell;
  for(const panel of [r.nextPanel,r.statsPanel,r.holdPanel]){
   assert.ok(Math.abs(panel.x-rightRailEnd-r.brickGap)<1e-6,
    name+' equal rail-to-board and rail-to-sidebar gutters');
   assert.ok(Math.abs(panel.x+panel.w-r.hx-r.hw)<1e-6,
    name+' sidebar right-aligned with header');
  }
 }
});
