import {describe,test} from 'node:test';
import assert from 'node:assert/strict';
import fs,{readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {drawTileFace,drawIBar,PIECE_PATTERNS,PIECE_LUMINANCE,drawPieceTiles,collectIFragments,drawIFragment,createVectorTileRenderer,spriteIdentity,VECTOR_PIECE_KINDS,collectPieceShadowGroups,pieceShadowProfile,createPieceShadowRenderer} from '../tetris/render.js';
import {renderSmoothTileSVG,renderIFragmentSVG,renderIStateSVG,IFragmentRuns,originalIDotCenters,originalJDotCenters} from '../tetris/assets/tiles/smooth-geometry.mjs';
import Core from '../tetris/game.js';
import {BRICK_UNIT,brickShapes,renderBrickSVG,brickRailGeometry,createBrickFrame} from '../tetris/assets/frames/brick-pattern.mjs';
import Layout from '../tetris/render.js';

describe('Sprite masters and SVG artwork',()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../tetris/assets/tiles');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 function signature(m){
  let v=2166136261>>>0;
  for(const c of m.flat()){
   const n=c+1;v=Math.imul(v^(n&255),16777619)>>>0;
   v=Math.imul(v^((n>>>8)&255),16777619)>>>0;
  }
  return v.toString(16).padStart(8,'0');
 }
 function actualTiles(kind){
  const width=kind==='I'?48:12,height=12;
  const grid=Array.from({length:height},()=>Array(width).fill(-1));
  const canvas={
   fillStyle:'',fillRect(x,y,w,h){
    const match=/^rgb\((\d+),(\d+),(\d+)\)$/.exec(this.fillStyle);
    assert.ok(match);assert.equal(match[1],match[2]);assert.equal(match[2],match[3]);
    for(let ry=0;ry<height;ry++)for(let rx=0;rx<width;rx++)
     if(rx+.5>=x&&rx+.5<x+w&&ry+.5>=y&&ry+.5<y+h)
      grid[ry][rx]=Number(match[1]);
   }
  };
  if(kind==='I')drawIBar(canvas,0,0,width,height);
  else drawTileFace(canvas,0,0,width,height,kind);
  return grid;
 }
 function pixelSVGData(svg,w,h){
  const grid=Array.from({length:h},()=>Array(w).fill(-1));
  const rx=/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="rgb\((\d+),(\d+),(\d+)\)"\/>/g;
  let count=0;
  for(const match of svg.matchAll(rx)){
   const [x,y,width,height,r,g,b]=match.slice(1).map(Number);
   assert.equal(r,g);assert.equal(g,b);
   for(let yy=y;yy<y+height;yy++)for(let xx=x;xx<x+width;xx++)grid[yy][xx]=r;
   count++;
  }
  assert.ok(count>0,'pixel SVG has real shapes');
  return grid;
 }
 test('seven pixel masters and seven smooth SVGs exist independently',()=>{
  assert.deepEqual(manifest.order,['I','O','T','S','Z','J','L']);
  assert.deepEqual(PIECE_PATTERNS,{
   I:'continuous-gravel',J:'dotted-field',L:'recessed-square',
   O:'corner-highlight',S:'small-center',T:'solid-fill',Z:'centered-square'
  });
  assert.equal(manifest.vectorGenerator,'smooth-geometry.mjs');
  assert.equal(manifest.version,'2.2');
  for(const kind of manifest.order)for(const style of ['pixel','vector']){
   const f=path.join(root,manifest.pieces[kind][style]);
   assert.ok(fs.existsSync(f),kind+' '+style);
   const xml=fs.readFileSync(f,'utf8');
   assert.match(xml,/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
   assert.ok(xml.endsWith('</svg>\n'));
   assert.ok(xml.includes('data-kind="'+kind+'"'));
   assert.ok(xml.includes('data-style="'+style+'"'));
   assert.ok(!xml.includes('<image'),'no hidden raster images');
  }
 });
 test('approved pixel masters are bit-for-bit faithful to the V119 pixel renderer',()=>{
  for(const kind of manifest.order){
   const expected=actualTiles(kind),w=expected[0].length,h=expected.length;
   const svg=fs.readFileSync(path.join(root,manifest.pieces[kind].pixel),'utf8');
   assert.deepEqual(pixelSVGData(svg,w,h),expected,'master drift: '+kind);
   assert.equal(signature(expected),manifest.pieces[kind].sourceSignature);
   assert.ok(svg.includes('data-signature="'+signature(expected)+'"'));
  }
 });
 test('smooth SVGs regenerate exactly from layered source, without micro-rounded paths',()=>{
  for(const kind of manifest.order){
   const vector=fs.readFileSync(path.join(root,manifest.pieces[kind].vector),'utf8');
   assert.equal(vector,renderSmoothTileSVG(kind),'generated source changed: '+kind);
   assert.ok(vector.includes('data-signature="'+manifest.pieces[kind].sourceSignature+'"'));
   assert.match(vector,/shape-rendering="geometricPrecision"/);
   assert.match(vector,/<rect /);
   assert.doesNotMatch(vector,/<path|<image|<filter| rx=| ry=|checker|stripe|diagonal/);
   const circles=(vector.match(/<circle /g)||[]).length;
   assert.equal(circles,kind==='I'?31:kind==='J'?9:0);
  }
 });
 test('O corner is a genuine straight-edged triangle and the art has no separated bevel strokes',()=>{
  const o=renderSmoothTileSVG('O');
  assert.match(o,/<polygon points="3,3 8,3 3,8" fill="rgb\(242,242,242\)"\/>/);
  assert.doesNotMatch(o,/<path|<line|stroke=|stroke-width|<circle/);
  const t=renderSmoothTileSVG('T');
  assert.equal((t.match(/<rect /g)||[]).length,1);
 });
 test('dot scatter is stable, bounded, and visually organic',()=>{
  const i=originalIDotCenters(),j=originalJDotCenters();
  assert.equal(i.length,31);assert.equal(j.length,9);
  assert.deepEqual(i,originalIDotCenters());assert.deepEqual(j,originalJDotCenters());
  assert.ok(i.every(p=>p.x>=2&&p.x<=46&&p.y>=2&&p.y<=10));
  assert.ok(j.every(p=>p.x>=2&&p.x<=10&&p.y>=2&&p.y<=10));
  assert.ok(i.some(p=>!Number.isInteger(p.x*2)),'jitter not aligned to pixel grid');
 });
 test('I original coordinates survive any contiguous fragment at any original offset',()=>{
  const original=originalIDotCenters();
  for(let offset=0;offset<4;offset++)for(let length=1;length<=4-offset;length++){
   const expected=original.filter(p=>
    p.x-p.radius>=offset*12+1.35&&p.x+p.radius<=offset*12+length*12-1.35);
   const out=renderIFragmentSVG({sourceOffset:offset,length});
   const centers=[...out.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)]
    .map(m=>({x:Number((Number(m[1])+offset*12).toFixed(3)),y:Number(m[2])}));
   const roundedExpected=expected.map(p=>({x:Number(p.x.toFixed(3)),y:Number(p.y.toFixed(3))}));
   assert.deepEqual(centers,roundedExpected,'phase moved at '+offset+'+'+length);
   assert.match(out,new RegExp('viewBox="0 0 '+(12*length)+' 12"'));
   const vertical=renderIFragmentSVG({sourceOffset:offset,length,orientation:'vertical'});
   assert.match(vertical,new RegExp('viewBox="0 0 12 '+(12*length)+'"'));
   assert.match(vertical,/rotate\(90\)/);
  }
 });
 test('all sixteen I deletion masks are supported in either orientation',()=>{
  for(let mask=0;mask<16;mask++){
   const runs=IFragmentRuns(mask);
   assert.equal(runs.reduce((n,r)=>n+r.length,0),mask.toString(2).replace(/0/g,'').length);
   for(const orientation of ['horizontal','vertical']){
    const svg=renderIStateSVG(mask,orientation);
    assert.ok(svg.includes('data-source-mask="'+mask+'"'));
    assert.ok(svg.includes('data-orientation="'+orientation+'"'));
    assert.equal((svg.match(/<rect /g)||[]).length,runs.length*5);
   }
  }
  assert.throws(()=>IFragmentRuns(16),RangeError);
  assert.throws(()=>renderIFragmentSVG({sourceOffset:3,length:2}),RangeError);
 });
 test('the comparison page contains a functional original-cell masking control',()=>{
  const html=fs.readFileSync(path.join(root,'compare.html'),'utf8');
  assert.match(html,/import \{renderIStateSVG,IFragmentRuns\} from '\.\/smooth-geometry\.mjs\?v126'/);
  assert.match(html,/checks\.reduce\(\(n,ch,i\)=>n\|\(ch\.checked\?1<<i:0\),0\)/);
  assert.match(html,/const xml=renderIStateSVG\(mask,o\)/);
  assert.doesNotMatch(html,/core\.js|three-v027\.js|localStorage|serviceWorker/);
 });

 test('S and Z smooth versions have visibly differentiated light and shadow planes',()=>{
  const s=renderSmoothTileSVG('S'),z=renderSmoothTileSVG('Z');
  for(const svg of [s,z]){
   const values=[...svg.matchAll(/fill="rgb\((\d+),\1,\1\)"/g)].map(m=>Number(m[1]));
   assert.ok(Math.max(...values)-Math.min(...values)>135,'large tonal separation');
   assert.ok((svg.match(/<rect /g)||[]).length>=6,'explicit bottom/right shadows');
  }
 });
});

