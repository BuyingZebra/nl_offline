/* V163: deeper per-piece stamped shadow and rotation regression tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {collectPieceShadowGroups,pieceShadowProfile,createPieceShadowRenderer}
 from '../art.js';
const require=createRequire(import.meta.url);
const Core=require('../core.js');
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

test('profile adds contact and projected gradient layers at board-like depth',()=>{
 const p=pieceShadowProfile(20);
 assert.equal(p.depth,16);
 assert.ok(p.contact.blur<p.core.blur&&p.core.blur<p.cast.blur);
 assert.ok(p.cast.offsetY>p.contact.offsetY);
 assert.equal(p.cast.alpha,1);
 assert.equal(p.core.alpha,1);
 assert.equal(p.contact.alpha,1);
 assert.equal(p.cast.offsetY,p.core.offsetY);
 assert.equal(p.cast.offsetX,p.core.offsetX);
 assert.equal(pieceShadowProfile(4).depth,8);
 assert.equal(pieceShadowProfile(100).depth,20);
});

function fakeCanvasFactory(stats){
 return ()=>{
  stats.created++;
  const draws=[],g={
   save(){},restore(){},setTransform(){},beginPath(){},rect(){},
   fill(){draws.push({blur:this.shadowBlur,x:this.shadowOffsetX,
    y:this.shadowOffsetY,alpha:this.shadowColor,operation:this.globalCompositeOperation});}
  };
  const canvas={width:0,height:0,draws,getContext(type){return type==='2d'?g:null;}};
  return canvas;
 };
}
test('shadow stamps are cached across movement and rebuilt for rotation',()=>{
 const stats={created:0},images=[];
 const shadows=createPieceShadowRenderer({
  createCanvas:fakeCanvasFactory(stats),pixelRatio:()=>2,capacity:8
 });
 const g={drawImage:(...args)=>images.push(args)};
 const b=board(),m=meta();
 const T={id:1,x:3,y:4,matrix:Core.SHAPES.T};
 shadows.draw(g,collectPieceShadowGroups(b,m,T),2,2,20);
 assert.equal(stats.created,1);
 assert.equal(images.length,1);
 const stamp=images[0][0];
 assert.equal(stamp.draws.length,4,'cast, opaque core, contact, silhouette erasure');
 assert.ok(stamp.draws[0].blur>stamp.draws[1].blur);
 assert.ok(stamp.draws[1].blur>stamp.draws[2].blur);
 assert.equal(stamp.draws[0].alpha,'rgba(0,0,0,1)');
 assert.equal(stamp.draws[1].alpha,'rgba(0,0,0,1)');
 assert.equal(stamp.draws[3].operation,'destination-out');
 T.x+=2;T.y+=1;
 shadows.draw(g,collectPieceShadowGroups(b,m,T),2,2,20);
 assert.equal(stats.created,1,'translation reuses the same raster');
 T.matrix=Core.turn(T.matrix,1);
 shadows.draw(g,collectPieceShadowGroups(b,m,T),2,2,20);
 assert.equal(stats.created,2,'rotation has an independently rasterized silhouette');
 T.matrix=Core.turn(T.matrix,-1);
 shadows.draw(g,collectPieceShadowGroups(b,m,T),2,2,20);
 assert.equal(stats.created,2,'rotating back reuses prior shadow');
 assert.equal(shadows.cacheSize,2);
 shadows.dispose();assert.equal(shadows.cacheSize,0);
});

test('V162 shadows render after the grid, before SVG piece faces',()=>{
 const src=fs.readFileSync(new URL('../three-v027.js',import.meta.url),'utf8');
 const section=src.slice(src.indexOf('function stage('),
  src.indexOf('function drawSharpBoardInsetShadow('));
 const grid=section.indexOf('g.stroke();g.globalAlpha=1;');
 const cast=section.indexOf('pieceShadows.draw(g,shadowGroups,offX,offY,tile);');
 const faces=section.indexOf('displayBoard.forEach((row,ry)=>row.forEach((kind,rx)=>{',cast);
 assert.ok(grid>=0&&cast>grid&&faces>cast);
 assert.doesNotMatch(section,/drawPieceShadowGradients\(|pieceShadowOccupancy\(/);
 assert.match(src,/rect\(offX,offY,w-4,h-4,'#181818'\)/);
});
