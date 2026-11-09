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
test('a single local record is sanitized and never permits invalid or negative scores',()=>{
 assert.equal(Scores.sanitize(null),null);
 assert.equal(Scores.sanitize({score:-5}),null);
 assert.equal(Scores.sanitize({score:'unknown'}),null);
 assert.deepEqual(Scores.sanitize({score:'500.9',lines:-4,level:3.2,at:7}),{
  score:500,lines:0,level:3,at:7
 });
});
test('storage errors do not interrupt gameplay or erase current-session record',()=>{
 const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('quota')}};
 assert.equal(Scores.read(blocked),null);
 const record=Scores.update(blocked,null,{score:42,lines:2,level:1,at:99});
 assert.equal(record.score,42);
 assert.equal(Scores.update(blocked,record,{score:12}),record);
});
test('one local best replaces the leaderboard; ties preserve previous metadata',()=>{
 const map=new Map();
 const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 assert.equal(Scores.KEY,'nomadTetrisPersonalBestV01');
 const first=Scores.update(storage,null,{score:42,lines:1,level:1,at:10});
 assert.deepEqual(Scores.read(storage),first);
 assert.equal(Scores.update(storage,first,{score:42,lines:10,level:8}),first);
 assert.equal(Scores.read(storage).lines,1);
 const next=Scores.update(storage,first,{score:94,lines:3,level:2,at:22});
 assert.equal(next.score,94);
 assert.deepEqual(Scores.read(storage),next);
 assert.equal(map.has(Scores.OLD_TOP_FIVE),false);
 assert.equal(map.has(Scores.LEGACY),false);
});
test('a stale tab cannot overwrite a higher score in the local storage fallback',()=>{
 const map=new Map();
 const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 const firstTab=Scores.read(storage),secondTab=Scores.read(storage);
 Scores.update(storage,firstTab,{score:1200,lines:20,level:2,at:20});
 const visible=Scores.update(storage,secondTab,{score:300,lines:1,level:0,at:30});
 assert.equal(visible.score,1200);
 assert.deepEqual(Scores.read(storage),{score:1200,lines:20,level:2,at:20});
});
test('a blocked score database falls back to the existing local record',async()=>{
 const map=new Map();
 const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 const persist=Scores.createPersistence(storage,{open(){throw Error('blocked');}});
 await persist({score:1200,lines:20,level:2,at:20});
 assert.equal((await persist({score:300,lines:1,level:0,at:30})).score,1200);
 assert.deepEqual(Scores.read(storage),{score:1200,lines:20,level:2,at:20});
});
test('legacy five-entry scores migrate highest result and keep their original backup',()=>{
 const backup=JSON.stringify([
  {name:'ABC',score:62,lines:4,level:1,at:5},
  {name:'XYZ',score:400,lines:12,level:2,at:9},
  {name:'BAD',score:-20}]);
 const map=new Map([[Scores.OLD_TOP_FIVE,backup],[Scores.LEGACY,'350']]);
 const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 assert.deepEqual(Scores.read(storage),{score:400,lines:12,level:2,at:9});
 assert.equal(map.get(Scores.OLD_TOP_FIVE),backup);
 assert.equal(JSON.parse(map.get(Scores.KEY)).score,400);
});
test('numeric legacy best is recovered if higher than leaderboard score',()=>{
 const map=new Map([[Scores.OLD_TOP_FIVE,JSON.stringify([{score:100,lines:1,level:1}])],[Scores.LEGACY,'800']]);
 const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 assert.deepEqual(Scores.read(storage),{score:800,lines:0,level:0,at:0});
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
 g.start();g.lines=9;g.level=0;
 g.board=Array.from({length:20},()=>Array(10).fill(0));
 for(let x=0;x<10;x++)g.board[19][x]=(x===4||x===5)?0:'Z';
 g.current=g.piece('O');g.current.y=18;
 lockNow(g);
 assert.deepEqual(events.map(x=>x.type),['piece-locked','lines-cleared','level-changed']);
 assert.deepEqual([events[1].count,...events[1].rows],[1,19]);
 assert.equal(events[2].from,0);
 assert.equal(events[2].to,1);
 assert.equal(events[2].lines,10);
 assert.equal(g.level,1);
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
 assert.equal(events[0].level,0);
 assert.equal(g.pieces,0);
});

test('classic 1989 scoring has no placement bonus, only soft drop and line points',()=>{
 const g=fresh();g.start();
 assert.equal(g.softDrop(),true);
 assert.equal(g.score,1);
 lockNow(g);
 assert.equal(g.score,1,'ordinary placement awards no points');
});
test('1989 four-line clear awards 1200 at displayed level 00',()=>{
 const g=fresh();g.start();g.board=Array.from({length:20},()=>Array(10).fill(0));
 for(let y=16;y<20;y++)for(let x=0;x<10;x++)if(x!==4)g.board[y][x]='J';
 const p=g.piece('I');p.matrix=Core.turn(p.matrix,1);p.rotation=1;p.x=2;g.current=p;
 lockNow(g);
 assert.equal(g.lines,4);assert.equal(g.score,1200);
});
test('level cap is 20, and crossing a threshold uses the 1989 score multiplier',()=>{
 const g=fresh();g.start();assert.equal(Core.MAX_LEVEL,20);
 g.lines=9;g.level=0;
 g.board=Array.from({length:20},()=>Array(10).fill(0));
 for(let x=0;x<10;x++)g.board[19][x]=(x===4||x===5)?0:'Z';
 g.current=g.piece('O');g.current.y=18;lockNow(g);
 assert.equal(g.level,1);assert.equal(g.score,80);
 g.lines=400;g.level=20;
 g.current=g.piece('O');g.current.y=18;lockNow(g);
 assert.equal(g.level,20);
});

test('NOMAD retains Game Boy level numbering 00 through 20',()=>{
 const g=fresh();
 assert.equal(g.level,0);
 assert.equal(g.dropMs,850,'first level preserves approved starting gravity');
 g.start();
 g.lines=199;g.level=19;
 g.board=Array.from({length:20},()=>Array(10).fill(0));
 for(let x=0;x<10;x++)g.board[19][x]=(x===4||x===5)?0:'Z';
 g.current=g.piece('O');g.current.y=18;lockNow(g);
 assert.equal(g.lines,200);
 assert.equal(g.level,20);
 assert.equal(g.score,840,'level 20 scoring uses a 21x multiplier');
 assert.equal(g.status,'playing','reaching level 20 does not end the game');
});
