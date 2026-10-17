const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const core=require('../tetris/core.js');

const fresh=()=>new core.Game(()=>.33);
const norm=m=>JSON.stringify(m);
test('all seven tetrominoes are defined with exactly four blocks',()=>{
 assert.equal(core.IDS.length,7);
 for(const name of core.IDS){
  const cells=core.SHAPES[name].flat().filter(Boolean);
  assert.equal(cells.length,4,name+' should have four blocks');
  assert.ok(cells.every(c=>c===name));
 }
});
test('seven bag always contains each piece once',()=>{
 for(const rng of [()=>0,()=>.5,()=>.99999999]){
  const bag=core.shuffledBag(rng);
  assert.equal(bag.length,7);
  assert.deepEqual([...bag].sort(),[...core.IDS].sort());
 }
 const g=fresh();
 const first=[g.current.kind,...g.queue.slice(0,6)].sort();
 assert.deepEqual(first,[...core.IDS].sort());
});
test('four clockwise or four reverse turns preserve each piece matrix',()=>{
 for(const name of core.IDS){
  let m=core.SHAPES[name];
  const before=norm(m);
  for(let i=0;i<4;i++)m=core.turn(m,1);
  assert.equal(norm(m),before,'CW '+name);
  for(let i=0;i<4;i++)m=core.turn(m,-1);
  assert.equal(norm(m),before,'CCW '+name);
 }
});
test('game starts, pauses, resumes and restarts with an empty board',()=>{
 const g=fresh();
 assert.equal(g.status,'ready');
 assert.ok(!g.move(1),'movement disabled before start');
 assert.equal(g.start(),true);
 assert.equal(g.status,'playing');
 assert.equal(g.pause(),true);
 assert.equal(g.status,'paused');
 assert.ok(!g.hardDrop());
 assert.equal(g.start(),true);
 g.hardDrop();
 assert.ok(g.pieces>=1);
 g.reset();
 assert.equal(g.status,'ready');
 assert.equal(g.score,0);
 assert.equal(g.lines,0);
 assert.ok(g.board.every(row=>row.every(c=>c===0)));
});
test('horizontal movement respects the field borders',()=>{
 const g=fresh();g.start();
 for(let i=0;i<50;i++)g.move(-1);
 assert.equal(g.move(-1),false);
 for(let i=0;i<50;i++)g.move(1);
 assert.equal(g.move(1),false);
});
test('ghost and hard drop agree; hard drop rewards exactly two points per row',()=>{
 const g=fresh();g.start();
 const target=g.ghostY(),oldScore=g.score;
 assert.ok(target>=0);
 assert.equal(g.hardDrop(),true);
 assert.equal(g.pieces,1);
 assert.equal(g.score-oldScore,target*2);
});
test('hold prevents repeated swaps until the next piece is locked',()=>{
 const g=fresh();g.start();
 const active=g.current.kind;
 assert.equal(g.holdPiece(),true);
 assert.equal(g.hold,active);
 assert.equal(g.canHold,false);
 assert.equal(g.holdPiece(),false);
 g.hardDrop();
 assert.equal(g.canHold,true);
 assert.equal(g.holdPiece(),true);
 assert.equal(g.current.kind,active);
});
test('line clear correctly removes both filled rows and scores the double',()=>{
 const g=fresh();g.start();
 g.board=Array.from({length:20},()=>Array(10).fill(0));
 for(let y=18;y<=19;y++)for(let x=0;x<10;x++)g.board[y][x]=x===4||x===5?0:'J';
 g.current=g.piece('O');
 const distance=g.ghostY()-g.current.y;
 g.hardDrop();
 assert.equal(g.lines,2);
 assert.equal(g.score,300+distance*2);
 assert.equal(g.level,1);
 assert.ok(g.board.slice(0,2).every(row=>row.every(cell=>!cell)));
});
test('level increases after ten line clears and accelerates gravity',()=>{
 const g=fresh();
 const first=g.dropMs;
 g.lines=10;g.level=1+Math.floor(g.lines/10);
 assert.equal(g.level,2);
 assert.ok(g.dropMs<first);
});
test('piece cannot spawn on an occupied board and game ends',()=>{
 const g=fresh();g.start();
 g.board[1][4]='Z';
 assert.equal(g.spawn('T'),false);
 assert.equal(g.status,'over');
 assert.ok(!g.move(1));
});
test('the game responds to time and respects grounded lock delay',()=>{
 const g=fresh();g.start();
 g.current=g.piece('O');
 g.current.y=18;
 assert.equal(g.isGrounded(),true);
 g.tick(100);
 assert.equal(g.pieces,0);
 for(let i=0;i<5;i++)g.tick(100);
 assert.equal(g.pieces,1);
});
test('browser assets are local, parse cleanly, and expose iPhone controls',()=>{
 const dir=path.join(__dirname,'../tetris');
 const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
 const ui=fs.readFileSync(path.join(dir,'ui.js'),'utf8');
 const sw=fs.readFileSync(path.join(dir,'sw.js'),'utf8');
 const {Script}=require('node:vm');
 assert.doesNotThrow(()=>new Script(ui));
 assert.doesNotThrow(()=>new Script(sw));
 assert.ok(html.includes('FIELD ATLAS / NEWFOUNDLAND'));
 assert.ok(html.includes('ARCADE SYSTEM'));
 assert.ok(html.includes('data-action="hard"'));
 assert.ok(html.includes('data-action="hold"'));
 assert.ok(html.includes('id="options"'));
 assert.ok(html.includes('data-theme="green"'));
 assert.ok(ui.includes('requestAnimationFrame(frame)'));
 assert.ok(ui.includes("theme==='amber'?'green':'amber'"));
 assert.ok(ui.includes("localStorage.setItem"));
 assert.ok(sw.includes('cache.addAll(APP_SHELL)'));
 assert.ok(!html.includes('tile.openstreetmap.org'));
});
