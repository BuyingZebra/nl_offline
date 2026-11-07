(()=>{
'use strict';
const $=id=>document.getElementById(id);
const canvas=$('board'),ctx=canvas.getContext('2d',{alpha:true});
let CW=(MC+2)*22,CH=(MR+2)*22;
const STEP=22,PAD=22;
const coord=q=>[PAD+q[0]*STEP,PAD+q[1]*STEP];
const els={level:$('level-title'),lives:$('lives'),remaining:$('remaining'),feedback:$('feedback'),loader:$('board-loader'),overlay:$('overlay'),overlayTitle:$('overlay-heading'),overlayDetail:$('overlay-detail'),overlayAction:$('overlay-action'),overlaySecondary:$('overlay-secondary'),settings:$('settings'),theme:$('theme'),animations:$('animations'),sounds:$('sounds'),seed:$('seed-label'),connection:$('connection')};
let palette={};
const prefersReduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
const saved=(()=>{try{return JSON.parse(localStorage.getItem('arrow_maze_pwa_state_v4')||'null')}catch(e){return null}})();
const previousVersion=(()=>{try{return JSON.parse(localStorage.getItem('arrow_maze_pwa_state_v3')||'null')}catch(e){return null}})();
const oldSettings=(()=>{try{return JSON.parse(localStorage.getItem('arrow_maze_pwa_state')||'null')}catch(e){return null}})();
const migratedOldSave=!saved&&!!previousVersion;
let installPrompt=null, audioCtx=null;
const freshSeed=()=>{
  if(window.crypto?.getRandomValues){let a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]>>>0;}
  return (Math.random()*4294967296)>>>0;
};
const game={level:1,seed:freshSeed(),pieces:[],removed:new Set(),lives:3,animating:null,blocked:null,hint:0,pressed:0,epoch:0,ready:false,motion:!prefersReduced,sound:false};
if(saved&&typeof saved==='object'){
  if(Number.isInteger(saved.level)&&saved.level>=1&&saved.level<=9999)game.level=saved.level;
  if(Number.isInteger(saved.seed)&&saved.seed>=0&&saved.seed<=4294967295)game.seed=saved.seed>>>0;
  if(Array.isArray(saved.removed))game.removed=new Set(saved.removed.filter(x=>Number.isInteger(x)));
  if(Number.isInteger(saved.lives))game.lives=Math.max(0,Math.min(3,saved.lives));
  if(typeof saved.motion==='boolean')game.motion=saved.motion;
  if(typeof saved.sound==='boolean')game.sound=saved.sound;
  if(saved.dark===true)document.documentElement.classList.add('phosphor');
}else if(previousVersion&&typeof previousVersion==='object'){
  // The collision rules changed, so previous removed IDs cannot be reused.
  // Keep level/seed/preferences but restart the repaired level with 3 drops.
  if(Number.isInteger(previousVersion.level)&&previousVersion.level>=1&&previousVersion.level<=9999)game.level=previousVersion.level;
  if(Number.isInteger(previousVersion.seed)&&previousVersion.seed>=0&&previousVersion.seed<=4294967295)game.seed=previousVersion.seed>>>0;
  if(previousVersion.dark===true)document.documentElement.classList.add('phosphor');
  if(typeof previousVersion.motion==='boolean')game.motion=previousVersion.motion;
  if(typeof previousVersion.sound==='boolean')game.sound=previousVersion.sound;
}else if(oldSettings&&typeof oldSettings==='object'){
  // The generator changed: do not apply old removed-arrow IDs to a different puzzle.
  if(Number.isInteger(oldSettings.level)&&oldSettings.level>=1&&oldSettings.level<=9999)game.level=oldSettings.level;
  if(oldSettings.dark===true)document.documentElement.classList.add('phosphor');
  if(typeof oldSettings.motion==='boolean')game.motion=oldSettings.motion;
  if(typeof oldSettings.sound==='boolean')game.sound=oldSettings.sound;
}
els.animations.checked=game.motion;
els.sounds.checked=game.sound;
const code=()=>game.level+'-'+game.seed.toString(36).toUpperCase();
function persist(){try{localStorage.setItem('arrow_maze_pwa_state_v4',JSON.stringify({level:game.level,seed:game.seed,removed:[...game.removed],lives:game.lives,motion:game.motion,sound:game.sound,dark:document.documentElement.classList.contains('phosphor')}))}catch(e){}}
function feedback(text){els.feedback.textContent=text;}
function refreshUI(){
  els.level.textContent='Level '+game.level;
  els.remaining.textContent=(game.pieces.length-game.removed.size)+' / '+game.pieces.length;
  els.seed.textContent=code();
  els.lives.setAttribute('aria-label',game.lives+' lives remaining');
  [...els.lives.children].forEach((el,i)=>el.classList.toggle('lost',i>=game.lives));
}
function colorVars(){
  const css=getComputedStyle(document.documentElement);
  for(const x of ['bg','ink','muted','dots','glow','danger'])palette[x]=css.getPropertyValue('--'+x).trim();
}
function paintBase(){
  ctx.clearRect(0,0,CW,CH);
  ctx.fillStyle=palette.dots;
  ctx.beginPath();
  for(let x=0;x<MC;x++)for(let y=0;y<MR;y++){
    const xx=PAD+x*STEP,yy=PAD+y*STEP;
    ctx.moveTo(xx+1.7,yy);ctx.arc(xx,yy,1.7,0,Math.PI*2);
  }
  ctx.fill();
}
function paintLine(points,dir,color,opacity=1,offset=[0,0],weight=4.25){
  if(points.length<2)return;
  ctx.save();ctx.globalAlpha=opacity;ctx.translate(offset[0],offset[1]);
  ctx.lineJoin='round';ctx.lineCap='round';
  ctx.strokeStyle=color;ctx.lineWidth=weight;
  ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);
  for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);
  ctx.stroke();
  const end=points[points.length-1],dx=DIRS[dir][0],dy=DIRS[dir][1];
  const px=-dy,py=dx;
  ctx.fillStyle=color;
  ctx.beginPath();
  ctx.moveTo(end[0]+8.4*dx,end[1]+8.4*dy);
  ctx.lineTo(end[0]-5.0*dx+5.2*px,end[1]-5.0*dy+5.2*py);
  ctx.lineTo(end[0]-5.0*dx-5.2*px,end[1]-5.0*dy-5.2*py);
  ctx.closePath();ctx.fill();
  ctx.restore();
}
function activePieces(){return game.pieces.filter(p=>!game.removed.has(p.id));}
function occupiedExcept(id){const ob=new Set();for(const p of game.pieces){if(p.id===id||game.removed.has(p.id))continue;for(const q of p.points)ob.add(idx(q[0],q[1]));}return ob;}
function eligible(p){return canEscape(p,occupiedExcept(p.id));}
function drawStaticPiece(p,time){
  let glow=p.id===game.hint;
  const pressed=p.id===game.pressed;
  const points=p.points.map(coord);
  let offset=[0,0],c=glow?palette.glow:pressed?palette.glow:palette.ink,weight=glow?5.8:pressed?6:4.25;
  if(game.blocked&&game.blocked.id===p.id){
    const t=Math.min(1,(time-game.blocked.start)/330);
    offset=[Math.sin(t*Math.PI*9)*(1-t)*6,0];c=palette.danger;
  }
  if(glow||pressed){
    ctx.save();ctx.shadowColor=palette.glow;ctx.shadowBlur=9;
    paintLine(points,p.dir,c,.85+Math.sin(time/190)*.15,offset,weight);
    ctx.restore();
  }else paintLine(points,p.dir,c,1,offset,weight);
}
function routeWithDistance(p){
  const base=p.points.map(coord),L=(base.length-1)*STEP;
  const last=base[base.length-1],d=DIRS[p.dir];
  // Let the tail follow the original path and then leave the screen in the same direction.
  const E=CW+CH+L+STEP*5;
  const route=base.concat([[last[0]+d[0]*E,last[1]+d[1]*E]]);
  const cum=[0];
  for(let i=1;i<route.length;i++)cum.push(cum[i-1]+Math.hypot(route[i][0]-route[i-1][0],route[i][1]-route[i-1][1]));
  const border=d[0]===1?CW-last[0]+STEP:d[0]===-1?last[0]+STEP:d[1]===1?CH-last[1]+STEP:last[1]+STEP;
  return {route,cum,L,travel:L+border};
}
function along(line,at){
  const dist=Math.max(0,Math.min(line.cum[line.cum.length-1],at));
  let i=0;
  while(i<line.cum.length-2&&line.cum[i+1]<dist)i++;
  const lo=line.cum[i],hi=line.cum[i+1],u=(hi===lo?0:(dist-lo)/(hi-lo));
  const p=line.route[i],q=line.route[i+1];
  return [p[0]+(q[0]-p[0])*u,p[1]+(q[1]-p[1])*u];
}
function visibleMovingLine(line,start,end){
  const out=[along(line,start)];
  for(let i=1;i<line.route.length-1;i++){
    if(line.cum[i]>start&&line.cum[i]<end)out.push(line.route[i]);
  }
  out.push(along(line,end));return out;
}
function easing(t){return 1-Math.pow(1-t,2.65);}
function paint(now=performance.now()){
  if(!game.ready)return;
  colorVars();paintBase();
  for(const p of activePieces()){
    if(game.animating?.id===p.id){
      const a=game.animating;
      const frac=Math.max(0,Math.min(1,(now-a.start)/a.duration));
      const travel=a.geometry.travel*(a.motion?easing(frac):1);
      const pts=visibleMovingLine(a.geometry,travel,travel+a.geometry.L);
      const fade=frac>.88?Math.max(0,(1-frac)/.12):1;
      // The head rotates through each corner as the tail follows its route.
      const tip=pts[pts.length-1],prev=pts[pts.length-2];
      let heading=p.dir;
      if(prev&&tip){
        const dx=tip[0]-prev[0],dy=tip[1]-prev[1];
        heading=Math.abs(dx)>Math.abs(dy)?(dx>=0?0:2):(dy>=0?1:3);
      }
      paintLine(pts,heading,palette.ink,fade);
    }else drawStaticPiece(p,now);
  }
}
function resize(){
  CW=(MC+2)*STEP;CH=(MR+2)*STEP;
  canvas.style.aspectRatio=CW+' / '+CH;
  const dpr=Math.min(3,window.devicePixelRatio||1);
  if(canvas.width!==Math.round(CW*dpr)||canvas.height!==Math.round(CH*dpr)){
    canvas.width=Math.round(CW*dpr);canvas.height=Math.round(CH*dpr);
  }
  ctx.setTransform(dpr,0,0,dpr,0,0);
  paint();
}
function loop(t,epoch){
  if(epoch!==game.epoch)return;
  paint(t);
  if(game.animating){
    if(t-game.animating.start>=game.animating.duration){
      const id=game.animating.id;game.animating=null;game.removed.add(id);game.hint=0;
      refreshUI();persist();paint(t);
      const left=game.pieces.length-game.removed.size;
      feedback(left?`Arrow escaped · ${left} remaining`:'All arrows escaped!');
      if(left===0)showResult('win');
      else if(!activePieces().some(eligible))showResult('repair');
    }else requestAnimationFrame(v=>loop(v,epoch));
  }else if(game.blocked){
    if(t-game.blocked.start>=330){
      game.blocked=null;paint(t);
      if(game.lives===0)showResult('loss');
    }else requestAnimationFrame(v=>loop(v,epoch));
  }
}
function playTone(which){
  if(!game.sound)return;
  try{
    const A=window.AudioContext||window.webkitAudioContext;
    if(!A)return;
    audioCtx ||=new A();if(audioCtx.state==='suspended')audioCtx.resume();
    const osc=audioCtx.createOscillator(),gain=audioCtx.createGain(),now=audioCtx.currentTime;
    osc.type='sine';osc.frequency.setValueAtTime(which==='bad'?175:which==='win'?630:395,now);
    osc.frequency.exponentialRampToValueAtTime(which==='bad'?100:which==='win'?880:650,now+.11);
    gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.07,now+.01);gain.gain.exponentialRampToValueAtTime(.0001,now+.17);
    osc.connect(gain).connect(audioCtx.destination);osc.start(now);osc.stop(now+.18);
  }catch(e){}
}
function choose(id){
  if(!game.ready||game.lives<=0||game.animating||game.blocked||!els.overlay.hidden)return;
  const p=game.pieces.find(x=>x.id===id&&!game.removed.has(id));
  if(!p)return;
  if(!activePieces().some(eligible)){showResult('repair');return;}
  game.hint=0;
  if(!eligible(p)){
    const epoch=++game.epoch;
    game.lives=Math.max(0,game.lives-1);game.blocked={id,start:performance.now()};
    refreshUI();persist();paint();playTone('bad');
    if(navigator.vibrate)navigator.vibrate(25);
    feedback(game.lives?`Blocked! ${game.lives} drops left`:'Out of drops. Retry this puzzle.');
    requestAnimationFrame(t=>loop(t,epoch));return;
  }
  playTone('good');
  const geometry=routeWithDistance(p);
  const motion=game.motion&&!prefersReduced;
  const duration=motion?Math.max(550,Math.min(1120,580+p.points.length*12)):24;
  const epoch=++game.epoch;
  game.animating={id,geometry,start:performance.now(),duration,motion};
  feedback('Arrow escaping…');
  requestAnimationFrame(t=>loop(t,epoch));
}
function distToSegment(x,y,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1];
  let t=((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1);
  t=Math.max(0,Math.min(1,t));return Math.hypot(x-(a[0]+t*dx),y-(a[1]+t*dy));
}
// All hit-test distances use CSS pixels; the canvas backing resolution does not
// change how forgiving a finger tap feels. Always select the nearest real line.
function boardPoint(e){
  const r=canvas.getBoundingClientRect();
  return {x:(e.clientX-r.left)/r.width*CW,y:(e.clientY-r.top)/r.height*CH,scale:CW/r.width};
}
function hitTest(x,y,limit){
  let best=0,dist=limit;
  for(const p of activePieces()){
    const pts=p.points.map(coord);
    for(let i=1;i<pts.length;i++){
      const d=distToSegment(x,y,pts[i-1],pts[i]);
      if(d<dist){dist=d;best=p.id;}
    }
    // The solid arrowhead belongs to the same hit area as its winding body.
    const head=pts[pts.length-1],dx=DIRS[p.dir][0],dy=DIRS[p.dir][1];
    const d=Math.hypot(x-(head[0]+dx*5),y-(head[1]+dy*5));
    if(d<dist){dist=d;best=p.id;}
  }
  return best;
}
let down=null;
canvas.addEventListener('pointerdown',e=>{
  if(e.isPrimary===false||e.button>0||!game.ready||game.animating||game.blocked||!els.overlay.hidden)return;
  const p=boardPoint(e);
  const radius=(e.pointerType==='mouse'?11:21)*p.scale;
  const id=hitTest(p.x,p.y,radius);
  down={id,pointerId:e.pointerId,x:e.clientX,y:e.clientY};
  game.pressed=id;
  paint();
  try{canvas.setPointerCapture(e.pointerId);}catch(_){}
});
canvas.addEventListener('pointerup',e=>{
  if(!down||down.pointerId!==e.pointerId)return;
  const id=down.id;
  const distance=Math.hypot(e.clientX-down.x,e.clientY-down.y);
  down=null;game.pressed=0;paint();
  if(distance>26)return; // A swipe/scroll should not accidentally cost a life.
  if(id)choose(id);
  else feedback('Tap a dark arrow line');
});
canvas.addEventListener('pointercancel',()=>{down=null;game.pressed=0;paint();});
canvas.addEventListener('lostpointercapture',()=>{game.pressed=0;paint();});
canvas.addEventListener('keydown',e=>{
  if(e.key==='Enter'||e.key===' '){e.preventDefault();const p=activePieces().find(eligible);if(p)choose(p.id);}
});
function showResult(type){
  const won=type==='win',repair=type==='repair';
  els.overlay.hidden=false;
  $('finish-icon').textContent=won?'✦':repair?'⚙':'↶';
  els.overlayTitle.textContent=won?'Level complete!':repair?'Puzzle needs repair':'Out of drops';
  els.overlayDetail.textContent=won?`You cleared all ${game.pieces.length} arrows. Ready for Level ${game.level+1}?`:repair?'No arrow has a clear escape. This should never happen. You can repair the puzzle for free without losing your level.':'A complete solution exists. Try this same layout again.';
  els.overlayAction.textContent=won?'NEXT LEVEL':repair?'REPAIR PUZZLE':'RETRY LEVEL';
  els.overlayAction.onclick=()=>won?nextLevel():repair?newMaze():retry();
  els.overlaySecondary.textContent=won?'NEW MAZE':'NEW MAZE';
  els.overlaySecondary.onclick=()=>newMaze();
  if(won)playTone('win');
}
function start(level,seed,restore=false){
  game.epoch++;
  game.animating=null;game.blocked=null;game.hint=0;game.pressed=0;game.ready=false;
  game.level=Math.max(1,Math.min(9999,level|0));game.seed=seed>>>0;
  if(!restore){game.removed=new Set();game.lives=3;}
  els.overlay.hidden=true;
  els.loader.textContent=`CREATING LEVEL ${game.level}…`;
  els.loader.hidden=false;
  els.level.textContent='Level '+game.level;
  feedback('Generating a solvable maze…');
  // Yield a frame, so the loading indicator remains visible on slower phones.
  requestAnimationFrame(()=>setTimeout(()=>{
    try{
      game.pieces=generate(game.level,game.seed);
      if(!game.pieces.length)throw new Error('No arrows generated');
      const result=solveBoard(game.pieces);
      if(!result.ok)throw new Error('Puzzle validation failed: '+result.reason);
      const available=new Set(game.pieces.map(p=>p.id));
      game.removed=new Set([...game.removed].filter(id=>available.has(id)));
      // Validate saved partial board too. A damaged save is restarted safely.
      const partial=activePieces();
      const repaired=partial.length&&!solveBoard(partial).ok;
      if(repaired){game.removed.clear();game.lives=3;}
      game.ready=true;els.loader.hidden=true;resize();refreshUI();persist();
      const remaining=game.pieces.length-game.removed.size;
      if(remaining===0)showResult('win');
      else if(game.lives===0)showResult('loss');
      else feedback(repaired?'Invalid saved position repaired. Your level was kept.':(migratedOldSave?'Puzzle updated: self-blocking arrows fixed, level restarted.':game.level<=3?`${remaining} arrows · tap any line to clear it`:`${remaining} arrows · ${difficulty(game.level).label.toLowerCase()} puzzle`));
    }catch(e){
      els.loader.textContent='LEVEL COULD NOT LOAD';feedback('Game startup error: '+e.message);
      console.error('Arrow Maze failed to initialize',e);
    }
  },10));
}
function retry(){start(game.level,game.seed);}
function newMaze(){start(game.level,freshSeed());}
function nextLevel(){start(game.level+1,freshSeed());}
$('previous').addEventListener('click',()=>start(Math.max(1,game.level-1),freshSeed()));
$('new').addEventListener('click',newMaze);
$('retry').addEventListener('click',retry);
$('hint').addEventListener('click',()=>{
  if(!game.ready||game.lives<=0||game.animating||game.blocked||!els.overlay.hidden)return;
  const valid=activePieces().filter(eligible);
  if(!valid.length){feedback('No clear arrows found');return;}
  game.hint=valid[Math.floor(Math.random()*valid.length)].id;
  feedback('The gold arrow can escape now');paint();
});
$('theme').addEventListener('click',()=>{document.documentElement.classList.toggle('phosphor');colorVars();paint();persist();});
$('level-title').addEventListener('click',()=>{
  const v=window.prompt('Enter a level number (1–9999)',String(game.level));
  if(v===null)return;
  const n=Number(v.trim());
  if(Number.isInteger(n)&&n>=1&&n<=9999)start(n,freshSeed());
  else feedback('Level must be between 1 and 9999');
});
$('start-over').addEventListener('click',()=>{
  els.settings.close();start(1,freshSeed());
});
$('help').addEventListener('click',()=>{
  if(typeof els.settings.showModal==='function')els.settings.showModal();else els.settings.setAttribute('open','');
});
els.animations.addEventListener('change',()=>{game.motion=els.animations.checked;persist();});
els.sounds.addEventListener('change',()=>{game.sound=els.sounds.checked;persist();});
$('seed-button').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(code());feedback('Puzzle code copied: '+code());}
  catch(e){window.prompt('Copy your puzzle code:',code());}
});
$('load-seed').addEventListener('click',()=>{
  const raw=$('seed-input').value.trim().toUpperCase();
  const match=raw.match(/^(\d{1,4})-([0-9A-Z]{1,8})$/);
  const parsed=match?parseInt(match[2],36):NaN;
  if(!match||Number(match[1])<1||!Number.isFinite(parsed)||parsed>4294967295){$('code-error').textContent='Enter a valid code, e.g. 43-ABC123';return;}
  $('code-error').textContent='';els.settings.close();start(Number(match[1]),parsed>>>0);
});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
$('install').addEventListener('click',async()=>{
  if(installPrompt){const event=installPrompt;installPrompt=null;await event.prompt();return;}
  $('install-help').textContent='To install on iPhone, open the hosted HTTPS site in Safari, tap Share → Add to Home Screen → Open as Web App. On desktop, use your browser’s Install app option.';
});
function swStatus(){
  if(!('serviceWorker' in navigator)){els.connection.textContent='BROWSER MODE';return;}
  navigator.serviceWorker.register('./sw.js').then(()=>{
    els.connection.textContent='OFFLINE-READY';
  }).catch(e=>{
    els.connection.textContent='BROWSER MODE';console.info('Service worker unavailable here:',e.message);
  });
}
window.addEventListener('resize',resize);
window.addEventListener('error',event=>{
  if(!game.ready){els.loader.textContent='GAME FAILED TO LOAD';feedback('Open the PWA on an HTTPS site, not inside a restricted file preview.');}
});
if(new URLSearchParams(location.search).has('test')){
  window.__arrowMazeDebug={
    state:()=>({level:game.level,seed:game.seed,lives:game.lives,ready:game.ready,remaining:activePieces().length,total:game.pieces.length,cols:MC,rows:MR,animating:!!game.animating,overlay:!els.overlay.hidden}),
    arrows:()=>activePieces().map(p=>({id:p.id,dir:p.dir,points:p.points,eligible:eligible(p)})),
    choose,hitTest,boardPoint,validate:()=>solveBoard(activePieces()),
    reset:retry,
    start
  };
}
colorVars();swStatus();start(game.level,game.seed,true);
})();
