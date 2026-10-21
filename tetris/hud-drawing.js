/* V063 — Canvas2D HUD painting extracted without visual changes.
 * Caller supplies drawing primitives, live game state and existing button
 * registrar; the same UI can draw on the cached base or cropped canvases.
 */
export function createHudDrawing({panel,text,rect,key,smallPiece,getGame,getHighs,
 C,UI_SPACE,fmt}){
function drawSidebar(r){
 const game=getGame(),highs=getHighs();
 const short=r.short;
 const {holdPanel:hold,nextPanel:next,statsPanel:stats}=r;
 const sx=hold.x,sw=hold.w;
 panel(hold.x,hold.y,hold.w,hold.h,9,C.panel);
 text('HOLD',sx+sw/2,hold.y+13,9,C.weak,'center');
 smallPiece(game.hold,sx+(sw-80)/2,hold.y+23,80,Math.min(short?43:60,Math.max(12,hold.h-26)),'hold');
 panel(next.x,next.y,next.w,next.h,9,C.panel);
 text('NEXT',sx+sw/2,next.y+13,9,C.weak,'center');
 const previewH=Math.min(short?36:44,Math.max(9,(next.h-32)/3));
 for(let i=0;i<3;i++){
  smallPiece(game.queue[i],sx+(sw-80)/2,next.y+26+i*(previewH+1),80,previewH,'next');
 }
 panel(stats.x,stats.y,stats.w,stats.h,9,C.panel);
 text('BEST',sx+sw/2,stats.y+12,9,C.weak,'center');
 text(Math.max(highs[0]?.score||0,game.score),sx+sw/2,stats.y+30,13,C.ink,'center');
 text('PIECES',sx+sw/2,stats.y+52,9,C.weak,'center');
 text(game.pieces,sx+sw/2,stats.y+Math.min(70,stats.h-13),13,C.ink,'center');
}
function drawControls(r){
 const game=getGame();
 panel(r.dx,r.dy,r.dw,r.dh,12,C.panel);
 const px=r.dx+r.deckPad,pw=r.dw-2*r.deckPad,ly=r.dy+r.deckPad+7;
 const s=Math.max(13,Math.min(17,pw*.046));
 text('LEVEL',px+2,ly,9,C.weak,'left');
 text('SCORE',px+pw/2,ly,9,C.weak,'center');
 text('LINES',px+pw-2,ly,9,C.weak,'right');
 text(fmt(game.level,2),px+2,ly+23,s);
 text(fmt(game.score),px+pw/2,ly+23,s,C.ink,'center');
 text(fmt(game.lines,2),px+pw-2,ly+23,s,C.ink,'right');
 rect(px,r.dy+r.deckPad+UI_SPACE.scoreHeight-1,pw,1,C.border);
 const gap=UI_SPACE.padGap;
 const cy=r.dy+r.deckPad+UI_SPACE.scoreHeight+r.deckGap,ch=r.buttonH;
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
