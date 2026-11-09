import {describe,test} from 'node:test';
import assert from 'node:assert/strict';
import Core,{Scores,createActionController,GAME_ACTIONS,createScreenManager,SCREENS,createSettingsManager,STORAGE_KEYS,DEFAULT_EFFECTS} from '../tetris/game.js';
import fs from 'node:fs';
import {createAppLifecycle,runCleanupTasks,createGraphicsHealth} from '../tetris/platform.js';

describe('Game rules and personal bests',()=>{
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
});

describe('Gameplay commands',()=>{
 function harness(initialStatus='ready',canInteract=()=>true){
  const events=[],storage=new Map();
  const game={
   status:initialStatus,pieces:0,lines:0,score:0,level:0,hold:null,
   move:dx=>{if(game.status!=='playing')return false;events.push(['move',dx]);return true;},
   rotate:dir=>{if(game.status!=='playing')return false;events.push(['rotate',dir]);return true;},
   softDrop:()=>{if(game.status!=='playing')return false;game.score++;events.push(['soft']);return true;},
   holdPiece:()=>{if(game.status!=='playing')return false;game.hold='T';events.push(['hold']);return true;},
   pause:()=>{if(game.status==='playing'){game.status='paused';return true;}
    if(game.status==='paused'){game.status='playing';return true;}return false;},
   start:()=>{if(['ready','paused','over'].includes(game.status)){
    if(game.status==='over')game.reset();
    game.status='playing';return true;}return false;},
   reset:()=>{game.status='ready';game.pieces=0;game.lines=0;game.score=0;game.level=0;game.hold=null;events.push(['reset']);}
  };
  const scores={
   read:()=>null,
   update:(unused,current,entry)=>{
    if(entry.score<=(current?.score||0))return current;
    const saved={...entry};events.push(['persistScore',saved]);return saved;
   }
  };
  const settings={
   toggleTheme:()=>events.push(['theme']),
   restoreDefaults:()=>events.push(['restoreFX']),
   setSetting:(key,value)=>events.push(['setting',key,value])
  };
  const screens={
   close:()=>events.push(['close']),
   openOptions:()=>events.push(['options']),
   openScores:()=>events.push(['scores'])
  };
  let lineClear=false;
  const actions=createActionController({
   game,scores,storage,settings,screens,
   getLineClearActive:()=>lineClear,
   clearLineClear:()=>{lineClear=false;events.push(['clearLine']);},
   markLayers:(...names)=>events.push(['dirty',...names]),
   invalidate:()=>events.push(['invalidate']),
   tone:(freq,len)=>events.push(['tone',freq,len]),
   onCopyDebug:()=>events.push(['debug']),
   onResetSettingsUI:()=>events.push(['resetSettingsUI']),
   canInteract,now:()=>123456
  });
  return {actions,events,game,storage,scores,settings,screens,
   setLineClear:value=>{lineClear=value;},
   get lineClear(){return lineClear;}
  };
 }

 test('all seven gameplay actions remain unchanged',()=>{
  assert.deepEqual(GAME_ACTIONS,['left','right','cw','soft','hold','pause','start']);
 });
 test('ready input fails without side effects',()=>{
  const h=harness();
  assert.equal(h.actions.perform('left'),false);
  assert.equal(h.actions.perform('soft'),false);
  assert.deepEqual(h.events,[]);
 });
 test('starting play preserves the approved redraw notifications',()=>{
  const h=harness();
  assert.equal(h.actions.perform('start'),true);
  assert.deepEqual(h.events,[['dirty','board','controls'],['dirty','base'],['invalidate']]);
 });
 test('move, rotate and hold keep their previous effects',()=>{
  const h=harness('playing');
  h.actions.perform('left');
  assert.deepEqual(h.events,[['move',-1],['dirty','board','controls'],['invalidate']]);
  h.events.length=0;
  h.actions.perform('cw');
  assert.deepEqual(h.events,[['rotate',1],['dirty','board','controls'],['tone',305,undefined],['invalidate']]);
  h.events.length=0;
  h.actions.perform('hold');
  assert.deepEqual(h.events,[['hold'],['dirty','board','controls'],['dirty','sidebar'],['tone',265,undefined],['invalidate']]);
 });
 test('soft drop saves the best immediately without any initials or leaderboard',()=>{
  const h=harness('playing');h.game.lines=6;h.game.level=2;
  h.actions.perform('soft');
  assert.deepEqual(h.actions.best,{score:1,lines:6,level:2,at:123456});
  assert.deepEqual(h.events,[
   ['soft'],['dirty','board','controls'],['dirty','sidebar'],
   ['persistScore',{score:1,lines:6,level:2,at:123456}],['invalidate']
  ]);
  h.events.length=0;h.actions.observeScore();
  assert.deepEqual(h.events,[],'record must not be written again for ties');
 });
 test('gravity/line-clear updates can store one better record independently',()=>{
  const h=harness('playing');
  h.game.score=125;h.game.lines=12;h.game.level=1;
  assert.equal(h.actions.observeScore(),true);
  assert.deepEqual(h.actions.best,{score:125,lines:12,level:1,at:123456});
  h.events.length=0;h.game.score=100;
  assert.equal(h.actions.observeScore(),false);
  assert.deepEqual(h.events,[]);
  h.game.score=200;h.game.lines=14;
  assert.equal(h.actions.observeScore(),true);
  assert.equal(h.actions.best.lines,14);
 });
 test('game over saves any outstanding best once, with no initials prompt',()=>{
  const h=harness('over');h.game.score=300;h.game.lines=20;h.game.level=4;
  h.actions.onGameOver();
  assert.deepEqual(h.events,[['persistScore',{score:300,lines:20,level:4,at:123456}]]);
  h.actions.onGameOver();
  assert.equal(h.events.length,1);
  assert.equal('openHighScoreEntry' in h.screens,false);
 });
 test('restarting saves an unfinished record before resetting gameplay',()=>{
  const h=harness('paused');h.game.score=430;
   h.actions.dispatch('restart');
  assert.equal(h.actions.best.score,430);
  assert.equal(h.game.score,0);
  assert.equal(h.game.status,'playing');
  assert.deepEqual(h.events,[
   ['persistScore',{score:430,lines:0,level:0,at:123456}],
   ['clearLine'],['reset'],['dirty','board','sidebar','controls','base'],['close'],['invalidate']
  ]);
 });
 test('line-clear flash still blocks movement but allows pause',()=>{
  const h=harness('playing');h.setLineClear(true);
  for(const a of ['left','right','cw','soft','hold'])assert.equal(h.actions.perform(a),false);
  assert.equal(h.actions.perform('pause'),true);
  assert.equal(h.game.status,'paused');
  assert.equal(h.actions.perform('pause'),true);
  assert.equal(h.game.status,'playing');
 });
 test('settings and appearance retain the same callbacks',()=>{
  const h=harness();
  h.actions.setSetting('pieceGhost',false);
  assert.deepEqual(h.events,[['setting','pieceGhost',false],['dirty','board'],['invalidate']]);
  h.events.length=0;h.actions.dispatch('theme');
  assert.deepEqual(h.events,[['theme'],['dirty','base'],['invalidate']]);
  h.events.length=0;h.actions.dispatch('resetFX');
  assert.deepEqual(h.events,[['restoreFX'],['resetSettingsUI'],['dirty','base'],['invalidate']]);
 });
 test('menu actions retain navigation, but score entry and initials commands are gone',()=>{
  const h=harness();
  for(const [action,event] of [['close','close'],['copyDebug','debug'],
   ['options','options'],['scores','scores']]){
   h.events.length=0;h.actions.dispatch(action);
   assert.equal(h.events.at(-1)[0],event);
  }
  h.events.length=0;
  for(const action of ['skipScore','saveScore','typeInitials','block','scroll','board','unknown'])
   h.actions.dispatch(action);
  assert.deepEqual(h.events,[]);
 });
 test('context-loss protection still blocks invisible actions',()=>{
  const h=harness('paused',()=>false);
  assert.equal(h.actions.perform('pause'),false);
  assert.equal(h.actions.perform('soft'),false);
  h.actions.dispatch('restartYes');h.actions.dispatch('options');
  h.actions.dispatch('theme');h.actions.setSetting('bloomStrength',35);
  assert.deepEqual(h.events,[]);
 });
 test('context-loss safety pause is still allowed during interruption',()=>{
  const h=harness('playing',()=>false);
  assert.equal(h.actions.perform('pause'),true);
  assert.equal(h.game.status,'paused');
  assert.equal(h.actions.perform('pause'),false);
  assert.deepEqual(h.events,[['dirty','board','controls'],['dirty','base'],['invalidate']]);
 });
 test('controller remains isolated from visual and DOM ownership',()=>{
  const h=harness();assert.equal(Object.isFrozen(h.actions),true);
  for(const forbidden of ['renderer','context','screen','layout','canvas','initialsInput'])
   assert.equal(forbidden in h.actions,false);
 });
});

