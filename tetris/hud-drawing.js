/* V063 — Canvas2D HUD painting extracted without visual changes.
 * Caller supplies drawing primitives, live game state and existing button
 * registrar; the same UI can draw on the cached base or cropped canvases.
 */
// Square tetromino cells at every preview aspect ratio, including narrow phones.
export function fitPreviewCells(shape,x,y,w,h,role='next',targetCell=null){
 if(!Array.isArray(shape)||!(w>0)||!(h>0))return [];
 const points=[];
 for(let row=0;row<shape.length;row++){
  const values=shape[row];
  if(!Array.isArray(values))continue;
  for(let col=0;col<values.length;col++)if(values[col])points.push([col,row]);
 }
 if(!points.length)return [];
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 const minX=Math.min(...xs),minY=Math.min(...ys);
 const cols=Math.max(...xs)-minX+1,rows=Math.max(...ys)-minY+1;
 let size;
 if(Number.isFinite(targetCell)&&targetCell>0){
  // Exactly 75% of a gameplay cell on normal viewports; shrink only when
  // a constrained panel cannot contain the entire four-block piece.
  size=Math.min(targetCell,w/cols,h/rows);
 }else{
  // Preserve the legacy fit for external callers without a board-cell target.
  const sourceH=role==='hold'?90:75;
  const sourceCell=Math.min(21,(120-12)/cols,(sourceH-10)/rows);
  const scale=Math.min(w/120,h/sourceH);
  size=Math.min(sourceCell*scale,Math.max(0,w-4)/cols,Math.max(0,h-4)/rows);
 }
 if(!(size>0))return [];
 const startX=x+(w-size*cols)/2,startY=y+(h-size*rows)/2;
 return points.map(([col,row])=>({
  x:startX+(col-minX)*size,y:startY+(row-minY)*size,size
 }));
}

export function createHudDrawing({panel,text,rect,key,smallPiece,getGame,
 C,UI_SPACE,fmt}){
function drawSidebar(r){
 const game=getGame();
 const {nextPanel:next,statsPanel:stats,holdPanel:hold}=r;
 const inset=Math.max(3,Math.min(6,stats.w*.06));
 const preview=(box,kind,role)=>{
  // One compact panel only. The NEXT/HOLD label is outside its border.
  const heading=role==='next'?'NEXT':'HOLD';
  text(heading,box.x+box.w,box.y-r.previewLabelSpace/2,
   9,C.weak,'right',box.w);
  panel(box.x,box.y,box.w,box.h,0,C.panel);
  const pad=5;
  smallPiece(kind,box.x+pad,box.y+pad,
   Math.max(0,box.w-2*pad),Math.max(0,box.h-2*pad),
   role,r.previewCell);
 };
 preview(next,game.queue[0],'next');
 panel(stats.x,stats.y,stats.w,stats.h,0,C.panel);
 const rows=[['SCORE',fmt(game.score)],['LEVEL',fmt(game.level,2)],['LINES',fmt(game.lines,2)]];
 const slot=Math.max(1,(stats.h-8)/3);
 rows.forEach(([title,value],i)=>{
  const labelY=stats.y+6+i*slot+11;
  const valueY=labelY+Math.max(12,Math.min(20,slot*.38));
  text(title,stats.x+inset+1,labelY,9,C.weak,'left',Math.max(8,stats.w-2*inset));
  text(value,stats.x+inset+1,valueY,Math.max(11,Math.min(15,stats.w*.15)),
   C.ink,'left',Math.max(8,stats.w-2*inset),'terminal');
  if(i<2)rect(stats.x+inset,stats.y+6+(i+1)*slot,
   Math.max(0,stats.w-2*inset),1,C.border);
 });
 preview(hold,game.hold,'hold');
}
function drawControls(r){
 // V114: restore the enclosing controls panel; button geometry and hitboxes
 // stay exactly as before.
 panel(r.dx,r.dy,r.dw,r.dh,0,C.panel);
 const px=r.dx+r.deckPad,pw=r.dw-2*r.deckPad;
 // The score strip is now in the right-hand column; leave the approved
 // positions and dimensions of every game control unchanged.
 const cy=r.dy+r.deckPad,ch=r.buttonH;
 const gap=UI_SPACE.padGap;
 let ey;
 if(r.compactControls){
  // Narrow landscape: maintain usable touch targets by reflowing controls.
  const third=Math.max(0,(pw-2*gap)/3);
  key('◀',px,cy,third,ch,'left',{light:true,repeat:true});
  key('↻',px+third+gap,cy,third,ch,'cw');
  key('▶',px+2*(third+gap),cy,third,ch,'right',{light:true,repeat:true});
  key('DROP',px,cy+ch+gap,pw,ch,'soft',{light:true,repeat:true});
  ey=cy+2*(ch+gap);
 }else{
  const col=Math.max(0,(pw-gap*4)/5);
  key('◀',px,cy,col,ch,'left',{light:true,repeat:true});
  key('DROP',px+col+gap,cy,col*2+gap,ch,'soft',{light:true,repeat:true});
  key('▶',px+col*3+gap*3,cy,col,ch,'right',{light:true,repeat:true});
  key('↻',px+col*4+gap*4,cy,col,ch,'cw');
  ey=cy+ch+r.deckGap;
 }
 // Keep the secondary controls centered at their approved 75% width.
 const extraGap=UI_SPACE.extrasGap;
 const ew=(pw-extraGap)/2*UI_SPACE.buttonWidthScale;
 const groupW=ew*2+extraGap,groupX=px+(pw-groupW)/2;
 key('HOLD',groupX,ey,ew,r.extraH,'hold');
 key('PAUSE',groupX+ew+extraGap,ey,ew,r.extraH,'pause');
}

 return Object.freeze({drawSidebar,drawControls});
}
