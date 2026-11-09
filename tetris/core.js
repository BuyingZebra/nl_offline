/* FIELD ATLAS / ARCADE — falling-block game core.
 * Pure, dependency-free rules. One source supports the browser and Node tests.
 * The geometry and controls belong to FIELD ATLAS; no map services required.
 */
(function (root, make) {
  const game = make();
  if (typeof module === 'object' && module.exports) module.exports = game;
  if (root) root.FieldAtlasBlocks = game;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
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
});