describe('Menus and pause state',()=>{
 function harness(initial='ready'){
  let status=initial,pauses=0;
  const transitions=[];
  const screens=createScreenManager({
   getGameStatus:()=>status,
   pauseGame:()=>{pauses++;status='paused';return true;},
   onChange:(from,to)=>transitions.push({from,to,gameStatus:status})
  });
  return {
   screens,transitions,
   get status(){return status;},set status(next){status=next;},
   get pauses(){return pauses;}
  };
 }

 test('starts on gameplay screen without opening a modal',()=>{
  const {screens}=harness();
  assert.equal(screens.screen,SCREENS.GAME);
  assert.equal(screens.active,null);
  assert.equal(screens.hasModal,false);
  assert.equal(screens.isOptions,false);
  assert.equal(screens.isScores,false);
  assert.equal(screens.paintsModalLayer,false);
 });

 test('opening Display System pauses active gameplay before the UI transition',()=>{
  const h=harness('playing');
  assert.equal(h.screens.openOptions(),true);
  assert.equal(h.status,'paused');
  assert.equal(h.pauses,1);
  assert.deepEqual(h.transitions,[{from:null,to:'options',gameStatus:'paused'}]);
  assert.equal(h.screens.active,SCREENS.OPTIONS);
  assert.equal(h.screens.paintsModalLayer,true);
 });

 test('high scores pause active gameplay but continue painting into the board popup',()=>{
  const h=harness('playing');
  h.screens.openScores();
  assert.equal(h.status,'paused');
  assert.equal(h.pauses,1);
  assert.equal(h.screens.isScores,true);
  assert.equal(h.screens.paintsModalLayer,false);
  assert.deepEqual(h.transitions,[{from:null,to:'scores',gameStatus:'paused'}]);
 });

 test('opening settings or high scores from ready/paused/over does not pause',()=>{
  for(const status of ['ready','paused','over']){
   const h=harness(status);
   h.screens.openOptions();
   h.screens.close();
   h.screens.openScores();
   assert.equal(h.pauses,0);
   assert.equal(h.status,status);
  }
 });

 test('restart uses the paused board action without opening a modal',()=>{
  const {screens}=harness('paused');
  assert.equal(screens.screen,SCREENS.GAME);
  assert.equal(screens.requestRestart,undefined);
  assert.equal(SCREENS.RESTART,undefined);
  assert.equal(screens.paintsModalLayer,false);
 });

 test('there is no initials-entry modal; one personal record uses the existing board overlay',()=>{
  const h=harness('over');
  assert.equal(SCREENS.ENTRY,undefined);
  assert.equal(h.screens.openHighScoreEntry,undefined);
  h.screens.openScores();
  assert.equal(h.screens.active,SCREENS.SCORES);
  assert.equal(h.pauses,0);
  assert.deepEqual(h.transitions.map(x=>[x.from,x.to]),[[null,'scores']]);
 });
 test('closing always returns to the existing gameplay status and clears overlay state',()=>{
  const h=harness('playing');
  h.screens.openOptions();
  assert.equal(h.screens.close(),true);
  assert.equal(h.screens.screen,SCREENS.GAME);
  assert.equal(h.screens.active,null);
  assert.equal(h.screens.hasModal,false);
  assert.equal(h.status,'paused'); // Same as old V085: never auto-resume.
  assert.deepEqual(h.transitions.at(-1),{from:'options',to:null,gameStatus:'paused'});
 });

 test('reopening the same screen reissues UI-reset callback',()=>{
  const h=harness('paused');
  h.screens.openOptions();
  h.screens.openOptions();
  assert.deepEqual(h.transitions.map(x=>[x.from,x.to]),[
   [null,'options'],['options','options']
  ]);
  assert.equal(h.pauses,0);
 });

 test('Screen Manager has no render or gameplay state ownership',()=>{
  const h=harness('ready');
  assert.equal(Object.isFrozen(h.screens),true);
  assert.equal(h.screens.screen,SCREENS.GAME);
  assert.equal('board' in h.screens,false);
  assert.equal('renderer' in h.screens,false);
  assert.equal('game' in h.screens,false);
 });
});

