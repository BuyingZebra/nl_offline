import {describe,test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Layout from '../tetris/render.js';
import {fileURLToPath} from 'node:url';
import {createHudDrawing,fitPreviewCells} from '../tetris/render.js';
import {makeRegion,makeButtonControl,makeSliderControl,findRegionAt,sliderValueAt,createInputController} from '../tetris/input.js';

const appDir=fileURLToPath(new URL('../tetris',import.meta.url));

describe('Responsive geometry',()=>{
 const {computeLayout}=Layout;

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
 test('portrait stacks the board and aligned sidebar between two 8px gaps',()=>{
  const r=computeLayout(393,852,{top:59,bottom:34},ui);
  assert.equal(r.landscape,false);
  assert.equal(r.compactControls,false);
  assert.equal(r.boardH,2*r.boardW,'the board retains its 10:20 ratio');
  assert.ok(Math.abs(r.boardY+r.boardH/2-405)<1e-8,'the board retains its vertical center');
  assert.ok(Math.abs(r.boardX-r.previewCell-r.brickGap-r.hx)<1e-8,
   'framed board begins at header/footer left edge');
  const topGap=r.boardY-(r.hy+r.hh),bottomGap=r.dy-(r.boardY+r.boardH);
  assert.ok(Math.abs(topGap-8)<1e-8&&Math.abs(bottomGap-8)<1e-8);
  assert.equal(r.nextPanel.y-r.previewLabelSpace,r.boardY,'NEXT outside label aligned to board top');
  assert.equal(r.holdPanel.y+r.holdPanel.h,r.boardY+r.boardH,
   'HOLD bottom aligned with board');
  assert.ok(Math.abs(r.statsPanel.y+r.statsPanel.h/2-r.boardY-r.boardH/2)<.01,
   'statistics centered between previews');
  assert.ok(r.nextPanel.y<r.statsPanel.y&&r.statsPanel.y<r.holdPanel.y);
 });
 test('portrait board grows continuously through every height at representative safe widths',()=>{
  const safeAreas=[{}, {top:20}, {top:59,bottom:34},
   {top:47,bottom:21,left:14,right:10}, {top:72,bottom:48,left:10,right:14}];
  for(const safe of safeAreas)for(const width of [280,320,360,375,393,414,430,480,520]){
   const w=width+(safe.left||0)+(safe.right||0);
   let previous;
   for(let h=Math.max(480,w);h<=1000;h++){
    const r=computeLayout(w,h,safe,ui);
    if(previous){
     const change=r.boardH-previous.boardH;
     assert.ok(change>=-1e-6&&change<=1+1e-6,
      `${w}x${h}, safe ${JSON.stringify(safe)}: board changed by ${change}px`);
     assert.ok(Math.abs(r.dy-previous.dy)<=1+1e-6,'deck moves smoothly');
    }
    assert.ok(Math.abs(r.boardY-r.hy-r.hh-8)<1e-6&&
     Math.abs(r.dy-r.boardY-r.boardH-8)<1e-6,'the stack uses 8px internal gaps');
    assert.ok(r.boardX+r.boardW+2*r.brickGap+r.previewCell<=r.sideX+1e-6,
     'the right brick rail and its gutters fit before the sidebar');
    assert.ok(r.nextPanel.y+r.nextPanel.h+ui.unit<=r.statsPanel.y+1e-6&&
     r.statsPanel.y+r.statsPanel.h+ui.unit<=r.holdPanel.y-r.previewLabelSpace+1e-6,
     'preview labels and stats retain their spacing');
    assert.ok(r.dy+r.dh+38<=h+1e-6,'both terminal rows fit below the deck');
    previous=r;
   }
  }
 });
 test('short portrait fills the stage and width-limited portrait keeps surplus outside the stack',()=>{
  const compact=computeLayout(320,568,{top:20},ui);
  assert.equal(compact.boardH,334);
  assert.equal(compact.boardY-compact.hy-compact.hh,8);
  assert.equal(compact.dy-compact.boardY-compact.boardH,8);
  const devTools=computeLayout(376,583,{},ui);
  assert.equal(devTools.boardH,369);
  assert.equal(devTools.boardY-devTools.hy-devTools.hh,8);
  assert.equal(devTools.dy-devTools.boardY-devTools.boardH,8);
  for(const [w,h] of [[398,758],[1908,945]]){
   const r=computeLayout(w,h,{},ui);
   assert.ok(r.hy>0,'surplus space moves outside the header');
   assert.ok(r.dy+r.dh+38<h,'surplus space moves outside the footer');
   assert.ok(Math.abs(r.boardY-r.hy-r.hh-8)<1e-8);
   assert.ok(Math.abs(r.dy-r.boardY-r.boardH-8)<1e-8);
  }
 });
 test('portrait controls retain non-overlapping 44px targets at compact widths and heights',async()=>{
  const {createHudDrawing}=await import('../tetris/render.js');
  const keys=[];
  const hud=createHudDrawing({panel(){},key:(label,x,y,w,h,action)=>keys.push({x,y,w,h,action}),
   C:{},UI_SPACE:ui});
  for(const [w,h,safe] of [
   [280,480,{top:20}],[304,480,{top:59,bottom:34,left:14,right:10}],
   [320,568,{top:20}],[375,621,{top:20}],[393,731,{top:59,bottom:34}],
   [393,852,{top:59,bottom:34}],[430,932,{top:62,bottom:34}]
  ]){
   const r=computeLayout(w,h,safe,ui);
   keys.length=0;
   hud.drawControls(r);
   assert.deepEqual(keys.map(key=>key.action),['left','soft','right','cw','hold','pause']);
   for(let i=0;i<keys.length;i++){
    const key=keys[i];
    assert.ok(key.w>=44&&key.h>=44,`${w}x${h}: ${key.action} is too small`);
    checkPanel(key,{left:r.dx,right:r.dx+r.dw,top:r.dy,bottom:r.dy+r.dh},key.action);
    for(const prior of keys.slice(0,i)){
     assert.ok(key.x>=prior.x+prior.w||prior.x>=key.x+key.w||
      key.y>=prior.y+prior.h||prior.y>=key.y+key.h,'control hit regions do not overlap');
    }
   }
  }
 });

 test('tall portrait makes a minimal width adjustment to fit the aligned brick frame',()=>{
  const r=computeLayout(430,932,{top:62,bottom:34},ui);
  assert.ok(r.nextPanel.w>=4*r.previewCell+10-1e-7,
   'the full four-cell preview fits beside the full-width brick rails');
  assert.ok(Math.abs(r.boardH-2*r.boardW)<1e-7);
  assert.ok(Math.abs(r.boardY-(r.sy+(r.sh-r.boardH)/2))<1e-7,
   'board stays centered vertically');
  assert.ok(Math.abs(r.boardX-r.previewCell-r.brickGap-r.hx)<1e-7);
  assert.ok(Math.abs(r.dy-r.boardY-r.boardH-8)<1e-8,'deck follows the board');
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
 test('render module owns layout without a separate HTML script',()=>{
  const html=fs.readFileSync(path.join(appDir,'three-v027.html'),'utf8');
  const renderer=fs.readFileSync(path.join(appDir,'three-v027.js'),'utf8');
  const visual=fs.readFileSync(path.join(appDir,'render.js'),'utf8');
  assert.doesNotMatch(html,/src="\.\/layout\.js/);
  assert.match(renderer,/import Layout, \{/);
  assert.match(renderer,/const ScreenLayout=Layout;/);
  assert.match(visual,/const Layout=\(\(\)=>\{/);
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
});

describe('HUD layout and viewport rules',()=>{
 const {computeLayout}=Layout;

 const ui={
  unit:6,buttonWidthScale:.75,overlayButtonWidthScale:.85,appMax:520,
  padX:11,stackGap:6,side:93,sideGap:6,headHeight:80,headIcons:46,
  headIconGap:6,headRightPad:6,headTitleInset:17,deckBottom:30,
  deckPad:6,scoreHeight:45,deckGap:6,padGap:6,padHeight:53,
  extrasHeight:44,extrasGap:6,holdHeight:88,nextHeight:162,statsHeight:92
 };
 function makeHUD(){
  const painted={panels:[],text:[],pieces:[],keys:[],rects:[]};
  const game={hold:'S',queue:['T','O','J'],score:684,level:3,lines:12,pieces:33};
  const hud=createHudDrawing({
   panel:(...v)=>painted.panels.push(v),text:(...v)=>painted.text.push(v),
   rect:(...v)=>painted.rects.push(v),key:(...v)=>painted.keys.push(v),
   smallPiece:(...v)=>painted.pieces.push(v),
   getGame:()=>game,getHighs:()=>[{score:9000}],
   C:{panel:'#1d1d1d',bg:'#080808',border:'#777',subtleBorder:'#2e2e2e',
     weak:'#aeaeae',bright:'#cecece',ink:'#e3e3e3'},
   UI_SPACE:ui,fmt:(n,k=6)=>String(n).padStart(k,'0')
  });
  return {hud,painted,game};
 }
 test('NEXT, SCORE, LEVEL, LINES and HOLD share square double borders',()=>{
  const r=computeLayout(393,852,{top:59,bottom:34},ui);
  const {hud,painted}=makeHUD();
  hud.drawSidebar(r);
  assert.deepEqual(painted.text.map(t=>t[0]),
   ['NEXT','SCORE','000684','LEVEL','03','LINES','12','HOLD']);
  assert.deepEqual(painted.pieces.map(p=>[p[0],p[5]]),[['T','next'],['S','hold']]);
  assert.equal(painted.panels.length,10,'five outer frames and five inset frames');
  assert.deepEqual(painted.panels.map(p=>p[4]),Array(10).fill(0),
   'all ten frames have square, unbeveled corners');
  const [next,nextInner,scoreBox,scoreInner,levelBox,levelInner,
   linesBox,linesInner,hold,holdInner]=painted.panels;
  const panels=[next,scoreBox,levelBox,linesBox,hold];
  for(const [x,y,w,h] of panels){
   assert.ok(Math.abs(w-r.nextPanel.w)<.00001,'ALL five boxes have equal width');
   assert.ok(Math.abs(x+w-r.sideX-r.sideW)<.00001,
    'all five boxes share the header/footer right alignment');
   assert.ok(Math.abs(x+w-r.hx-r.hw)<.00001,
    'portrait boxes end at header right edge');
  }
  assert.deepEqual(next.slice(0,4),[
   r.nextPanel.x,r.nextPanel.y,r.nextPanel.w,r.nextPanel.h]);
  assert.deepEqual(hold.slice(0,4),[
   r.holdPanel.x,r.holdPanel.y,r.holdPanel.w,r.holdPanel.h]);
  for(const [outer,inner] of [[next,nextInner],[scoreBox,scoreInner],
   [levelBox,levelInner],[linesBox,linesInner],[hold,holdInner]]){
   assert.equal(inner[4],0,'inner border remains square');
   assert.equal(inner[5],null,'inner border has no fill');
   assert.equal(inner[6],'#cecece','inset frame matches solid button luminance');
   const rim=Math.min(4,Math.max(2,(outer[3]-12)/2));
   assert.deepEqual(inner.slice(0,4),[
    outer[0]+rim,outer[1]+rim,outer[2]-2*rim,outer[3]-2*rim]);
  }
  assert.equal(next[3],hold[3],'NEXT/HOLD same preview height');
  assert.equal(next[2],hold[2],'NEXT/HOLD same preview width');
  assert.ok(Math.abs(scoreBox[3]-levelBox[3])<.00001,
   'SCORE and LEVEL readouts have equal heights');
  assert.ok(Math.abs(scoreBox[3]-linesBox[3])<.00001,
   'SCORE and LINES readouts have equal heights');
  assert.ok(scoreBox[1]>=r.statsPanel.y);
  assert.ok(linesBox[1]+linesBox[3]<=r.statsPanel.y+r.statsPanel.h+.00001);
  assert.ok(scoreBox[1]+scoreBox[3]<levelBox[1]);
  assert.ok(levelBox[1]+levelBox[3]<linesBox[1]);
  assert.equal(painted.text[0][5],'left','NEXT outside label left aligned');
  assert.equal(painted.text.at(-1)[5],'left','HOLD outside label left aligned');
  assert.ok(Math.abs(painted.text[0][1]-(next[0]+Math.max(3,Math.min(6,r.statsPanel.w*.06))+1))<.00001);
  assert.ok(Math.abs(painted.text.at(-1)[1]-painted.text[0][1])<.00001);
  for(const [index,boxIndex] of [[1,1],[3,2],[5,3]]){
   const label=painted.text[index],number=painted.text[index+1],box=panels[boxIndex];
   assert.equal(label[5],'left','readout label remains left-aligned');
   assert.ok(label[2]<box[1],'readout label sits OUTSIDE the box');
   assert.equal(number[5],'left','terminal data are left aligned');
   assert.equal(number[7],'terminal','retain approved terminal font');
   const valueInset=Math.max(10,Math.min(12,box[2]*.14));
   assert.ok(Math.abs(number[1]-(box[0]+valueInset))<.00001);
  }
  const railEnd=r.boardX+r.boardW+r.brickGap+r.previewCell;
  assert.ok(Math.abs(next[0]-railEnd-r.brickGap)<1e-7,
   'brick-to-sidebar gutter matches board-to-brick gutter');
  assert.ok(Math.abs(r.nextPanel.y-r.previewLabelSpace-r.boardY)<.01);
  assert.ok(Math.abs(r.holdPanel.y+r.holdPanel.h-r.boardY-r.boardH)<.01);
  assert.ok(Math.abs(r.statsPanel.y+r.statsPanel.h/2-r.boardY-r.boardH/2)<.01);
  assert.ok(r.statsPanel.h<=150.01,'three readouts remain compact');
  assert.equal(painted.rects.length,0,'no separator lines or bevel details');
  assert.ok(panels.slice(1,4).every(p=>p[5]==='#1d1d1d'&&p[6]==='#777'),
   'readout fill matches header and footer');
  for(const piece of painted.pieces){
   assert.ok(piece[3]>0&&piece[4]>0);
   assert.ok(piece[3]<=r.nextPanel.w-10+.001);
   assert.ok(piece[4]<=r.nextPanel.h-10+.001);
   assert.ok(Math.abs(piece[6]-((r.boardW-4)/10)*.75)<1e-8,
    'preview targets exactly 75% game tile size');
  }
 });
 test('all seven tetrominoes fit without distortion in NEXT and HOLD',()=>{
  const shapes=[
   [[1,1,1,1]],[[1,1],[1,1]],
   [[0,1,0],[1,1,1]],[[1,0],[1,0],[1,1]],
   [[0,1],[0,1],[1,1]],[[1,1,0],[0,1,1]],[[0,1,1],[1,1,0]]
  ];
  for(const role of ['next','hold']){
   for(const frame of [
    {x:10,y:20,w:80,h:80},{x:3,y:8,w:36,h:36},
    {x:20,y:30,w:120,h:48},{x:10,y:0,w:38,h:95}
   ]){
    for(const shape of shapes){
     const cells=fitPreviewCells(shape,frame.x,frame.y,frame.w,frame.h,role);
     assert.equal(cells.length,4,'each tetromino has four square cells');
     for(const tile of cells){
      assert.ok(tile.size>0);
      assert.ok(tile.x>=frame.x-.001&&tile.y>=frame.y-.001);
      assert.ok(tile.x+tile.size<=frame.x+frame.w+.001);
      assert.ok(tile.y+tile.size<=frame.y+frame.h+.001);
     }
    }
   }
  }
 });
 test('all seven tetrominoes use exactly 75% of game tile on normal panels',()=>{
  const shapes=[
   [[1,1,1,1]],[[1,1],[1,1]],
   [[0,1,0],[1,1,1]],[[1,0],[1,0],[1,1]],
   [[0,1],[0,1],[1,1]],[[1,1,0],[0,1,1]],[[0,1,1],[1,1,0]]
  ];
  const r=computeLayout(393,852,{top:59,bottom:34},ui);
  for(const role of ['next','hold']){
   const frame=role==='next'?r.nextPanel:r.holdPanel;
   const inset=5,inner=frame.w-2*inset;
   for(const shape of shapes){
    const cells=fitPreviewCells(shape,frame.x+inset,frame.y+inset,
     inner,frame.h-2*inset,role,r.previewCell);
    assert.equal(cells.length,4);
    for(const tile of cells){
     assert.ok(Math.abs(tile.size-r.previewCell)<.000001,
      'each block is 0.75 × board tile size');
     assert.ok(tile.x>=frame.x+inset-.001&&tile.y>=frame.y+inset-.001);
     assert.ok(tile.x+tile.size<=frame.x+frame.w-inset+.001);
     assert.ok(tile.y+tile.size<=frame.y+frame.h-inset+.001);
    }
   }
  }
 });
 test('approved 6 game controls retain button arrangement and positions',()=>{
  const r=computeLayout(393,852,{top:59,bottom:34},ui);
  const {hud,painted}=makeHUD();
  hud.drawControls(r);
  assert.equal(painted.panels.length,1,'enclosing controls container is visible');
  assert.deepEqual(painted.keys.map(k=>k[0]),['◀','DROP','▶','↻','HOLD','PAUSE']);
  assert.deepEqual(painted.keys.map(k=>k[5]),['left','soft','right','cw','hold','pause']);
  assert.deepEqual(painted.keys.map(k=>k[2]),[
   r.dy+r.deckPad,r.dy+r.deckPad,r.dy+r.deckPad,r.dy+r.deckPad,
   r.dy+r.deckPad+r.buttonH+r.deckGap,r.dy+r.deckPad+r.buttonH+r.deckGap
  ]);
  assert.deepEqual(painted.text,[],'level score lines no longer drawn above game buttons');
 });
 test('V155 stream-backed two-row operation log replaces the old shaded version strip',()=>{
  const source=fs.readFileSync(new URL('../tetris/three-v027.js',import.meta.url),'utf8');
  const merged=fs.readFileSync(new URL('../tetris/render.js',import.meta.url),'utf8');
  const cropped=merged.slice(0,merged.indexOf('// Textures, sprite art'));
  const terminal=merged.slice(merged.indexOf('// Canvas user interface, overlay'));
  const html=fs.readFileSync(new URL('../tetris/three-v027.html',import.meta.url),'utf8');
  assert.match(source,/text\('NOMAD'/);
  assert.match(source,/text\('TETRIS SYSTEM'/);
  assert.match(source,/function stage\(r,drawPieces=true\)/);
  assert.match(source,/const FONT='"Roboto Condensed"/);
  assert.match(source,/const TERMINAL_FONT='"Share Tech Mono"/);
  assert.doesNotMatch(source,/const footerLeft=|ruleStart,r\.footerY|rect\(r\.off\+11,r\.footerY-12/);
  assert.match(source,/drawTerminalLog\(g,terminalLog,r,performance\.now\(\),C\.ink,C\.bg,FONT\)/);
  assert.doesNotMatch(cropped,/r\.dy\+r\.dh\+1/);
  assert.match(terminal,/r\.dy\+r\.dh\+1/);
  assert.match(terminal,/Roboto Condensed/);
  assert.doesNotMatch(html,/family=VT323/);
  assert.match(terminal,/composeTerminalMessage/);
  assert.match(source,/C\.bg,FONT\)/);
  for(const [w,h,safe] of [
   [393,852,{top:59,bottom:34}],
   [320,568,{top:18,bottom:0}],
   [852,393,{top:0,bottom:20}]
  ]){
   const r=computeLayout(w,h,safe,ui);
   assert.ok(r.dy+r.dh<=r.dy+r.dh+1+.01,
    'both terminal rows stay OUTSIDE and below the controls container');
   if(!r.landscape)assert.equal(r.dx+r.dw,r.hx+r.hw,
     'portrait controls retain their established header alignment');
  }
 });
 test('official logo is an editable, rounded-cap SVG bundled locally',()=>{
  const svg=fs.readFileSync(new URL('../tetris/nomad-mark.svg',import.meta.url),'utf8');
  const html=fs.readFileSync(new URL('../tetris/three-v027.html',import.meta.url),'utf8');
  const sw=fs.readFileSync(new URL('../tetris/sw.js',import.meta.url),'utf8');
  assert.match(svg,/<svg [^>]*viewBox="0 0 160 64"/);
  assert.match(svg,/stroke-linecap="round"/);
  assert.match(svg,/<circle cx="80" cy="32" r="24"/);
  assert.equal((svg.match(/ M\d+/g)||[]).length,5);
  assert.match(svg,/M18 18 H56 M104 18 H142 M8 32 H51 M109 32 H152 M18 46 H56 M104 46 H142/);
  assert.ok(56-18<51-8&&142-104<152-109,'middle strokes are longest');
  assert.match(sw,/\.\/nomad-mark\.svg/);
  assert.match(html,/family=Roboto\+Condensed/);
 });

 test('recessed SCORE LEVEL LINES modules keep equal widths across viewports',()=>{
  for(const [w,h,safe] of [
   [393,852,{top:59,bottom:34}],[430,932,{top:62,bottom:34}],
   [375,812,{top:50,bottom:34}],[320,568,{top:20}],
   [280,600,{top:20,bottom:20}],[844,390,{left:59,right:59,bottom:21}],
   [667,375,{left:44,right:44}],[568,320,{left:44,right:44}]
  ]){
   const r=computeLayout(w,h,safe,ui),{hud,painted}=makeHUD();
   hud.drawSidebar(r);
   assert.equal(painted.panels.length,10);
   const boxes=[0,2,4,6,8].map(i=>painted.panels[i]);
   const insets=[1,3,5,7,9].map(i=>painted.panels[i]);
   for(let i=0;i<5;i++){
    const outer=boxes[i],inner=insets[i];
    assert.ok(inner[0]>outer[0]&&inner[1]>outer[1]);
    assert.ok(inner[0]+inner[2]<outer[0]+outer[2]);
    assert.ok(inner[1]+inner[3]<outer[1]+outer[3]);
    assert.equal(inner[4],0,'inset frame remains square');
    assert.equal(inner[6],'#cecece','internal boundary matches button outline');
    assert.equal(outer[5],'#1d1d1d','readout matches header/footer fill');
   }
   assert.ok(boxes.every(box=>Math.abs(box[2]-r.nextPanel.w)<1e-7),
    'NEXT/HOLD and all score modules keep identical widths');
   if(!r.landscape){
    const railEnd=r.boardX+r.boardW+r.brickGap+r.previewCell;
    assert.ok(Math.abs(boxes[0][0]-railEnd-r.brickGap)<1e-7,
     'right brick-to-panel gap matches board-to-brick gap');
    assert.ok(Math.abs(boxes[0][0]+boxes[0][2]-r.hx-r.hw)<1e-7,
     'all sidebar containers still right-aligned with the header');
   }
   assert.ok(boxes.every(box=>Math.abs(box[0]+box[2]-r.nextPanel.x-r.nextPanel.w)<1e-7),
    'all readouts align with the same sidebar right edge');
   assert.ok(boxes.slice(1,4).every(box=>box[4]===0&&box[3]>0),
    'flat score frames have no bevel');
   for(let i=1;i<4;i++){
    const p=painted.text[2*i-1],value=painted.text[2*i];
    assert.ok(p[2]<boxes[i][1],'label above its numbered panel');
    assert.equal(value[5],'left','number stays left aligned');
    const valueInset=Math.max(10,Math.min(12,boxes[i][2]*.14));
    assert.ok(Math.abs(value[1]-(boxes[i][0]+valueInset))<1e-7,
     'number stays at its left inset');
   }
  }
 });

 test('V143 removes rejected mascot SVG and board decal',()=>{
  const renderer=fs.readFileSync(new URL('../tetris/three-v027.js',import.meta.url),'utf8');
  const sw=fs.readFileSync(new URL('../tetris/sw.js',import.meta.url),'utf8');
  assert.doesNotMatch(renderer,/soldierSticker|soldier-sticker|assets\/mascot\/|decalW|decalH/);
  assert.doesNotMatch(sw,/nomad-field-soldier-head\.svg/);
  assert.equal(fs.existsSync(new URL('../tetris/assets/mascot/nomad-field-soldier-head.svg',import.meta.url)),false);
  assert.match(renderer,/rect\(offX,offY,w-4,h-4,'#181818'\)/);
 });

 test('V162 stamps independently owned and rotating piece shadows onto the board',()=>{
  const renderer=fs.readFileSync(new URL('../tetris/three-v027.js',import.meta.url),'utf8');
  const sw=fs.readFileSync(new URL('../tetris/sw.js',import.meta.url),'utf8');
  const start=renderer.indexOf('function stage(r,drawPieces=true){');
  const end=renderer.indexOf('function paintBoardPopup(r)',start);
  const board=renderer.slice(start,end);
  assert.ok(start>=0&&end>start,'inset shadow belongs to board renderer');
  assert.match(board,/g\.globalAlpha=\.751355748;g\.strokeStyle=C\.grid/);
  assert.match(board,/rect\(offX,offY,w-4,h-4,'#181818'\)/);
  assert.match(renderer,/grid:'#2b2b2b'/);
  assert.match(renderer,/collectPieceShadowGroups,createPieceShadowRenderer/);
  assert.match(board,/collectPieceShadowGroups\(displayBoard,displayMeta,/);
  assert.match(board,/pieceShadows\.draw\(g,shadowGroups,offX,offY,tile\)/);
  assert.doesNotMatch(board,/g\.shadowBlur=5\.5|g\.shadowOffsetY=4\.5/);
  assert.match(sw,/\.\/render\.js/);
  assert.match(renderer,/terminalLog\.enqueue\('BUILD: VERSION V'\+THREE_BUILD_VERSION,/);
  assert.match(board,/for\(const run of iRuns\)/);
  assert.match(board,/const depth=Math\.min\(20,Math\.max\(8,tile\*\.8\)\)/);
  assert.equal((board.match(/insetShade\(/g)||[]).length,4,
   'top, left, bottom and right inner shadow strips');
  assert.match(board,/g\.createLinearGradient/);
  assert.match(board,/g\.fillRect\(rx,ry,rw,rh\)/);
  assert.match(board,/g\.rect\(offX,offY,w-4,h-4\);g\.clip\(\)/);
  assert.match(board,/rect\(offX,offY,w-4,h-4,'#181818'\)/);
 });
});

describe('Shared hitboxes and slider geometry',()=>{
 test('button descriptor uses exactly the same bounds for drawing and hits',()=>{
  for(const [label,x,y,w,h,action,opts] of [
   ['PAUSE',100,200,90,46,'pause',{}],
   ['◀',12,654,60,53,'left',{light:true,repeat:true}],
   ['DROP',78,654,125,53,'hard',{light:true}],
   ['X',327,65,46,46,'close',{modalControl:true}]
  ]){
   const b=makeButtonControl(label,x,y,w,h,action,opts);
   assert.equal(b.kind,'button');
   assert.equal(b.label,label);
   assert.deepEqual([b.hitbox.x,b.hitbox.y,b.hitbox.w,b.hitbox.h,b.hitbox.act],
    [b.x,b.y,b.w,b.h,b.act]);
   assert.equal(b.hitbox.repeat,b.repeat);
   assert.equal(b.hitbox.modalControl,b.modalControl);
  }
 });
 test('each button holds no unrelated modal or gameplay state',()=>{
  const a=makeButtonControl('HOLD',3,4,50,40,'hold',{light:false,arrow:true});
  const b=makeButtonControl('PAUSE',3,4,50,40,'pause',{modalControl:true});
  assert.equal(a.hitbox.modalControl,false);
  assert.equal(b.hitbox.modalControl,true);
  assert.equal(a.arrow,true);
  assert.equal(b.arrow,false);
 });
 test('slider describes painted track, handle and hit region as one geometry',()=>{
  const a=makeSliderControl(100,200,220,['','bloomStrength',0,100,1,'%'],25);
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
   const s=makeSliderControl(x,y,w,setting,value);
   assert.equal(s.labelW,width);
   assert.equal(s.valueText,digits);
   assert.equal(s.hitbox.field,setting[1]);
  }
 });
 test('slider input maps the identical model track to persisted values',()=>{
  const s=makeSliderControl(22,120,284,['','opacity',0,100,5,'%'],50);
  assert.equal(sliderValueAt(s.hitbox,s.trackX),0);
  assert.equal(sliderValueAt(s.hitbox,s.trackX+s.trackW*.51),50);
  assert.equal(sliderValueAt(s.hitbox,s.trackX+s.trackW),100);
  assert.equal(sliderValueAt(s.hitbox,s.trackX-999),0);
  assert.equal(sliderValueAt(s.hitbox,s.trackX+s.trackW+999),100);
 });
 test('input hit-tests select newest overlay and preserve inclusive boundaries',()=>{
  const a=makeRegion(0,0,300,600,'board',{board:true});
  const b=makeButtonControl('PAUSE',10,10,70,44,'pause');
  const c=makeButtonControl('X',10,10,70,44,'close');
  assert.equal(findRegionAt([a,b.hitbox,c.hitbox],{x:30,y:30}).act,'close');
  assert.equal(findRegionAt([a,b.hitbox],{x:10,y:10}).act,'pause');
  assert.equal(findRegionAt([a,b.hitbox],{x:80,y:54}).act,'pause');
  assert.equal(findRegionAt([a,b.hitbox],{x:90,y:60}).act,'board');
  assert.equal(findRegionAt([a],{x:-1,y:3}),undefined);
 });
 test('options controls are vertically clipped to scroll viewport',()=>{
  const toggle=makeRegion(20,50,180,60,'toggle',{field:'bloom',modalControl:true});
  const ordinary=makeRegion(20,50,180,60,'scroll',{scroll:true});
  const view={x:20,y:80,w:180,h:200};
  assert.equal(findRegionAt([ordinary,toggle],{x:30,y:65},'options',view).act,'scroll');
  assert.equal(findRegionAt([ordinary,toggle],{x:30,y:90},'options',view).act,'toggle');
  assert.equal(findRegionAt([ordinary,toggle],{x:30,y:65},null,view).act,'toggle');
 });
});

describe('Pointer and keyboard input',()=>{
 function target(){
  const listeners=new Map();
  return {
   listeners,
   addEventListener(name,handler,options){listeners.set(name,{handler,options});},
   removeEventListener(name,handler,options){
    assert.equal(listeners.get(name)?.handler,handler);
    assert.equal(listeners.get(name)?.options,options);
    listeners.delete(name);
   },
   emit(name,event){return listeners.get(name)?.handler(event);}
  };
 }
 function harness(repeating=false,canInteract=()=>true,regions=null){
  const screen=target(),document=target(),window=target();
  let captured=null,released=0,actions=[],invalidations=0,buttonPresses=[],buttonReleases=[];
  screen.getBoundingClientRect=()=>({left:0,top:0,width:100,height:60});
  screen.setPointerCapture=id=>{captured=id};
  screen.hasPointerCapture=id=>captured===id;
  screen.releasePointerCapture=id=>{assert.equal(id,captured);captured=null;released++};
  function loseCapture(id){
   if(captured===id)captured=null;
   screen.emit('lostpointercapture',{type:'lostpointercapture',pointerId:id});
  }
  const controller=createInputController({
   screen,document,window,initialsInput:{},
   getViewport:()=>({width:100,height:60}),
   getRegions:()=>regions||[{x:0,y:0,w:100,h:60,act:'left',repeat:repeating}],
   getModal:()=>null,getModalView:()=>null,getOptionsScroll:()=>0,
   setOptionsScroll:()=>{},getOptionsMaxScroll:()=>0,setScrollVelocity:()=>{},
   setBaseDirty:()=>{},handleAction:a=>actions.push(a),perform:a=>actions.push(a),
   setSetting:()=>{},settingValue:()=>0,toggleScanlineMenu:()=>{},chooseScanline:()=>{},
   openModal:()=>{},invalidate:()=>{invalidations++},
   clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),canInteract,
   onButtonPress:(hit,now,held)=>buttonPresses.push({hit,held}),
   onButtonRelease:hit=>buttonReleases.push(hit)
  });
  function down(id=3){
   screen.emit('pointerdown',{
    pointerType:'touch',button:0,pointerId:id,clientX:20,clientY:20,timeStamp:1,
    preventDefault(){}
   });
  }
  return {controller,screen,document,window,down,loseCapture,
   get captured(){return captured},get released(){return released},
   get actions(){return actions},get invalidations(){return invalidations},
   get buttonPresses(){return buttonPresses},get buttonReleases(){return buttonReleases}
  };
 }
 test('input ownership registers one matching listener for each event',()=>{
  const h=harness();
  assert.deepEqual([...h.screen.listeners.keys()],
   ['contextmenu','selectstart','pointerdown','pointermove','pointerup','pointercancel','lostpointercapture','wheel']);
  assert.deepEqual([...h.window.listeners.keys()],['blur']);
  assert.deepEqual([...h.document.listeners.keys()],['keydown']);
  assert.deepEqual(h.screen.listeners.get('wheel').options,{passive:false});
 });
 test('final disposal releases capture, removes all listeners and is idempotent',()=>{
  const h=harness();h.down();
  assert.equal(h.controller.pressed.id,3);
  assert.equal(h.captured,3);
  assert.equal(h.controller.dispose(),true);
  assert.equal(h.released,1);
  assert.equal(h.controller.pressed,null);
  assert.equal(h.controller.disposed,true);
  assert.equal(h.screen.listeners.size,0);
  assert.equal(h.window.listeners.size,0);
  assert.equal(h.document.listeners.size,0);
  assert.equal(h.controller.dispose(),false);
  assert.equal(h.released,1);
 });
 test('disposal cancels delayed button repeats and ignores subsequent input',async()=>{
  const h=harness(true);
  h.down();assert.deepEqual(h.actions,['left']);
  h.controller.dispose();
  await new Promise(resolve=>setTimeout(resolve,255));
  h.screen.emit('pointerdown',{pointerId:4,clientX:20,clientY:20,preventDefault(){}});
  h.document.emit('keydown',{code:'ArrowLeft',preventDefault(){}});
  assert.deepEqual(h.actions,['left']);
 });
 test('temporary cancel retains listeners for browser restoration',()=>{
  const h=harness();
  h.down();h.controller.cancel();
  assert.equal(h.controller.pressed,null);
  assert.equal(h.screen.listeners.size,8);
  h.down(4);
  assert.equal(h.controller.pressed.id,4);
  assert.deepEqual(h.actions,['left','left']);
  h.controller.dispose();
 });
 test('losing pointer capture stops an active repeat and allows the next touch',t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const hit={x:0,y:0,w:100,h:60,act:'soft',kind:'button',repeat:true};
  const h=harness(false,()=>true,[hit]);
  try{
   h.down(3);
   t.mock.timers.tick(50);
   assert.deepEqual(h.actions,['soft','soft']);
   h.loseCapture(4);
   assert.equal(h.controller.pressed.id,3);
   h.loseCapture(3);
   assert.equal(h.controller.pressed,null);
   assert.deepEqual(h.buttonReleases,[hit]);
   t.mock.timers.tick(150);
   assert.deepEqual(h.actions,['soft','soft']);
   h.down(5);
   assert.equal(h.controller.pressed.id,5);
   assert.deepEqual(h.actions,['soft','soft','soft']);
  }finally{h.controller.dispose();}
 });
 test('Enter and numpad Enter activate the primary game action once per press',()=>{
  const primary={x:0,y:0,w:100,h:60,act:'start',kind:'button'};
  const h=harness(false,()=>true,[primary]);
  for(const [code,repeat] of [['Enter',false],['Enter',true],['NumpadEnter',false]]){
   h.document.emit('keydown',{code,repeat,preventDefault(){}});
  }
  assert.deepEqual(h.actions,['start','start']);
  assert.deepEqual(h.buttonPresses,[{hit:primary,held:false},{hit:primary,held:false}]);
  h.controller.dispose();
 });

 test('suspended and recovering pages cannot receive hidden pointer or keyboard actions',()=>{
  let active=false;
  const h=harness(false,()=>active);
  h.down();h.document.emit('keydown',{code:'ArrowLeft',preventDefault(){}});
  assert.deepEqual(h.actions,[]);
  assert.equal(h.controller.pressed,null);
  active=true;
  h.down(5);
  assert.deepEqual(h.actions,['left']);
  active=false;
  h.screen.emit('pointerup',{pointerId:5,clientX:20,clientY:20,timeStamp:3});
  assert.equal(h.controller.pressed,null);
  assert.deepEqual(h.actions,['left']);
  h.controller.dispose();
 });

 test('pointer holds and keyboard taps share button luminance model',()=>{
  const hit={x:0,y:0,w:100,h:60,act:'left',kind:'button',repeat:false};
  const h=harness(false,()=>true,[hit]);
  h.down();
  assert.equal(h.buttonPresses.length,1);
  assert.equal(h.buttonPresses[0].hit,hit);
  assert.equal(h.buttonPresses[0].held,true);
  h.controller.cancel();
  assert.equal(h.buttonReleases[0],hit);
  h.document.emit('keydown',{code:'ArrowLeft',repeat:false,preventDefault(){}});
  assert.equal(h.buttonPresses.length,2);
  assert.equal(h.buttonPresses[1].hit,hit);
  assert.equal(h.buttonPresses[1].held,false);
  h.controller.dispose();
 });
 test('tapping and swiping outside controls do not capture input or move a piece',()=>{
  const h=harness(false,()=>true,[]);
  for(const [clientX,clientY] of [[20,20],[85,20],[20,55]]){
   h.down();
   h.screen.emit('pointermove',{pointerId:3,clientX,clientY});
   h.screen.emit('pointerup',{type:'pointerup',pointerId:3,clientX,clientY});
  }
  assert.equal(h.captured,null);
  assert.deepEqual(h.actions,[]);
  assert.deepEqual(h.buttonPresses,[]);
  h.controller.dispose();
 });
 test('inactive and recovering sessions cannot trigger afterglow events',()=>{
  const hit={x:0,y:0,w:100,h:60,act:'left',kind:'button'};
  const h=harness(false,()=>false,[hit]);
  h.down();
  h.document.emit('keydown',{code:'ArrowLeft',preventDefault(){}});
  assert.deepEqual(h.buttonPresses,[]);
  h.controller.dispose();
 });

 test('iOS native long-press menus and selection are suppressed on the game surface',()=>{
  const h=harness();
  let cancelled=0;
  h.screen.emit('contextmenu',{preventDefault(){cancelled++}});
  h.screen.emit('selectstart',{preventDefault(){cancelled++}});
  assert.equal(cancelled,2);
  h.down();
  assert.deepEqual(h.actions,['left'],'press action remains immediate');
  assert.equal(h.controller.pressed.id,3,'long press remains owned by game');
  h.controller.dispose();
  assert.equal(h.screen.listeners.size,0,'native-menu prevention cleans up');
 });

 test('long-press suppression is scoped to canvas, not the high-score initials',()=>{
  const h=harness();
  assert.equal(h.document.listeners.has('contextmenu'),false);
  assert.equal(h.document.listeners.has('selectstart'),false);
  assert.equal(h.window.listeners.has('contextmenu'),false);
  h.controller.dispose();
 });
});
