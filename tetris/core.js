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
  const CLEAR_POINTS = [0,100,300,500,800];
  const blankBoard = () => Array.from({length:ROWS}, () => Array(COLS).fill(0));
  const copyMatrix = m => m.map(row => row.slice());
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
      this.reset();
    }
    reset() {
      this.board=blankBoard();
      this.queue=[];
      this.hold=null;
      this.canHold=true;
      this.score=0;
      this.lines=0;
      this.level=1;
      this.pieces=0;
      this.lastClear=0;
      this.lastEvent='READY';
      this.status='ready';
      this.elapsed=0;
      this.gravityClock=0;
      this.lockClock=0;
      this.lockMoves=0;
      this.fillQueue();
      this.current=null;
      this.spawn();
      this.status='ready';
    }
    fillQueue() {
      while(this.queue.length<7)this.queue.push(...shuffledBag(this.rng));
    }
    piece(kind) {
      const matrix=copyMatrix(SHAPES[kind]);
      return {kind,matrix,rotation:0,x:Math.floor((COLS-matrix[0].length)/2),y:0};
    }
    spawn(kind) {
      if (!kind) { this.fillQueue(); kind=this.queue.shift(); this.fillQueue(); }
      this.current=this.piece(kind);
      this.gravityClock=0;
      this.lockClock=0;
      this.lockMoves=0;
      if(this.collides(this.current)) {
        this.status='over';
        this.lastEvent='GAME OVER';
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
      if(dx&&this.lockMoves<15){this.lockClock=0;this.lockMoves++;}
      return true;
    }
    move(dx) {return this.tryMove(Math.sign(dx),0);}
    softDrop() {
      if(!this.tryMove(0,1))return false;
      this.score++;
      this.gravityClock=0;
      this.lockClock=0;
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
          if(this.lockMoves<15){this.lockClock=0;this.lockMoves++;}
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
    hardDrop() {
      if(this.status!=='playing')return false;
      const distance=this.ghostY()-this.current.y;
      this.current.y+=distance;
      this.score+=Math.max(0,distance)*2;
      this.lockPiece();
      return true;
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
      let above=false;
      for(let iy=0;iy<p.matrix.length;iy++)for(let ix=0;ix<p.matrix[iy].length;ix++){
        const kind=p.matrix[iy][ix];
        if(!kind)continue;
        const x=p.x+ix,y=p.y+iy;
        if(y<0)above=true;
        else if(y<ROWS&&x>=0&&x<COLS)this.board[y][x]=kind;
      }
      if(above){this.status='over';this.lastEvent='GAME OVER';return;}
      // A successful placement scores even when a piece settles by gravity.
      // This small bonus complements, rather than replaces, drop/line points.
      this.score+=10*this.level;
      const remaining=this.board.filter(row=>row.some(cell=>!cell));
      const cleared=ROWS-remaining.length;
      while(remaining.length<ROWS)remaining.unshift(Array(COLS).fill(0));
      this.board=remaining;
      this.lastClear=cleared;
      this.score+=CLEAR_POINTS[cleared]*this.level;
      this.lines+=cleared;
      this.level=1+Math.floor(this.lines/10);
      this.pieces++;
      this.canHold=true;
      this.lastEvent=cleared===4?'TETRIS!':cleared?cleared+' LINE'+(cleared!==1?'S':''):'LOCK';
      this.spawn();
      if(this.status==='over')this.lastEvent='GAME OVER';
    }
    get dropMs() {
      return Math.max(65,Math.round(850*Math.pow(.78,this.level-1)));
    }
    tick(dt) {
      if(this.status!=='playing'||!this.current)return false;
      const elapsed=Math.min(100,Math.max(0,Number(dt)||0));
      this.elapsed+=elapsed;
      this.gravityClock+=elapsed;
      let changed=false;
      while(this.gravityClock>=this.dropMs){
        this.gravityClock-=this.dropMs;
        if(!this.tryMove(0,1))break;
        changed=true;
      }
      if(this.isGrounded()){
        this.lockClock+=elapsed;
        if(this.lockClock>=450){this.lockPiece();changed=true;}
      }else this.lockClock=0;
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
  return Object.freeze({COLS,ROWS,IDS,SHAPES,turn,shuffledBag,Game});
});