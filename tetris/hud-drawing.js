/* V063 — Canvas2D HUD painting extracted without visual changes.
 * Caller supplies drawing primitives, live game state and existing button
 * registrar; the same UI can draw on the cached base or cropped canvases.
 */
export function createHudDrawing({panel,text,rect,key,smallPiece,getGame,getHighs,
 C,UI_SPACE,fmt}){
function drawSidebar(r){
 const game=getGame();
 const {nextPanel:next,statsPanel:stats,holdPanel:hold}=r;
 const inset=Math.max(3,Math.min(6,next.w*.06));
 const label=(word,x,y)=>text(word,x+inset+1,y+15,9,C.weak,'left',Math.max(8,next.w-2*inset-2));
 const nested=(box,kind,role)=>{
  panel(box.x,box.y,box.w,box.h,0,C.panel);
  label(role==='next'?'NEXT':'HOLD',box.x,box.y);
  const ix=box.x+inset,iy=box.y+25;
  const iw=Math.max(1,box.w-2*inset),ih=Math.max(1,box.h-25-inset);
  if(iw<=1||ih<=1)return;
  panel(ix,iy,iw,ih,0,C.bg,C.border);
  // One visible upcoming piece, as in the original Tetris display.
  const pw=Math.max(1,iw-6),ph=Math.max(1,Math.min(role==='next'?68:72,ih-6));
  smallPiece(kind,ix+(iw-pw)/2,iy+(ih-ph)/2,pw,ph,role);
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
   Math.max(0,stats.w-2*inset),1,C.subtleBorder);
 });
 nested(hold,game.hold,'hold');
}
function drawControls(r){
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
  key('DROP',px,cy+ch+gap,pw,ch,'hard',{light:true});
  ey=cy+2*(ch+gap);
 }else{
  const col=Math.max(0,(pw-gap*4)/5);
  key('◀',px,cy,col,ch,'left',{light:true,repeat:true});
  key('DROP',px+col+gap,cy,col*2+gap,ch,'hard',{light:true});
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
