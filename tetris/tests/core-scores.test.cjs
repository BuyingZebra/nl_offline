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
 for(let i=0;i<4;i++)g.tick(100);
 g.tick(99);assert.equal(g.pieces,0);
 g.tick(1);
 assert.equal(g.pieces,1);
});
test('lock delay pauses off a ledge and only a new downward row resets it',()=>{
 const g=fresh();g.start();g.spawn('O');
 for(let i=0;i<8;i++)g.softDrop();
 g.board[10][4]='Z';
 g.tick(100);g.tick(100);
 assert.equal(g.lockClock,200);
 assert.equal(g.move(1),true);
 g.tick(100);
 assert.equal(g.lockClock,200,'airborne time leaves the timer intact');
 assert.equal(g.move(-1),true);
 g.tick(100);
 assert.equal(g.lockClock,300,'returning at the same height keeps the timer');
 g.move(1);
 assert.equal(g.softDrop(),true);
 assert.equal(g.lockClock,0);
});
test('a wall kick keeps the timer and gravity only counts time after landing',()=>{
 const g=fresh();g.start();g.spawn('T');
 for(let i=0;i<18;i++)g.softDrop();
 g.tick(100);
 assert.equal(g.rotate(),true);
 assert.equal(g.lockClock,100);

 g.spawn('O');
 g.level=29;
 for(let i=0;i<17;i++)g.softDrop();
 g.tick(g.dropMs+8);
 assert.equal(g.current.y,18);
 assert.ok(Math.abs(g.lockClock-8)<1e-9);
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
test('last-chance clears save overhangs or score before either kind of game over',()=>{
 for(const [startY,rows,blocked,reason] of [
  [-1,1,false,null],[-2,2,false,null],
  [-2,1,false,'top-out'],[-1,1,true,'spawn-blocked']
 ]){
  const g=fresh(),events=[];
  g.start();g.onEvent(event=>events.push(event));
  const p=g.piece('I');
  p.matrix=Core.turn(p.matrix,1);p.rotation=1;p.x=-2;p.y=startY;
  g.current=p;g.queue=['T',...g.queue];
  for(let y=0;y<rows;y++)g.board[y].fill('J',1);
  if(blocked)g.board[1][4]='J';
  g.board[startY+4][0]='J';
  assert.equal(g.isGrounded(),true);
  g.lockPiece();
  assert.equal(g.lines,rows);
  assert.equal(g.score,rows===1?40:100);
  assert.equal(g.status,reason?'over':'playing');
  assert.deepEqual(events.map(e=>e.type),reason?
   ['piece-locked','lines-cleared','game-over']:['piece-locked','lines-cleared']);
  assert.equal(events[1].points,g.score);
  if(reason)assert.equal(events[2].reason,reason);
  const firstSavedIndex=startY+rows<0?1:0;
  assert.equal(g.board[0][0],'I');
  assert.deepEqual(g.boardMeta[0][0],
   {kind:'I',pieceId:p.id,rotation:1,sourceIndex:firstSavedIndex});
  if(rows===2)assert.equal(g.boardMeta[1][0].sourceIndex,1);
 }
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
test('crossing a threshold uses the 1989 score multiplier',()=>{
 const g=fresh();g.start();
 g.lines=9;g.level=0;
 g.board=Array.from({length:20},()=>Array(10).fill(0));
 for(let x=0;x<10;x++)g.board[19][x]=(x===4||x===5)?0:'Z';
 g.current=g.piece('O');g.current.y=18;lockNow(g);
 assert.equal(g.level,1);assert.equal(g.score,80);
});

test('NES gravity reaches maximum at 29 and level 89 continues until game over',()=>{
 const g=fresh();
 assert.equal(g.level,0);
 assert.equal(Core.MAX_LEVEL,89);
 const frameMs=1000/60.0988;
 for(const [level,frames] of [[0,48],[10,5],[12,5],[18,3],[28,2],[29,1],[89,1]]){
  g.level=level;assert.equal(g.dropMs,frames*frameMs);
 }
 g.start();
 g.lines=889;g.level=88;
 for(let i=0;i<2;i++){
  for(let x=0;x<10;x++)g.board[19][x]=(x===4||x===5)?0:'Z';
  g.current=g.piece('O');lockNow(g);
  assert.equal(g.lines,890+i);
  assert.equal(g.level,89);
  assert.equal(g.score,3600*(i+1));
  assert.equal(g.status,'playing');
 }
});
