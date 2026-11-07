'use strict';
/*
 * Arrow Maze puzzle engine v6
 *
 * Two separate guarantees:
 *   (1) Every candidate is a self-avoiding polyline with a free exit ray.
 *   (2) Reverse construction + independent full-board solver ensure a solution.
 *
 * Each (level, seed) generates exactly the same board. No baked-in maps.
 * A level never silently ships with fewer pieces than its target.
 */
let MC=26, MR=35;
const DIRS=[[1,0],[0,1],[-1,0],[0,-1]];
const idx=(x,y)=>y*MC+x;
const within=(x,y)=>x>=0&&x<MC&&y>=0&&y<MR;
function difficulty(level){
  const l=Math.max(1,Math.min(9999,Math.floor(level)||1));
  const grid=l<=3?[12,16]:l<=8?[14,19]:l<=15?[17,23]:l<=24?[20,27]:l<=35?[23,31]:[26,35];
  return {
    cols:grid[0],rows:grid[1],count:Math.min(49,l+2),
    maxTurns:l<=2?0:l<=5?1:l<=10?2:l<=18?3:l<=30?4:6,
    maxLength:l<=2?4:l<=5?6:l<=10?9:l<=20?13:18,
    maxNewBlockers:l<=2?0:l<=8?1:l<=20?2:l<=35?3:5,
    label:l<=5?'INTRO':l<=12?'EASY':l<=25?'BUILDING':l<=40?'TRICKY':'EXPERT'
  };
}
function rng(seed){let a=seed>>>0;return ()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};}
function hash(x,y,seed){let v=(Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(seed|0,1442695041))|0;v=Math.imul(v^(v>>>13),1274126177);return ((v^(v>>>16))>>>0)/4294967295;}
function vnoise(x,y,s){const xx=Math.floor(x),yy=Math.floor(y);let fx=x-xx,fy=y-yy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);return (hash(xx,yy,s)*(1-fx)+hash(xx+1,yy,s)*fx)*(1-fy)+(hash(xx,yy+1,s)*(1-fx)+hash(xx+1,yy+1,s)*fx)*fy;}
function fbm(x,y,s){return .57*vnoise(x,y,s)+.29*vnoise(x*2.13,y*2.13,s+291)+.14*vnoise(x*4.39,y*4.39,s+732);}
const occupiedOf=pieces=>{const cells=new Set();for(const p of pieces)for(const pt of p.points)cells.add(idx(pt[0],pt[1]));return cells;};
function validArrowGeometry(p){
  if(!p||!Array.isArray(p.points)||p.points.length<2||!Number.isInteger(p.dir)||!DIRS[p.dir])return false;
  const seen=new Set(),parts=p.points;
  for(let i=0;i<parts.length;i++){
    const pt=parts[i],x=pt&&pt[0],y=pt&&pt[1];
    if(!Number.isInteger(x)||!Number.isInteger(y)||!within(x,y))return false;
    const k=idx(x,y);
    if(seen.has(k))return false;
    seen.add(k);
    if(i){const prev=parts[i-1];if(Math.abs(x-prev[0])+Math.abs(y-prev[1])!==1)return false;}
  }
  const h=parts[parts.length-1],before=parts[parts.length-2],d=DIRS[p.dir];
  if(h[0]-before[0]!==d[0]||h[1]-before[1]!==d[1])return false;
  let x=h[0]+d[0],y=h[1]+d[1];
  while(within(x,y)){if(seen.has(idx(x,y)))return false;x+=d[0];y+=d[1];}
  return true;
}
function canEscape(p,otherCells){
  if(!validArrowGeometry(p))return false;
  const [dx,dy]=DIRS[p.dir],h=p.points[p.points.length-1];
  for(let x=h[0]+dx,y=h[1]+dy;within(x,y);x+=dx,y+=dy){
    if(otherCells.has(idx(x,y)))return false;
  }
  return true;
}
function sweep(p){
  const cells=new Set(),d=DIRS[p.dir],h=p.points[p.points.length-1];
  for(let x=h[0]+d[0],y=h[1]+d[1];within(x,y);x+=d[0],y+=d[1])cells.add(idx(x,y));
  return cells;
}
function solveBoard(pieces){
  if(!Array.isArray(pieces)||!pieces.length)return {ok:false,sequence:[],reason:'empty'};
  const ids=new Set(),cells=new Set(),pending=pieces.slice();
  for(const p of pending){
    if(ids.has(p.id)||!validArrowGeometry(p))return {ok:false,sequence:[],reason:'invalid arrow geometry'};
    ids.add(p.id);
    for(const pt of p.points){const k=idx(pt[0],pt[1]);if(cells.has(k))return {ok:false,sequence:[],reason:'overlapping arrows'};cells.add(k);}
  }
  const sequence=[];
  while(pending.length){
    let move=-1;
    for(let i=0;i<pending.length;i++){
      const p=pending[i],d=DIRS[p.dir],h=p.points[p.points.length-1];
      let clear=true;
      for(let x=h[0]+d[0],y=h[1]+d[1];within(x,y);x+=d[0],y+=d[1]){
        if(cells.has(idx(x,y))){clear=false;break;}
      }
      if(clear){move=i;break;}
    }
    if(move<0)return {ok:false,sequence,reason:'deadlock with '+pending.length+' arrows'};
    const [p]=pending.splice(move,1);
    sequence.push(p.id);
    for(const q of p.points)cells.delete(idx(q[0],q[1]));
  }
  return {ok:true,sequence,reason:null};
}
// Build the full clear escape ray BEFORE growing the arrow. Every backwards
// step must avoid that ray, other pieces, and its own already visited cells.
function growFromExit(rand,seed,profile,occupied,stage,short=false){
  const dir=Math.floor(rand()*4);
  const d=DIRS[dir];
  // Bias toward a nearby edge, but do not restrict arrows to one orientation.
  let x=1+Math.floor(rand()*(MC-2)),y=1+Math.floor(rand()*(MR-2));
  const bias=rand();
  if(bias<.56){
    if(dir===0)x=Math.max(1,MC-2-Math.floor(rand()*Math.min(7,MC-2)));
    if(dir===2)x=Math.min(MC-2,1+Math.floor(rand()*Math.min(7,MC-2)));
    if(dir===1)y=Math.max(1,MR-2-Math.floor(rand()*Math.min(7,MR-2)));
    if(dir===3)y=Math.min(MR-2,1+Math.floor(rand()*Math.min(7,MR-2)));
  }
  const head=idx(x,y);
  if(occupied.has(head))return null;
  const lane=new Set();
  for(let xx=x+d[0],yy=y+d[1];within(xx,yy);xx+=d[0],yy+=d[1]){
    const k=idx(xx,yy);
    if(occupied.has(k))return null;
    lane.add(k);
  }
  const bx=x-d[0],by=y-d[1];
  if(!within(bx,by)||occupied.has(idx(bx,by)))return null;
  const visited=new Set([head,idx(bx,by)]);
  const reversed=[[x,y],[bx,by]];
  const maxEdges=profile.maxLength;
  const maxTurns=profile.maxTurns;
  let desired;
  if(short)desired=1+Math.floor(rand()*Math.min(3,maxEdges));
  else {
    const variation=rand();
    const cap=Math.min(maxEdges,2+Math.floor((.30+.70*variation)*maxEdges));
    desired=1+Math.floor(rand()*Math.max(1,cap));
    if(stage<.5&&rand()<.63)desired=Math.max(desired,Math.min(cap,4+Math.floor(rand()*5)));
  }
  let walk=(dir+2)%4,turns=0;
  // Fixed, finite number of choices per segment; no recursive backtracking.
  for(let step=1;step<desired;step++){
    const cur=reversed[reversed.length-1];
    const options=[];
    for(const nextDir of [walk,(walk+1)%4,(walk+3)%4]){
      if(nextDir!==walk&&turns>=maxTurns)continue;
      const nx=cur[0]+DIRS[nextDir][0],ny=cur[1]+DIRS[nextDir][1];
      if(!within(nx,ny))continue;
      const k=idx(nx,ny);
      if(occupied.has(k)||visited.has(k)||lane.has(k))continue;
      const n=fbm(nx*.17,ny*.17,seed+811);
      let weight=(nextDir===walk?1.8:1.0)+(nextDir===walk?.3:0)+n*.75;
      // Gradually vary shape without forcing difficulty to rise forever.
      if(nextDir!==walk&&maxTurns>0&&step<desired-1)weight+=.12;
      options.push({nextDir,nx,ny,k,weight});
    }
    if(!options.length)break;
    const total=options.reduce((s,o)=>s+o.weight,0);
    let roll=rand()*total;
    let chosen=options[options.length-1];
    for(const option of options){roll-=option.weight;if(roll<=0){chosen=option;break;}}
    if(chosen.nextDir!==walk)turns++;
    walk=chosen.nextDir;
    reversed.push([chosen.nx,chosen.ny]);visited.add(chosen.k);
  }
  // The last segment pointing out is predetermined by the initial backward step.
  return {id:0,dir,points:reversed.reverse()};
}
// Scores are aesthetics only: they never override geometry or solvability.
function chooseCandidate(p,pieces,occupied,profile,seed,rand,stage,mode){
  if(!p||!validArrowGeometry(p))return null;
  let dependencies=0;
  for(const old of pieces){
    // A new arrow may block existing ones, never the reverse; its own exit
    // was verified clear of all previously placed pieces.
    const r=sweep(old);
    if(p.points.some(q=>r.has(idx(q[0],q[1]))))dependencies++;
  }
  if(mode===0&&dependencies>profile.maxNewBlockers)return null;
  let bends=0;
  for(let i=2;i<p.points.length;i++){
    let a=p.points[i-2],b=p.points[i-1],c=p.points[i];
    if(b[0]-a[0]!==c[0]-b[0]||b[1]-a[1]!==c[1]-b[1])bends++;
  }
  if(bends>profile.maxTurns||p.points.length>profile.maxLength+1)return null;
  const center=p.points[Math.floor(p.points.length/2)];
  // Fractal bands create local clusters of different line shapes.
  const n=fbm(center[0]*.19,center[1]*.19,seed+42);
  const score=1.9*Math.min(dependencies,mode===0?3:5)+
    (stage<.65?1.0:.25)*Math.min(bends,4)+
    Math.min(12,p.points.length)*.13+n*1.6+rand()*.6;
  return score;
}
function build(level,seed,profile,attempt){
  const rand=rng((seed^Math.imul(level,2654435761)^Math.imul(attempt+1,0x9e3779b1))>>>0);
  const pieces=[],occupied=new Set();
  for(let n=0;n<profile.count;n++){
    const stage=n/profile.count;
    let best=null,bestScore=-Infinity;
    // Normal mode pursues varied shapes; relaxed mode prioritizes finishing
    // the required board size when a dense area is difficult to fill.
    for(let mode=0;mode<3&&!best;mode++){
      const budget=mode===0?42:mode===1?100:180;
      for(let trial=0;trial<budget;trial++){
        const p=growFromExit(rand,seed,profile,occupied,stage,mode===2);
        const score=chooseCandidate(p,pieces,occupied,profile,seed,rand,stage,mode);
        if(score===null)continue;
        if(score>bestScore){best=p;bestScore=score;}
        if(mode===0&&best&&trial>=15)break;
        if(mode===1&&best&&trial>=26)break;
        if(mode===2&&best)break;
      }
    }
    if(!best)break;
    best.id=n+1;
    pieces.push(best);
    for(const pt of best.points)occupied.add(idx(pt[0],pt[1]));
  }
  return pieces;
}
// Read-only complexity metrics for future difficulty tuning. They do NOT change
// how boards are generated, so a difficulty redesign can be tested independently.
function analyzeBoard(pieces){
  const owners=new Map();
  for(const p of pieces)for(const q of p.points)owners.set(idx(q[0],q[1]),p.id);
  const blockers=new Map();
  let totalTurns=0,totalCells=0;
  for(const p of pieces){
    const deps=new Set();
    const [dx,dy]=DIRS[p.dir],h=p.points[p.points.length-1];
    for(let x=h[0]+dx,y=h[1]+dy;within(x,y);x+=dx,y+=dy){
      const owner=owners.get(idx(x,y));
      if(owner!==undefined&&owner!==p.id)deps.add(owner);
    }
    blockers.set(p.id,deps);
    totalCells+=p.points.length;
    for(let j=2;j<p.points.length;j++){
      const a=p.points[j-2],b=p.points[j-1],c=p.points[j];
      if(b[0]-a[0]!==c[0]-b[0]||b[1]-a[1]!==c[1]-b[1])totalTurns++;
    }
  }
  const memo=new Map(),visiting=new Set();
  function depth(id){
    if(memo.has(id))return memo.get(id);
    if(visiting.has(id))return Infinity; // invalid cyclic dependency
    visiting.add(id);
    const d=blockers.get(id)||new Set();
    const value=1+(d.size?Math.max(...[...d].map(depth)):0);
    visiting.delete(id);memo.set(id,value);return value;
  }
  return {
    arrows:pieces.length,
    initialChoices:[...blockers.values()].filter(s=>s.size===0).length,
    blockingRelations:[...blockers.values()].reduce((n,s)=>n+s.size,0),
    longestDependencyChain:pieces.length?Math.max(...pieces.map(p=>depth(p.id))):0,
    totalTurns,
    averageCells:pieces.length?Number((totalCells/pieces.length).toFixed(2)):0
  };
}
function generate(level,seed){
  const profile=difficulty(level);
  MC=profile.cols;MR=profile.rows;
  seed=(Number(seed)>>>0);
  let lastFailure='';
  // Several deterministic attempts. Failed attempts are discarded, not returned.
  for(let attempt=0;attempt<12;attempt++){
    const pieces=build(level,seed,profile,attempt);
    if(pieces.length!==profile.count){lastFailure=`incomplete ${pieces.length}/${profile.count}`;continue;}
    const validation=solveBoard(pieces);
    if(!validation.ok){lastFailure=validation.reason;continue;}
    return pieces;
  }
  // Explicit failure is safer than publishing a misleading incomplete level.
  throw new Error('Unable to build a valid Level '+level+' ('+lastFailure+'). Please retry with another seed.');
}
if(typeof module!=='undefined'&&module.exports)module.exports={generate,canEscape,validArrowGeometry,occupiedOf,difficulty,within,idx,solveBoard,analyzeBoard,getDimensions:()=>({cols:MC,rows:MR})};