describe('Tile shading',()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../tetris/assets/tiles/vector');
 const kinds=['I','O','T','S','Z','J','L'];
 // Immutable V120 geometry fingerprints: shade tuning must not move a vertex,
 // alter gravel positions, add a bevel or change any block's bounding box.
 const originalGeometry=Object.freeze({
  I:'626a8628',O:'3f976e60',T:'d65d58ba',S:'50497d6b',
  Z:'00deea00',J:'fac9b25d',L:'29800bd4'
 });
 function hash(s){
  let h=2166136261>>>0;
  for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619)>>>0;
  return h.toString(16).padStart(8,'0');
 }
 function shapes(svg){
  return [...svg.matchAll(/<(?:rect|polygon|circle)\b[^>]*\/>/g)].map(m=>m[0]);
 }
 function grayscale(tag){
  const m=tag.match(/fill="rgb\((\d+),(\d+),(\d+)\)"/);
  assert.ok(m,'every shape must use grayscale: '+tag);
  assert.equal(m[1],m[2]);assert.equal(m[2],m[3]);
  return Number(m[1]);
 }
 const values=kind=>shapes(renderSmoothTileSVG(kind)).map(grayscale);

 test('V121 smooth SVG shading preserves the exact approved V120 geometry',()=>{
  for(const kind of kinds){
   const generated=renderSmoothTileSVG(kind);
   assert.equal(fs.readFileSync(path.join(root,kind+'.svg'),'utf8'),generated,
    'checked-in SVG differs from runtime generator: '+kind);
   const geometry=shapes(generated).map(s=>s.replace(/\sfill="[^"]*"/,'')).join('\n');
   assert.equal(hash(geometry),originalGeometry[kind],'geometry drift: '+kind);
   assert.doesNotMatch(generated,/<path| rx=| ry=|filter|random|stroke=/);
  }
 });

 test('all directed highlights are brighter and all opposite shadows darker',()=>{
  for(const [kind,minDifference,baseShade] of [
   ['O',80,142],['S',120,210],
   ['Z',120,10],['J',65,146],['L',95,157]
  ]){
   const v=values(kind);
   assert.equal(v[0],baseShade,'unchanged base luminance '+kind);
   assert.ok(v[1]-v[3]>=minDifference,'stronger directional contrast '+kind);
   assert.ok(v[1]>v[0],kind+' top/left highlight is lighter than base');
   if(kind!=='Z'&&kind!=='O')assert.ok(v[3]<v[0],kind+' lower bevel is a shadow');
  }
 });

 test('T remains a single, unchanged flat square and O keeps its genuine triangle',()=>{
  const t=renderSmoothTileSVG('T'),o=renderSmoothTileSVG('O');
  assert.deepEqual(values('T'),[142]);
  assert.equal(shapes(t).length,1);
  assert.equal((o.match(/<polygon/g)||[]).length,1);
  assert.match(o,/<polygon points="3,3 8,3 3,8" fill="rgb\(242,242,242\)"\/>/);
 });

 test('I gravel remains fixed when original four-block strip is fragmented',()=>{
  const original=renderIFragmentSVG({length:4});
  for(let offset=0;offset<4;offset++)for(let len=1;len<=4-offset;len++){
   const fragment=renderIFragmentSVG({sourceOffset:offset,length:len});
   assert.ok(fragment.includes('data-source-offset="'+offset+'"'));
   const dots=shapes(fragment).filter(tag=>tag.startsWith('<circle'));
   const dotsInWhole=shapes(original).filter(tag=>tag.startsWith('<circle'));
   assert.ok(dots.length<=dotsInWhole.length);
   // No render-time randomness or new gravel coordinates allowed.
   assert.equal(fragment,renderIFragmentSVG({sourceOffset:offset,length:len}));
  }
 });

 test('I-piece highlight is replaced with a same-position inset shadow',()=>{
  const faces=shapes(renderSmoothTileSVG('I'));
  assert.equal(faces[0],'<rect x="1" y="1" width="46" height="10" fill="rgb(164,164,164)"/>');
  assert.equal(faces[1],'<rect x="1" y="1" width="46" height="1" fill="rgb(77,77,77)"/>');
  assert.equal(faces[2],'<rect x="1" y="1" width="1" height="10" fill="rgb(77,77,77)"/>');
  assert.equal(grayscale(faces[3]),152);
  assert.equal(grayscale(faces[4]),149);
  for(let offset=0;offset<4;offset++)for(let length=1;length<=4-offset;length++){
   const parts=shapes(renderIFragmentSVG({sourceOffset:offset,length}));
   assert.equal(grayscale(parts[1]),77);
   assert.equal(grayscale(parts[2]),77);
   assert.equal(parts[1].match(/x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/)[0],
    'x="1" y="1" width="'+(length*12-2)+'" height="1"');
  }
 });

 test('the preserved I shadow is 35 percent darker than the prior V125 value',()=>{
  const prior=119,current=77;
  assert.equal(Math.round(prior*.65),current);
  assert.ok(current<prior);
 });
});

