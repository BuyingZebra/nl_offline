/* NOMAD: game-rule and save-data edge cases. Run with Node 22. */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Core=require('../core.js'),Scores=require('../scores.js');
const fresh=()=>new Core.Game(()=>.33);
const lockNow=g=>{g.current.y=g.ghostY();g.lockPiece();};
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
 assert.equal(g.softDrop(),false);
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
 lockNow(g);
 assert.equal(g.canHold,true);
});
test('two completed rows score correctly and are removed',()=>{
 const g=fresh();g.start();
 g.board=Array.from({length:20},()=>Array(10).fill(0));
 for(let y=18;y<=19;y++)for(let x=0;x<10;x++)
  g.board[y][x]=(x===4||x===5)?0:'J';
 g.current=g.piece('O');
 lockNow(g);
 assert.equal(g.lines,2);assert.equal(g.score,100);
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

test('game event subscriptions are removable, and invalid listeners are rejected',()=>{
 const g=fresh(),events=[];
 assert.throws(()=>g.onEvent(null),TypeError);
 const unsubscribe=g.onEvent(event=>events.push(event.type));
 assert.equal(typeof unsubscribe,'function');
 assert.equal(g.start(),true);
 lockNow(g);
 assert.deepEqual(events,['piece-locked']);
 assert.equal(unsubscribe(),true);
 assert.equal(unsubscribe(),false);
 g.reset();
 assert.deepEqual(events,['piece-locked']);
});
test('failed game-event observers cannot interrupt a lock or other listeners',()=>{
 const g=fresh(),events=[];
 g.onEvent(()=>{throw Error('broken renderer');});
 g.onEvent(event=>events.push(event.type));
 g.start();
 lockNow(g);
 assert.equal(g.pieces,1);
 assert.deepEqual(events,['piece-locked']);
});
test('event observers removed during dispatch are not invoked later in that event',()=>{
 const g=fresh(),events=[];
 let removeOther;
 g.onEvent(()=>{events.push('first');removeOther();});
 removeOther=g.onEvent(()=>events.push('removed'));
 g.start();lockNow(g);
 assert.deepEqual(events,['first']);
});
test('piece lock reports exactly one read-only event with final engine state',()=>{
 const g=fresh(),events=[];
 g.onEvent(event=>events.push(event));
 g.start();
 const locked=g.current.kind;
 lockNow(g);
 assert.deepEqual(events.map(x=>x.type),['piece-locked']);
 const event=events[0];
 assert.equal(Object.isFrozen(event),true);
 assert.equal(event.kind,locked);
 assert.equal(event.cleared,0);
 assert.equal(event.score,g.score);
 assert.equal(event.lines,g.lines);
 assert.equal(event.level,g.level);
 assert.equal(event.status,'playing');
 assert.equal(g.pieces,1);
});
test('gravity locking emits the same event once, without needing any renderer',()=>{
 const g=fresh(),events=[];
 g.onEvent(e=>events.push(e.type));
 g.start();
 g.current=g.piece('O');g.current.y=18;
 for(let n=0;n<6;n++)g.tick(100);
 assert.deepEqual(events,['piece-locked']);
 assert.equal(g.pieces,1);
});
test('completed rows include the exact pre-clear landed board and row indices',()=>{
 const g=fresh(),events=[];
 g.onEvent(event=>events.push(event));
 g.start();
 g.board=Array.from({length:20},()=>Array(10).fill(0));
 for(let y=18;y<=19;y++)for(let x=0;x<10;x++)
  g.board[y][x]=(x===4||x===5)?0:'J';
 g.current=g.piece('O');
 lockNow(g);
 assert.deepEqual(events.map(x=>x.type),['piece-locked','lines-cleared']);
 const clear=events[1];
 assert.equal(clear.count,2);
 assert.deepEqual(clear.rows,[18,19]);
 assert.equal(clear.status,'playing');
 assert.equal(clear.lines,2);
 assert.equal(clear.score,g.score);
 assert.equal(Object.isFrozen(clear),true);
 assert.equal(Object.isFrozen(clear.rows),true);
 assert.equal(Object.isFrozen(clear.board),true);
 assert.equal(Object.isFrozen(clear.board[19]),true);
 assert.ok(clear.board[18].every(Boolean));
 assert.ok(clear.board[19].every(Boolean));
 assert.equal(clear.board[18][4],'O');
 assert.equal(clear.board[19][5],'O');
 assert.ok(g.board[18].every(c=>!c));
 assert.ok(g.board[19].every(c=>!c));
 assert.notEqual(clear.board,g.board);
 assert.throws(()=>{clear.board[19][0]='X';},TypeError);
});
test('level changes are ordered after the lock and clear, with the old and new levels',()=>{
 const g=fresh(),events=[];
 g.onEvent(event=>events.push(event));
 g.start();g.lines=9;g.level=1;
 g.board=Array.from({length:20},()=>Array(10).fill(0));
 for(let x=0;x<10;x++)g.board[19][x]=(x===4||x===5)?0:'Z';
 g.current=g.piece('O');g.current.y=18;
 lockNow(g);
 assert.deepEqual(events.map(x=>x.type),['piece-locked','lines-cleared','level-changed']);
 assert.deepEqual([events[1].count,...events[1].rows],[1,19]);
 assert.equal(events[2].from,1);
 assert.equal(events[2].to,2);
 assert.equal(events[2].lines,10);
 assert.equal(g.level,2);
});
test('blocked spawn during hold emits game-over without a lock event',()=>{
 const g=fresh(),events=[];
 g.onEvent(event=>events.push(event));
 g.start();g.hold='O';
 g.board[0][4]='Z';
 assert.equal(g.holdPiece(),true);
 assert.equal(g.status,'over');
 assert.deepEqual(events.map(x=>x.type),['game-over']);
 assert.equal(events[0].reason,'spawn-blocked');
});
test('a lock above the board reports top-out without a successful lock',()=>{
 const g=fresh(),events=[];
 g.onEvent(event=>events.push(event));
 g.start();g.current=g.piece('O');g.current.y=-1;
 g.lockPiece();
 assert.equal(g.status,'over');
 assert.deepEqual(events.map(x=>x.type),['game-over']);
 assert.equal(events[0].reason,'top-out');
});
test('reset emits a clean ready-state event and does not keep stale gameplay state',()=>{
 const g=fresh(),events=[];
 g.onEvent(event=>events.push(event));
 g.start();lockNow(g);
 events.length=0;
 g.reset();
 assert.deepEqual(events.map(x=>x.type),['reset']);
 assert.equal(events[0].status,'ready');
 assert.equal(events[0].score,0);
 assert.equal(events[0].level,1);
 assert.equal(g.pieces,0);
});

test('classic 1989 scoring has no placement bonus, only soft drop and line points',()=>{
 const g=fresh();g.start();
 assert.equal(g.softDrop(),true);
 assert.equal(g.score,1);
 lockNow(g);
 assert.equal(g.score,1,'ordinary placement awards no points');
});
test('1989 four-line clear awards 1200 at displayed level 01',()=>{
 const g=fresh();g.start();g.board=Array.from({length:20},()=>Array(10).fill(0));
 for(let y=16;y<20;y++)for(let x=0;x<10;x++)if(x!==4)g.board[y][x]='J';
 const p=g.piece('I');p.matrix=Core.turn(p.matrix,1);p.rotation=1;p.x=2;g.current=p;
 lockNow(g);
 assert.equal(g.lines,4);assert.equal(g.score,1200);
});
test('level cap is 20, and crossing a threshold uses the 1989 score multiplier',()=>{
 const g=fresh();g.start();assert.equal(Core.MAX_LEVEL,20);
 g.lines=9;g.level=1;
 g.board=Array.from({length:20},()=>Array(10).fill(0));
 for(let x=0;x<10;x++)g.board[19][x]=(x===4||x===5)?0:'Z';
 g.current=g.piece('O');g.current.y=18;lockNow(g);
 assert.equal(g.level,2);assert.equal(g.score,80);
 g.lines=400;g.level=20;
 g.current=g.piece('O');g.current.y=18;lockNow(g);
 assert.equal(g.level,20);
});
