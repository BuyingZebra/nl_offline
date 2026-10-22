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
  assert.ok(r.holdPanel.y+r.holdPanel.h<=r.nextPanel.y+.01,'hold/next overlap');
  assert.ok(r.nextPanel.y+r.nextPanel.h<=r.statsPanel.y+.01,'next/stats overlap');
  if(r.compactControls){
   const target=(r.dw-2*r.deckPad-2*ui.padGap)/3;
   assert.ok(target>0,'landscape button target width');
   const rowsBottom=r.dy+r.deckPad+ui.scoreHeight+r.deckGap+
    2*r.buttonH+2*ui.padGap+r.extraH;
   assert.ok(rowsBottom<=r.dy+r.dh+.01,'stacked controls fit deck');
  }
 });
}
test('portrait keeps original current-device positioning',()=>{
 const r=computeLayout(393,852,{top:59,bottom:34},ui);
 assert.equal(r.landscape,false);
 assert.equal(r.compactControls,false);
 assert.equal(r.boardW,234.5);
 assert.equal(r.boardH,469);
});
test('narrow landscape reflows buttons, without changing portrait',()=>{
 assert.equal(computeLayout(667,375,{left:44,right:44},ui).compactControls,true);
 assert.equal(computeLayout(375,667,{},ui).compactControls,false);
});
test('HTML loads layout ahead of the Three.js module',()=>{
 const html=fs.readFileSync(path.join(__dirname,'three-v027.html'),'utf8');
 const renderer=fs.readFileSync(path.join(__dirname,'three-v027.js'),'utf8');
 assert.ok(html.includes('layout.js?three=v050-r1'));
 assert.ok(html.indexOf('layout.js?three=v050-r1')<html.indexOf('<script type="module">'));
 assert.ok(renderer.includes('ScreenLayout.computeLayout(W,H,insets(),UI_SPACE)'));
 assert.ok(/const THREE_BUILD_VERSION=getBuildVersion\(document\);/.test(renderer));
});
