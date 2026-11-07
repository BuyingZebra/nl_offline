'use strict';
let MC=26, MR=35;
function difficulty(level){
  const l=Math.max(1,Math.min(9999,Math.floor(level)||1));
  const grid=l<=3?[12,16]:l<=8?[14,19]:l<=15?[17,23]:l<=24?[20,27]:l<=35?[23,31]:[26,35];
  return {
    cols:grid[0],rows:grid[1],
    count:Math.min(49,l+2),
    maxTurns:l<=2?0:l<=5?1:l<=10?2:l<=18?3:l<=30?4:6,
    maxLength:l<=2?4:l<=5?6:l<=10?9:l<=20?13:18,
    maxNewBlockers:l<=2?0:l<=8?1:l<=20?2:l<=35?3:5,
    label:l<=5?'INTRO':l<=12?'EASY':l<=25?'BUILDING':l<=40?'TRICKY':'EXPERT'
  };
}
const DIRS=[[1,0],[0,1],[-1,0],[0,-1]];
const idx=(x,y)=>y*MC+x;
const within=(x,y)=>x>=0&&x<MC&&y>=0&&y<MR;
function rng(seed){let a=seed>>>0;return ()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;}}
function hash(x,y,seed){let v=(Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(seed|0,1442695041))|0;v=Math.imul(v^(v>>>13),1274126177);return ((v^(v>>>16))>>>0)/4294967295;}
function vnoise(x,y,s){const xx=Math.floor(x),yy=Math.floor(y);let fx=x-xx,fy=y-yy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);return (hash(xx,yy,s)*(1-fx)+hash(xx+1,yy,s)*fx)*(1-fy)+(hash(xx,yy+1,s)*(1-fx)+hash(xx+1,yy+1,s)*fx)*fy;}
function fbm(x,y,s){return .57*vnoise(x,y,s)+.29*vnoise(x*2.13,y*2.13,s+291)+.14*vnoise(x*4.39,y*4.39,s+732);}
function occupiedOf(pcs){const res=new Set();for(const p of pcs)for(const pt of p.points)res.add(idx(pt[0],pt[1]));return res;}
// Collisions include the arrow's OWN tail. The arrowhead must travel straight to
// the edge without passing through any occupied cell, including its own body.
// Structural geometry rule: an arrow is a single non-crossing grid path.
// Its head must point along the final segment, and the straight escape lane
// cannot run through ANY part of that same arrow. This rule is independent
// of other arrows and checked both during construction and before gameplay.
function validArrowGeometry(p){
  if(!p||!Array.isArray(p.points)||p.points.length<2||!DIRS[p.dir])return false;
  const seen=new Set(),parts=p.points;
  for(let i=0;i<parts.length;i++){
    const pt=parts[i],x=pt&&pt[0],y=pt&&pt[1];
    if(!Number.isInteger(x)||!Number.isInteger(y)||!within(x,y))return false;
    const key=idx(x,y);
    if(seen.has(key))return false;
    seen.add(key);
    if(i){const prev=parts[i-1];if(Math.abs(x-prev[0])+Math.abs(y-prev[1])!==1)return false;}
  }
  const h=parts[parts.length-1],before=parts[parts.length-2],d=DIRS[p.dir];
  if(h[0]-before[0]!==d[0]||h[1]-before[1]!==d[1])return false;
  let x=h[0]+d[0],y=h[1]+d[1];
  while(within(x,y)){
    if(seen.has(idx(x,y)))return false;
    x+=d[0];y+=d[1];
  }
  return true;
}
function canEscape(p,ob){
  if(!validArrowGeometry(p))return false;
  const own=new Set(p.points.slice(0,-1).map(q=>idx(q[0],q[1])));
  const d=DIRS[p.dir],h=p.points[p.points.length-1];
  let x=h[0]+d[0],y=h[1]+d[1];
  while(within(x,y)){
    const k=idx(x,y);
    if(own.has(k)||ob.has(k))return false;
    x+=d[0];y+=d[1];
  }
  return true;
}
function sweep(p){const r=new Set(),d=DIRS[p.dir],h=p.points[p.points.length-1];let x=h[0]+d[0],y=h[1]+d[1];while(within(x,y)){r.add(idx(x,y));x+=d[0];y+=d[1];}return r;}
function arrow(rand,seed,stage,profile){
  const x=Math.floor(1+rand()*(MC-2)),y=Math.floor(1+rand()*(MR-2));
  const local=fbm(x*.19,y*.19,seed+13);
  // Gentle fractal weighting: gradients steer arrows toward coherent bands.
  if(rand()>.58+.36*local) return null;
  let dir=Math.floor(rand()*4);
  if(rand()<.61){const ed=[MC-1-x,MR-1-y,x,y];const fav=ed.indexOf(Math.min(...ed));dir=rand()<.73?fav:(fav+((rand()<.5)?1:3))%4;}
  const points=[[x,y]],visited=new Set([idx(x,y)]);
  let segments;
  const variety=rand();
  if(profile.maxTurns===0)segments=1;
  else if(stage<.12)segments=2+Math.floor(rand()*Math.min(4,profile.maxTurns));
  else if(variety<.19)segments=1;
  else if(variety<.55)segments=2+Math.floor(rand()*2);
  else if(variety<.90)segments=3+Math.floor(rand()*3);
  else segments=4+Math.floor(rand()*3);
  if(stage>.58&&rand()<.55)segments=Math.min(segments,2+Math.floor(rand()*2));
  segments=Math.max(1,Math.min(segments,profile.maxTurns+1));
  let totalLength=0;
  let walk=(dir+2)%4;
  for(let s=0;s<segments;s++){
    if(s)walk=(walk+(rand()<.5?1:3))%4;
    const room=profile.maxLength-totalLength;
    if(room<1)break;
    const amount=Math.min(room,1+Math.floor(rand()*(s===0?3:rand()<.15?5:4)));
    totalLength+=amount;
    for(let i=0;i<amount;i++){
      const prev=points[points.length-1],xx=prev[0]+DIRS[walk][0],yy=prev[1]+DIRS[walk][1];
      if(!within(xx,yy)||visited.has(idx(xx,yy)))return null;
      visited.add(idx(xx,yy));points.push([xx,yy]);
    }
  }
  return {id:0,dir,points:points.reverse()};
}
// Independent whole-board validator. Unlike the generator's candidate check,
// this evaluates the complete final board and actually peels pieces away.
// Any valid move on a solved board must leave another solved board: removing
// obstacles never introduces a collision.
function solveBoard(pieces){
  if(!Array.isArray(pieces)||pieces.length===0)return {ok:false,sequence:[],reason:'empty'};
  const pending=pieces.slice(),cells=new Set(),ids=new Set();
  for(const p of pending){
    if(ids.has(p.id)||!validArrowGeometry(p)) return {ok:false,sequence:[],reason:'invalid arrow geometry (including self-crossing)'};
    ids.add(p.id);
    const local=new Set();
    for(let i=0;i<p.points.length;i++){
      const [x,y]=p.points[i];
      if(!Number.isInteger(x)||!Number.isInteger(y)||!within(x,y)) return {ok:false,sequence:[],reason:'off board'};
      const k=idx(x,y);
      if(cells.has(k)||local.has(k))return {ok:false,sequence:[],reason:'overlapping path'};
      cells.add(k);local.add(k);
      if(i){const q=p.points[i-1];if(Math.abs(x-q[0])+Math.abs(y-q[1])!==1)return {ok:false,sequence:[],reason:'disconnected path'};}
    }
  }
  const sequence=[];
  while(pending.length){
    let choice=-1;
    for(let i=0;i<pending.length;i++){
      const p=pending[i],d=DIRS[p.dir],h=p.points[p.points.length-1];
      let x=h[0]+d[0],y=h[1]+d[1],clear=true;
      while(within(x,y)){
        if(cells.has(idx(x,y))){clear=false;break;}
        x+=d[0];y+=d[1];
      }
      if(clear){choice=i;break;}
    }
    if(choice<0)return {ok:false,sequence,reason:'deadlock at '+pending.length+' arrows'};
    const [done]=pending.splice(choice,1);
    sequence.push(done.id);
    for(const q of done.points)cells.delete(idx(q[0],q[1]));
  }
  return {ok:true,sequence,reason:null};
}
function generateOnce(level,seed,profile){
  const rand=rng((seed^Math.imul(level,2654435761))>>>0);
  const desired=profile.count;
  const pieces=[];
  const occupied=new Set();
  for(let n=0;n<desired;n++){
    const corridors=[];
    for(const old of pieces){const rests=new Set(occupied);for(const q of old.points)rests.delete(idx(q[0],q[1]));if(canEscape(old,rests))corridors.push(sweep(old));}
    let best=null,top=-1e9;
    const tries=220+(n>29?160:0);
    for(let t=0;t<tries;t++){
      const p=arrow(rand,seed,n/desired,profile);
      if(!p||!validArrowGeometry(p)||p.points.some(q=>occupied.has(idx(q[0],q[1]))))continue;
      if(!canEscape(p,occupied))continue;
      let deps=0;for(const cor of corridors)if(p.points.some(q=>cor.has(idx(q[0],q[1]))))deps++;
      if(deps>profile.maxNewBlockers)continue;
      const mid=p.points[Math.floor(p.points.length/2)];
      const form=(p.points.length>4&&p.points.length<17?1:.35);
      let turns=0;
      for(let j=2;j<p.points.length;j++) {
        const a=p.points[j-2],b=p.points[j-1],c=p.points[j];
        if((b[0]-a[0])!==(c[0]-b[0])||(b[1]-a[1])!==(c[1]-b[1]))turns++;
      }
      const score=Math.min(3,deps)*3.4+form*.7+(n<desired*.12?Math.min(turns,5)*.85:Math.min(turns,3)*.20)+fbm(mid[0]*.19,mid[1]*.19,seed+42)*.8+rand()*2;
      if(score>top){top=score;best=p;}
      if(deps>=2&&t>35)break;
    }
    if(!best)break;
    best.id=n+1;
    pieces.push(best);
    for(const q of best.points)occupied.add(idx(q[0],q[1]));
  }
  return pieces;
}
function generate(level,seed){
  const profile=difficulty(level);
  MC=profile.cols;MR=profile.rows;
  const desired=profile.count;
  let best=[];
  for(let attempt=0;attempt<8;attempt++){
    const salt=attempt===0?seed:(seed^Math.imul(attempt,0x9e3779b1))>>>0;
    const result=generateOnce(level,salt,profile);
    // Never publish an unverified board, even if a future generator change
    // accidentally violates the reverse-construction invariant.
    const check=result.length?solveBoard(result):{ok:false};
    if(!check.ok)continue;
    if(result.length>best.length)best=result;
    if(best.length>=desired)return best;
  }
  return best;
}
if(typeof module!=='undefined'&&module.exports)module.exports={generate,canEscape,validArrowGeometry,occupiedOf,difficulty,within,idx,solveBoard,getDimensions:()=>({cols:MC,rows:MR})};