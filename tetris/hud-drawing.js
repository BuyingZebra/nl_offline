/* V063 — Canvas2D HUD painting extracted without visual changes.
 * Caller supplies drawing primitives, live game state and existing button
 * registrar; the same UI can draw on the cached base or cropped canvases.
 */
// Square tetromino cells at every preview aspect ratio, including narrow phones.
export function fitPreviewCells(shape,x,y,w,h,role='next'){
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
 const sourceH=role==='hold'?90:75;
 const sourceCell=Math.min(21,(120-12)/cols,(sourceH-10)/rows);
 // Scale both axes equally; independent X/Y scaling distorted the tiles.
 const scale=Math.min(w/120,h/sourceH);
 const size=Math.min(sourceCell*scale,Math.max(0,w-4)/cols,Math.max(0,h-4)/rows);
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
 const inset=Math.max(3,Math.min(6,next.w*.06));
 const label=(word,x,y)=>text(word,x+inset+1,y+15,9,C.weak,'left',Math.max(8,next.w-2*inset-2));
 const nested=(box,kind,role)=>{
  panel(box.x,box.y,box.w,box.h,0,C.panel);
  label(role==='next'?'NEXT':'HOLD',box.x,box.y);
  // The outer panel can be rectangular for its left-aligned label.
  // The nested piece frame is a true square with equal visual padding.
  const labelSpace=25;
  const availableH=Math.max(0,box.h-labelSpace-inset);
  const side=Math.min(Math.max(0,box.w-2*inset),availableH);
  if(side<=1)return;
  const ix=box.x+(box.w-side)/2;
  const iy=box.y+labelSpace+(availableH-side)/2;
  panel(ix,iy,side,side,0,C.bg,C.border);
  const preview=Math.max(1,side-6);
  smallPiece(kind,ix+(side-preview)/2,iy+(side-preview)/2,preview,preview,role);
 };
 nested(next,game.queue[0],'next');
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
 nested(hold,game.hold,'hold');
}
function drawControls(r){
 // V127: a shared outer screen border replaces the old deck container.
 // The cropped layer already clears this area to standard screen black.
 // All six buttons keep their original layout, geometry and hitboxes.
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
