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
test('browser assets are local, parse cleanly, and expose iPhone controls',()=>{
 const dir=path.join(__dirname,'../tetris');
 const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
 const ui=fs.readFileSync(path.join(dir,'ui.js'),'utf8');
 const sw=fs.readFileSync(path.join(dir,'sw.js'),'utf8');
 const {Script}=require('node:vm');
 assert.doesNotThrow(()=>new Script(ui));
 assert.doesNotThrow(()=>new Script(sw));
 assert.ok(html.includes('<h1>TETRIS SYSTEM</h1>'));
 assert.doesNotMatch(html,/<small>FIELD ATLAS \/ NEWFOUNDLAND<\/small>/);
 assert.doesNotMatch(html,/<h1>ARCADE SYSTEM<\/h1>/);
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
 assert.ok(html.includes('<button id="newGameButton" hidden>NEW GAME</button>'));
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
 assert.ok(sw.includes("const CACHE='field-atlas-arcade-v022'"));
 assert.match(sw,/event\.respondWith\(fetch\(request,\{cache:'no-store'\}\)/);
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
 assert.ok(html.includes('<script src="./scores.js?arcade=v022"></script>'));
 assert.ok(html.includes('id="pausedScoresButton"'));
 assert.doesNotMatch(html,/id="scoresButton"/);
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
 assert.ok(html.includes('id="buttonFxLayer"'));
 assert.ok(html.includes('#buttonFxLayer .fx-persistence-ghost'));
 assert.ok(ui.includes("installPhosphorFeedback(button)"));
 assert.ok(ui.includes("button.addEventListener('pointerdown',()=>flashPhosphor(button))"));
 assert.ok(ui.includes('experimental.onButton(button,bounds,appBounds)'));
 assert.doesNotMatch(ui,/button\.appendChild\(layer\)/);
 assert.ok(html.includes('opacity:var(--vignette-intensity)'));
 assert.ok(html.includes('opacity:var(--scan-intensity)'));
 assert.ok(ui.includes("app.style.setProperty('--glow-strength'"));
 assert.ok(ui.includes("app.style.setProperty('--glow-radius'"));
 assert.ok(ui.includes("app.style.setProperty('--vignette-intensity'"));
});

test('new cached arcade shell includes the scoring system for offline play',()=>{
 const sw=fs.readFileSync(path.join(__dirname,'../tetris/sw.js'),'utf8');
 assert.match(sw,/const APP_SHELL=\[[^\]]*'\.\/scores\.js\?arcade=v022'/);
 assert.match(sw,/const CACHE='field-atlas-arcade-v022'/);
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
 const appEnd=html.lastIndexOf('</div>\n<script src="./core.js?arcade=v022">');
 const dialogs=html.indexOf('<dialog id="options"');
 assert.ok(dialogs>appStart&&dialogs<appEnd,'Modal must stay in #app below the global overlay');
 assert.match(html,/#screenTopFade,#screenBottomFade\{z-index:41;/);
 assert.match(html,/#screenShade\{z-index:42;/);
 assert.match(html,/#screenScan\{position:absolute;inset:0;z-index:43;/);
 assert.match(html,/#phosphorFilm\{z-index:44;/);
 assert.match(html,/#sweep\{z-index:40;/);
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
 assert.match(html,/#app dialog\{position:fixed;top:50dvh;/);
 assert.doesNotMatch(dialog,/height="[0-9]+"/);
});

test('map-style scanlines are a single grayscale light/dark overlay beneath phosphor hue',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../tetris/index.html'),'utf8');
 const map=fs.readFileSync(path.join(__dirname,'../preview-v033/index.html'),'utf8');
 assert.equal((html.match(/#screenScan\{/g)||[]).length,1,'No competing scanline overrides');
 assert.match(html,/#screenScan\{position:absolute;inset:0;z-index:43;pointer-events:none;\s*opacity:var\(--scan-intensity\);\s*background:repeating-linear-gradient\(to bottom,\s*rgba\(255,255,255,.15\) 0px,rgba\(255,255,255,.15\) 1px,\s*transparent 1px,transparent 3px,\s*rgba\(0,0,0,.59\) 3px,rgba\(0,0,0,.59\) 4px\)\}/);
 assert.ok(map.includes('rgba(var(--phosphor-rgb),.15) 0px'));
 assert.ok(map.includes('rgba(0,0,0,.59) 3px'));
 assert.ok(html.includes('#phosphorFilm{z-index:44;pointer-events:none}'));
 assert.ok(html.includes('mix-blend-mode:color;opacity:1'));
 assert.ok(html.includes('#app dialog[open]{display:block}'));
 assert.doesNotMatch(html,/modal-camera-fx/);
});
test('PAUSE is permanently labeled and cannot resume the game from screen controls or key P',()=>{
 const dir=path.join(__dirname,'../tetris');
 const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
 const ui=fs.readFileSync(path.join(dir,'ui.js'),'utf8');
 assert.ok(html.includes('data-action="pause" id="pauseButton">PAUSE</button>'));
 assert.doesNotMatch(ui,/pauseButton'\)\.disabled/);
 assert.match(ui,/case 'pause':performed=game\.status==='playing'&&game\.pause\(\);break/);
 assert.match(ui,/case 'pause':performed=game\.status==='playing'&&game\.pause\(\);break/);
 assert.ok(html.includes('<button id="playButton">▶ START GAME</button>'));
 assert.ok(ui.includes("$('playButton').textContent='▶ RESUME'"));
 assert.doesNotMatch(ui,/pauseButton'\)\.textContent=/);
 assert.doesNotMatch(ui,/Enter:'start'/);
 assert.ok(html.includes('id="newGameButton" hidden'));
 assert.ok(html.includes('id="pausedScoresButton" hidden'));
});

test('persistence exclusively controls screen-space button afterimages',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../tetris/index.html'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../tetris/ui.js'),'utf8');
 const fx=fs.readFileSync(path.join(__dirname,'../tetris/experimental-fx.js'),'utf8');
 assert.equal((html.match(/id="buttonFxLayer"/g)||[]).length,1);
 assert.match(html,/#buttonFxLayer\{position:absolute;inset:0;z-index:39;/);
 assert.match(html,/#buttonFxLayer \.fx-persistence-ghost\{/);
 assert.match(ui,/function flashPhosphor\(button\)\{/);
 assert.match(ui,/experimental\.onButton\(button,bounds,appBounds\)/);
 assert.doesNotMatch(ui,/buttonFxLayer\.appendChild\(layer\)|emittedColour/);
 assert.doesNotMatch(html,/phosphor-hit-layer|phosphor-flash/);
 assert.match(fx,/if\(!values\.persistenceEnabled\|\|values\.persistenceAmount<=0\|\|!motionAllowed\(\)\)return/);
 assert.match(fx,/if\(name==='persistenceEnabled'&&!values\[name\]\)/);
});
test('phone controls use the requested four-button layout and centered secondary pair',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../tetris/index.html'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../tetris/ui.js'),'utf8');
 const pad=html.match(/<div id="pad"[\s\S]*?<\/div>/)?.[0];
 const extras=html.match(/<div id="extras"[\s\S]*?<\/div>/)?.[0];
 assert.ok(pad&&extras,'game control groups must exist');
 assert.deepEqual([...pad.matchAll(/data-action="([^"]+)"/g)].map(m=>m[1]),
  ['left','hard','right','cw']);
 assert.deepEqual([...extras.matchAll(/data-action="([^"]+)"/g)].map(m=>m[1]),
  ['hold','pause']);
 assert.ok(pad.includes('data-action="hard" aria-label="Hard drop">DROP</button>'));
 assert.doesNotMatch(pad,/drop-arrow|drop-label|▼/);
 assert.ok(pad.includes('data-action="cw" aria-label="Rotate clockwise">↻</button>'));
 assert.doesNotMatch(html,/data-action="ccw"|data-action="down"/);
 assert.doesNotMatch(ui,/case 'ccw':|case 'down':|KeyZ:'ccw'|ArrowDown:'down'/);
 assert.match(ui,/ArrowDown:'hard',Space:'hard'/);
 assert.match(ui,/else if\(dy>25\)perform\('hard'\)/);
 assert.match(html,/#pad button\[data-action="hard"\]\{\s*grid-column:span 2;/);
 assert.match(html,/#extras\{display:flex;justify-content:center;align-items:center;/);
 assert.match(html,/#extras button\{flex:0 1 40%;max-width:180px;/);
});

test('removing the console leaves stage space available without damaging overlays or pause',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../tetris/index.html'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../tetris/ui.js'),'utf8');
 assert.doesNotMatch(html,/id="console"|id="consoleState"/);
 assert.doesNotMatch(ui,/consoleState|#console|CONSOLE v0/);
 assert.ok(html.includes('id="stage"'));
 assert.ok(html.includes('id="boardShell"'));
 assert.ok(html.includes('id="buttonFxLayer"'));
 assert.ok(html.includes('id="pauseButton">PAUSE</button>'));
 assert.ok(ui.includes("case 'pause':performed=game.status==='playing'&&game.pause();break;"));
 assert.ok(ui.includes("$('playButton').textContent='▶ RESUME'"));
});


test('all three direction keys share a solid phosphor face, and ready instructions are practical',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../tetris/index.html'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../tetris/ui.js'),'utf8');
 assert.match(html,/#pad button:is\(\[data-action="left"\],\[data-action="hard"\],\[data-action="right"\]\)\{\s*background:var\(--bright\);color:var\(--shadow\);border-color:var\(--bright\)/);
 const pad=html.match(/<div id="pad"[\s\S]*?<\/div>/)?.[0];
 assert.ok(pad);
 assert.match(pad,/<button data-action="hard" aria-label="Hard drop">DROP<\/button>/);
 assert.doesNotMatch(pad,/<span|drop-arrow|drop-label|▼/);
 assert.match(html,/#pad button\[data-action="hard"\]\{\s*grid-column:span 2;/);
 assert.ok(ui.includes("const readyMessage='SURVIVE THE SOVIET CHALLENGE'"));
 assert.ok(ui.includes('showReadyMessage()'));
 assert.ok(html.includes('<span id="readyText">SURVIVE THE SOVIET CHALLENGE</span><span id="readyCursor" aria-hidden="true"></span>'));
 assert.ok(html.includes('@keyframes ready-cursor-blink'));
 assert.ok(html.includes('#veilText:has(#readyCursor){display:flex;flex-direction:column;'));
 assert.ok(html.includes('align-items:center;justify-content:center;gap:12px'));
 assert.ok(html.includes('#readyCursor{display:block;flex:none;'));
 assert.ok(html.includes('margin:0;background:var(--weak)'));
 assert.doesNotMatch(ui,/readyTypingTimer|setInterval\(type,32\)|startReadyIntro/);
 assert.doesNotMatch(ui,/FALLING-BLOCK ARCADE/);
});

test('PAUSE stays visually active in READY and PAUSED but cannot start or resume gameplay',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../tetris/index.html'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../tetris/ui.js'),'utf8');
 assert.match(html,/<button data-action="pause" id="pauseButton">PAUSE<\/button>/);
 assert.doesNotMatch(ui,/\$\('pauseButton'\)\.disabled\s*=/);
 assert.match(ui,/case 'pause':performed=game\.status==='playing'&&game\.pause\(\);break;/);
 assert.match(ui,/\$\('playButton'\)\.textContent='▶ RESUME';/);
});



test('remove barrel distortion, retain the blur and use a clearer pause veil',()=>{
 const dir=path.join(__dirname,'../tetris');
 const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
 const ui=fs.readFileSync(path.join(dir,'ui.js'),'utf8');
 const sw=fs.readFileSync(path.join(dir,'sw.js'),'utf8');
 assert.doesNotMatch(html,/crtFilterDefs|crtDisplacement|crtGlass|curvatureControl|curvatureValue|fieldAtlasCRTBarrel|crt-curve\.js/);
 assert.doesNotMatch(ui,/FieldAtlasCRT|applyCurvature|curvatureControl|curvatureValue|fieldAtlasTetrisCurvature/);
 assert.doesNotMatch(sw,/crt-curve\.js/);
 assert.match(sw,/const CACHE='field-atlas-arcade-v022'/);
 assert.ok(!fs.existsSync(path.join(dir,'crt-curve.js')));
 assert.match(html,/#app\{background:var\(--bg\)\}/);
 assert.match(html,/#veil\{[^}]*backdrop-filter:blur\(3px\)\}/);
 assert.match(html,/#veil\{background:color-mix\(in srgb,var\(--card-bg\) 82%,transparent\)\}/);
});
test('grayscale luminance, hue-only phosphor film, and darkening-only vignette',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../tetris/index.html'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../tetris/ui.js'),'utf8');
 assert.ok(html.includes('--bg:#151515;--app-face:var(--bg)'));
 assert.ok(html.includes('--panel:color-mix(in srgb,var(--bg) 40%,black)'));
 for(const gray of ['#303030','#e3e3e3','#cecece','#aeaeae','#6a6a6a','#060606','#292929'])
  assert.ok(html.includes(gray),'Missing grayscale luminance step '+gray);
 assert.doesNotMatch(html,/:root\[data-theme="amber"\]\{\s*--bg:/);
 assert.match(html,/#app\{background:var\(--bg\)\}/);
 assert.match(html,/#phosphorFilm\{position:absolute;inset:0;z-index:34;pointer-events:none;\s*background:rgb\(var\(--phosphor-rgb\)\);mix-blend-mode:color;opacity:1\}/);
 assert.match(html,/:root\[data-theme="amber"\]\{--phosphor-rgb:255,196,100\}/);
 assert.match(html,/#screenShade\{opacity:var\(--vignette-intensity\);\s*background:radial-gradient\(/);
 assert.equal((html.match(/radial-gradient\(/g)||[]).length,1,'Only the darkening vignette may use a radial gradient');
 assert.ok(html.includes('rgba(255,255,255,.15) 0px'));
 assert.ok(html.includes('transparent 1px,transparent 3px'));
 assert.ok(html.includes('#sweep{z-index:40;pointer-events:none}'));
 assert.doesNotMatch(html,/#stage\s*\{\s*background:/);
 assert.ok(ui.includes("document.querySelector('meta[name=\"theme-color\"]').content='#151515'"));
});
test('flat app, darker visible panels, matching ordinary buttons and bright Start/Resume',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../tetris/index.html'),'utf8');
 assert.match(html,/#app :is\(\.panel,\.side-panel,#options,#leaderboard,#scoreEntry,#restartConfirm\)\{\s*background:var\(--card-bg\)/);
 assert.match(html,/#boardShell\{background:var\(--card-bg\)\}/);
 assert.match(html,/#app \.score-row\{background:var\(--app-face\)\}/);
 assert.match(html,/#app button:not\(:is\(#playButton,\[data-action="left"\],\[data-action="hard"\],\[data-action="right"\]\)\)\{\s*background:var\(--app-face\);/);
 assert.match(html,/#app #playButton\{\s*background:var\(--bright\);color:var\(--shadow\);border-color:var\(--bright\)/);
 assert.match(html,/#pad button:is\(\[data-action="left"\],\[data-action="hard"\],\[data-action="right"\]\)\{\s*background:var\(--bright\);color:var\(--shadow\);border-color:var\(--bright\)/);
 assert.match(html,/#app #playButton:active\{background:var\(--bright\);color:var\(--shadow\)\}/);
 assert.match(html,/#veil\{background:color-mix\(in srgb,var\(--card-bg\) 82%,transparent\)/);
});
test('pause actions omit icons and use High Score label',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../tetris/index.html'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../tetris/ui.js'),'utf8');
 assert.ok(html.includes('<button id="newGameButton" hidden>NEW GAME</button>'));
 assert.ok(html.includes('<button id="pausedScoresButton" hidden>HIGH SCORE</button>'));
 assert.doesNotMatch(html,/>★ TOP 5 SCORES|>↻ NEW GAME/);
 assert.match(ui,/refreshPalette\(\);\s*\/\/ Canvas is a separate paint surface\.[\s\S]*?paintBoard\(\);\s*updateHUD\(\);/);
});


test('the refresh sweep has independent luminance control and saved strength',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../tetris/index.html'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../tetris/ui.js'),'utf8');
 assert.match(html,/#sweep\{opacity:var\(--sweep-intensity,var\(--glow-level\)\)\}/);
 assert.match(html,/id="sweepControl" class="effect-slider" type="range" min="0" max="100" step="1" value="65"/);
 assert.ok(html.includes('id="sweepValue">65%'));
 assert.ok(ui.includes("read('fieldAtlasTetrisSweepV01','65')"));
 assert.ok(ui.includes("store('fieldAtlasTetrisSweepV01',sweep)"));
 assert.ok(ui.includes("app.style.setProperty('--sweep-intensity'"));
 assert.ok(ui.includes("rangeDisplay($('sweepControl'),$('sweepValue'),sweep)"));
});

test('experimental effects use isolated grayscale compositor layers and offline module',()=>{
 const dir=path.join(__dirname,'../tetris');
 const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
 const ui=fs.readFileSync(path.join(dir,'ui.js'),'utf8');
 const fx=fs.readFileSync(path.join(dir,'experimental-fx.js'),'utf8');
 const sw=fs.readFileSync(path.join(dir,'sw.js'),'utf8');
 const {Script}=require('node:vm');
 assert.doesNotThrow(()=>new Script(fx));
 assert.ok(sw.includes("'./experimental-fx.js?arcade=v022'"));
 assert.ok(html.includes('<script src="./experimental-fx.js?arcade=v022"></script>'));
 assert.ok(html.indexOf('experimental-fx.js')<html.indexOf('<script src="./ui.js?arcade=v022">'));
 for(const id of ['fxSoftness','fxNoise','experimentalFxSection','resetExperimental',
   'fxNoiseEnabled','fxNoiseAmount','fxNoiseSpeed',
   'fxPersistenceEnabled','fxPersistenceAmount','fxPersistenceDecay',
   'fxSoftnessEnabled','fxSoftnessAmount']){
  assert.ok(html.includes('id="'+id+'"'),'Missing experimental compositor control '+id);
 }
 assert.match(html,/#fxSoftness\{inset:0;z-index:27;background:transparent\}/);
 assert.match(html,/#fxNoise\{inset:0;z-index:28;/);
 assert.doesNotMatch(html,/fxInterference|fxGlitch/);
 assert.doesNotMatch(fx,/interference|glitch/i);
 assert.match(html,/#phosphorFilm\{z-index:44;pointer-events:none\}/);
 assert.ok(fx.includes("fieldAtlasTetrisExperimentalV01"));
 assert.ok(fx.includes("noiseEnabled:false"));
 assert.ok(fx.includes("softnessEnabled:false"));
 assert.ok(fx.includes("persistenceEnabled:false"));
 assert.match(ui,/experimental\.onButton\(button,bounds,appBounds\)/);
 assert.doesNotMatch(fx,/\.style\.filter\s*=|\.style\.backgroundColor\s*=\s*['"](?:green|amber)/);
});

test('experimental controller toggles, saves, renders interaction ghosts and resets cleanly',()=>{
 const {runInNewContext}=require('node:vm');
 const script=fs.readFileSync(path.join(__dirname,'../tetris/experimental-fx.js'),'utf8');
 const elements=new Map(),saved=new Map();
 let frameCount=0;
 function element(id){
   if(elements.has(id))return elements.get(id);
   const listeners={},children=[];
   const item={id,value:'',checked:false,clientWidth:390,clientHeight:844,
    style:{setProperty(k,v){this[k]=v}},textContent:'',
    addEventListener(type,handler){(listeners[type]??=[]).push(handler);},
    fire(type){for(const cb of listeners[type]||[])cb();},
    getContext(){return {
      createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)}},
      putImageData(){}
    };},
    querySelectorAll(cls){return children.filter(x=>cls==='.fx-persistence-ghost'&&x.className==='fx-persistence-ghost')},
    appendChild(node){children.push(node);node.remove=()=>{const i=children.indexOf(node);if(i>=0)children.splice(i,1)}}
   };
   elements.set(id,item);return item;
 }
 const doc={hidden:false,getElementById:element,createElement:()=>element('ghost'+Math.random()),
  addEventListener(){}};
 const win={localStorage:{
  getItem:k=>saved.has(k)?saved.get(k):null,
  setItem:(k,v)=>saved.set(k,v)},
  matchMedia:()=>({matches:false,addEventListener(){}}),
  requestAnimationFrame:()=>++frameCount,cancelAnimationFrame(){},
  setTimeout:()=>100,clearTimeout(){},addEventListener(){},
  getComputedStyle:()=>({
    borderRadius:'8px',backgroundColor:'rgb(21,21,21)',color:'rgb(227,227,227)',
    borderTopColor:'rgb(106,106,106)',fontSize:'12px',fontWeight:'700',
    fontFamily:'monospace',letterSpacing:'1px'})
 };
 runInNewContext(script,{window:win});
 const fx=win.FieldAtlasExperimentalFX.create(doc);
 assert.equal(fx.getValues().noiseEnabled,false);
 assert.equal(element('fxNoise').style.display,'none');
 assert.equal(element('fxSoftness').style.display,'none');
 element('fxNoiseEnabled').checked=true;element('fxNoiseEnabled').fire('change');
 assert.equal(element('fxNoise').style.display,'block');
 assert.ok(frameCount>0);
 element('fxSoftnessEnabled').checked=true;element('fxSoftnessEnabled').fire('change');
 assert.equal(element('fxSoftness').style.display,'block');
 element('fxSoftnessAmount').value='50';element('fxSoftnessAmount').fire('input');
 assert.equal(element('fxSoftness').style.backdropFilter,'blur(0.80px)');
 element('fxPersistenceEnabled').checked=true;element('fxPersistenceEnabled').fire('change');
 fx.onButton({textContent:'PAUSE'}, {left:11,top:30,width:80,height:44},
  {left:1,top:5});
 const ghosts=element('buttonFxLayer').querySelectorAll('.fx-persistence-ghost');
 assert.equal(ghosts.length,1);
 assert.equal(ghosts[0].style.left,'10px');
 assert.equal(ghosts[0].style.top,'25px');
 assert.equal(ghosts[0].textContent,'PAUSE');
 element('fxPersistenceEnabled').checked=false;element('fxPersistenceEnabled').fire('change');
 assert.equal(element('buttonFxLayer').querySelectorAll('.fx-persistence-ghost').length,0);
 fx.onButton({textContent:'PAUSE'}, {left:11,top:30,width:80,height:44},{left:1,top:5});
 assert.equal(element('buttonFxLayer').querySelectorAll('.fx-persistence-ghost').length,0);
 assert.ok(saved.has('fieldAtlasTetrisExperimentalV01'));
 element('resetExperimental').fire('click');
 assert.equal(fx.getValues().noiseEnabled,false);
 assert.equal(fx.getValues().persistenceEnabled,false);
 assert.equal(element('fxSoftness').style.display,'none');
 assert.equal(element('fxNoise').style.display,'none');
 assert.equal(element('buttonFxLayer').querySelectorAll('.fx-persistence-ghost').length,0);
 assert.equal(element('fxNoiseEnabled').checked,false);
 assert.equal(element('fxNoiseAmountValue').textContent,'18%');
});

test('HUD level, score and lines display in left-center-right order',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../tetris/index.html'),'utf8');
 const strip=html.match(/<div id="scoreStrip">([\s\S]*?)<\/div>\s*<div id="pad"/)?.[1];
 assert.ok(strip);
 assert.deepEqual([...strip.matchAll(/<small>(LEVEL|SCORE|LINES)<\/small>/g)].map(x=>x[1]),['LEVEL','SCORE','LINES']);
 assert.ok(html.includes('#scoreStrip div:nth-child(1){align-items:flex-start;text-align:left}'));
 assert.ok(html.includes('#scoreStrip div:nth-child(2){align-items:center;text-align:center}'));
 assert.ok(html.includes('#scoreStrip div:nth-child(3){align-items:flex-end;text-align:right}'));
 assert.doesNotMatch(html,/#scoreStrip div:last-child\{display:none\}/);
});

test('consecutive normal placements accumulate visible score and preserve level multiplier',()=>{
 const g=fresh();g.start();
 assert.equal(g.score,0);
 g.current=g.piece('O');g.current.y=18;
 for(let t=0;t<6;t++)g.tick(100);
 assert.equal(g.score,10);
 assert.equal(g.pieces,1);
 const prev=g.score;
 g.hardDrop();
 assert.ok(g.score>prev);
 assert.equal(g.pieces,2);
 g.level=3;
 g.current=g.piece('O');
 g.current.y=18;
 for(let t=0;t<6;t++)g.tick(100);
 assert.ok(g.score>=prev+30);
});

test('score, level and lines are refreshed independently of canvas redraw',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'../tetris/ui.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../tetris/index.html'),'utf8');
 assert.match(ui,/function syncLiveStats\(\)\{/);
 for(const id of ['scoreValue','levelValue','linesValue'])
   assert.ok(ui.includes(id+':String(game.'),'Missing game-bound live counter '+id);
 assert.match(ui,/function updateHUD\(\)\{\s*syncLiveStats\(\)/);
 assert.match(ui,/offerScoreOnGameOver\(\);\s*syncLiveStats\(\);\s*dirty=true/);
 assert.match(ui,/if\(game.status==='playing'\|\|changed\)syncLiveStats\(\)/);
 assert.ok(ui.includes('game.reset();'));
 assert.ok(ui.includes('game.start();'));
 assert.ok(html.includes('id="scoreValue"'));
 assert.ok(html.includes('id="linesValue"'));
 assert.ok(html.includes('id="levelValue"'));
});

test('portrait Tetris mirrors FIELD ATLAS map screen and footer safe-area anchor',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../tetris/index.html'),'utf8');
 const map=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.ok(map.includes('height:100dvh;max-width:520px'));
 assert.ok(map.includes('#footer{bottom:calc(env(safe-area-inset-bottom,0px) + 10px)'));
 assert.match(html,/#app\{position:relative;display:flex;flex-direction:column;gap:9px;[\s\S]*?max-width:520px;height:var\(--arcade-shell-height,100dvh\);/);
 assert.match(html,/@media\(orientation:portrait\)\{\s*#app\{height:var\(--arcade-shell-height,100dvh\);min-height:0;padding:0 11px\}/);
 assert.match(html,/#eventline\{position:absolute;left:11px;right:11px;\s*bottom:calc\(env\(safe-area-inset-bottom,0px\) \+ 10px\)\}/);
 assert.match(html,/#controlDeck\{margin-bottom:calc\(env\(safe-area-inset-bottom,0px\) \+ 30px\)\}/);
 assert.ok(html.includes('#stage{min-height:0;flex:1;'));
 assert.ok(html.includes('aspect-ratio:1/2;'));
});

test('Tetris bundle is cache coherent and visible score changes trigger feedback',()=>{
 const dir=path.join(__dirname,'../tetris');
 const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
 const ui=fs.readFileSync(path.join(dir,'ui.js'),'utf8');
 const sw=fs.readFileSync(path.join(dir,'sw.js'),'utf8');
 for(const name of ['core','scores','experimental-fx','ui']){
  assert.ok(html.includes('src="./'+name+'.js?arcade=v022"'));
  assert.ok(sw.includes("'./"+name+".js?arcade=v022'"));
 }
 assert.match(ui,/if\(\(id==='scoreValue'\|\|id==='levelValue'\|\|id==='linesValue'\)&&game.status==='playing'\)/);
 assert.ok(html.includes('#scoreStrip strong.hud-changed{animation:hud-tick'));
 assert.ok(ui.includes("node.classList.add('hud-changed')"));
});

test('iOS portrait viewport correction extends compositor, not individual layers',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'../tetris/ui.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../tetris/index.html'),'utf8');
 assert.match(ui,/function fitPhoneViewport\(\)\{/);
 assert.match(ui,/window\.screen\?\.height/);
 assert.match(ui,/window\.matchMedia\('\(orientation: portrait\)'\)\.matches/);
 assert.match(ui,/window\.matchMedia\('\(pointer: coarse\)'\)\.matches/);
 assert.match(ui,/if\(difference>0&&difference<=Math\.min\(160,viewport\*\.25\)\)/);
 assert.match(ui,/app\.style\.setProperty\('--arcade-shell-height',Math\.ceil\(height\)\+'px'\)/);
 assert.match(ui,/window\.addEventListener\('resize',fitPhoneViewport/);
 assert.match(html,/#screenScan\{position:absolute;inset:0;/);
 assert.match(html,/#phosphorFilm\{z-index:44;pointer-events:none\}/);
});
