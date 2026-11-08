/* NOMAD V163 — deeper per-piece raised cast shadows.
 * Preserve core piece IDs and current rotated matrices. Pre-rasterized stamps
 * are cached by SILHOUETTE (not position) for fast movement and rotation on iOS.
 * Shadows darken the floor/grid only; SVG piece artwork remains untouched.
 */
const COLS=10,ROWS=20;
const depthForTile=tile=>Math.min(20,Math.max(8,tile*.8));
const cappedDpr=n=>Math.max(1,Math.min(3,Number(n)||1));

// Respect immutable boardMeta.pieceId even when two independent tetrominoes
// share edges or have been split by completed rows. Fallback legacy cells
// have distinct IDs rather than merging every connected block.
export function collectPieceShadowGroups(board,meta,active=null,hiddenRows=null){
 const groups=new Map();
 function add(id,x,y){
  if(!Number.isInteger(x)||!Number.isInteger(y)||
     x<0||x>=COLS||y<0||y>=ROWS)return;
  if(!groups.has(id))groups.set(id,[]);
  groups.get(id).push({x,y});
 }
 for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
  if(!board?.[y]?.[x]||hiddenRows?.has(y))continue;
  const pieceId=meta?.[y]?.[x]?.pieceId;
  add(Number.isSafeInteger(pieceId)&&pieceId>0?'locked:'+pieceId:'cell:'+x+':'+y,x,y);
 }
 // A new group is rebuilt from the live matrix EVERY repaint. Rotations,
 // wall kicks, gravity and hold therefore update the silhouette immediately.
 if(active?.matrix){
  const id='active:'+(Number.isSafeInteger(active.id)?active.id:'current');
  active.matrix.forEach((row,dy)=>row.forEach((kind,dx)=>{
   if(kind)add(id,active.x+dx,active.y+dy);
  }));
 }
 return [...groups].map(([id,cells])=>{
  cells.sort((a,b)=>a.y-b.y||a.x-b.x);
  const minX=Math.min(...cells.map(c=>c.x)),minY=Math.min(...cells.map(c=>c.y));
  const maxX=Math.max(...cells.map(c=>c.x)),maxY=Math.max(...cells.map(c=>c.y));
  return {id,cells,minX,minY,maxX,maxY};
 });
}

export function pieceShadowProfile(tile){
 const depth=depthForTile(tile);
 return Object.freeze({
  // Keep the existing shadow reach, but deepen its projection so phosphor
  // bloom doesn't wash it out. An opaque central shadow is offset below
  // the piece, while a soft penumbra gradually extinguishes the grid.
  cast:{blur:depth,offsetX:6,offsetY:7,alpha:1},
  core:{blur:5,offsetX:6,offsetY:7,alpha:1},
  // Tight contact shadow preserves the apparent separation at each edge.
  contact:{blur:2.25,offsetX:2.5,offsetY:3.5,alpha:1},
  depth
 });
}

export function createPieceShadowRenderer({
 createCanvas=()=>document.createElement('canvas'),
 pixelRatio=()=>1,capacity=48
}={}){
 const cache=new Map();
 const limit=Math.max(1,Math.floor(capacity)||48);
 function stamp(group,tile,dpr){
  const profile=pieceShadowProfile(tile);
  const normalized=group.cells.map(c=>(c.x-group.minX)+','+(c.y-group.minY)).sort().join(';');
  const key=tile.toFixed(4)+'@'+dpr.toFixed(2)+':'+normalized;
  const prev=cache.get(key);
  if(prev){cache.delete(key);cache.set(key,prev);return prev;}
  const pad=Math.ceil(profile.depth*2+Math.max(
   profile.cast.offsetX,profile.cast.offsetY)+4);
  const shapeW=(group.maxX-group.minX+1)*tile;
  const shapeH=(group.maxY-group.minY+1)*tile;
  const width=shapeW+2*pad,height=shapeH+2*pad;
  const canvas=createCanvas();
  canvas.width=Math.ceil(width*dpr);canvas.height=Math.ceil(height*dpr);
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)return null;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const silhouette=()=>{
   ctx.beginPath();
   for(const {x,y} of group.cells)ctx.rect(
    pad+(x-group.minX)*tile,pad+(y-group.minY)*tile,tile,tile);
  };
  // Apply physical pixel offsets to Canvas2D shadow props because shadowBlur
  // and shadowOffset are not transformed with the canvas coordinate matrix.
  for(const layer of [profile.cast,profile.core,profile.contact]){
   ctx.save();
   ctx.fillStyle='#000000';
   ctx.shadowColor='rgba(0,0,0,'+layer.alpha+')';
   ctx.shadowBlur=layer.blur*dpr;
   ctx.shadowOffsetX=layer.offsetX*dpr;
   ctx.shadowOffsetY=layer.offsetY*dpr;
   silhouette();ctx.fill();
   ctx.restore();
  }
  // Erase each source silhouette from the offscreen shadow, so transparent
  // motifs in the actual SVG pieces still show their correct original floor.
  ctx.save();
  ctx.globalCompositeOperation='destination-out';
  ctx.fillStyle='#000000';
  silhouette();ctx.fill();
  ctx.restore();
  const item={canvas,width,height,pad};
  if(cache.size>=limit)cache.delete(cache.keys().next().value);
  cache.set(key,item);
  return item;
 }
 function draw(g,groups,offX,offY,tile){
  if(!(tile>0)||!groups?.length)return 0;
  const dpr=cappedDpr(pixelRatio());
  let drawn=0;
  // The board's existing clip confines every shadow to the recessed floor.
  for(const group of groups){
   if(!group.cells.length)continue;
   const item=stamp(group,tile,dpr);
   if(!item)continue;
   g.drawImage(item.canvas,
    offX+group.minX*tile-item.pad,
    offY+group.minY*tile-item.pad,item.width,item.height);
   drawn++;
  }
  return drawn;
 }
 return Object.freeze({
  draw,dispose:()=>cache.clear(),
  get cacheSize(){return cache.size;}
 });
}
