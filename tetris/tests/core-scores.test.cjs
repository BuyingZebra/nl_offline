/* NOMAD: game-rule and save-data edge cases. Run with Node 22. */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Core=require('../core.js'),Scores=require('../scores.js');
const fresh=()=>new Core.Game(()=>.33);
test('tetrominoes always contain four blocks and seven-bags have no duplicates',()=>{
 assert.equal(Core.IDS.length,7);
 for(const kind of Core.IDS)
  assert.equal(Core.SHAPES[kind].flat().filter(Boolean).length,4,kind);
 for(const rng of [()=>0,()=>.5,()=>.999999999999])
  assert.deepEqual(Core.shuffledBag(rng).slice().sort(),Core.IDS.slice().sort());
});
test('rotating a piece four times restores original matrix',()=>{
 for(const kind of Core.IDS)for(const dir of [-1,1]){
  const source=JSON.stringify(Core.SHAPES[kind]);
  let m=Core.SHAPES[kind];
  for(let n=0;n<4;n++)m=Core.turn(m,dir);
  assert.equal(JSON.stringify(m),source,kind);
 }
});
test('state transitions prevent movement when not playing',()=>{
 const g=fresh();
 assert.equal(g.move(-1),false);
 assert.equal(g.start(),true);
 assert.equal(g.pause(),true);
 assert.equal(g.hardDrop(),false);
 assert.equal(g.start(),true);
 assert.equal(g.status,'playing');
});
test('piece stays inside board boundaries',()=>{
 const g=fresh();g.start();
 for(let i=0;i<50;i++)g.move(-1);
 assert.equal(g.move(-1),false);
 for(let i=0;i<50;i++)g.move(1);
 assert.equal(g.move(1),false);
});
test('hold is locked until a new piece lands',()=>{
 const g=fresh();g.start();
 assert.equal(g.holdPiece(),true);
 assert.equal(g.holdPiece(),false);
 g.hardDrop();
 assert.equal(g.canHold,true);
});
test('two completed rows score correctly and are removed',()=>{
 const g=fresh();g.start();
 g.board=Array.from({length:20},()=>Array(10).fill(0));
 for(let y=18;y<=19;y++)for(let x=0;x<10;x++)
  g.board[y][x]=(x===4||x===5)?0:'J';
 g.current=g.piece('O');
 const distance=g.ghostY()-g.current.y;
 g.hardDrop();
 assert.equal(g.lines,2);assert.equal(g.score,310+distance*2);
 assert.ok(g.board.slice(0,2).every(r=>r.every(c=>!c)));
});
test('grounded pieces obey the lock delay',()=>{
 const g=fresh();g.start();g.current=g.piece('O');g.current.y=18;
 assert.equal(g.isGrounded(),true);
 g.tick(100);assert.equal(g.pieces,0);
 for(let i=0;i<5;i++)g.tick(100);
 assert.equal(g.pieces,1);
});
test('spawn collision produces game over',()=>{
 const g=fresh();g.start();g.board[1][4]='Z';
 assert.equal(g.spawn('T'),false);
 assert.equal(g.status,'over');
 assert.equal(g.move(1),false);
});
test('malformed, negative and excess scores are sanitized',()=>{
 const list=Scores.sanitize([
  {name:'A*1',score:500,lines:2,level:1,at:1},
  {name:'BAD',score:-2},null,
  ...Array.from({length:8},(_,i)=>({name:'OK',score:i,lines:0,level:1,at:i}))
 ]);
 assert.equal(list.length,5);
 assert.equal(list[0].name,'A1');
 assert.deepEqual(list.map(x=>x.score),[500,7,6,5,4]);
 assert.deepEqual(Scores.sanitize({not:'a list'}),[]);
 assert.equal(Scores.qualifies(list,4),false);
});
test('storage errors leave scores usable without modifying game state',()=>{
 const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('quota')}};
 assert.deepEqual(Scores.read(blocked),[]);
 const list=Scores.save(blocked,[{name:'ABC',score:42,lines:0,level:1,at:1}]);
 assert.equal(list[0].score,42);
});
test('high score schema and legacy key remain compatible',()=>{
 assert.equal(Scores.KEY,'fieldAtlasTetrisTopFiveV01');
 const map=new Map();
 const storage={getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,v)};
 Scores.save(storage,[{name:'ABC',score:42,lines:1,level:1,at:10}]);
 assert.equal(Scores.read(storage)[0].score,42);
 assert.equal(map.get('fieldAtlasTetrisBest'),'42');
});
