import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {collectIFragments} from '../i-piece-fragments.js';
import {drawIFragment,drawIBar} from '../tile-face.js';
const require=createRequire(import.meta.url);
const Core=require('../core.js');

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
 const js=readFileSync(new URL('../three-v027.js',import.meta.url),'utf8');
 assert.match(js,/collectIFragments\(displayBoard,displayMeta,/);
 assert.match(js,/drawIFragment\(g,offX\+run\.x\*tile,offY\+run\.y\*tile,/);
 assert.match(js,/lineClearFX=\{board:event\.board,boardMeta:event\.boardMeta/);
 assert.doesNotMatch(js,/while\(visibleI\(/);
});
