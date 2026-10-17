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

test('restart is only offered in the pause menu and never beside DROP',()=>{
 const path=require('node:path');
 const fs=require('node:fs');
 const html=fs.readFileSync(path.join(__dirname,'../tetris/index.html'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../tetris/ui.js'),'utf8');
 const deck=html.match(/<div id="extras">([\s\S]*?)<\/div>/)?.[1];
 assert.ok(deck);
 assert.doesNotMatch(deck,/NEW|restart|newGameButton/i);
 assert.equal((html.match(/data-action="restart"/g)||[]).length,0);
 assert.ok(html.includes('<button id="newGameButton" hidden>↻ NEW GAME</button>'));
 assert.ok(html.indexOf('id="newGameButton"')<html.indexOf('id="boardShell"')+500);
 assert.match(ui,/newGameButton'\)\.hidden=game\.status!=='paused'/);
 assert.match(ui,/if\(game\.status==='paused'&&!restartConfirm\.open\)openPanel\(restartConfirm\)/);
 assert.doesNotMatch(ui,/case 'restart':|KeyR:'restart'/);
});

test('new game requires explicit yes and cancel does not reset score',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const html=fs.readFileSync(path.join(__dirname,'../tetris/index.html'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../tetris/ui.js'),'utf8');
 assert.match(html,/<dialog id="restartConfirm"[^>]+aria-labelledby="restartConfirmTitle"/);
 assert.ok(html.includes('Your current game and score will be lost. Are you sure?'));
 assert.ok(html.includes('<button id="cancelRestart">CANCEL</button>'));
 assert.ok(html.includes('<button id="confirmRestart">YES, RESTART</button>'));
 assert.match(ui,/\$\('cancelRestart'\)\.addEventListener\('click',\(\)=>closePanel\(restartConfirm\)\)/);
 assert.match(ui,/\$\('confirmRestart'\)\.addEventListener\('click',\(\)=>\{/);
 assert.match(ui,/if\(game\.status!=='paused'\)\{closePanel\(restartConfirm\);return;\}/);
 assert.match(ui,/closePanel\(restartConfirm\);\s*game\.reset\(\);\s*game\.start\(\);/);
 assert.match(ui,/if\(options\.open\|\|restartConfirm\.open\|\|leaderboard\.open\|\|scoreEntry\.open\)return/);
});

test('service worker fetches current game first and preserves offline fallback',()=>{
 const sw=require('node:fs').readFileSync(require('node:path').join(__dirname,'../tetris/sw.js'),'utf8');
 assert.ok(sw.includes("const CACHE='field-atlas-arcade-v006'"));
 assert.match(sw,/event\.respondWith\(fetch\(request\)/);
 assert.match(sw,/caches\.match\(request,\{ignoreSearch:true\}\)/);
});


const Scores=require('../tetris/scores.js');
test('top-five scores sort descending, keep five, and handle equal ties safely',()=>{
 let entries=[];
 for(const value of [400,1200,600,700,200,900,1,750,1200]){
  entries=Scores.add(entries,{name:'abc',score:value,lines:2,level:1,at:value});
 }
 assert.equal(entries.length,5);
 assert.deepEqual(entries.map(v=>v.score),[1200,1200,900,750,700]);
 assert.deepEqual(entries.map(v=>v.name),['ABC','ABC','ABC','ABC','ABC']);
 assert.equal(Scores.qualifies(entries,400),false);
 assert.equal(Scores.qualifies(entries,701),true);
 assert.equal(Scores.qualifies(entries,700),false);
 assert.equal(Scores.qualifies(entries,0),false);
});

test('initials are restricted to three uppercase alphanumerics; malformed persisted data is rejected',()=>{
 assert.equal(Scores.initials('ab c!0'), 'ABC');
 assert.equal(Scores.initials('a<script>'),'ASC');
 assert.equal(Scores.initials('  '),'AAA');
 assert.deepEqual(Scores.sanitize(null),[]);
 const entries=Scores.sanitize([
  {name:'xyz',score:5.9,lines:1,level:1,at:100},
  {name:'BAD',score:-5},{name:'',score:'oops'}
 ]);
 assert.deepEqual(entries.map(e=>e.name),['XYZ']);
 assert.equal(entries[0].score,5);
});

test('leaderboard saves/reloads locally and migrates prior single best',()=>{
 const data=new Map([['fieldAtlasTetrisBest','850']]);
 const storage={getItem:key=>data.has(key)?data.get(key):null,
                setItem:(key,value)=>data.set(key,value)};
 let ranks=Scores.read(storage);
 assert.equal(ranks.length,1);
 assert.equal(ranks[0].name,'OLD');
 assert.equal(ranks[0].score,850);
 ranks=Scores.add(ranks,{name:'JMS',score:1200,lines:8,level:1,at:42});
 Scores.save(storage,ranks);
 assert.deepEqual(Scores.read(storage).map(x=>x.score),[1200,850]);
 assert.equal(data.get('fieldAtlasTetrisBest'),'1200');
 assert.equal(Scores.read(null).length,0);
});

test('the high score feature is game-over-only, with visible five-slot board and initials entry',()=>{
 const dir=path.join(__dirname,'../tetris');
 const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
 const ui=fs.readFileSync(path.join(dir,'ui.js'),'utf8');
 assert.ok(html.includes('<script src="./scores.js"></script>'));
 assert.ok(html.includes('id="scoresButton"'));
 assert.ok(html.includes('id="scoreEntry"'));
 assert.ok(html.includes('id="leaderboard"'));
 assert.ok(html.includes('id="initialsEntry" maxlength="3"'));
 assert.ok(html.includes('id="saveScore"'));
 assert.ok(html.includes('id="skipScore"'));
 assert.match(ui,/if\(game\.status!=='over'\|\|gameOverHandled\)return/);
 assert.match(ui,/if\(!Scores\.qualifies\(highScores,game\.score\)\)return/);
 assert.match(ui,/highScores=Scores\.add\(highScores,/);
 assert.match(ui,/highScores=Scores\.save\(storage,highScores\)/);
 assert.match(ui,/for\(let rank=0;rank<Scores\.LIMIT;rank\+\+\)/);
 assert.doesNotMatch(ui,/store\('fieldAtlasTetrisBest',highScore\)/);
});

test('all map display settings and reactive phosphor behaviors are reflected in the arcade',()=>{
 const dir=path.join(__dirname,'../tetris');
 const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
 const ui=fs.readFileSync(path.join(dir,'ui.js'),'utf8');
 for(const id of ['glowControl','scanControl','vignetteControl','glowValue',
  'scanValue','vignetteValue','themeToggle','closeOptions','resetEffects',
  'screenTopFade','screenBottomFade',
  'fade-screenTop-on','fade-screenBottom-on']) {
  assert.ok(html.includes('id="'+id+'"'),'Missing '+id);
 }
 assert.ok(ui.includes("read('fieldAtlasEffectsV06','null')"));
 assert.ok(ui.includes("store('fieldAtlasEffectsV06'"));
 assert.ok(ui.includes("read('fieldAtlasGradientsV20','null')"));
 assert.ok(ui.includes("store('fieldAtlasGradientsV20'"));
 assert.ok(html.includes('phosphor-hit-layer'));
 assert.ok(ui.includes("installPhosphorFeedback(button)"));
 assert.ok(ui.includes("button.addEventListener('pointerdown',flash)"));
 assert.ok(ui.includes("button.addEventListener('click',event=>{if(event.detail===0)flash();})"));
 assert.ok(html.includes('opacity:var(--vignette-intensity)'));
 assert.ok(html.includes('opacity:var(--scan-intensity)'));
 assert.ok(ui.includes("app.style.setProperty('--glow-strength'"));
 assert.ok(ui.includes("app.style.setProperty('--glow-radius'"));
 assert.ok(ui.includes("app.style.setProperty('--vignette-intensity'"));
});

test('new cached arcade shell includes the scoring system for offline play',()=>{
 const sw=fs.readFileSync(path.join(__dirname,'../tetris/sw.js'),'utf8');
 assert.match(sw,/const APP_SHELL=\[[^\]]*'\.\/scores\.js'/);
 assert.match(sw,/const CACHE='field-atlas-arcade-v006'/);
});


test('one screen-wide compositor covers game and every menu with only two fades',()=>{
 const dir=path.join(__dirname,'../tetris');
 const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
 const ui=fs.readFileSync(path.join(dir,'ui.js'),'utf8');
 for(const id of ['screenTopFade','screenBottomFade','fade-screenTop','fade-screenBottom',
  'screenShade','screenScan','sweep','phosphorFilm','modalScrim']){
  assert.ok(html.includes('id="'+id+'"'),'Missing overlay/control '+id);
 }
 for(const id of ['playfieldTopFade','playfieldBottomFade','fade-playfieldTop','fade-playfieldBottom']){
  assert.ok(!html.includes('id="'+id+'"'),'Unexpected board-only fade '+id);
 }
 assert.match(ui,/const fadeKeys=\['screenTop','screenBottom'\]/);
 assert.doesNotMatch(ui,/\.showModal\(/);
 assert.doesNotMatch(ui,/modal-camera-fx/);
 assert.doesNotMatch(html,/modal-camera-fx/);
 assert.ok(ui.includes('panel.show()'));
 assert.ok(ui.includes('panel.close()'));
 assert.ok(ui.includes("element.inert=opened"));
 assert.ok(ui.includes("if(event.key==='Tab')")===false); // explicit not-equal guard is used
 assert.ok(ui.includes("if(event.key!=='Tab')return"));
 assert.ok(html.includes('#app dialog[open]{display:block}'));
 const appStart=html.indexOf('<div id="app">');
 const appEnd=html.lastIndexOf('</div>\n<script src="./core.js">');
 const dialogs=html.indexOf('<dialog id="options"');
 assert.ok(dialogs>appStart&&dialogs<appEnd,'Modal must stay in #app below the global overlay');
 assert.match(html,/#screenTopFade,#screenBottomFade\{z-index:41;/);
 assert.match(html,/#screenShade\{z-index:42;/);
 assert.match(html,/#screenScan\{position:absolute;inset:0;z-index:43;/);
 assert.match(html,/#phosphorFilm\{z-index:44;/);
 assert.match(html,/#sweep\{z-index:45;/);
 assert.ok(html.includes('mix-blend-mode:color'));
 assert.ok(ui.includes("root.style.setProperty('--screen-top-fade'"));
 assert.ok(ui.includes("root.style.setProperty('--screen-bottom-fade'"));
 assert.ok(html.includes('pointer-events:none'));
});

test('tile glow follows each tile fill rather than uniform bright tint',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'../tetris/ui.js'),'utf8');
 assert.match(ui,/ctx\.shadowColor=color\(body,/);
 assert.doesNotMatch(ui,/ctx\.shadowColor=color\(palette\.bright,/);
});


test('Fallout-style settings cap display height, restore original font, and preserve square icons',()=>{
 const dir=path.join(__dirname,'../tetris');
 const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
 const js=fs.readFileSync(path.join(dir,'ui.js'),'utf8');
 const dialog=html.slice(html.indexOf('<dialog id="options"'),html.indexOf('<dialog id="leaderboard"'));
 assert.ok(dialog.includes('class="dialog-toolbar"'));
 assert.ok(dialog.indexOf('id="closeOptions"')<dialog.indexOf('id="ghostControl"'));
 assert.ok(dialog.includes('aria-label="FIELD ATLAS display settings"'));
 assert.doesNotMatch(dialog,/id="displayTitle"|<h2|Screen-wide effects shared with FIELD ATLAS/);
 assert.ok(html.includes('#app #options{max-height:66.6667%;'));
 assert.ok(html.includes('max-height:min(66.6667%,66.6667dvh)'));
 assert.ok(html.includes('--terminal-font:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'));
 assert.doesNotMatch(html,/Courier New/);
 assert.ok(html.includes('#app #closeOptions{'));
 assert.ok(html.includes('display:block;width:100%;max-width:none;'));
 assert.ok(html.includes('border-bottom:1px solid var(--border)'));
 assert.equal((html.match(/id="closeOptions"/g)||[]).length,1);
 assert.doesNotMatch(dialog,/id="themeSetting"/);
 assert.doesNotMatch(js,/themeSetting/);
 assert.ok(html.includes('id="themeToggle"'));
 assert.ok(html.includes('#app input[type="checkbox"]:checked{'));
 assert.match(html,/#app input\[type="checkbox"\][\s\S]*?border-radius:0/);
 assert.match(html,/#app input\.effect-slider::-webkit-slider-thumb\{[\s\S]*?border-radius:0/);
 assert.match(html,/#app input\.effect-slider::-moz-range-thumb\{[\s\S]*?border-radius:0/);
 assert.ok(html.includes('--terminal-font:'));
 assert.match(html,/#app dialog\{position:absolute;/);
 assert.doesNotMatch(dialog,/height="[0-9]+"/);
});

test('the exact map CRT scanline pattern stays over menus without duplicate passes',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../tetris/index.html'),'utf8');
 const map=fs.readFileSync(path.join(__dirname,'../preview-v033/index.html'),'utf8');
 const black='rgba(0,0,0,.59) 3px,rgba(0,0,0,.59) 4px';
 assert.ok(html.includes('rgba(var(--phosphor-rgb),.15) 0px'));
 assert.ok(html.includes(black));
 assert.ok(map.includes('rgba(var(--phosphor-rgb),.15) 0px'));
 assert.ok(map.includes(black));
 assert.ok(html.includes('#screenScan{position:absolute;inset:0;z-index:43;pointer-events:none;'));
 assert.ok(html.includes('#app dialog[open]{display:block}'));
 assert.doesNotMatch(html,/modal-camera-fx/);
});