describe('Saved preferences',()=>{
 function memoryStorage(initial={}){
  const data=new Map(Object.entries(initial));
  return {
   data,
   getItem:key=>data.has(key)?data.get(key):null,
   setItem:(key,value)=>{data.set(key,String(value));}
  };
 }

 test('original visual defaults, sound and ghost settings are unchanged',()=>{
  const settings=createSettingsManager(memoryStorage());
  assert.deepEqual(settings.effects,DEFAULT_EFFECTS);
  assert.equal(settings.pieceGhost,true);
  assert.equal(settings.soundOn,true);
  assert.equal(settings.theme,'green');
 });

 test('slider values are stored using the original percent scaling',()=>{
  const storage=memoryStorage(),settings=createSettingsManager(storage);
  settings.setSetting('bloomStrength',35);
  assert.equal(settings.effects.bloomStrength,.35);
  assert.equal(JSON.parse(storage.data.get(STORAGE_KEYS.effects)).bloomStrength,.35);
 });

 test('all historical preference storage keys remain compatible',()=>{
  const storage=memoryStorage();
  const settings=createSettingsManager(storage);
  settings.setSetting('pieceGhost',false);
  settings.setSetting('sound',false);
  settings.toggleTheme();
  assert.equal(storage.data.get(STORAGE_KEYS.pieceGhost),'no');
  assert.equal(storage.data.get(STORAGE_KEYS.sound),'no');
  assert.equal(storage.data.get(STORAGE_KEYS.theme),'amber');
  assert.equal(settings.pieceGhost,false);
  assert.equal(settings.soundOn,false);
  assert.equal(settings.theme,'amber');
 });

 test('scanline Off retains the selected pattern for later use',()=>{
  const settings=createSettingsManager(memoryStorage());
  settings.chooseScanline('off');
  assert.equal(settings.effects.scanlines,false);
  assert.equal(settings.effects.scanlinePreset,'aperture');
  settings.chooseScanline('dot');
  assert.equal(settings.effects.scanlines,true);
  assert.equal(settings.effects.scanlinePreset,'dot');
 });

 test('Restore Defaults resets effects/ghost/sound but not phosphor theme',()=>{
  const settings=createSettingsManager(memoryStorage());
  settings.setSetting('ghost',true);
  settings.setSetting('pieceGhost',false);
  settings.setSetting('sound',false);
  settings.toggleTheme();
  settings.restoreDefaults();
  assert.deepEqual(settings.effects,DEFAULT_EFFECTS);
  assert.equal(settings.pieceGhost,true);
  assert.equal(settings.soundOn,true);
  assert.equal(settings.theme,'amber');
 });

 test('legacy saved effects load by matching value types and clamp bloom',()=>{
  const storage=memoryStorage({
   [STORAGE_KEYS.effects]:JSON.stringify({
    bloomStrength:3,scanlineOpacity:67,ghost:'invalid',softnessRadius:4
   }),
   [STORAGE_KEYS.pieceGhost]:'no',
   [STORAGE_KEYS.theme]:'amber'
  });
  const settings=createSettingsManager(storage);
  assert.equal(settings.effects.bloomStrength,1);
  assert.equal(settings.effects.scanlineOpacity,67);
  assert.equal(settings.effects.ghost,false);
  assert.equal(settings.effects.softnessRadius,4);
  assert.equal(settings.pieceGhost,false);
  assert.equal(settings.theme,'amber');
 });

 test('score initials remain at their original preference key',()=>{
  const storage=memoryStorage();
  const settings=createSettingsManager(storage);
  assert.equal(settings.readInitials(),'AAA');
  settings.saveInitials('MRC');
  assert.equal(settings.readInitials(),'MRC');
  assert.equal(storage.data.get(STORAGE_KEYS.initials),'MRC');
 });

 test('settings work if local persistence throws',()=>{
  const settings=createSettingsManager({
   getItem(){throw Error('access blocked');},
   setItem(){throw Error('quota exceeded');}
  });
  settings.setSetting('sound',false);
  assert.equal(settings.soundOn,false);
  settings.restoreDefaults();
  assert.equal(settings.soundOn,true);
  assert.deepEqual(settings.effects,DEFAULT_EFFECTS);
 });

 test('V103 persists and caps decay at 120ms with no scan refresh control',()=>{
  const store=memoryStorage(),settings=createSettingsManager(store);
  assert.equal(settings.effects.persistence,true);
  assert.equal(settings.effects.persistenceMs,120);
  assert.equal('scanRefreshHz' in settings.effects,false);
  settings.setSetting('persistenceMs',80);
  assert.equal(settings.effects.persistenceMs,80);
  settings.setSetting('persistence',false);
  const reopened=createSettingsManager(store);
  assert.equal(reopened.effects.persistenceMs,80);
  assert.equal(reopened.effects.persistence,false);
  reopened.restoreDefaults();
  assert.equal(reopened.effects.persistenceMs,120);
  assert.equal('scanRefreshHz' in reopened.effects,false);
  assert.equal(reopened.theme,'green');
 });
 test('decay setting clamps; removed scanning options are ignored',()=>{
  const store=memoryStorage(),settings=createSettingsManager(store);
  settings.setSetting('persistenceMs',90000);
  assert.equal(settings.effects.persistenceMs,120);
  settings.setSetting('persistenceMs',0);
  assert.equal(settings.effects.persistenceMs,10);
  settings.setSetting('persistenceMs',193);
  assert.equal(settings.effects.persistenceMs,120);
  settings.setSetting('scanRefreshHz',120);
  settings.setSetting('persistenceProfile','p39');
  assert.equal('scanRefreshHz' in settings.effects,false);
  assert.equal('persistenceProfile' in settings.effects,false);
 });
 test('stored V102 settings above 120 ms migrate to the new ceiling',()=>{
  const old=memoryStorage({
   [STORAGE_KEYS.effects]:JSON.stringify({
    persistenceProfile:'p39',scanRefreshHz:75,persistence:true,persistenceMs:460
   })
  });
  const settings=createSettingsManager(old);
  assert.equal(settings.effects.persistenceMs,120);
  assert.equal('scanRefreshHz' in settings.effects,false);
  assert.equal(settings.effects.persistence,true);
 });
 test('a prior saved decay at 190ms is automatically clamped to 120ms',()=>{
  const stored=memoryStorage({
   [STORAGE_KEYS.effects]:JSON.stringify({persistence:true,persistenceMs:190})
  });
  const settings=createSettingsManager(stored);
  assert.equal(settings.effects.persistenceMs,120);
  settings.setSetting('persistenceMs',120);
  assert.equal(createSettingsManager(stored).effects.persistenceMs,120);
 });

 test('V161 restores the original green/amber phosphor cycle',()=>{
  const storage=memoryStorage();
  const settings=createSettingsManager(storage);
  assert.equal(settings.theme,'green');
  assert.equal(settings.toggleTheme(),'amber');
  assert.equal(settings.toggleTheme(),'green');
  assert.equal(storage.data.get(STORAGE_KEYS.theme),'green');
  const savedBlue=memoryStorage({[STORAGE_KEYS.theme]:'blue'});
  const reopened=createSettingsManager(savedBlue);
  assert.equal(reopened.theme,'green','obsolete V160 blue falls back to green');
  assert.equal(reopened.toggleTheme(),'amber');
 });
 test('V161 removes the blue tint without changing original emissive ratios',()=>{
  const source=fs.readFileSync(new URL('../tetris/crt.js',import.meta.url),'utf8');
  assert.match(source,/green:new THREE\.Vector3\(\.2,1,\.2\)/);
  assert.match(source,/amber:new THREE\.Vector3\(185\/255,79\/255,9\/255\)/);
  assert.doesNotMatch(source,/blue:new THREE\.Vector3/);
  assert.match(source,/tint\.uniforms\.uTint\.value\.copy\(hues\[theme\]\|\|hues\.green\)/);
 });
});

