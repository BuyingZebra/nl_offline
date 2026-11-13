/* NOMAD — single game authority. Internal modules remain private. */
export const Core=(()=>{
  'use strict';
  const COLS = 10, ROWS = 20;
  const IDS = ['I','J','L','O','S','T','Z'];
  const SHAPES = {
    I: [[0,0,0,0],['I','I','I','I'],[0,0,0,0],[0,0,0,0]],
    J: [['J',0,0],['J','J','J'],[0,0,0]],
    L: [[0,0,'L'],['L','L','L'],[0,0,0]],
    O: [['O','O'],['O','O']],
    S: [[0,'S','S'],['S','S',0],[0,0,0]],
    T: [[0,'T',0],['T','T','T'],[0,0,0]],
    Z: [['Z','Z',0],[0,'Z','Z'],[0,0,0]]
  };
  // SRS kicks. Matrix Y points down, opposite the standard table's Y direction.
  const JLSTZ = {
    '0>1': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '1>0': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    '1>2': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    '2>1': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '2>3': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '3>2': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '3>0': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '0>3': [[0,0],[1,0],[1,-1],[0,2],[1,2]]
  };
  const I_KICKS = {
    '0>1': [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
    '1>0': [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
    '1>2': [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
    '2>1': [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
    '2>3': [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
    '3>2': [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
    '3>0': [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
    '0>3': [[0,0],[-1,0],[2,0],[-1,-2],[2,1]]
  };
  // North American NES gravity in frames per row, and Nintendo line-clear base scores.
  const GRAVITY_FRAMES = [48,43,38,33,28,23,18,13,8,6,5,5,5,4,4,4,3,3,3,2,2,2,2,2,2,2,2,2,2,1];
  const NES_FRAME_MS = 1000/60.0988;
  const CLEAR_POINTS = [0,40,100,300,1200];
  const MAX_LEVEL = 89, LOCK_MS = 500;
  const blankBoard = () => Array.from({length:ROWS}, () => Array(COLS).fill(0));
  // A stable source index follows each of the four I cells through rotation.
  // The index belongs to the original spawned strip, never its board position.
  function iSourceIndex(rotation,x,y) {
    if(rotation===0)return y===1?x:null;
    if(rotation===1)return x===2?y:null;
    if(rotation===2)return y===2?3-x:null;
    if(rotation===3)return x===1?3-y:null;
    return null;
  }
  const copyMatrix = m => m.map(row => row.slice());
  function bottomRow(piece) {
    for(let y=piece.matrix.length-1;y>=0;y--)
      if(piece.matrix[y].some(Boolean))return piece.y+y;
  }
  function turn(matrix, dir) {
    const N = matrix.length;
    const out = Array.from({length:N},()=>Array(N).fill(0));
    for (let y=0; y<N; y++) for (let x=0; x<N; x++) {
      if (dir === 1) out[x][N-1-y] = matrix[y][x];
      else out[N-1-x][y] = matrix[y][x];
    }
    return out;
  }
  function shuffledBag(rng) {
    const bag = IDS.slice();
    for (let i=bag.length-1; i>0; i--) {
      const j = Math.min(i, Math.floor(Math.max(0,Math.min(.999999999999,rng()))*(i+1)));
      [bag[i],bag[j]]=[bag[j],bag[i]];
    }
    return bag;
  }
  class Game {
    constructor(rng=Math.random) {
      this.rng=rng;
      // Game observers never own rules, rendering or mutable board data.
      this._eventListeners=new Set();
      this.reset();
    }
    onEvent(listener) {
      if(typeof listener!=='function')throw new TypeError('Game event listener must be a function');
      this._eventListeners.add(listener);
      // Unsubscribe is safe to call repeatedly and during an event.
      return ()=>this._eventListeners.delete(listener);
    }
    _emit(event) {
      if(!this._eventListeners.size)return;
      const message=Object.freeze(event);
      // A UI/diagnostic observer must never corrupt deterministic gameplay.
      for(const listener of [...this._eventListeners]){
        if(!this._eventListeners.has(listener))continue;
        try{listener(message);}catch(error){/* Observer failure is isolated. */}
      }
    }
    reset() {
      this.board=blankBoard();
      // Parallel to the original kind-only board: old collision/scoring APIs
      // keep working, while renderers can distinguish touching I instances.
      this.boardMeta=blankBoard();
      this._nextPieceId=1;
      this.queue=[];
      this.hold=null;
      this.canHold=true;
      this.score=0;
      this.lines=0;
      this.level=0;
      this.pieces=0;
      this.lastClear=0;
      this.lastEvent='READY';
      this.status='ready';
      this.elapsed=0;
      this.gravityClock=0;
      this.lockClock=0;
      this.fillQueue();
      this.current=null;
      this.spawn();
      this.status='ready';
      this._emit({type:'reset',status:this.status,score:this.score,lines:this.lines,level:this.level});
    }
    fillQueue() {
      while(this.queue.length<7)this.queue.push(...shuffledBag(this.rng));
    }
    piece(kind) {
      const matrix=copyMatrix(SHAPES[kind]);
      return {kind,id:this._nextPieceId++,matrix,rotation:0,x:Math.floor((COLS-matrix[0].length)/2),y:0};
    }
    spawn(kind,notifyGameOver=true) {
      if (!kind) { this.fillQueue(); kind=this.queue.shift(); this.fillQueue(); }
      this.current=this.piece(kind);
      this.gravityClock=0;
      this.lockClock=0;
      this.lowestRow=bottomRow(this.current);
      if(this.collides(this.current)) {
        this.status='over';
        this.lastEvent='GAME OVER';
        if(notifyGameOver)this._emit({
          type:'game-over',reason:'spawn-blocked',
          score:this.score,lines:this.lines,level:this.level,status:this.status
        });
        return false;
      }
      return true;
    }
    start() {
      if(this.status==='over')this.reset();
      if(this.status==='ready'||this.status==='paused') {
        this.status='playing';
        this.lastEvent='PLAY';
        return true;
      }
      return false;
    }
    pause() {
      if(this.status==='playing'){this.status='paused';this.lastEvent='PAUSED';return true;}
      if(this.status==='paused')return this.start();
      return false;
    }
    collides(piece, x=piece.x,y=piece.y,matrix=piece.matrix) {
      for(let iy=0;iy<matrix.length;iy++)for(let ix=0;ix<matrix[iy].length;ix++){
        if(!matrix[iy][ix])continue;
        const px=x+ix,py=y+iy;
        if(px<0||px>=COLS||py>=ROWS)return true;
        if(py>=0&&this.board[py][px])return true;
      }
      return false;
    }
    isGrounded() {
      return Boolean(this.current&&this.collides(this.current,this.current.x,this.current.y+1));
    }
    tryMove(dx,dy) {
      if(this.status!=='playing'||!this.current)return false;
      const p=this.current;
      if(this.collides(p,p.x+dx,p.y+dy))return false;
      p.x+=dx;p.y+=dy;
      if(dy>0){
        const row=bottomRow(p);
        if(row>this.lowestRow){this.lowestRow=row;this.lockClock=0;}
      }
      return true;
    }
    move(dx) {return this.tryMove(Math.sign(dx),0);}
    softDrop() {
      if(!this.tryMove(0,1))return false;
      this.score++;
      this.gravityClock=0;
      return true;
    }
    rotate(dir=1) {
      if(this.status!=='playing'||!this.current)return false;
      const p=this.current;
      if(p.kind==='O')return true;
      const nextRotation=(p.rotation+(dir===1?1:3))%4;
      const matrix=turn(p.matrix,dir);
      const kicks=(p.kind==='I'?I_KICKS:JLSTZ)[p.rotation+'>'+nextRotation]||[[0,0]];
      for(const [kx,ky] of kicks){
        if(!this.collides(p,p.x+kx,p.y+ky,matrix)) {
          p.x+=kx;p.y+=ky;p.rotation=nextRotation;p.matrix=matrix;
          this.lowestRow=Math.max(this.lowestRow,bottomRow(p));
          return true;
        }
      }
      return false;
    }
    ghostY() {
      if(!this.current)return 0;
      const p=this.current;
      let y=p.y;
      while(!this.collides(p,p.x,y+1))y++;
      return y;
    }
    holdPiece() {
      if(this.status!=='playing'||!this.canHold)return false;
      const active=this.current.kind;
      const next=this.hold;
      this.hold=active;
      this.canHold=false;
      if(next)this.spawn(next);
      else this.spawn();
      this.canHold=false;
      this.lastEvent=this.status==='over'?'GAME OVER':'HOLD';
      return true;
    }
    lockPiece() {
      const p=this.current;
      if(!p||this.status!=='playing')return;
      if(!Number.isSafeInteger(p.id))p.id=this._nextPieceId++;
      const overhang=[];
      for(let iy=0;iy<p.matrix.length;iy++)for(let ix=0;ix<p.matrix[iy].length;ix++){
        const kind=p.matrix[iy][ix];
        if(!kind)continue;
        const x=p.x+ix,y=p.y+iy;
        if(y>=ROWS||x<0||x>=COLS)continue;
        const meta=Object.freeze({
          kind,pieceId:p.id,rotation:p.rotation,
          sourceIndex:kind==='I'?iSourceIndex(p.rotation,ix,iy):null
        });
        if(y<0)overhang.push({x,y,meta});
        else{
          this.board[y][x]=kind;
          this.boardMeta[y][x]=meta;
        }
      }
      const remaining=[],remainingMeta=[],completed=[];
      for(let y=0;y<ROWS;y++){
        const row=this.board[y];
        if(row.every(Boolean))completed.push(y);
        else {
          remaining.push(row);
          remainingMeta.push(this.boardMeta[y]);
        }
      }
      const cleared=completed.length;
      // Capture the exact landed board before completed rows are removed.
      // Only allocate the frozen board snapshot when there are rows to flash.
      const beforeClear=cleared&&this._eventListeners.size?
       Object.freeze(this.board.map(row=>Object.freeze(row.slice()))):null;
      const beforeClearMeta=beforeClear?
       Object.freeze(this.boardMeta.map(row=>Object.freeze(row.slice()))):null;
      while(remaining.length<ROWS){
        remaining.unshift(Array(COLS).fill(0));
        remainingMeta.unshift(Array(COLS).fill(0));
      }
      // Every cleared visible row is below every overhanging cell.
      let topOut=false;
      for(const {x,y,meta} of overhang){
        const row=y+cleared;
        if(row<0)topOut=true;
        else{
          remaining[row][x]=meta.kind;
          remainingMeta[row][x]=meta;
        }
      }
      this.board=remaining;
      this.boardMeta=remainingMeta;
      this.lastClear=cleared;
      const priorLevel=this.level;
      this.lines+=cleared;
      // Nintendo scores the clear at the level reached by that clear.
      this.level=Math.min(MAX_LEVEL,Math.floor(this.lines/10));
      const points=CLEAR_POINTS[cleared]*(this.level+1);
      this.score+=points;
      const locked=!topOut||cleared>0;
      if(locked)this.pieces++;
      this.lastEvent=cleared===4?'TETRIS!':cleared?cleared+' LINE'+(cleared!==1?'S':''):'LOCK';
      // Suppress early game-over notification until the lock and clear events
      // have been delivered in game-rule order.
      const spawned=!topOut&&this.spawn(undefined,false);
      if(!spawned){this.status='over';this.lastEvent='GAME OVER';}
      else this.canHold=true;
      if(locked)this._emit({
        type:'piece-locked',kind:p.kind,x:p.x,y:p.y,rotation:p.rotation,
        cleared,score:this.score,lines:this.lines,level:this.level,status:this.status
      });
      if(cleared)this._emit({
        type:'lines-cleared',count:cleared,points,rows:Object.freeze(completed),
        board:beforeClear,boardMeta:beforeClearMeta,
        score:this.score,lines:this.lines,level:this.level,status:this.status
      });
      if(this.level!==priorLevel)this._emit({
        type:'level-changed',from:priorLevel,to:this.level,
        score:this.score,lines:this.lines,status:this.status
      });
      if(!spawned)this._emit({
        type:'game-over',reason:topOut?'top-out':'spawn-blocked',
        score:this.score,lines:this.lines,level:this.level,status:this.status
      });
    }
    get dropMs() {
      return GRAVITY_FRAMES[Math.min(this.level,29)]*NES_FRAME_MS;
    }
    tick(dt) {
      if(this.status!=='playing'||!this.current)return false;
      const elapsed=Math.min(100,Math.max(0,Number(dt)||0));
      this.elapsed+=elapsed;
      let remaining=elapsed;
      let changed=false;
      // Split elapsed time at gravity and lock boundaries. Time spent falling
      // before a landing never counts against that piece's grounded timer.
      while(remaining>0){
        const grounded=this.isGrounded();
        const gravityLeft=this.dropMs-this.gravityClock;
        const lockLeft=grounded?LOCK_MS-this.lockClock:Infinity;
        const step=Math.min(remaining,gravityLeft,lockLeft);
        this.gravityClock+=step;
        if(grounded)this.lockClock+=step;
        remaining-=step;
        if(step===lockLeft){this.lockPiece();return true;}
        if(step===gravityLeft){
          this.gravityClock=0;
          if(!grounded&&this.tryMove(0,1))changed=true;
        }
      }
      return changed;
    }
    cells() {
      const result=this.board.map(row=>row.slice());
      if(!this.current)return result;
      const p=this.current;
      for(let y=0;y<p.matrix.length;y++)for(let x=0;x<p.matrix[y].length;x++){
        if(!p.matrix[y][x])continue;
        const xx=p.x+x,yy=p.y+y;
        if(xx>=0&&xx<COLS&&yy>=0&&yy<ROWS)result[yy][xx]=p.matrix[y][x];
      }
      return result;
    }
  }
  return Object.freeze({COLS,ROWS,MAX_LEVEL,IDS,SHAPES,turn,shuffledBag,Game});
})();
export const Scores=(()=>{
 'use strict';
 const KEY='nomadTetrisPersonalBestV01';
 const OLD_TOP_FIVE='fieldAtlasTetrisTopFiveV01';
 const LEGACY='fieldAtlasTetrisBest';
 const positive=n=>{
  const value=Number(n);
  return Number.isFinite(value)?Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,Math.floor(value))):0;
 };
 function sanitize(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const score=positive(value.score);
  if(!score)return null;
  return Object.freeze({score,lines:positive(value.lines),
   level:positive(value.level),at:positive(value.at)});
 }
 function better(a,b){
  if(!a)return b;
  if(!b)return a;
  return b.score>a.score?b:a;
 }
 function parseRecord(raw){
  try{return sanitize(JSON.parse(raw));}catch(error){return null;}
 }
 function read(storage){
  if(!storage)return null;
  try{
   const raw=storage.getItem(KEY);
   let result=parseRecord(raw);
   const old=storage.getItem(OLD_TOP_FIVE);
   if(old!==null){
    try{
     const list=JSON.parse(old);
     if(Array.isArray(list))
      for(const entry of list)result=better(result,sanitize(entry));
    }catch(error){/* Damaged old leaderboard. */}
   }
   const legacy=positive(storage.getItem(LEGACY));
   result=better(result,legacy>0?sanitize({score:legacy}):null);
   // A successful migration has no effect on the former backup records.
   return result&&raw!==JSON.stringify(result)?save(storage,result):result;
  }catch(error){return null;}
 }
 function save(storage,record){
  const best=sanitize(record);
  if(!best||!storage)return best;
  let winner=best;
  try{
   const raw=storage.getItem(KEY);
   winner=better(parseRecord(raw),best);
   const serialized=JSON.stringify(winner);
   if(raw!==serialized)storage.setItem(KEY,serialized);
  }catch(error){/* Storage disabled; keep the current-session best. */}
  return winner;
 }
 function update(storage,current,candidate){
  const existing=sanitize(current);
  const incoming=sanitize(candidate);
  return incoming&&(!existing||incoming.score>existing.score)?
   save(storage,incoming):(existing?current:null);
 }
 function createPersistence(storage,indexedDB){
  if(!indexedDB)return null;
  let opening;
  return async function persist(candidate){
   const proposed=sanitize(candidate);
   try{
    opening??=new Promise((resolve,reject)=>{
     const request=indexedDB.open('nomad-tetris-scores',1);
     request.onupgradeneeded=()=>request.result.createObjectStore('records');
     request.onsuccess=()=>resolve(request.result);
     request.onerror=()=>reject(request.error);
    });
    const db=await opening;
    const best=await new Promise((resolve,reject)=>{
     const transaction=db.transaction('records','readwrite');
     const records=transaction.objectStore('records');
     const request=records.get(KEY);
     let winner;
     request.onsuccess=()=>{
      const existing=sanitize(request.result);
      winner=better(existing,proposed);
      if(winner&&winner!==existing)records.put(winner,KEY);
     };
     transaction.oncomplete=()=>resolve(winner);
     transaction.onabort=()=>reject(transaction.error);
    });
    // Preserve the legacy record as a compatibility mirror. The database
    // transaction is authoritative for concurrent writes.
    if(best)save(storage,best);
    return best;
   }catch(error){
    return proposed?save(storage,proposed):read(storage);
   }
  };
 }
 return Object.freeze({KEY,OLD_TOP_FIVE,LEGACY,sanitize,read,save,update,createPersistence});
})();
// Preserve integration hooks used by the existing browser smoke test.
if(typeof window!=='undefined'){
 window.FieldAtlasBlocks=Core;
 window.FieldAtlasScores=Scores;
}
const PHOSPHOR_BOUNDS=Object.freeze({minPersistenceMs:10,maxPersistenceMs:120,stepPersistenceMs:10,defaultPersistenceMs:120});
export function normalizePersistenceMs(value){
 const n=Number(value);
 return Number.isFinite(n)?
  Math.max(PHOSPHOR_BOUNDS.minPersistenceMs,Math.min(PHOSPHOR_BOUNDS.maxPersistenceMs,
   Math.round(n/PHOSPHOR_BOUNDS.stepPersistenceMs)*PHOSPHOR_BOUNDS.stepPersistenceMs)):
  PHOSPHOR_BOUNDS.defaultPersistenceMs;
}
/* Screen transitions, settings and game actions. */

/* V073 — user-approved display defaults taken from the October 26 screenshot.
 * The settings schema and slider ranges are unchanged.
 * Saved preferences still override defaults; Restore Defaults reapplies these.
 */
export const DEFAULT_EFFECTS=Object.freeze({phosphor:true,bloom:true,bloomStrength:.22,
 ghost:false,ghostX:2,ghostY:0,ghostStrength:22,
 scanlines:true,scanlinePreset:'aperture',scanlineOpacity:49,
 softness:false,softnessStrength:.64,softnessRadius:3,
 vignette:true,vignetteAmount:.57,
 persistence:true,persistenceMs:120,
 shadows:true,shadowAngle:55,shadowDistance:13,shadowBlur:14,
 shadowBias:1,shadowOpacity:.8});
export const DISPLAY_EFFECTS=[
 {id:'phosphor',title:'PHOSPHOR COLOR',toggle:'phosphor'},
 {id:'persistence',title:'PHOSPHOR RESPONSE',toggle:'persistence',
  sliders:[['DECAY','persistenceMs',10,120,10,'ms']]},
 {id:'scanlines',title:'CRT SCANLINES',toggle:'scanlines',pattern:true,
  sliders:[['','scanlineOpacity',0,100,1,'%']]},
 {id:'vignette',title:'SCREEN VIGNETTE',toggle:'vignette',
  sliders:[['','vignetteAmount',0,100,1,'%']]},
 {id:'bloom',title:'PHOSPHOR BLOOM',toggle:'bloom',
  sliders:[['','bloomStrength',0,100,1,'%']]},
 // Light-specific sliders live only in the paused Light Control deck.
 // The Display System retains the effect toggle and launcher.
 {id:'shadows',title:'DROP SHADOWS',toggle:'shadows'},
 {id:'ghost',title:'SIGNAL GHOSTING',toggle:'ghost',
  sliders:[['X','ghostX',-32,32,1,'px'],
   ['Y','ghostY',-32,32,1,'px'],
   ['','ghostStrength',0,100,1,'%']]},
 {id:'softness',title:'EDGE SOFTNESS',toggle:'softness',
  sliders:[['STRENGTH','softnessStrength',0,100,1,'%'],
   ['RADIUS','softnessRadius',0,10,.5,'px']]},
 {id:'piece',title:'GHOST PIECE',toggle:'pieceGhost'},
 {id:'sound',title:'SOUND',toggle:'sound'}
];
// Supported independently of renderer code so saved preferences migrate safely.
export const SHADOW_RANGES=Object.freeze({
 shadowAngle:[0,360],shadowDistance:[0,35],shadowBlur:[0,30],
 shadowBias:[0,1],shadowOpacity:[0,1]
});
export const SHADOW_SETTING_KEYS=Object.freeze(['shadows',...Object.keys(SHADOW_RANGES)]);
export const SCANLINE_PRESET_IDS=Object.freeze(['original','horizontal','aperture','slot','dot']);
export const EFFECT_NUMBER_RANGES=Object.freeze({
 bloomStrength:[0,1],ghostX:[-32,32],ghostY:[-32,32],ghostStrength:[0,100],
 scanlineOpacity:[0,100],softnessStrength:[0,1],softnessRadius:[0,10],
 vignetteAmount:[0,1],persistenceMs:[10,120],...SHADOW_RANGES
});
// Validate persisted, migrated and user-submitted effects using one schema.
export function normalizeEffectValue(key,value){
 if(!Object.prototype.hasOwnProperty.call(DEFAULT_EFFECTS,key))return undefined;
 const fallback=DEFAULT_EFFECTS[key];
 if(typeof fallback==='boolean')return typeof value==='boolean'?value:fallback;
 if(key==='scanlinePreset')
  return typeof value==='string'&&SCANLINE_PRESET_IDS.includes(value)?value:fallback;
 if(typeof fallback==='number'){
  if(typeof value!=='number'||!Number.isFinite(value))return fallback;
  if(key==='persistenceMs')return normalizePersistenceMs(value);
  const range=EFFECT_NUMBER_RANGES[key];
  return range?Math.max(range[0],Math.min(range[1],value)):fallback;
 }
 return fallback;
}
export const LIGHT_PROPERTY_CONTROLS=Object.freeze([
 Object.freeze({label:'DISTANCE',field:'shadowDistance',min:0,max:35,step:1,unit:'px'}),
 Object.freeze({label:'GAUSSIAN BLUR',field:'shadowBlur',min:0,max:30,step:1,unit:'px'}),
 Object.freeze({label:'BIAS',field:'shadowBias',min:0,max:100,step:1,unit:'%'}),
 Object.freeze({label:'OPACITY',field:'shadowOpacity',min:0,max:100,step:1,unit:'%'})
]);
export function scanlineChoices(presets){
 return [{id:'off',name:'OFF'},...presets.map(p=>({id:p.id,name:p.name}))];
}
export function effectSettingValue(key,fx,{ghost,sound}){
 if(key==='pieceGhost')return ghost;
 if(key==='sound')return sound;
 if(['softnessStrength','vignetteAmount','bloomStrength','shadowBias','shadowOpacity'].includes(key))
  return Math.round(fx[key]*100);
 return fx[key];
}
export function effectSettingToStored(key,value,clamp=(v,a,b)=>Math.max(a,Math.min(b,v))){
 return ['softnessStrength','vignetteAmount','bloomStrength','shadowBias','shadowOpacity'].includes(key)?
  clamp(value/100,0,1):value;
}

/* NOMAD Tetris V085 — Settings Manager.
 * Owns the existing user preferences and persistence; no rendering or UI
 * dependencies. Historical storage keys and reset behaviour are preserved.
 */

export const STORAGE_KEYS=Object.freeze({
 effects:'fieldAtlasThreeV027FX01',
 pieceGhost:'fieldAtlasTetrisGhost',
 sound:'fieldAtlasTetrisSound',
 theme:'fieldAtlasThemeV06',
 initials:'fieldAtlasTetrisInitials'
});

export function createSettingsManager(storage){
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 const read=(key,fallback)=>{
  try{return storage?.getItem(key)??fallback;}catch(e){return fallback;}
 };
 const write=(key,value)=>{
  try{storage?.setItem(key,String(value));}catch(e){}
 };
 let effects={...DEFAULT_EFFECTS};
 try{
  const saved=JSON.parse(read(STORAGE_KEYS.effects,'null'));
  if(saved&&typeof saved==='object'&&!Array.isArray(saved))
   for(const key of Object.keys(DEFAULT_EFFECTS))
    effects[key]=normalizeEffectValue(key,saved[key]);
 }catch(e){/* Corrupt/disabled storage keeps documented defaults. */}
 let pieceGhost=read(STORAGE_KEYS.pieceGhost,'yes')!=='no';
 let soundOn=read(STORAGE_KEYS.sound,'yes')!=='no';
 // Restore the original green/amber-only phosphor selection. A saved
 // blue preference from V160 gracefully falls back to green.
 let theme=read(STORAGE_KEYS.theme,'green')==='amber'?'amber':'green';

 function persistEffects(){
  write(STORAGE_KEYS.effects,JSON.stringify(effects));
 }
 function settingValue(key){
  return effectSettingValue(key,effects,{ghost:pieceGhost,sound:soundOn});
 }
 function setSetting(key,value){
  if(key==='pieceGhost'){
   pieceGhost=Boolean(value);
   write(STORAGE_KEYS.pieceGhost,pieceGhost?'yes':'no');
   return;
  }
  if(key==='sound'){
   soundOn=Boolean(value);
   write(STORAGE_KEYS.sound,soundOn?'yes':'no');
   return;
  }
  if(Object.prototype.hasOwnProperty.call(DEFAULT_EFFECTS,key)){
   // Nonfinite input must not saturate the slider through percent clamping.
   const converted=typeof DEFAULT_EFFECTS[key]==='number'&&
    (typeof value!=='number'||!Number.isFinite(value))?
    DEFAULT_EFFECTS[key]:effectSettingToStored(key,value,clamp);
   effects[key]=normalizeEffectValue(key,converted);
   persistEffects();
  }
 }
 function chooseScanline(id){
  if(id!=='off'&&!SCANLINE_PRESET_IDS.includes(id))return false;
  effects.scanlines=id!=='off';
  if(id!=='off')effects.scanlinePreset=id;
  persistEffects();
  return true;
 }
 function toggleTheme(){
  theme=theme==='green'?'amber':'green';
  write(STORAGE_KEYS.theme,theme);
  return theme;
 }
 function restoreDefaults(){
  effects={...DEFAULT_EFFECTS};
  persistEffects();
  pieceGhost=true;soundOn=true;
  write(STORAGE_KEYS.pieceGhost,'yes');
  write(STORAGE_KEYS.sound,'yes');
  // The phosphor theme is deliberately not reset in the historical behaviour.
 }
 return Object.freeze({
  get effects(){return effects;},
  get pieceGhost(){return pieceGhost;},
  get soundOn(){return soundOn;},
  get theme(){return theme;},
  settingValue,setSetting,chooseScanline,toggleTheme,restoreDefaults,
  readInitials:()=>read(STORAGE_KEYS.initials,'AAA'),
  saveInitials:value=>write(STORAGE_KEYS.initials,value)
 });
}

/* NOMAD Tetris V086 — screen/navigation state, no rendering dependencies.
 * The Game object continues to own ready/playing/paused/over. This controller
 * owns only which menu is visible and when navigation requests pause gameplay.
 */
export const SCREENS=Object.freeze({
 GAME:'game',
 OPTIONS:'options',
 PROPERTIES:'properties',
 SCORES:'scores',
 LIGHT:'light'
});

const MODALS=new Set([
 null,SCREENS.OPTIONS,SCREENS.PROPERTIES,SCREENS.SCORES,SCREENS.LIGHT
]);

export function createScreenManager({getGameStatus,pauseGame,onChange}){
 if(typeof getGameStatus!=='function'||typeof pauseGame!=='function'||
    typeof onChange!=='function')throw new TypeError('Screen Manager requires lifecycle callbacks');
 let active=null;
 let lightParent=SCREENS.OPTIONS;

 // Always announce valid transitions, even when opening the same screen again:
 // the existing UI resets menu scroll, picker state and pointer capture each time.
 function open(next){
  if(!MODALS.has(next))return false;
  const previous=active;
  if(next===SCREENS.LIGHT&&previous!==SCREENS.LIGHT)
   lightParent=previous===SCREENS.PROPERTIES?SCREENS.PROPERTIES:SCREENS.OPTIONS;
  active=next;
  onChange(previous,next);
  return true;
 }
 function openWithPause(next){
  // Preserve V085: entering either menu pauses an active game first.
  if(getGameStatus()==='playing')pauseGame();
  return open(next);
 }
 return Object.freeze({
  get active(){return active;},
  get screen(){return active??SCREENS.GAME;},
  get hasModal(){return active!==null;},
  get isScores(){return active===SCREENS.SCORES;},
  get isOptions(){return active===SCREENS.OPTIONS;},
  get isProperties(){return active===SCREENS.PROPERTIES;},
  get usesPropertiesBoard(){return active===SCREENS.PROPERTIES||active===SCREENS.LIGHT&&lightParent===SCREENS.PROPERTIES;},
  get isLight(){return active===SCREENS.LIGHT;},
  get paintsModalLayer(){return active!==null&&active!==SCREENS.SCORES;},
  // A single close operation returns Light Control to its parent Display
  // System; all other menus go back to the paused game.
  close:()=>open(active===SCREENS.LIGHT?lightParent:null),
  openProperties:()=>openWithPause(SCREENS.PROPERTIES),
  openOptions:()=>openWithPause(SCREENS.OPTIONS),
  openLight:()=>openWithPause(SCREENS.LIGHT),
  openScores:()=>openWithPause(SCREENS.SCORES)
 });
}

/* NOMAD Tetris V123 — application actions and event coordination.
 * No Canvas, WebGL, browser events, input geometry, or layout ownership.
 * This module maps user/game actions to the existing game, screen, settings
 * and score services through explicit adapters. V087 behaviour is retained.
 */
export const GAME_ACTIONS=Object.freeze([
 'left','right','cw','soft','hold','pause','start'
]);

const BLOCKED_DURING_LINE_CLEAR=new Set([
 'left','right','cw','soft','hold'
]);

export function createActionController({
 game,scores,storage,persistScore,settings,screens,
 getLineClearActive,clearLineClear,markLayers,invalidate,tone,
 onCopyDebug,onResetSettingsUI,onTerminalEvent=()=>{},
 canInteract=()=>true,now=()=>Date.now()
}){
 if(!game||!scores||!settings||!screens||
    typeof getLineClearActive!=='function'||
    typeof clearLineClear!=='function'||typeof markLayers!=='function'||
    typeof invalidate!=='function'||typeof tone!=='function'||
    typeof onCopyDebug!=='function'||typeof onResetSettingsUI!=='function')
  throw new TypeError('Application Actions require game, screen and UI adapters');

 let best=scores.read(storage);
 function syncBest(){
  if(!persistScore)return;
  void persistScore(best).then(saved=>{
   if(!saved||(best&&saved.score<=best.score))return;
   best=saved;
   if(screens.isScores){
    markLayers('base');
    invalidate();
   }
  });
 }
 syncBest();

 // Save new personal records as soon as the score improves, rather than
 // requiring initials or waiting for GAME OVER. Ties keep prior metadata.
 function observeScore(){
  const previous=best;
  best=scores.update(persistScore?null:storage,best,{
   score:game.score,lines:game.lines,level:game.level,at:now()
  });
  if(best!==previous)syncBest();
  return best!==previous;
 }
 function onGameOver(){
  if(game.status==='over')observeScore();
 }

 function perform(type){
  // During GPU interruption permit only the transition from playing to paused.
  // Do not allow invisible controls to restart or resume the game.
  if(!canInteract()&&!(type==='pause'&&game.status==='playing'))return false;
  // Preserve line-clear input lock: PAUSE is still permitted during the flash.
  if(getLineClearActive()&&game.status==='playing'&&
     BLOCKED_DURING_LINE_CLEAR.has(type))return false;
  const was=game.status,pieces=game.pieces,lines=game.lines,
   score=game.score,held=game.hold;
  let ok=false;
  if(type==='left')ok=game.move(-1);
  else if(type==='right')ok=game.move(1);
  else if(type==='cw')ok=game.rotate(1);
  else if(type==='soft')ok=game.softDrop();
  else if(type==='hold')ok=game.holdPiece();
  else if(type==='pause')ok=game.pause();
  else if(type==='start')ok=game.start();
  if(ok){
   markLayers('board','controls');
   if(game.pieces!==pieces||game.hold!==held)markLayers('sidebar');
   // SCORE/LEVEL/LINES now live in the independent sidebar HUD.
   // Updating a numeric readout must never invalidate the button artwork.
   if(game.score!==score||game.lines!==lines)markLayers('sidebar');
   if(game.status!==was)markLayers('base');
   if(game.lines>lines)tone(610,.14);
   else if(game.pieces>pieces)tone(175);
   else if(type==='cw')tone(305);
   else if(type==='hold')tone(265);
   if(game.score!==score)observeScore();
   if(type==='start')onTerminalEvent(was==='paused'?'GAME: RESUMED':'GAME: SESSION STARTED',
    was==='paused'?'GM: RESUMED':'GM: START');
   if(type==='pause')onTerminalEvent(game.status==='paused'?'GAME: PAUSED':'GAME: RESUMED',
    game.status==='paused'?'GM: PAUSED':'GM: RESUMED');
   if(type==='hold')onTerminalEvent('INPUT: HOLD PIECE '+game.hold,'IN: HOLD '+game.hold);
   onGameOver();invalidate();
  }
  return ok;
 }

 function restart(){
  if(!canInteract())return;
  observeScore();
  clearLineClear();
  game.reset();game.start();
  onTerminalEvent('GAME: SESSION RESTARTED','GM: RESTART');
  markLayers('board','sidebar','controls','base');
  screens.close();invalidate();
 }

 function setSetting(key,value){
  if(!canInteract())return;
  settings.setSetting(key,value);
  if(key==='pieceGhost'||SHADOW_SETTING_KEYS.includes(key))markLayers('board');
  invalidate();
 }

 function dispatch(action){
  if(!canInteract())return;
  if(action==='block'||action==='scroll'||action==='board')return;
  if(action==='close'){screens.close();return;}
  if(action==='copyDebug'){onCopyDebug();return;}
  if(action==='options'){screens.openOptions();return;}
  if(action==='light'){screens.openLight();return;}
  if(action==='scores'){
   const saved=scores.read(storage);
   if(saved&&(!best||saved.score>best.score))best=saved;
   syncBest();
   screens.openScores();return;
  }
  if(action==='theme'){
   settings.toggleTheme();markLayers('base');invalidate();return;
  }
  if(action==='restart'){restart();return;}
  if(action==='resetFX'){
   settings.restoreDefaults();onResetSettingsUI();
   markLayers('base','board');invalidate();return;
  }
  if(GAME_ACTIONS.includes(action))perform(action);
 }

 return Object.freeze({
  perform,dispatch,restart,observeScore,onGameOver,setSetting,
  get best(){return best;}
 });
}

export default Core;
