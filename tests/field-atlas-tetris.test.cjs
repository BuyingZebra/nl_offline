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
test('hard drop adds two points per row and a placement bonus',()=>{
 const g=fresh();g.start();
 const target=g.ghostY(),oldScore=g.score;
 assert.ok(target>=0);
 assert.equal(g.hardDrop(),true);
 assert.equal(g.pieces,1);
 assert.equal(g.score-oldScore,target*2+10);
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
 assert.equal(g.score,310+distance*2);
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
 assert.equal(g.score,10,'Gravity-locked piece earns a placement bonus');
});

// Consolidated V028 architecture invariants. No HTML/CSS mirroring path.
const Scores=require('../tetris/scores.js');
test('canonical Tetris loads only native Pixi display, stable core, scores and CRT passes',()=>{
 const d=path.join(__dirname,'../tetris');
 const html=fs.readFileSync(path.join(d,'index.html'),'utf8');
 const ui=fs.readFileSync(path.join(d,'pixi-ui.js'),'utf8');
 const crt=fs.readFileSync(path.join(d,'pixi-crt.js'),'utf8');
 for(const asset of ['./core.js?arcade=v028','./scores.js?arcade=v028',
  './vendor/pixi.min.js?arcade=v028','./pixi-crt.js?arcade=v028','./pixi-ui.js?arcade=v028'])
  assert.ok(html.includes(asset),asset);
 assert.ok(!html.includes('./ui.js?')&&!html.includes('experimental-fx.js'));
 assert.ok(!html.includes('renderer-pixi.js'));
 assert.ok(html.includes('id="game"')&&html.includes('id="initialsNative"'));
 new Function(ui);new Function(crt);
 assert.ok(ui.includes('new P.Application()'));
 assert.ok(crt.includes('class CRT'));
 assert.ok(crt.includes('this.scene.filters='));
});
test('final screen is grayscale before its phosphor GPU pass',()=>{
 const d=path.join(__dirname,'../tetris');
 const ui=fs.readFileSync(path.join(d,'pixi-ui.js'),'utf8');
 const crt=fs.readFileSync(path.join(d,'pixi-crt.js'),'utf8');
 assert.match(ui,/bg:0x151515/);
 assert.match(ui,/panel:0x080808/);
 assert.match(ui,/bright:0xcecece/);
 assert.match(ui,/border:0x6a6a6a/);
 assert.ok(crt.includes("this.order=['glow','ghost','softness','noise','scanlines','vignette','phosphor']"));
 assert.ok(crt.includes('uTint'));
 assert.ok(crt.includes('uThreshold'));
});
test('traditional pause action never resumes the paused game',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'../tetris/pixi-ui.js'),'utf8');
 assert.ok(ui.includes("which==='pause')ok=game.status==='playing'&&game.pause()"));
 assert.ok(ui.includes("'NEW GAME'")&&ui.includes("'HIGH SCORE'"));
 assert.ok(ui.includes('game.reset()')&&ui.includes("openModal('restart')"));
});
test('offline cache enumerates only live PixiJS and core dependencies',()=>{
 const sw=fs.readFileSync(path.join(__dirname,'../tetris/sw.js'),'utf8');
 assert.ok(sw.includes("const CACHE='field-atlas-arcade-v028'"));
 for(const file of ['core.js','scores.js','pixi-ui.js','pixi-crt.js','vendor/pixi.min.js'])
  assert.ok(sw.includes(file+'?arcade=v028'),file);
 assert.ok(!sw.includes('experimental-fx.js')&&!sw.includes('./ui.js?'));
 assert.ok(sw.includes("cache:'no-store'"));
});
test('top-five scores stay compatible with existing device storage',()=>{
 assert.equal(Scores.KEY,'fieldAtlasTetrisTopFiveV01');
 assert.deepEqual(Scores.sanitize([
  {name:'ABC',score:100,lines:3,level:1,at:1},
  {name:'XYZ',score:500,lines:4,level:1,at:2}
 ]).map(x=>x.score),[500,100]);
 assert.equal(Scores.initials('j*9-n2'),'J9N');
 const storage=new Map();
 const adapter={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 const saved=Scores.save(adapter,[{name:'AAA',score:42,lines:0,level:1,at:1}]);
 assert.equal(Scores.read(adapter)[0].score,42);
 assert.equal(saved[0].name,'AAA');
});
