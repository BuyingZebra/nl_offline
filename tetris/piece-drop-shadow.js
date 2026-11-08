/* NOMAD V159 — raised tetromino shadows cast onto the grid.
 * Uses the SAME shadow distance and peak darkness as the playfield inset:
 * depth = clamp(tile * .8, 8, 20); opacity .58 / .42 / .24.
 * No texture changes, per-tile bevels, canvas filters, or extra render pass.
 */
const ROWS=20,COLS=10;
const depthForTile=tile=>Math.min(20,Math.max(8,tile*.8));

// One occupied silhouette for locked + falling cells. Touching tiles share
// an outer edge, avoiding black seams through an intact tetromino shape.
export function pieceShadowOccupancy(board,active=null,hiddenRows=null){
 const cells=Array.from({length:ROWS},(_,y)=>Array.from(
  {length:COLS},(_,x)=>Boolean(board?.[y]?.[x])&&!hiddenRows?.has(y)));
 if(active?.matrix)active.matrix.forEach((row,dy)=>row.forEach((kind,dx)=>{
  if(!kind)return;
  const x=active.x+dx,y=active.y+dy;
  if(Number.isInteger(x)&&Number.isInteger(y)&&
     x>=0&&x<COLS&&y>=0&&y<ROWS)cells[y][x]=true;
 }));
 return cells;
}

// Every edge has an explicit linear gradient from the silhouette (dark) to
// the distant grid (transparent). The black is painted AFTER the grid,
// BEFORE the authored tile SVGs, so it gradually hides grid lines without
// dimming the actual piece art. The board's existing clip owns all bounds.
export function drawPieceShadowGradients(g,cells,offX,offY,tile){
 if(!(tile>0))return;
 const depth=depthForTile(tile);
 const occupied=(x,y)=>x>=0&&x<COLS&&y>=0&&y<ROWS&&Boolean(cells?.[y]?.[x]);
 const fade=(x0,y0,x1,y1,x,y,w,h,alpha)=>{
  if(!(w>0&&h>0))return;
  const gradient=g.createLinearGradient(x0,y0,x1,y1);
  gradient.addColorStop(0,'rgba(0,0,0,'+alpha+')');
  gradient.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=gradient;
  g.fillRect(x,y,w,h);
 };
 // Coalesce uninterrupted cell edges into one fade to keep each piece
 // silhouette smooth and avoid one gradient allocation per block.
 for(let y=0;y<ROWS;y++)for(const side of ['top','bottom']){
  const delta=side==='top'?-1:1,alpha=side==='bottom'?.58:.24;
  for(let x=0;x<COLS;){
   if(!occupied(x,y)||occupied(x,y+delta)){x++;continue;}
   const begin=x;
   while(x<COLS&&occupied(x,y)&&!occupied(x,y+delta))x++;
   const edgeY=offY+(y+(side==='bottom'?1:0))*tile;
   const startX=offX+begin*tile,length=(x-begin)*tile;
   if(side==='bottom')fade(startX,edgeY,startX,edgeY+depth,
    startX,edgeY,length,depth,alpha);
   else fade(startX,edgeY,startX,edgeY-depth,
    startX,edgeY-depth,length,depth,alpha);
  }
 }
 for(let x=0;x<COLS;x++)for(const side of ['left','right']){
  const delta=side==='left'?-1:1,alpha=side==='right'?.42:.24;
  for(let y=0;y<ROWS;){
   if(!occupied(x,y)||occupied(x+delta,y)){y++;continue;}
   const begin=y;
   while(y<ROWS&&occupied(x,y)&&!occupied(x+delta,y))y++;
   const edgeX=offX+(x+(side==='right'?1:0))*tile;
   const startY=offY+begin*tile,length=(y-begin)*tile;
   if(side==='right')fade(edgeX,startY,edgeX+depth,startY,
    edgeX,startY,depth,length,alpha);
   else fade(edgeX,startY,edgeX-depth,startY,
    edgeX-depth,startY,depth,length,alpha);
  }
 }
 // Radial corner quarters connect the straight fades without squared-off
 // corners. Only EXPOSED convex corners contribute; interior seams do not.
 for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
  if(!occupied(x,y))continue;
  for(const [dx,dy,alpha] of [
   [-1,-1,.24],[1,-1,.24],[-1,1,.42],[1,1,.58]
  ]){
   if(occupied(x+dx,y)||occupied(x,y+dy))continue;
   const cx=offX+(x+(dx===1?1:0))*tile;
   const cy=offY+(y+(dy===1?1:0))*tile;
   const gradient=g.createRadialGradient(cx,cy,0,cx,cy,depth);
   gradient.addColorStop(0,'rgba(0,0,0,'+alpha+')');
   gradient.addColorStop(1,'rgba(0,0,0,0)');
   g.fillStyle=gradient;
   g.fillRect(dx===1?cx:cx-depth,dy===1?cy:cy-depth,depth,depth);
  }
 }
}