describe('Gameplay integration',()=>{
 function session(){
  const saved=new Map(),transitions=[],tones=[],layers=[],events=[],cleaned=[];
  const storage={
   getItem:key=>saved.has(key)?saved.get(key):null,
   setItem:(key,value)=>saved.set(key,String(value))
  };
  const settings=createSettingsManager(storage);
  const game=new Core.Game(()=>.5);
  let clearActive=false,actions,lifecycle;
  const canvasListeners=new Map();
  const canvas={
   addEventListener:(type,fn)=>canvasListeners.set(type,fn),
   removeEventListener:(type,fn)=>{
    assert.equal(canvasListeners.get(type),fn);
    canvasListeners.delete(type);
   }
  };
  const graphics=createGraphicsHealth({
   canvas,
   onLost:()=>{
    if(game.status==='playing')actions.perform('pause');
    cleaned.push('input-cancelled-on-context-loss');
   },
   onRestored:()=>{layers.push('graphics-restored');}
  });
  graphics.attach();
  const emit=(type)=>{
   let prevented=false;
   canvasListeners.get(type)?.({preventDefault(){prevented=true;}});
   return prevented;
  };
  const screens=createScreenManager({
   getGameStatus:()=>game.status,
   pauseGame:()=>actions.perform('pause'),
   onChange:(from,to)=>transitions.push({from,to,status:game.status})
  });
  const unsubscribe=game.onEvent(event=>{
   events.push(event);
   if(event.type==='lines-cleared'&&event.status==='playing')
    clearActive=true;
  });
  actions=createActionController({
   game,scores:Scores,storage,settings,screens,
   getLineClearActive:()=>clearActive,
   clearLineClear:()=>{clearActive=false;},
   markLayers:(...names)=>layers.push(...names),
   invalidate:()=>layers.push('invalidated'),
   tone:(freq)=>tones.push(freq),
   onCopyDebug:()=>layers.push('debug'),
   onResetSettingsUI:()=>layers.push('settings-ui-reset'),
   canInteract:()=>graphics.status==='ready'&&lifecycle?.canWork!==false,
   now:()=>5000
  });
  lifecycle=createAppLifecycle({
   onSuspend:()=>{
    // Matches renderer: lifecycle sets suspended BEFORE calling the callback.
    if(game.status==='playing'){
     game.pause();
     layers.push('base','board','controls');
    }
    cleaned.push('input-cancelled-on-hide');
   },
   onResume:()=>{layers.push('resized','redrawn');},
   onDispose:()=>runCleanupTasks([
    ['game-events',()=>{unsubscribe();cleaned.push('game-events');}],
    ['graphics',()=>{graphics.detach();cleaned.push('graphics');}],
    ['input',()=>cleaned.push('input')],
    ['resources',()=>cleaned.push('resources')]
   ])
  });
  return {game,storage,saved,settings,actions,screens,lifecycle,graphics,
   emit,canvasListeners,events,tones,transitions,layers,cleaned,
   get clearActive(){return clearActive;},
   clearFlash(){clearActive=false;}
  };
 }

 test('real game, screen manager and settings preserve pause-before-options and audio',()=>{
  const s=session();
  assert.equal(s.actions.perform('start'),true);
  assert.equal(s.game.status,'playing');
  assert.equal(s.actions.perform('soft'),true);
  s.game.current.y=s.game.ghostY();s.game.lockPiece();
  assert.equal(s.game.pieces,1);
  assert.equal(s.events.filter(e=>e.type==='piece-locked').length,1);
  assert.equal(s.game.score,1,'manually soft-dropped row scores one point');
  s.actions.dispatch('options');
  assert.equal(s.game.status,'paused');
  assert.equal(s.screens.isOptions,true);
  assert.equal(s.transitions.at(-1).status,'paused');
  s.actions.setSetting('bloomStrength',33);
  s.actions.setSetting('sound',false);
  s.actions.setSetting('pieceGhost',false);
  assert.equal(s.settings.effects.bloomStrength,.33);
  assert.equal(s.saved.get(STORAGE_KEYS.sound),'no');
  assert.equal(s.saved.get(STORAGE_KEYS.pieceGhost),'no');
  s.actions.dispatch('close');
  assert.equal(s.screens.hasModal,false);
  assert.equal(s.game.status,'paused','menu closing must not silently resume gameplay');
  const reopened=createSettingsManager(s.storage);
  assert.equal(reopened.effects.bloomStrength,.33);
  assert.equal(reopened.soundOn,false);
  s.lifecycle.dispose();
 });

 test('line clear event drives input lock and score/level updates without engine overrides',()=>{
  const s=session();s.actions.perform('start');
  s.game.lines=9;s.game.level=0;
  s.game.board=Array.from({length:20},()=>Array(10).fill(0));
  for(let x=0;x<10;x++)s.game.board[19][x]=(x===4||x===5)?0:'Z';
  s.game.current=s.game.piece('O');s.game.current.y=18;
  s.game.current.y=s.game.ghostY();s.game.lockPiece();
  assert.equal(s.game.lines,10);
  assert.equal(s.game.level,1);
  const last=s.events.filter(e=>['piece-locked','lines-cleared','level-changed'].includes(e.type));
  assert.deepEqual(last.map(e=>e.type),['piece-locked','lines-cleared','level-changed']);
  assert.deepEqual(last[1].rows,[19]);
  assert.equal(last[1].board[19][4],'O');
  assert.equal(s.clearActive,true);
  assert.equal(s.actions.perform('left'),false,'flash blocks input');
  assert.equal(s.actions.perform('pause'),true,'flash must still permit pause');
  assert.equal(s.game.status,'paused');
  s.clearFlash();
  assert.equal(s.actions.perform('pause'),true);
  assert.equal(s.game.status,'playing');
  s.lifecycle.dispose();
 });

 test('background, bfcache and WebGL interruption never resume gameplay invisibly',()=>{
  const s=session();s.actions.perform('start');
  assert.equal(s.lifecycle.suspend('visibility'),true);
  assert.equal(s.game.status,'paused','background must pause even after input guard activates');
  assert.equal(s.actions.perform('soft'),false);
  assert.equal(s.actions.perform('start'),false);
  assert.equal(s.lifecycle.pageHide(true),false,'repeated hidden event is inert');
  assert.equal(s.lifecycle.pageShow(true),true);
  assert.equal(s.game.status,'paused');
  assert.ok(s.layers.includes('redrawn'));
  assert.equal(s.actions.perform('start'),true);
  assert.equal(s.game.status,'playing');
  assert.equal(s.emit('webglcontextlost'),true);
  assert.equal(s.game.status,'paused');
  assert.equal(s.actions.perform('soft'),false);
  s.emit('webglcontextrestored');
  assert.equal(s.graphics.status,'recovering');
  assert.equal(s.actions.perform('start'),false);
  assert.equal(s.graphics.rendered(),true);
  assert.equal(s.actions.perform('start'),true);
  assert.equal(s.game.status,'playing');
  assert.equal(s.lifecycle.pageHide(false),true);
  assert.equal(s.lifecycle.status,'disposed');
  assert.equal(s.actions.perform('soft'),false);
  assert.equal(s.canvasListeners.size,0);
  assert.deepEqual(s.cleaned.slice(-4),['game-events','graphics','input','resources']);
  assert.equal(s.lifecycle.dispose(),false);
 });

 test('one device-local personal record is saved on game over and survives restart',()=>{
  const s=session();s.actions.perform('start');
  s.game.score=1000;s.game.lines=18;s.game.level=2;
  s.game.board[0][4]='Z';
  s.game.spawn('O');
  assert.equal(s.game.status,'over');
  s.actions.onGameOver();
  assert.equal(s.screens.active,null,'no score-entry overlay');
  assert.deepEqual(Scores.read(s.storage),{score:1000,lines:18,level:2,at:5000});
  assert.equal(s.saved.has(Scores.OLD_TOP_FIVE),false);
  s.actions.restart();
  assert.equal(s.game.status,'playing');
  assert.equal(s.game.score,0);
  assert.equal(s.screens.hasModal,false);
  assert.equal(Scores.read(s.storage).score,1000);
  s.actions.dispatch('pause');
  s.actions.dispatch('scores');
  assert.equal(s.screens.isScores,true);
  s.lifecycle.dispose();
 });
});