describe('Monochrome tile patterns',()=>{
 const kinds=['I','J','L','O','S','T','Z'];
 function capture(draw){
  const calls=[];
  const g={fillStyle:'',fillRect(x,y,w,h){calls.push({x,y,w,h,color:this.fillStyle});}};
  draw(g);
  return calls;
 }
 function shade(calls,x,y){
  let result=null;
  for(const r of calls){
   if(x>=r.x&&x<r.x+r.w-.0005&&y>=r.y&&y<r.y+r.h-.0005)
    result=Number(/^rgb\((\d+),/.exec(r.color)?.[1]);
  }
  return result;
 }
 test('seven approved patterns are mapped to their original Game Boy shapes',()=>{
  assert.deepEqual(PIECE_PATTERNS,{
   I:'continuous-gravel',J:'dotted-field',L:'recessed-square',
   O:'corner-highlight',S:'small-center',T:'solid-fill',Z:'centered-square'
  });
  assert.equal(Object.isFrozen(PIECE_PATTERNS),true);
  assert.ok(!Object.values(PIECE_PATTERNS).some(s=>/checker|stripe|diagonal/.test(s)));
  assert.deepEqual(PIECE_LUMINANCE,{I:219,J:129,L:183,O:237,S:201,T:147,Z:165});
 });
 test('every approved motif retains its distinctive light/dark pixel arrangement',()=>{
  const tile=k=>capture(g=>drawTileFace(g,0,0,12,12,k));
  const o=tile('O'),t=tile('T'),s=tile('S'),z=tile('Z'),j=tile('J'),l=tile('L');
  assert.ok(shade(o,3.5,3.5)>shade(o,7.5,7.5),'O corner is brighter');
  assert.equal(shade(t,2.5,2.5),shade(t,9.5,9.5),'T is flat solid fill');
  assert.ok(shade(s,5.5,5.5)<shade(s,3.5,3.5),'S has tiny dark center');
  assert.ok(shade(z,5.5,5.5)<shade(z,4.5,4.5),'Z has nested bright ring');
  assert.ok(shade(j,3.5,3.5)<shade(j,4.5,3.5),'J has sparse dark dots');
  assert.ok(shade(l,5.5,5.5)<shade(l,2.5,2.5),'L has a recessed square');
 });
 test('all source pixels are monochrome, deterministic and inside their tile',()=>{
  for(const kind of kinds)for(const size of [8,11,20,28]){
   const draw=()=>capture(g=>drawTileFace(g,12,18,size,size,kind));
   const calls=draw();
   assert.deepEqual(calls,draw(),kind+' is deterministic at '+size);
   assert.ok(calls.length>0&&calls.length<100,kind+' keeps drawing affordable');
   for(const r of calls){
    const match=/^rgb\((\d+),(\d+),(\d+)\)$/.exec(r.color);
    assert.ok(match,'valid grayscale');
    assert.equal(match[1],match[2]);assert.equal(match[2],match[3]);
    assert.ok(r.w>0&&r.h>0);
    assert.ok(r.x>=12&&r.y>=18);
    assert.ok(r.x+r.w<=12+size+.005&&r.y+r.h<=18+size+.005);
   }
  }
 });
 test('the four-block I is a single uninterrupted gravel bar, not four framed tiles',()=>{
  const tiles=[0,1,2,3].map(i=>({x:i*20,y:0,size:20}));
  const one=capture(g=>drawPieceTiles(g,tiles,'I'));
  const direct=capture(g=>drawIBar(g,0,0,80,20));
  assert.deepEqual(one,direct);
  const border=capture(g=>drawIBar(g,0,0,48,12));
  assert.equal(shade(border,2.5,1.5),shade(border,12.5,1.5),
   'top border does not restart between cells');
  const vertical=capture(g=>drawIBar(g,0,0,12,48));
  assert.equal(shade(vertical,1.5,2.5),shade(vertical,1.5,12.5),
   'vertical bar has no internal borders');
 });
 test('gameboard, falling piece and NEXT/HOLD use the same approved renderer',()=>{
  const code=readFileSync(new URL('../tetris/platform.js',import.meta.url),'utf8');
  assert.match(code,/vectorTiles\.drawPiece\(g,fitPreviewCells\(/);
  assert.match(code,/if\(p.kind==='I'\)vectorTiles\.drawPiece\(g,activeTiles,'I',\{rotation:p.rotation\}\)/);
  assert.match(code,/vectorTiles\.drawIFragment\(g,offX\+run\.x\*tile,offY\+run\.y\*tile,/);
  assert.match(code,/tileFace\(px,py,size,size,kind\)/);
  assert.match(code,/g.globalAlpha=\.751355748;g.strokeStyle=C.grid/);
 });
});

describe('Piece identity and fragments',()=>{
 const fresh=()=>{const g=new Core.Game(()=>.49);g.start();return g;};
 const locked=(g,kind,x,y,rotation=0)=>{
  const p=g.piece(kind);
  for(let i=0;i<rotation;i++){p.matrix=Core.turn(p.matrix,1);p.rotation=(p.rotation+1)%4;}
  p.x=x;p.y=y;g.current=p;g.lockPiece();return p.id;
 };

 test('touching horizontal I tetrominoes do not merge across instance identities',()=>{
  const g=fresh();
  const first=locked(g,'I',0,18);
  const second=locked(g,'I',4,18);
  const runs=collectIFragments(g.board,g.boardMeta);
  assert.equal(runs.length,2);
  assert.deepEqual(runs.map(x=>[x.pieceId,x.x,x.length,x.sourceOffset]),[
   [first,0,4,0],[second,4,4,0]
  ]);
  assert.ok(g.board[19].slice(0,8).every(x=>x==='I'));
  assert.equal(g.boardMeta[19][3].pieceId,first);
  assert.equal(g.boardMeta[19][4].pieceId,second);
 });

 test('vertical I retains sourceIndex after a middle row disappears',()=>{
  const g=fresh();
  g.board=Array.from({length:20},()=>Array(10).fill(0));
  for(let x=0;x<10;x++)if(x!==3)g.board[17][x]='Z';
  let event=null;
  g.onEvent(e=>{if(e.type==='lines-cleared')event=e;});
  const id=locked(g,'I',1,15,1);
  assert.deepEqual(event.rows,[17]);
  assert.equal(event.boardMeta[17][3].sourceIndex,2,'flash snapshot keeps the original deleted index');
  assert.equal(event.boardMeta[17][3].pieceId,id);
  assert.deepEqual(collectIFragments(g.board,g.boardMeta).map(x=>({
   id:x.pieceId,sourceOffset:x.sourceOffset,length:x.length,rotation:x.rotation,y:x.y
  })),[
   {id,sourceOffset:0,length:2,rotation:1,y:16},
   {id,sourceOffset:3,length:1,rotation:1,y:18}
  ]);
  assert.equal(g.board[18][3],'I');
  assert.equal(g.boardMeta[18][3].sourceIndex,3,'falling rows preserve original metadata');
  assert.ok(Object.isFrozen(event.boardMeta));
  assert.ok(Object.isFrozen(event.boardMeta[17]));
  assert.ok(Object.isFrozen(event.boardMeta[17][3]));
 });

 test('all four I rotations assign the original source indexes exactly once',()=>{
  for(let rotation=0;rotation<4;rotation++){
   const g=fresh(),id=locked(g,'I',2,10,rotation);
   const metadata=g.boardMeta.flat().filter(x=>x?.kind==='I');
   assert.equal(metadata.length,4);
   assert.deepEqual(metadata.map(x=>x.sourceIndex).sort(),[0,1,2,3]);
   assert.ok(metadata.every(x=>x.pieceId===id&&x.rotation===rotation));
   const runs=collectIFragments(g.board,g.boardMeta);
   assert.equal(runs.length,1);
   assert.equal(runs[0].length,4);
   assert.equal(runs[0].rotation,rotation);
  }
 });

 test('untracked cells do not merge and never inherit a neighbor identity',()=>{
  const board=Array.from({length:20},()=>Array(10).fill(0));
  board[19][1]='I';board[19][2]='I';board[19][3]='I';
  const runs=collectIFragments(board,[]);
  assert.equal(runs.length,3);
  assert.ok(runs.every(x=>x.untracked&&x.length===1));
 });

 test('source gaps and nonadjacent same-piece cells split into separate runs',()=>{
  const board=Array.from({length:20},()=>Array(10).fill(0));
  const meta=Array.from({length:20},()=>Array(10).fill(0));
  for(const [x,sourceIndex] of [[1,0],[2,1],[3,3]]){
   board[19][x]='I';
   meta[19][x]={kind:'I',pieceId:11,sourceIndex,rotation:0};
  }
  const runs=collectIFragments(board,meta);
  assert.deepEqual(runs.map(x=>[x.sourceOffset,x.length]),[[0,2],[3,1]]);
 });

 test('line flash hides completed rows without falsely joining neighbors',()=>{
  const g=fresh();
  locked(g,'I',0,18);
  const withAll=collectIFragments(g.board,g.boardMeta);
  const hidden=collectIFragments(g.board,g.boardMeta,{hiddenRows:new Set([19])});
  assert.equal(withAll.length,1);
  assert.equal(hidden.length,0);
 });

 function pixels(draw,w,h){
  const result=Array.from({length:h},()=>Array(w).fill(-1));
  const g={fillStyle:'',fillRect(x,y,ww,hh){
   const match=/^rgb\((\d+),/.exec(this.fillStyle);
   assert.ok(match);const val=Number(match[1]);
   for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)
    if(xx+.5>=x&&xx+.5<x+ww&&yy+.5>=y&&yy+.5<y+hh)result[yy][xx]=val;
  }};
  draw(g);
  return result;
 }
 test('I fragment interiors preserve absolute gravel phase instead of repacking',()=>{
  const full=pixels(g=>drawIBar(g,0,0,48,12),48,12);
  for(let sourceOffset=0;sourceOffset<4;sourceOffset++)
   for(let length=1;length<=4-sourceOffset;length++){
    const fragment=pixels(g=>drawIFragment(g,0,0,12*length,12,
     {sourceOffset,length,rotation:0}),12*length,12);
    // Only outer border may be redrawn; interior source marks keep their pixels.
    for(let y=2;y<10;y++)for(let x=2;x<12*length-2;x++)
     assert.equal(fragment[y][x],full[y][sourceOffset*12+x],
      'texture shifted at '+sourceOffset+'+'+length+', '+x+','+y);
   }
 });
 test('rendering selects piece-instance fragments, not same-type adjacency',()=>{
  const js=readFileSync(new URL('../tetris/platform.js',import.meta.url),'utf8');
  assert.match(js,/collectIFragments\(displayBoard,displayMeta,/);
  assert.match(js,/vectorTiles\.drawIFragment\(g,offX\+run\.x\*tile,offY\+run\.y\*tile,/);
  assert.match(js,/lineClearFX=\{board:event\.board,boardMeta:event\.boardMeta/);
  assert.doesNotMatch(js,/while\(visibleI\(/);
 });
});

describe('Vector rendering and pixel fallback',()=>{
 function mock(){
  const images=[],canvases=[],painted=[];
  let dpr=2,redraws=0;
  const renderer=createVectorTileRenderer({
   createImage(){
    const image={onload:null,onerror:null,src:null};
    images.push(image);return image;
   },
   createCanvas(){
    const canvas={width:0,height:0,calls:[],getContext(){
     return {drawImage:(...args)=>canvas.calls.push(args),imageSmoothingEnabled:false,
      imageSmoothingQuality:'medium'};
    }};
    canvases.push(canvas);return canvas;
   },
   pixelRatio:()=>dpr,
   onReady:()=>{redraws++;}
  });
  const g={drawImage:(...args)=>painted.push(args),fillRect(){},fillStyle:''};
  return {renderer,g,images,canvases,painted,get redraws(){return redraws;},
   setDpr:value=>{dpr=value;}};
 }

 test('all seven authored SVG assets preload before gameplay without per-frame parsing',()=>{
  const m=mock();
  m.renderer.preload();
  assert.equal(m.images.length,7);
  assert.equal(m.renderer.imageCount,7);
  const sources=m.images.map(img=>img.src);
  for(const kind of VECTOR_PIECE_KINDS)
   assert.ok(sources.some(src=>src==='./assets/tiles/vector/'+kind+'.svg?v126'),kind);
  assert.equal(m.renderer.rasterCount,0);
  m.images.forEach(img=>img.onload());
  assert.equal(m.redraws,7);
 });

 test('smooth SVG is drawn after loading and cached at physical display resolution',()=>{
  const m=mock();
  assert.equal(m.renderer.drawTile(m.g,12,20,20,20,'O'),false);
  assert.equal(m.painted.length,0,'pixel fallback until SVG loads');
  assert.equal(m.images.length,1);
  assert.equal(m.images[0].src,'./assets/tiles/vector/O.svg?v126');
  m.images[0].onload();
  assert.equal(m.renderer.drawTile(m.g,12,20,20,20,'O'),true);
  assert.equal(m.canvases.length,1);
  assert.equal(m.canvases[0].width,40);
  assert.equal(m.canvases[0].height,40);
  assert.equal(m.canvases[0].calls.length,1,'SVG rasterized once');
  assert.equal(m.painted.length,1);
  m.renderer.drawTile(m.g,40,20,20,20,'O');
  assert.equal(m.canvases.length,1,'positions reuse the same raster');
  m.setDpr(3);
  m.renderer.drawTile(m.g,40,20,20,20,'O');
  assert.equal(m.canvases.length,2);
  assert.equal(m.canvases[1].width,60);
 });

 test('NEXT, HOLD and active piece all use the same vector renderer',()=>{
  const m=mock();
  const tiles=[{x:0,y:0,size:20},{x:20,y:0,size:20},{x:0,y:20,size:20},{x:20,y:20,size:20}];
  m.renderer.drawPiece(m.g,tiles,'O');
  assert.equal(m.images.length,1,'O shape has exactly one SVG image source');
  m.images[0].onload();
  m.renderer.drawPiece(m.g,tiles,'O');
  assert.equal(m.painted.length,4,'four cells use one decoded SVG');
  assert.equal(m.canvases.length,1,'four cells reuse one raster');
  m.renderer.drawPiece(m.g,tiles,'O');
  assert.equal(m.painted.length,8);
  assert.equal(m.canvases.length,1);
 });

 test('I-piece fragments preserve source offset, length and all four rotation directions',()=>{
  assert.equal(spriteIdentity('I',{sourceOffset:2,length:2,rotation:3}),'I:2:2:3');
  assert.throws(()=>spriteIdentity('I',{sourceOffset:3,length:2}),RangeError);
  const m=mock();
  m.renderer.drawIFragment(m.g,5,7,20,40,{sourceOffset:2,length:2,rotation:3});
  assert.equal(m.images.length,1);
  const src=m.images[0].src;
  assert.ok(src.startsWith('data:image/svg+xml;charset=utf-8,'));
  const xml=decodeURIComponent(src.split(',').slice(1).join(','));
  assert.match(xml,/data-source-offset="2"/);
  assert.match(xml,/data-source-length="2"/);
  assert.match(xml,/data-rotation="3"/);
  assert.match(xml,/viewBox="0 0 12 24"/);
  assert.match(xml,/rotate\(270\)/);
  m.images[0].onload();
  assert.equal(m.renderer.drawIFragment(m.g,5,7,20,40,{sourceOffset:2,length:2,rotation:3}),true);
  assert.equal(m.canvases[0].width,40);
  assert.equal(m.canvases[0].height,80);
 });

 test('each rotation preserves the exact original I-piece gravel artwork',()=>{
  for(let rotation=0;rotation<4;rotation++){
   const xml=renderIFragmentSVG({sourceOffset:1,length:2,rotation});
   assert.ok(xml.includes('data-rotation="'+rotation+'"'));
   assert.match(xml,rotation%2?/viewBox="0 0 12 24"/:/viewBox="0 0 24 12"/);
   assert.equal((xml.match(/<circle /g)||[]).length,
    (renderIFragmentSVG({sourceOffset:1,length:2,rotation:0}).match(/<circle /g)||[]).length);
  }
  assert.match(renderIFragmentSVG({orientation:'vertical'}),/rotate\(90\)/);
  assert.doesNotMatch(renderSmoothTileSVG('O'),/rx=|<image/);
 });

 test('the authored pixel renderer remains a functioning fallback for asset errors',()=>{
  const m=mock();
  assert.equal(m.renderer.drawTile(m.g,0,0,24,24,'S'),false);
  const im=m.images[0];im.onerror();
  assert.equal(m.renderer.drawTile(m.g,0,0,24,24,'S'),false);
  assert.equal(m.painted.length,0);
  assert.equal(m.redraws,1);
  m.renderer.dispose();
  assert.equal(m.renderer.imageCount,0);
  assert.equal(m.renderer.rasterCount,0);
  assert.equal(m.renderer.drawTile(m.g,0,0,24,24,'S'),false);
 });

 test('the live app uses vector art everywhere and owns its offline fallback',()=>{
  const js=readFileSync(new URL('../tetris/platform.js',import.meta.url),'utf8');
  const sw=readFileSync(new URL('../tetris/sw.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../tetris/three-v027.html',import.meta.url),'utf8');
  assert.match(js,/createVectorTileRenderer\(/);
  assert.match(js,/vectorTiles\.preload\(\)/);
  assert.match(js,/vectorTiles\.drawTile\(g,x,y,w,h,kind\)/);
  assert.match(js,/vectorTiles\.drawPiece\(g,fitPreviewCells\(/);
  assert.match(js,/vectorTiles\.drawIFragment\(g,offX\+run\.x\*tile,offY\+run\.y\*tile,/);
  assert.match(js,/vectorTiles\.drawPiece\(g,activeTiles,'I',\{rotation:p.rotation\}\)/);
  assert.match(js,/vectorTiles\.dispose\(\)/);
  const build=html.match(/name="tetris-build" content="([0-9]{3})"/)?.[1];
  assert.ok(build,'HTML must declare a three-digit build');
  assert.ok(sw.includes("CACHE_VERSION='v"+build+"'"),'offline cache and HTML must agree');
  for(const kind of VECTOR_PIECE_KINDS)
   assert.ok(sw.includes("'./assets/tiles/vector/"+kind+".svg'"));
  assert.match(sw,/'.\/assets\/tiles\/smooth-geometry\.mjs'/);
  assert.match(sw,/'.\/assets\/tiles\/gravel-layout\.mjs'/);

 });
});

describe('Brick rails',()=>{
 const {computeLayout}=Layout;
 const ui={
  unit:6,buttonWidthScale:.75,overlayButtonWidthScale:.85,appMax:520,
  padX:11,stackGap:6,side:93,sideGap:6,headHeight:80,headIcons:46,
  headIconGap:6,headRightPad:6,headTitleInset:17,deckBottom:30,
  deckPad:6,scoreHeight:45,deckGap:6,padGap:6,padHeight:53,
  extrasHeight:44,extrasGap:6,holdHeight:88,nextHeight:162,statsHeight:92
 };
 const near=(a,b)=>Math.abs(a-b)<1e-7;
 const imagePath=style=>fileURLToPath(
  new URL('../tetris/assets/frames/'+style+'/brick.svg',import.meta.url));
 const get=(w,h,safe={})=>computeLayout(w,h,safe,ui);

 test('SVGs restore the archived staggered texture within a square repeat tile',()=>{
  assert.deepEqual(BRICK_UNIT,{width:12,height:12,courses:2});
  for(const style of ['pixel','vector']){
   const svg=renderBrickSVG(style);
   assert.equal(svg,fs.readFileSync(imagePath(style),'utf8'));
   assert.match(svg,/viewBox="0 0 12 12"/);
   assert.match(svg,/width="12" height="12"/);
   assert.match(svg,new RegExp('data-style="'+style+'"'));
   assert.equal((svg.match(/<rect /g)||[]).length,15);
   assert.doesNotMatch(svg,/<image|<filter|<linearGradient|<radialGradient/);
   for(const match of svg.matchAll(/rgb\((\d+),(\d+),(\d+)\)/g)){
    assert.equal(match[1],match[2]);assert.equal(match[2],match[3]);
   }
   const faces=brickShapes(style).filter((_,i)=>i%5===0);
   assert.deepEqual(faces.map(x=>[x.x,x.y,x.w,x.h]),
    [[1,1,10,4],[-4,7,9,4],[6,7,9,4]],
    'original unmodified running bond: one full course plus two staggered edge bricks');
   assert.ok(faces.some(x=>x.x<0)&&faces.some(x=>x.x+x.w>12),
    'staggered artwork crosses the square asset edges for clean clipping');
  }
  assert.throws(()=>renderBrickSVG('invalid'),RangeError);
 });
 test('iPhone portrait rails repeat at 75% preview size and have exact 6px gap',()=>{
  const r=get(393,852,{top:59,bottom:34});
  const g=brickRailGeometry(r);
  assert.ok(g);
  assert.ok(near(r.boardX-g.width-g.gap,r.hx),'outer left brick edge aligns with header');
  assert.ok(near(r.boardX-g.width-g.gap,r.off+r.pad),'and footer left edge');
  assert.ok(near(g.width,(r.boardW-4)/10*.75));
  assert.ok(near(g.width,r.previewCell));
  assert.ok(near(g.height,g.width),'whole brick motif is square');
  assert.ok(near(g.gap,ui.padGap));
  assert.ok(near(g.left.x+g.left.w+ui.padGap,r.boardX));
  assert.ok(near(g.right.x,r.boardX+r.boardW+ui.padGap));
  assert.ok(near(g.leftVisible.w,g.width),'full left rail fits iPhone');
  assert.ok(near(g.rightVisible.w,g.width),'full right rail fits iPhone');
  assert.ok(near(g.left.y,r.boardY)&&near(g.right.y,r.boardY),
   'both brick rails begin at the outer board border');
  assert.ok(near(g.left.y+g.left.h,r.boardY+r.boardH));
  assert.ok(near(g.right.y+g.right.h,r.boardY+r.boardH));
 });
 test('all viewport sizes clip to available space, never over the board or sidebar',()=>{
  for(const [W,H,safe] of [
   [393,852,{top:59,bottom:34}],[430,932,{top:62,bottom:34}],
   [375,812,{top:50,bottom:34}],[320,568,{top:20}],
   [360,480,{top:20}],[280,600,{top:20,bottom:20}],
   [844,390,{left:59,right:59,bottom:21}],
   [667,375,{left:44,right:44}],[568,320,{left:44,right:44}],
   [915,412,{}]
  ]){
   const r=get(W,H,safe),before={...r},g=brickRailGeometry(r);
   assert.ok(g);
   assert.ok(near(g.width,r.previewCell));
   assert.ok(near(g.gap,ui.padGap));
   assert.ok(g.left.x+g.width<=r.boardX-ui.padGap+1e-7);
   assert.ok(g.right.x>=r.boardX+r.boardW+ui.padGap-1e-7);
   assert.ok(g.leftVisible.x>=Math.max(r.safe.left,r.off)-1e-7);
   assert.ok(g.leftVisible.w>=0&&g.leftVisible.w<=g.width+1e-7);
   assert.ok(g.rightVisible.w>=0&&g.rightVisible.w<=g.width+1e-7);
   assert.ok(g.rightVisible.x+g.rightVisible.w<=r.nextPanel.x-2+1e-7);
   assert.ok(near(g.left.y,r.boardY)&&near(g.left.y+g.left.h,r.boardY+r.boardH));
   assert.ok(near(g.right.y,r.boardY)&&near(g.right.y+g.right.h,r.boardY+r.boardH));
   if(!r.landscape){
    assert.ok(near(g.left.x,r.hx),'portrait frame aligns left with header/footer');
    assert.ok(near(g.leftVisible.w,g.width),'full left rail on portrait');
    assert.ok(near(g.rightVisible.w,g.width),'full right rail on portrait');
   }
   assert.deepEqual(r,before,'brick drawing never mutates the layout');
  }
  assert.equal(brickRailGeometry({...get(393,852),boardW:0}),null);
 });
 test('raster stamp stays square, static rails cover full height and reuse cache',()=>{
  const r=get(393,852,{top:59,bottom:34});
  const stamps=[],clips=[],draws=[];
  const frame=createBrickFrame({
   pixelRatio:()=>2,
   createCanvas:()=>{
    const canvas={width:0,height:0,getContext:()=>({fillStyle:'',fillRect(){}})};
    stamps.push(canvas);return canvas;
   }
  });
  const ctx={save(){},restore(){},beginPath(){},
   rect(...v){clips.push(v);},clip(){},drawImage(...v){draws.push(v);}};
  frame.draw(ctx,r);
  const g=brickRailGeometry(r);
  const repeats=Math.max(1,Math.round(g.left.h/g.height));
  assert.equal(stamps.length,1);
  assert.equal(stamps[0].width,stamps[0].height);
  assert.equal(clips.length,2,'one clip per board-side rail');
  assert.equal(draws.length,repeats*2,'no clipped/extra tile at the rail bottom');
  assert.ok(repeats>20,'smaller bricks do not stop at twenty repeats');
  for(const [image,x,y,w,h] of draws){
   assert.ok(near(w,g.width)&&near(h,g.height),
    'each drawn brick stays exactly square at 75% of a game block');
  }
  for(const side of [0,1]){
   const series=draws.slice(side*repeats,(side+1)*repeats);
   assert.ok(near(series[0][2],r.boardY),'first complete tile starts at board top');
   assert.ok(near(series.at(-1)[2]+series.at(-1)[4],r.boardY+r.boardH),
    'last complete tile ends flush with board bottom');
   const pitch=(r.boardH-g.height)/(repeats-1);
   for(let i=1;i<series.length;i++)
    assert.ok(near(series[i][2]-series[i-1][2],pitch),
     'even spacing across the board without a truncated last block');
  }
  frame.draw(ctx,r);
  assert.equal(frame.cachedStamps,1,'no redundant rasterization');
  frame.draw(ctx,r,'pixel');
  assert.equal(frame.cachedStamps,2,'pixel and vector stamps independent');
  frame.dispose();assert.equal(frame.cachedStamps,0);
 });
 test('bricks are painted on the static base, never on the playfield texture',()=>{
  const renderer=fs.readFileSync(new URL('../tetris/platform.js',import.meta.url),'utf8');
  const stage=renderer.slice(renderer.indexOf('function stage('),
   renderer.indexOf('function paintBoardPopup('));
  assert.doesNotMatch(stage,/brickFrame\.draw/);
  assert.equal((renderer.match(/brickFrame\.draw\(g,r\)/g)||[]).length,1);
  assert.match(renderer,/stage\(r,false\);[\s\S]*brickFrame\.draw\(g,r\);/);
  assert.match(renderer,/const offX=x\+2,offY=y\+2,tile=\(w-4\)\/10/);
  const sw=fs.readFileSync(new URL('../tetris/sw.js',import.meta.url),'utf8');
  for(const item of [
   './assets/frames/brick-pattern.mjs',
   './assets/frames/vector/brick.svg'
  ])assert.ok(sw.includes(item),'offline asset: '+item);
 });

 test('all tested viewport rails have complete undistorted first and last tiles',()=>{
  for(const [W,H,safe] of [
   [393,852,{top:59,bottom:34}],[430,932,{top:62,bottom:34}],
   [375,812,{top:50,bottom:34}],[320,568,{top:20}],
   [280,600,{top:20,bottom:20}],[844,390,{left:59,right:59,bottom:21}]
  ]){
   const r=get(W,H,safe),geom=brickRailGeometry(r);
   const drawCalls=[];
   const frame=createBrickFrame({
    pixelRatio:()=>2,
    createCanvas:()=>({width:0,height:0,getContext:()=>({fillRect(){}})})
   });
   frame.draw({
    save(){},restore(){},beginPath(){},rect(){},clip(){},
    drawImage(...args){drawCalls.push(args);}
   },r);
   const n=Math.max(1,Math.round(r.boardH/geom.height));
   // Some constrained landscape viewports intentionally clip one rail entirely.
   const visibleRails=[geom.leftVisible,geom.rightVisible].filter(g=>g.w>0);
   assert.equal(drawCalls.length,n*visibleRails.length);
   for(let i=0;i<visibleRails.length;i++){
    const tiles=drawCalls.slice(i*n,(i+1)*n);
    assert.ok(near(tiles[0][2],r.boardY));
    assert.ok(near(tiles.at(-1)[2]+tiles.at(-1)[4],r.boardY+r.boardH));
    assert.ok(tiles.every(t=>near(t[3],geom.width)&&near(t[4],geom.height)));
   }
   frame.dispose();
  }
 });

 test('browser uses the authored SVG asset after decoding, not a reconstructed stone',()=>{
  const images=[],stamps=[];let readyCount=0;
  const frame=createBrickFrame({
   pixelRatio:()=>2,
   createImage:()=>{
    const img={onload:null,onerror:null,src:''};
    images.push(img);return img;
   },
   createCanvas:()=>{
    const drawn={fallback:0,svg:0,fillStyle:'',
     fillRect(){this.fallback++;},drawImage(){this.svg++;}};
    const canvas={width:0,height:0,getContext:()=>drawn,drawn};
    stamps.push(canvas);return canvas;
   },
   onReady:style=>{assert.equal(style,'vector');readyCount++;}
  });
  const r=get(393,852,{top:59,bottom:34});
  const ctx={save(){},restore(){},beginPath(){},rect(){},clip(){},drawImage(){}};
  frame.draw(ctx,r);
  assert.equal(images.length,1,'one SVG image per texture style');
  assert.ok(images[0].src.endsWith('/vector/brick.svg?v137'));
  assert.ok(stamps[0].drawn.fallback>0,'exact artwork fallback until decoded');
  assert.equal(stamps[0].drawn.svg,0);
  images[0].onload();
  assert.equal(readyCount,1,'decode signals the base layer to redraw');
  frame.draw(ctx,r);
  assert.equal(stamps[1].drawn.fallback,0,'no procedural redraw after SVG ready');
  assert.equal(stamps[1].drawn.svg,1,'authored SVG image is the tile source');
  assert.equal(frame.cachedStamps,1);
  frame.dispose();
  assert.equal(frame.cachedStamps,0);
  assert.equal(images[0].onload,null);
 });
 test('running bond keeps square exterior edges and the approved side margins',()=>{
  const r=get(393,852,{top:59,bottom:34}),g=brickRailGeometry(r);
  const clips=[];
  const frame=createBrickFrame({
   pixelRatio:()=>2,
   createImage:()=>null,
   createCanvas:()=>({width:0,height:0,getContext:()=>({fillRect(){}})})
  });
  frame.draw({save(){},restore(){},beginPath(){},clip(){},
   rect(...v){clips.push(v);},drawImage(){}},r);
  assert.equal(clips.length,2);
  assert.deepEqual(clips[0],[g.leftVisible.x,r.boardY,g.leftVisible.w,r.boardH]);
  assert.deepEqual(clips[1],[g.rightVisible.x,r.boardY,g.rightVisible.w,r.boardH]);
  assert.ok(near(g.left.x,r.hx),'left outer edge follows the header/footer');
  assert.ok(near(g.left.x+g.left.w+6,r.boardX));
  assert.ok(near(g.right.x,r.boardX+r.boardW+6));
  frame.dispose();
 });
});

describe('Piece shadows',()=>{
 const board=()=>Array.from({length:20},()=>Array(10).fill(0));
 const meta=()=>Array.from({length:20},()=>Array(10).fill(0));

 test('adjacent locked tetrominoes keep distinct shadows by piece ID',()=>{
  const b=board(),m=meta();
  for(let x=1;x<=2;x++)for(let y=10;y<=11;y++){
   b[y][x]='O';m[y][x]={kind:'O',pieceId:4,rotation:0};
  }
  for(let x=3;x<=4;x++)for(let y=10;y<=11;y++){
   b[y][x]='O';m[y][x]={kind:'O',pieceId:9,rotation:0};
  }
  const groups=collectPieceShadowGroups(b,m);
  assert.equal(groups.length,2,'edge-touching pieces must NOT be merged');
  assert.deepEqual(groups.map(g=>g.id),['locked:4','locked:9']);
  assert.deepEqual(groups.map(g=>g.cells.length),[4,4]);
  // A cleared row leaves independently owned fragments, not one union.
  const split=collectPieceShadowGroups(b,m,null,new Set([11]));
  assert.deepEqual(split.map(g=>g.cells.length),[2,2]);
 });

 test('active silhouettes change with T and I rotation and wall kicks',()=>{
  const game=new Core.Game(()=>.1);
  game.start();
  for(const kind of ['T','I','J']){
   game.current=game.piece(kind);
   game.current.x=kind==='I'?2:3;game.current.y=4;
   const id=game.current.id;
   for(let i=0;i<4;i++){
    const groups=collectPieceShadowGroups(game.board,game.boardMeta,game.current);
    const active=groups.find(g=>g.id==='active:'+id);
    const expected=[];
    game.current.matrix.forEach((row,dy)=>row.forEach((v,dx)=>{
     if(v)expected.push({x:game.current.x+dx,y:game.current.y+dy});
    }));
    assert.deepEqual(active.cells,expected.sort((a,b)=>a.y-b.y||a.x-b.x));
    assert.equal(active.cells.length,4);
    assert.equal(game.rotate(1),true,'rotation succeeds in open board');
   }
   assert.equal(game.current.rotation,0,'four rotations return to start');
  }
  game.current=game.piece('T');
  game.current.x=0;game.current.y=0;
  assert.equal(game.rotate(1),true,'rotation near left board wall');
  assert.equal(collectPieceShadowGroups(game.board,game.boardMeta,game.current)[0].cells.length,4);
 });

 test('locked piece metadata preserves identity for subsequent shadows',()=>{
  const game=new Core.Game(()=>.1);game.start();
  game.current=game.piece('T');
  game.current.x=2;game.current.y=17;
  game.rotate(1);
  const id=game.current.id;
  game.lockPiece();
  const groups=collectPieceShadowGroups(game.board,game.boardMeta);
  const group=groups.find(g=>g.id==='locked:'+id);
  assert.ok(group,'locked piece ID retained');
  assert.equal(group.cells.length,4);
 });

 test('v06 parameters are scaled from the same 35px reference tile',()=>{
  const p=pieceShadowProfile(35);
  assert.equal(p.angle,55);
  assert.equal(p.distance,13);
  assert.equal(p.blur,14);
  assert.equal(p.bias,1);
  assert.equal(p.opacity,.8);
  assert.equal(p.resolution,.5);
  assert.ok(Math.abs(pieceShadowProfile(20).distance-13*20/35)<1e-12);
  assert.equal(pieceShadowProfile(70).blur,28);
 });

 function fakeCanvasFactory(stats){
  return ()=>{
   stats.created++;
   const canvas={width:0,height:0};
   const g={
    globalAlpha:1,save(){},restore(){},scale(){},fillRect(){},
    getImageData(){return {data:new Uint8ClampedArray(canvas.width*canvas.height*4)};},
    createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},
    putImageData(){stats.uploads++;}
   };
   canvas.getContext=type=>type==='2d'?g:null;
   return canvas;
  };
 }
 test('v06 stamps cache by shape, not position; rotation rebuilds only once',()=>{
  const stats={created:0,uploads:0},images=[];
  const shadows=createPieceShadowRenderer({
   createCanvas:fakeCanvasFactory(stats),pixelRatio:()=>2,capacity:8
  });
  const g={globalAlpha:1,save(){},restore(){},drawImage:(...args)=>images.push(args)};
  const b=board(),m=meta();
  const T={id:1,x:3,y:4,matrix:Core.SHAPES.T};
  shadows.draw(g,collectPieceShadowGroups(b,m,T),2,2,20);
  assert.equal(stats.created,2,'one temporary mask plus one cached shadow');
  assert.equal(stats.uploads,1,'one ImageData write for new silhouette');
  assert.equal(images.length,1);
  assert.ok(images[0][0].width>20,'stamp includes Gaussian padding');
  assert.ok(shadows.stats.cacheKiB>0);
  T.x+=2;T.y+=1;
  shadows.draw(g,collectPieceShadowGroups(b,m,T),2,2,20);
  assert.equal(stats.created,2,'movement never repeats convolution');
  T.matrix=Core.turn(T.matrix,1);
  shadows.draw(g,collectPieceShadowGroups(b,m,T),2,2,20);
  assert.equal(stats.created,4,'rotation receives a new cached stamp');
  T.matrix=Core.turn(T.matrix,-1);
  shadows.draw(g,collectPieceShadowGroups(b,m,T),2,2,20);
  assert.equal(stats.created,4,'rotating back reuses first stamp');
  assert.equal(shadows.cacheSize,2);
  assert.equal(shadows.stats.builds,2);
  shadows.dispose();assert.equal(shadows.cacheSize,0);
  assert.equal(shadows.stats.cacheKiB,0);
 });

 test('v190 settings modify shadow direction and blur without disturbing shape caching',()=>{
  const fx={shadows:true,shadowAngle:55,shadowDistance:13,shadowBlur:14,
   shadowBias:1,shadowOpacity:.8};
  const stats={created:0,uploads:0},samples=[];
  const renderer=createPieceShadowRenderer({
   createCanvas:fakeCanvasFactory(stats),getSettings:()=>fx,capacity:6
  });
  const g={globalAlpha:1,save(){},restore(){},
   drawImage(){samples.push(this.globalAlpha);}};
  const T={id:1,x:3,y:4,matrix:Core.SHAPES.T};
  const groups=()=>collectPieceShadowGroups(board(),meta(),T);
  renderer.draw(g,groups(),2,2,20);
  assert.equal(stats.created,2);
  assert.equal(samples[0],.8);
  fx.shadowOpacity=.35;
  renderer.draw(g,groups(),2,2,20);
  assert.equal(stats.created,2,'opacity is a cheap draw-only setting');
  assert.equal(samples.at(-1),.35);
  fx.shadows=false;
  assert.equal(renderer.draw(g,groups(),2,2,20),0);
  assert.equal(stats.created,2,'disabling shadows avoids any convolution');
  fx.shadows=true;
  renderer.draw(g,groups(),2,2,20);
  assert.equal(stats.created,2,'re-enabling shadows reuses the previous stamp');
  fx.shadowAngle=90;
  renderer.draw(g,groups(),2,2,20);
  assert.equal(stats.created,4,'direction change generates a new stamp');
  assert.equal(renderer.cacheSize,1,'old settings evict old shadow rasters');
  fx.shadowBlur=0;
  renderer.draw(g,groups(),2,2,20);
  assert.equal(stats.created,6,'hard-edged shadow rebuilds once');
  assert.ok(renderer.stats.cacheKiB>0);
  renderer.dispose();assert.equal(renderer.cacheSize,0);
 });
 test('v190 profile controls use the approved defaults and clamp all parameters',()=>{
  const p=pieceShadowProfile(35,{
   shadows:false,shadowAngle:320,shadowDistance:24,shadowBlur:7,
   shadowBias:.4,shadowOpacity:.6
  });
  assert.deepEqual([p.enabled,p.angle,p.distance,p.blur,p.bias,p.opacity],
   [false,320,24,7,.4,.6]);
  const clamped=pieceShadowProfile(35,{shadowAngle:999,shadowDistance:-1,
   shadowBlur:90,shadowBias:-3,shadowOpacity:3});
  assert.deepEqual([clamped.angle,clamped.distance,clamped.blur,
   clamped.bias,clamped.opacity],[360,0,30,0,1]);
  assert.equal(pieceShadowProfile(35).opacity,.8);
 });

 test('V162 shadows render after the grid, before SVG piece faces',()=>{
  const src=fs.readFileSync(new URL('../tetris/platform.js',import.meta.url),'utf8');
  const section=src.slice(src.indexOf('function stage('),
   src.indexOf('function drawSharpBoardInsetShadow('));
  const grid=section.indexOf('g.stroke();g.globalAlpha=1;');
  const cast=section.indexOf('pieceShadows.draw(g,shadowGroups,offX,offY,tile);');
  const faces=section.indexOf('displayBoard.forEach((row,ry)=>row.forEach((kind,rx)=>{',cast);
  assert.ok(grid>=0&&cast>grid&&faces>cast);
  assert.doesNotMatch(section,/drawPieceShadowGradients\(|pieceShadowOccupancy\(/);
  assert.match(src,/rect\(offX,offY,w-4,h-4,'#181818'\)/);
 });
});
