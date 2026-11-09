/* Canvas controls, overlays, sidebar and terminal. */
import {buttonLevel,buttonInkLevel} from './crt.js?v180';
import {makeRegion,makeButtonControl,makeSliderControl} from './input.js?v180';

/* Tetris System V052 — Canvas2D drawing primitives.
 * Drawing targets and hitboxes are caller-owned and resolve on each draw,
 * allowing the same primitives to draw gameplay and modal canvases.
 */
export function createCanvasUI({getContext,getRegions,C,FONT,
 LETTER_SPACING_EM,MAIN_ACTION_LABELS,BUTTON_ICON_LABELS,
 MAIN_ACTION_FONT_SIZE,BUTTON_FONT_SIZE,BUTTON_ICON_FONT_SIZE,
 getButtonPower=()=>0,ICON_FONT=FONT,TERMINAL_FONT=FONT}){
function panel(x,y,w,h,r=8,fill=C.panel,border=C.border){
 const g=getContext();
 if(w<=0||h<=0)return;
 // All UI containers and buttons have square (unbeveled) corners.
 // Preserve existing fills, grayscale luminance, borders and hitbox geometry.
 g.beginPath();g.roundRect(x+.5,y+.5,Math.max(1,w-1),Math.max(1,h-1),0);
 if(fill){g.fillStyle=fill;g.fill();}
 if(border){g.strokeStyle=border;g.lineWidth=1;g.stroke();}
}
// No per-label overrides. Canvas fillText(maxWidth) compresses glyph widths,
// so measure naturally and wrap only text that exceeds a caller's available width.
function wrapText(source,maxWidth){
 const g=getContext();
 const paragraphs=String(source).split('\n');
 if(!Number.isFinite(maxWidth))return paragraphs;
 const limit=Math.max(1,maxWidth),lines=[];
 for(const paragraph of paragraphs){
  if(g.measureText(paragraph).width<=limit){lines.push(paragraph);continue;}
  let line='';
  for(const word of paragraph.trim().split(/\s+/)){
   const joined=line?line+' '+word:word;
   if(g.measureText(joined).width<=limit){line=joined;continue;}
   if(line){lines.push(line);line='';}
   if(g.measureText(word).width<=limit){line=word;continue;}
   for(const ch of Array.from(word)){
    if(line&&g.measureText(line+ch).width>limit){lines.push(line);line='';}
    line+=ch;
   }
  }
  lines.push(line);
 }
 return lines;
}
function text(str,x,y,size=12,color=C.ink,align='left',maxWidth=Infinity,role='ui'){
 const g=getContext();
 // Fallout 4 roles: Roboto Condensed for the UI, Share Tech Mono for data.
 const isIcon=BUTTON_ICON_LABELS.has(String(str))||str==='▶';
 const terminal=role==='terminal'&&!isIcon;
 g.font=(terminal?'400 ':'700 ')+size+'px '+
  (isIcon?ICON_FONT:terminal?TERMINAL_FONT:FONT);
 g.textAlign=align;
 g.letterSpacing=(size*LETTER_SPACING_EM).toFixed(3)+'px';
 g.fillStyle=color;
 const lines=wrapText(str,maxWidth),step=size*1.2;
 for(let i=0;i<lines.length;i++){
  const line=lines[i],centerY=y+(i-(lines.length-1)/2)*step;
  // Canvas "middle" tracks the em box, not the ink of the selected font.
  // Align the measured visible glyph bounds with the existing text anchor.
  g.textBaseline='alphabetic';
  const metrics=g.measureText(line);
  const ascent=metrics.actualBoundingBoxAscent;
  const descent=metrics.actualBoundingBoxDescent;
  if(Number.isFinite(ascent)&&Number.isFinite(descent)&&ascent+descent>0){
   g.fillText(line,x,centerY+(ascent-descent)/2);
  }else{
   // Older contexts exposing width alone keep the previous behavior.
   g.textBaseline='middle';
   g.fillText(line,x,centerY);
  }
 }
 g.letterSpacing='0px';
}
function rect(x,y,w,h,color){const g=getContext();g.fillStyle=color;g.fillRect(x,y,w,h);}
function region(x,y,w,h,act,opts={}){const model=makeRegion(x,y,w,h,act,opts);getRegions().push(model);return model;}
// All visible button emission is set at the source, not by a later rectangle.
 const grayLevel=n=>{const v=Math.max(0,Math.min(255,Math.round(n)));return 'rgb('+v+','+v+','+v+')';};
 const buttonLight=(x,y,w,h)=>{
  const power=getButtonPower({x,y,w,h});
  return buttonLevel(power);
 };
function key(label,x,y,w,h,act,opts={}){
 const model=makeButtonControl(label,x,y,w,h,act,opts);
 const power=Math.max(0,Math.min(1,Number(getButtonPower(model.hitbox))||0));
 const lit=grayLevel(buttonLevel(power));
 // Negative-space text in solid buttons follows the press (6→30) without
 // disappearing into the bright solid face (206→255).
 const inverseInk=grayLevel(buttonInkLevel(power));
 const size=MAIN_ACTION_LABELS.has(String(model.label))?MAIN_ACTION_FONT_SIZE:
  BUTTON_ICON_LABELS.has(String(model.label))?BUTTON_ICON_FONT_SIZE:BUTTON_FONT_SIZE;
 // V165: keep button artwork as a single flat face. Solid buttons
 // remain exactly the approved full luminance (206 base, 255 pressed);
 // press afterglow, text, stroke, and hitboxes are unchanged.
 panel(model.x,model.y,model.w,model.h,8,model.light?lit:C.button,lit);
 text(model.label,model.x+model.w/2,model.y+model.h/2,size,
  model.light?inverseInk:lit,'center',Math.max(10,model.w-14));
 if(model.arrow)text('▶',model.x+17,model.y+model.h/2,
  BUTTON_ICON_FONT_SIZE,model.light?inverseInk:lit,'center');
 getRegions().push(model.hitbox);
 return model;
}

 return Object.freeze({panel,wrapText,text,rect,region,key,buttonLight});
}

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
 // V141: the same square double-border housing for all five boxes.
 const doubleFrame=(x,y,w,h)=>{
  const rim=Math.min(4,Math.max(2,(h-12)/2));
  panel(x,y,w,h,0,C.panel,C.border);
  if(w>rim*2+1&&h>rim*2+1)
   panel(x+rim,y+rim,w-rim*2,h-rim*2,0,null,C.bright);
  return rim;
 };
 const preview=(box,kind,role)=>{
  // One compact panel only. The NEXT/HOLD label is outside its border.
  const heading=role==='next'?'NEXT':'HOLD';
  // The panel aligns right with the header/footer; the label itself
  // stays left-aligned, just outside the panel's top edge.
  text(heading,box.x+inset+1,box.y-r.previewLabelSpace/2,
   9,C.weak,'left',Math.max(8,box.w-2*inset));
  doubleFrame(box.x,box.y,box.w,box.h);
  const pad=5;
  smallPiece(kind,box.x+pad,box.y+pad,
   Math.max(0,box.w-2*pad),Math.max(0,box.h-2*pad),
   role,r.previewCell);
 };
 preview(next,game.queue[0],'next');
 // Three independent flat LCD readouts, not one combined score panel.
 // Labels live outside their boxes; every box has the SAME right-aligned
 // width (also matching the NEXT and HOLD containers).
 const readouts=[['SCORE',fmt(game.score)],['LEVEL',fmt(game.level,2)],['LINES',fmt(game.lines,2)]];
 const slot=stats.h/3;
 const titleSpace=Math.min(15,Math.max(8,slot*.31));
 const bottomGap=Math.min(5,Math.max(2,slot*.10));
 const readoutHeight=Math.max(1,slot-titleSpace-bottomGap);
 readouts.forEach(([title,value],i)=>{
  const top=stats.y+i*slot,boxY=top+titleSpace;
  text(title,stats.x+inset+1,top+titleSpace*.50,9,C.weak,
   'left',Math.max(8,stats.w-2*inset));
  const rim=doubleFrame(stats.x,boxY,stats.w,readoutHeight);
  // Terminal data values are LEFT aligned within their frames.
  const valueInset=Math.max(10,Math.min(12,stats.w*.14));
  const digitSize=Math.max(10,Math.min(16,stats.w*.175,readoutHeight*.54));
  text(value,stats.x+valueInset,boxY+readoutHeight/2,digitSize,
   C.ink,'left',Math.max(8,stats.w-valueInset-rim-4),'terminal');
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

/* V064 — isolated Canvas2D settings and modal interface.
 * All original drawing primitives/layout measurements are preserved.
 * State is limited to menu scroll, scanline picker, status and view hit area.
 * No WebGL, frame-scheduler, or gameplay dependencies.
 */
export function createModalUI({
 document,SHAPES,DISPLAY_EFFECTS,SCANLINE_CHOICES,
 getViewport,layout,insets,clearRegions,getContext,
 panel,text,rect,region,key,buttonLight,gray,clamp,fmt,C,UI_SPACE,BUTTON_ICON_FONT_SIZE,
 getFX,activeScanlinePreset,settingValue,chooseScanlineSetting,invalidate,setScrollVelocity,
 getBest,getGame,getModal
}){
 const PREVIEW_SIZE=96,SETTINGS_SQUARE_SIZE=15;
 let modalView=null,optionsScroll=0,optionsMaxScroll=0;
 let scanlineMenuOpen=false,debugCopyState='idle';
// Menu geometry shares the six-pixel unit and the existing 46/42/37px
// phosphor/settings, HOLD and PAUSE button height.
function modalBounds(name){
 const {W,H}=getViewport();
 const safe=insets(),pad=UI_SPACE.unit,gap=UI_SPACE.unit;
 const buttonH=layout().headerButtonH;
 // Display System is its own full-screen view, not a 410px floating dialog.
 // Its title and fixed bottom control still respect the iPhone safe areas.
 if(name==='options')return {w:W,h:H,x:0,y:0,pad,gap,buttonH,
  safeTop:safe.top,safeBottom:safe.bottom};
 // The personal record fills the existing blurred playfield.
 // Unusually narrow landscape boards need a wider, legible overlay.
 if(name==='scores'){
  const b=layout(),narrow=b.boardW<205||b.boardH<310;
  if(narrow){
   const w=Math.min(410,W-2*UI_SPACE.padX);
   const h=Math.min(330,Math.max(0,H-safe.top-safe.bottom-2*gap));
   return {x:(W-w)/2,y:safe.top+(H-safe.top-safe.bottom-h)/2,
    w,h,pad,gap,buttonH:b.extraH,secondaryH:b.overlaySecondaryH,landscapeFallback:true};
  }
  return {x:b.boardX,y:b.boardY,w:b.boardW,h:b.boardH,pad,gap,
   buttonH:b.extraH,secondaryH:b.overlaySecondaryH,landscapeFallback:false};
 }
 const usable=Math.max(0,H-safe.top-safe.bottom);
 const wanted=2*pad+4*buttonH+4*gap+18;
 const w=Math.max(0,Math.min(410,W-2*UI_SPACE.padX));
 const h=Math.max(0,Math.min(wanted,usable-2*gap));
 return {w,h,x:(W-w)/2,y:safe.top+(usable-h)/2,pad,gap,buttonH};
}
// All visual previews share the very same T tetromino matrix and base image
// treatment. Per-effect rendering alters ONLY the effect, not the subject.
// The same real T tetromino and dim grayscale phosphor screen appear in every
// effect preview. These neutral pixels are tinted later by the EXISTING GPU.
function effectPreview(id){
 const canvas=document.createElement('canvas');
 canvas.width=PREVIEW_SIZE;canvas.height=PREVIEW_SIZE;
 const p=canvas.getContext('2d');if(!p)return canvas;
 const n=PREVIEW_SIZE;
 p.fillStyle=gray(26);p.fillRect(0,0,n,n);
 p.fillStyle=gray(31);
 for(let v=8;v<n;v+=8){p.fillRect(v,0,1,n);p.fillRect(0,v,n,1);}
 if(id==='phosphor'){
  // A single fully solid inset square; the edge gap is intentionally empty.
  p.fillStyle=gray(173);p.fillRect(13,13,n-26,n-26);
  return canvas;
 }
 if(id==='sound'){
  p.fillStyle=gray(193);
  [16,27,43,54,35,23].forEach((h,i)=>p.fillRect(15+i*12,70-h,7,h));
  return canvas;
 }
 const matrix=SHAPES.T,cells=[],size=20;
 for(let ry=0;ry<matrix.length;ry++)
  for(let rx=0;rx<matrix[ry].length;rx++)
   if(matrix[ry][rx])cells.push([rx,ry]);
 const drawPiece=(ghost=false)=>{
  p.save();if(ghost)p.globalAlpha=.43;
  for(const [cx,cy] of cells){
   const x=18+cx*size,y=28+cy*size;
   if(ghost){
    p.strokeStyle=gray(222);p.lineWidth=2;
    p.strokeRect(x+2,y+2,size-4,size-4);
    p.fillStyle=gray(58);p.fillRect(x+4,y+4,size-8,size-8);
   }else{
    // Bright outline and dark face emulate the approved Fallout thumbnail.
    p.fillStyle=gray(201);p.fillRect(x+1,y+1,size-2,size-2);
    p.fillStyle=gray(94);p.fillRect(x+3,y+4,size-6,size-7);
    p.fillStyle=gray(229);p.fillRect(x+3,y+2,size-6,2);
    p.fillStyle=gray(165);p.fillRect(x+3,y+4,2,size-7);
   }
  }
  p.restore();
 };
 if(id==='ghost'){
  p.save();p.globalAlpha=.33;p.translate(-8,2);drawPiece();p.restore();
  p.save();p.globalAlpha=.48;p.translate(8,-2);drawPiece();p.restore();
  drawPiece();
 }else if(id==='softness'){
  p.save();p.filter='blur(4.2px)';drawPiece();p.restore();
 }else if(id==='bloom'){
  p.save();p.shadowColor=gray(240);p.shadowBlur=22;drawPiece();p.restore();
  p.save();p.globalAlpha=.24;p.filter='blur(7px)';drawPiece();p.restore();
 }else if(id==='piece'){drawPiece(true);}
 else{
  drawPiece();
  if(id==='scanlines'){
   p.fillStyle='rgba(0,0,0,.68)';
   for(let y=0;y<n;y+=5)p.fillRect(0,y,n,2);
  }else if(id==='vignette'){
   const mask=p.createRadialGradient(48,48,8,48,48,66);
   mask.addColorStop(0,'rgba(0,0,0,0)');
   mask.addColorStop(.45,'rgba(0,0,0,.09)');
   mask.addColorStop(1,'rgba(0,0,0,.98)');
   p.fillStyle=mask;p.fillRect(0,0,n,n);
  }
 }
 return canvas;
}
const EFFECT_PREVIEWS=Object.fromEntries(
 DISPLAY_EFFECTS.map(effect=>[effect.id,effectPreview(effect.id)]));
// Match the shared square panel outline around every thumbnail, with a
// subtle 1px light-top/left and dark-bottom/right rim for terminal-style bevel.
function drawEffectThumbnail(id,x,y,size){
 const g=getContext();
 panel(x,y,size,size,9,C.panel,C.border);
 const inset=3,inner=Math.max(1,size-2*inset);
 g.save();
 g.beginPath();
 g.rect(x+inset,y+inset,inner,inner);
 g.clip();
 g.drawImage(EFFECT_PREVIEWS[id],x+inset,y+inset,inner,inner);
 g.restore();
 g.save();
 g.lineWidth=1;
 g.strokeStyle=gray(128);
 g.beginPath();
 g.moveTo(x+9,y+1.5);g.lineTo(x+size-9,y+1.5);
 g.moveTo(x+1.5,y+9);g.lineTo(x+1.5,y+size-9);
 g.stroke();
 g.strokeStyle=gray(45);
 g.beginPath();
 g.moveTo(x+9,y+size-1.5);g.lineTo(x+size-9,y+size-1.5);
 g.moveTo(x+size-1.5,y+9);g.lineTo(x+size-1.5,y+size-9);
 g.stroke();
 g.restore();
}
function selectedScanlineChoice(){const FX=getFX();return FX.scanlines?activeScanlinePreset(FX.scanlinePreset).id:'off';}
function toggleScanlineMenu(){
 scanlineMenuOpen=!scanlineMenuOpen;setScrollVelocity(0);invalidate();
}
function chooseScanline(id){
 if(!SCANLINE_CHOICES.some(choice=>choice.id===id))return;
 chooseScanlineSetting(id);
 scanlineMenuOpen=false;setScrollVelocity(0);invalidate();
}
function settingSquare(x,y,size,active,color=C.bright){
 const g=getContext();
 g.lineWidth=1;
 if(active){g.fillStyle=color;g.fillRect(x,y,size,size);}
 else{g.strokeStyle=color;g.strokeRect(x+.5,y+.5,size-1,size-1);}
}
function settingsExpandArrow(x,y,expanded,color){
 const g=getContext();
 g.save();g.translate(x,y);if(expanded)g.rotate(Math.PI/2);
 text('▶',0,0,BUTTON_ICON_FONT_SIZE,color,'center');g.restore();
}
// Size EVERY row against the most complex effect, as approved. With
// thumbnails centered, their edge-to-edge black space is identical.
const SETTINGS_ROW_GAP=UI_SPACE.unit; // 6px between equal-height row slots.
const SETTINGS_TITLE_H=20,SETTINGS_CONTROL_H=28,SETTINGS_SELECT_H=30;
function settingsPreviewSize(width){
 return Math.min(68,Math.max(56,Math.round(width*.185)));
}
function settingsContentHeight(effect,gap){
 const controls=effect.id==='ghost'?2:(effect.sliders?.length||0);
 return SETTINGS_TITLE_H+controls*(SETTINGS_CONTROL_H+gap)+
  (effect.pattern?(SETTINGS_SELECT_H+gap):0);
}
function settingsRows(buttonH,gap,width){
 const image=settingsPreviewSize(width),rows=[];let offset=0;
 const maxContentHeight=Math.max(...DISPLAY_EFFECTS.map(effect=>
  settingsContentHeight(effect,gap)));
 // 102px slots at 6px inner gaps, containing 68px image: 40px between
 // thumbnail edges after including the standard 6px between row slots.
 const rowHeight=Math.max(image,maxContentHeight+2*gap);
 for(const effect of DISPLAY_EFFECTS){
  const contentHeight=settingsContentHeight(effect,gap);
  const choiceHeight=Math.max(34,buttonH-8);
  const expanded=effect.pattern&&scanlineMenuOpen;
  const height=rowHeight+(expanded?SCANLINE_CHOICES.length*(choiceHeight+gap):0);
  rows.push({kind:'effect',effect,offset,height,rowHeight,contentHeight,choiceHeight});
  offset+=height+SETTINGS_ROW_GAP;
 }
 return {rows,height:Math.max(0,offset-SETTINGS_ROW_GAP)};
}
// One uniform slider primitive everywhere: 15px square, 6px gaps, real
// persisted values and full remaining row width from image to right inset.
function drawSettingsSlider(x,y,w,setting){
 const ctrl=makeSliderControl(x,y,w,setting,Number(settingValue(setting[1])),
  SETTINGS_SQUARE_SIZE,UI_SPACE.unit);
 const {label,size,labelW,trackX,trackW,fraction,valueText,valueW}=ctrl;
 if(label)text(label,x,y,10,C.ink,'left',labelW);
 rect(trackX,y-1.5,trackW,3,C.bright);
 rect(trackX,y-1.5,trackW*fraction,3,C.bright);
 rect(trackX+trackW*fraction-size/2,y-size/2,size,size,C.bright);
 text(valueText,x+w,y,10,C.bright,'right',valueW,'terminal');
 const hit=ctrl.hitbox;
 region(hit.x,hit.y,hit.w,hit.h,hit.act,{
  field:hit.field,min:hit.min,max:hit.max,step:hit.step,
  trackX:hit.trackX,trackW:hit.trackW,modalControl:hit.modalControl
 });
}
// Monochrome 16px bug glyph, so no multicolour system emoji enters our CRT.
function drawDebugBug(cx,cy,color=C.ink){
 const g=getContext();
 g.save();
 g.strokeStyle=color;g.lineWidth=1.5;g.lineCap='round';g.lineJoin='round';
 g.beginPath();
 g.ellipse(cx,cy+1.5,4.5,6,0,0,Math.PI*2);
 g.moveTo(cx-3,cy-5);g.lineTo(cx-5,cy-8);
 g.moveTo(cx+3,cy-5);g.lineTo(cx+5,cy-8);
 for(const dy of [-3,1,5]){
  g.moveTo(cx-4.5,cy+dy);g.lineTo(cx-8,cy+dy-2);
  g.moveTo(cx+4.5,cy+dy);g.lineTo(cx+8,cy+dy-2);
 }
 g.moveTo(cx-4,cy);g.lineTo(cx+4,cy);
 g.stroke();g.restore();
}

function drawOptions(q){
 const {W,H}=getViewport(),g=getContext();
 // The whole WebGL surface is a separate black terminal page. No outer
 // rounded panel, no translucent scrim and no game artwork beneath it.
 clearRegions();region(0,0,W,H,'block');
 const r=layout(),pad=q.pad,gap=q.gap,headH=r.hh;
 rect(0,0,W,H,C.bg);
 // Centre the same content column (<=520px) in portrait and landscape.
 // On phones its X coordinates are identical to the previous dialog,
 // retaining the approved title, X and Restore Defaults geometry.
 const pageW=Math.max(0,Math.min(r.width-2*UI_SPACE.padX,
  UI_SPACE.appMax-2*UI_SPACE.padX));
 const pageX=r.off+(r.width-pageW)/2,headerY=r.hy;
 // Use the very same panel radius, fill, border, header centre, font size,
 // colour, tracking and title inset as the TETRIS SYSTEM home-screen header.
 panel(pageX,headerY,pageW,headH,12,C.panel);
 const titleSize=r.landscape?13:Math.min(21,Math.max(16,W*.05));
 const closeX=pageX+pageW-UI_SPACE.headRightPad-q.buttonH;
 const debugX=closeX-q.buttonH-UI_SPACE.headIconGap;
 text('DISPLAY SYSTEM',pageX+UI_SPACE.headTitleInset,
  headerY+headH/2,titleSize,C.ink,'left',
  Math.max(10,debugX-pageX-UI_SPACE.headTitleInset-gap));
 const headerButtonY=headerY+(headH-q.buttonH)/2;
 key('',debugX,headerButtonY,q.buttonH,q.buttonH,'copyDebug');
 const debugLum=gray(buttonLight(debugX,headerButtonY,q.buttonH,q.buttonH));
 if(debugCopyState==='copied'||debugCopyState==='failed')
  text(debugCopyState==='copied'?'✓':'!',debugX+q.buttonH/2,
   headerButtonY+q.buttonH/2,BUTTON_ICON_FONT_SIZE,debugLum,'center');
 else drawDebugBug(debugX+q.buttonH/2,headerButtonY+q.buttonH/2,debugLum);
 key('X',closeX,headerButtonY,q.buttonH,q.buttonH,'close');
 const restoreW=Math.min(pageW-2*pad,
  r.boardW*UI_SPACE.overlayButtonWidthScale);
 const restoreY=H-q.safeBottom-gap-r.extraH;
 key('RESTORE DEFAULTS',pageX+(pageW-restoreW)/2,restoreY,
  restoreW,r.extraH,'resetFX',{light:true});
 const contentX=pageX+pad,contentW=pageW-2*pad;
 const top=headerY+headH+gap,bottom=restoreY-gap;
 const visibleH=Math.max(0,bottom-top);
 modalView={x:contentX,y:top,w:contentW,h:visibleH};
 const model=settingsRows(q.buttonH,gap,contentW);
 optionsMaxScroll=Math.max(0,model.height-visibleH);
 optionsScroll=clamp(optionsScroll,0,optionsMaxScroll);
 g.save();g.beginPath();g.rect(contentX,top,contentW,visibleH);g.clip();
 region(contentX,top,contentW,visibleH,'scroll',{scroll:true});
 for(const row of model.rows){
  const y=top+row.offset-optionsScroll;
  if(y+row.height<top||y>bottom)continue;
  const effect=row.effect,previewSize=settingsPreviewSize(contentW);
  // Centre thumbnail and content block independently in the SAME measured row.
  const previewX=contentX+gap;
  const previewY=y+(row.rowHeight-previewSize)/2;
  drawEffectThumbnail(effect.id,previewX,previewY,previewSize);
  const ctrlX=previewX+previewSize+gap;
  const ctrlW=contentX+contentW-gap-ctrlX;
  const blockTop=y+(row.rowHeight-row.contentHeight)/2;
  const titleY=blockTop+SETTINGS_TITLE_H/2;
  const toggleLum=gray(buttonLight(ctrlX,titleY-17,ctrlW,34));
  settingSquare(ctrlX,titleY-SETTINGS_SQUARE_SIZE/2,
   SETTINGS_SQUARE_SIZE,Boolean(settingValue(effect.toggle)),toggleLum);
  text(effect.title,ctrlX+SETTINGS_SQUARE_SIZE+gap,titleY,12,toggleLum,
   'left',Math.max(10,ctrlW-SETTINGS_SQUARE_SIZE-gap));
  region(ctrlX,titleY-17,ctrlW,34,'toggle',
   {field:effect.toggle,modalControl:true});
  const firstY=blockTop+SETTINGS_TITLE_H+gap+SETTINGS_CONTROL_H/2;
  if(effect.id==='ghost'){
   const half=(ctrlW-2*gap)/2;
   drawSettingsSlider(ctrlX,firstY,half,effect.sliders[0]);
   drawSettingsSlider(ctrlX+half+2*gap,firstY,half,effect.sliders[1]);
   drawSettingsSlider(ctrlX,firstY+SETTINGS_CONTROL_H+gap,
    ctrlW,effect.sliders[2]);
  }else if(effect.id==='softness'){
   drawSettingsSlider(ctrlX,firstY,ctrlW,effect.sliders[0]);
   drawSettingsSlider(ctrlX,firstY+SETTINGS_CONTROL_H+gap,
    ctrlW,effect.sliders[1]);
  }else if(effect.sliders?.length){
   effect.sliders.forEach((setting,i)=>drawSettingsSlider(ctrlX,
    firstY+i*(SETTINGS_CONTROL_H+gap),ctrlW,setting));
  }
  if(effect.pattern){
   // Pattern picker belongs to Scanlines; no new category or separate row.
   const selectY=blockTop+SETTINGS_TITLE_H+gap+
    SETTINGS_CONTROL_H+gap,selectH=SETTINGS_SELECT_H;
   const pickerLum=gray(buttonLight(ctrlX,selectY,ctrlW,selectH));
   panel(ctrlX,selectY,ctrlW,selectH,5,C.button,pickerLum);
   const current=SCANLINE_CHOICES.find(o=>o.id===selectedScanlineChoice());
   const shortNames={horizontal:'HORIZONTAL',aperture:'APERTURE',
    slot:'SLOT MASK',dot:'DOT MASK'};
   text(shortNames[current?.id]||current?.name||'ORIGINAL',
    ctrlX+gap,selectY+selectH/2,10,pickerLum,'left',
    Math.max(10,ctrlW-3*gap-BUTTON_ICON_FONT_SIZE));
   settingsExpandArrow(ctrlX+ctrlW-gap-BUTTON_ICON_FONT_SIZE/2,
    selectY+selectH/2,scanlineMenuOpen,pickerLum);
   region(ctrlX,selectY,ctrlW,selectH,'patternSelect',{modalControl:true});
   if(scanlineMenuOpen)SCANLINE_CHOICES.forEach((option,i)=>{
    const cy=y+row.rowHeight+i*(row.choiceHeight+gap);
    const chosen=option.id===selectedScanlineChoice();
    const choiceLum=gray(buttonLight(contentX+2*gap,cy,
     contentW-4*gap,row.choiceHeight));
    settingSquare(contentX+3*gap,
     cy+(row.choiceHeight-SETTINGS_SQUARE_SIZE)/2,
     SETTINGS_SQUARE_SIZE,chosen,choiceLum);
    text(option.name,contentX+5*gap+SETTINGS_SQUARE_SIZE,
     cy+row.choiceHeight/2,11,choiceLum,
     'left',contentW-8*gap-SETTINGS_SQUARE_SIZE);
    region(contentX+2*gap,cy,contentW-4*gap,row.choiceHeight,
     'scanlineChoice',{field:option.id,modalControl:true});
   });
  }
 }
 g.restore();
 // Keep scroll input and momentum; omit decorative scrollbar/row separators.
}
function drawScores(q){
 // One local personal record, displayed over the existing blurred playfield.
 // Rendered as neutral grayscale for the unchanged green/amber CRT compositor.
 const {W,H}=getViewport(),{x,y,w,h,pad,gap}=q;
 clearRegions();region(0,0,W,H,'block');
 panel(x,y,w,h,5,null,C.border);
 const best=getBest();
 const inset=Math.max(12,pad*2),inner=w-2*inset;
 const titleSize=Math.min(21,Math.max(15,w*.081));
 const titleH=titleSize+10;
 const rowH=Math.max(35,Math.min(51,h*.087));
 const buttonH=q.secondaryH,buttonW=w*UI_SPACE.overlayButtonWidthScale;
 const contentH=titleH+gap*3+3*rowH;
 const top=y+Math.max(inset,(h-contentH-buttonH-gap*3)/2);
 text('HIGH SCORE',x+w/2,top+titleH/2,titleSize,C.bright,'center',inner);
 const rows=[
  ['SCORE',String(best?.score??0).padStart(6,'0')],
  ['LINES',String(best?.lines??0).padStart(2,'0')],
  ['LEVEL',String(best?.level??0).padStart(2,'0')]
 ];
 const rowTop=top+titleH+gap*2;
 const labelSize=Math.max(11,Math.min(14,w*.053));
 const valueSize=Math.max(12,Math.min(16,w*.061));
 rows.forEach(([label,value],i)=>{
  const ry=rowTop+i*rowH;
  const middle=ry+rowH*.39;
  text(label,x+inset,middle,labelSize,C.ink,'left',inner*.43,'terminal');
  text(value,x+w-inset,middle,valueSize,C.bright,'right',inner*.56,'terminal');
  if(i<2){
   const dividerY=ry+rowH-2;
   // Thin dotted terminal separators, not the old ranking-table borders.
   for(let dx=0;dx<inner;dx+=5)rect(x+inset+dx,dividerY,1.5,.8,C.bright);
  }
 });
 const bx=x+(w-buttonW)/2;
 const by=Math.min(y+h-inset-buttonH,rowTop+3*rowH+gap*3);
 key('RETURN',bx,by,buttonW,buttonH,'close',{light:true});
}
function paintModal(q){
 const modal=getModal();
 if(modal==='options')drawOptions(q);
 else if(modal==='scores')drawScores(q);
}

 function resetSettings(){
  optionsScroll=0;optionsMaxScroll=0;scanlineMenuOpen=false;
 }
 function reset(){
  modalView=null;resetSettings();debugCopyState='idle';
 }
 return Object.freeze({
  modalBounds,paintModal,toggleScanlineMenu,chooseScanline,reset,resetSettings,
  get view(){return modalView;},
  get scroll(){return optionsScroll;},
  set scroll(v){optionsScroll=v;},
  get maxScroll(){return optionsMaxScroll;},
  get scanlineMenuOpen(){return scanlineMenuOpen;},
  get debugCopyState(){return debugCopyState;},
  set debugCopyState(value){debugCopyState=value;}
 });
}

/* NOMAD minimal terminal output engine.
 * Understands a small byte stream: printable ASCII/text, CR, LF, BS,
 * TAB, and CSI K / 2K (erase-to-end / erase-entire-line).
 *
 * It owns characters and cursor only; it does NOT know about gameplay,
 * message timestamps, animation timing, fades, or the canvas. The UI keeps
 * the two fixed '>' prompts and treats row 0 as live output, row 1 as history.
 */
export function createTerminalEngine({columns=36,capacity=160}={}){
 const max=Math.max(4,Math.min(1024,Math.trunc(Number(capacity)||160)));
 const clampColumns=n=>Math.max(4,Math.min(max,Math.trunc(Number(n)||4)));
 let cols=clampColumns(columns),cursor=2;
 let active=Array(max).fill(' '),history='';
 let mode='text',csi='';
 active[0]='>';active[1]=' ';
 const cellWrite=ch=>{
  if(cursor>=cols-1)return false; // reserve one complete cursor cell
  active[cursor++]=ch;
  return true;
 };
 const reset=()=>{
  active.fill(' ');
  active[0]='>';active[1]=' ';
  cursor=2;
 };
 const clearAfter=()=>{
  for(let i=cursor;i<max;i++)active[i]=' ';
 };
 const clearLine=()=>{
  for(let i=2;i<max;i++)active[i]=' ';
 };
 function executeCSI(command){
  const raw=csi;
  csi='';
  if(command==='K'){
   if(raw==='2')clearLine();
   else if(raw===''||raw==='0')clearAfter();
  }
 }
 function feed(input){
  let changed=false;
  for(const ch of String(input)){
   if(mode==='esc'){
    mode=ch==='['?'csi':'text';
    csi='';
    continue;
   }
   if(mode==='csi'){
    if(/[0-9;]/.test(ch)&&csi.length<12){csi+=ch;continue;}
    if(ch==='K')executeCSI(ch);
    mode='text';csi='';
    continue;
   }
   if(ch==='\x1b'){mode='esc';continue;}
   if(ch==='\r'){cursor=2;continue;}
   if(ch==='\n'){
    history=active.slice(0,Math.min(cursor,cols)).join('').trimEnd();
    reset();changed=true;continue;
   }
   if(ch==='\b'){cursor=Math.max(2,cursor-1);continue;}
   if(ch==='\t'){
    const target=2+Math.ceil((cursor-1)/4)*4;
    while(cursor<target&&cursor<cols-1)changed=cellWrite(' ')||changed;
    continue;
   }
   // Ignore unsupported C0 controls and DEL rather than printing boxes.
   const code=ch.codePointAt(0);
   if(code<32||code===127)continue;
   changed=cellWrite(ch)||changed;
  }
  return changed;
 }
 function setColumns(n){
  cols=clampColumns(n);
  cursor=Math.max(2,Math.min(cursor,cols-1));
 }
 function setHistory(line){
  // Resizing a responsive UI requires recomposing historical dot leaders.
  history=String(line||'').slice(0,cols-1);
 }
 function snapshot(){
  return {cells:active.slice(0,cols),cursor,columns:cols,history};
 }
 return Object.freeze({feed,setColumns,setHistory,snapshot});
}

/* NOMAD two-row line-at-a-time terminal. Fixed character cells, uppercase typography and
 * character-at-a-time output. Right-side statuses are aligned using dot leaders
 * computed BEFORE the line is typed; no text ever jumps on screen.
 * Rendering owns no game rules, DOM, or WebGL state.
 */
const pad=n=>String(n).padStart(2,'0');
function stamped(date,seconds=true){
 const d=date instanceof Date&&Number.isFinite(date.getTime())?date:new Date();
 return '['+pad(d.getHours())+':'+pad(d.getMinutes())+
  (seconds?':'+pad(d.getSeconds()):'')+']';
}
export function terminalLineBounds(r){
 return {x:r.dx+5,y:r.dy+r.dh+1,w:Math.max(1,r.dw-10),h:37};
}
// A line is built once, then emitted through the same character grid that
// moves the full-cell cursor. Statuses never pop in at the right-hand edge.
export function composeTerminalMessage(entry,columns){
 const width=Math.max(1,Math.floor(columns)-3); // '> ', then one cursor cell
 const parts=value=>{
  const s=String(value||'').trim().toUpperCase();
  const colon=s.indexOf(':');
  if(colon>0)return [s.slice(0,colon).trim(),s.slice(colon+1).trim()];
  const i=s.indexOf(' ');
  return i<0?['SYS',s]:[s.slice(0,i),s.slice(i+1).trim()];
 };
 const shortTag={SYSTEM:'SYS',SESSION:'SES',GAME:'GM',INPUT:'IN',CLEAR:'CLR',LEVEL:'LVL'};
 const candidates=[
  [stamped(entry.at,true),parts(entry.full),false],
  [stamped(entry.at,true),parts(entry.short),false],
  [stamped(entry.at,false),parts(entry.full),false],
  [stamped(entry.at,false),parts(entry.short),false],
  [stamped(entry.at,false),parts(entry.short),true],
  ['',parts(entry.short),true]
 ];
 for(const [stamp,p,abbreviate] of candidates){
  const tag=abbreviate?(shortTag[p[0]]||p[0].slice(0,3)):p[0];
  const left=(stamp?stamp+' ':'')+tag;
  const right=p[1];
  // Minimum '..' and spaces around the leaders; exact width keeps the
  // final status flush-right one cell before the blinking block cursor.
  const remaining=width-left.length-right.length;
  if(remaining>=4){
   return left+' '+'.'.repeat(remaining-2)+' '+right;
  }
 }
 // Very small viewports: retain the status first, with as much label as fits.
 const [tag,status]=parts(entry.short);
 const right=status.slice(-Math.max(1,width-4));
 const room=width-right.length;
 const left=tag.slice(0,Math.max(0,room-3));
 if(room>=4)return left+' '+'.'.repeat(room-left.length-2)+' '+right;
 return right.padStart(width,' ');
}
// A small authentic byte-stream terminal owns the character grid and cursor.
// NOMAD owns the queue, fixed prompts, and two-row snap/fade presentation.
// Old text snaps off, waits 250 ms, appears on the lower history row,
// then waits 250 ms before the next message types at 37 characters/second.
export function createTerminalLog({clock=()=>new Date(),
 typeMs=1000/37,holdMs=1750,offMs=250,pretypeMs=250}={}){
 const engine=createTerminalEngine({columns:36});
 let columns=36,phase='new';
 let current='',activeEntry=null,historyEntry=null;
 let nextAt=0,lastInput=0;
 const events=[{full:'SYSTEM: READY',short:'SYS: READY',at:clock()}];
 const clearActive=now=>{
  // CR + ANSI CSI 2K resets the output without touching either prompt.
  engine.feed('\r\x1b[2K');
  lastInput=now;
 };
 const write=(ch,now)=>{engine.feed(ch);lastInput=now;};
 function enqueue(full,short=full,priority=false){
  const entry={full:String(full).toUpperCase(),short:String(short).toUpperCase(),at:clock()};
  if(priority)events.splice(0,events.length,entry);
  else{events.push(entry);if(events.length>6)events.splice(0,events.length-6);}
 }
 function setColumns(n){
  const next=Math.max(4,Math.min(160,Math.floor(Number(n)||4)));
  if(next===columns)return;
  const state=engine.snapshot();
  const alreadyTyped=state.cells.slice(2,state.cursor).join('');
  columns=next;
  engine.setColumns(columns);
  // Recompose the status suffix at the actual viewport's character width.
  if(historyEntry)engine.setHistory('> '+composeTerminalMessage(historyEntry,columns));
  if(activeEntry&&phase!=='snap-off'){
   const rewritten=composeTerminalMessage(activeEntry,columns);
   current=rewritten;
   if(!rewritten.startsWith(alreadyTyped)||state.cursor>=columns){
    clearActive(lastInput);
    if(phase==='hold')phase='type';
    nextAt=0;
   }
  }
 }
 function start(now){
  activeEntry=events.shift()||null;
  if(!activeEntry){phase='hold';nextAt=now+holdMs;return false;}
  clearActive(now);
  current=composeTerminalMessage(activeEntry,columns);
  phase='type';nextAt=now;
  return true;
 }
 function advance(now){
  if(now<nextAt)return false;
  if(phase==='new')return start(now);
  if(phase==='type'){
   const typed=engine.snapshot().cursor-2;
   if(typed<current.length){
    write(current[typed],now);nextAt=now+typeMs;return true;
   }
   phase='hold';nextAt=now+holdMs;
   return false;
  }
  if(phase==='hold'){
   if(events.length===0)return false;
   // Only content snaps off; the two fixed prompt arrows remain visible.
   phase='snap-off';nextAt=now+offMs;lastInput=now;
   return true;
  }
  if(phase==='snap-off'){
   // LF actually advances the terminal stream. NOMAD draws the just-finished
   // line in the faded lower row instead of a conventional upper scrollback.
   historyEntry=activeEntry;
   engine.feed('\n');
   engine.setHistory('> '+composeTerminalMessage(historyEntry,columns));
   activeEntry=events.shift()||null;
   if(!activeEntry){phase='hold';nextAt=now+holdMs;return true;}
   clearActive(now);
   current=composeTerminalMessage(activeEntry,columns);
   phase='pretype';nextAt=now+pretypeMs;
   return true;
  }
  if(phase==='pretype'){
   phase='type';nextAt=now;
   return true;
  }
  return false;
 }
 function cursorVisible(now){
  const elapsed=Math.max(0,now-lastInput);
  return elapsed<500||Math.floor((elapsed-500)/480)%2===0;
 }
 function nextDelay(now){
  const elapsed=Math.max(0,now-lastInput);
  const blink=elapsed<500?500-elapsed:480-((elapsed-500)%480);
  const phaseWait=(phase==='hold'&&!events.length)?Infinity:Math.max(0,nextAt-now);
  return Math.max(16,Math.min(blink,phaseWait));
 }
 function snapshot(){
  return {...engine.snapshot(),phase,
   pending:events.length,activeVisible:phase!=='snap-off'};
 }
 return Object.freeze({enqueue,setColumns,advance,cursorVisible,nextDelay,snapshot});
}
export function drawTerminalLog(ctx,log,r,now,ink='#e3e3e3',bg='#080808',
 font='"Roboto Condensed",ui-monospace,Menlo,monospace'){
 const b=terminalLineBounds(r);
 const fontSize=10; // Same size and weight as SURVIVE THE SOVIET CHALLENGE.
 ctx.save();
 ctx.beginPath();ctx.rect(b.x,b.y,b.w,b.h);ctx.clip();
 ctx.font='700 '+fontSize+'px '+font;
 ctx.textBaseline='alphabetic';ctx.textAlign='left';
 ctx.letterSpacing='0px';
 if('fontKerning' in ctx)ctx.fontKerning='none';
 // Title-style proportional characters retain a fixed terminal cell grid.
 const cell=Math.max(1,Math.ceil(Math.max(
  ...['M','W','@','0'].map(ch=>ctx.measureText(ch).width)
 ))+1);
 log.setColumns(Math.max(4,Math.floor(b.w/cell)));
 const {cells,cursor,history,activeVisible}=log.snapshot();
 const metrics=ctx.measureText('H');
 const ascent=metrics.actualBoundingBoxAscent||fontSize*.70;
 const descent=metrics.actualBoundingBoxDescent||0;
 const cellH=Math.ceil(ascent+descent)+4;
 // Preserve the two-row terminal; shift its artwork 8px below the original
 // active position, rather than 14px. Gameplay layout is unchanged.
 const pitch=14,top=b.y+16,bottom=top+pitch;
 function glyph(ch,col,y,color=ink){
  ctx.fillStyle=color;
  ctx.fillText(ch,b.x+col*cell+(cell-ctx.measureText(ch).width)/2,
   y+(ascent-descent)/2);
 }
 // The two prompts are fixed. Historical text never moves or rewrites them.
 if(activeVisible){
  for(let i=2;i<cursor;i++){
   const ch=cells[i];
   if(ch!==' ')glyph(ch,i,top);
  }
 }
 for(let i=2;i<history.length&&i<cells.length;i++){
  const ch=history[i];
  if(ch!==' ')glyph(ch,i,bottom);
 }
 // Background-gradient occlusion affects ONLY older text at the bottom.
 const fade=ctx.createLinearGradient(0,b.y+23,0,b.y+b.h);
 fade.addColorStop(0,'rgba(8,8,8,0)');
 fade.addColorStop(.55,'rgba(8,8,8,0.40)');
 fade.addColorStop(1,bg);
 ctx.fillStyle=fade;ctx.fillRect(b.x,b.y+23,b.w,b.h-23);
 // Draw fixed arrows AFTER fading so neither the arrow nor its position dims.
 glyph('>',0,top);
 glyph('>',0,bottom);
 if(log.cursorVisible(now)&&cursor<cells.length){
  const position=activeVisible?cursor:2;
  const x=b.x+position*cell,y=top-cellH/2;
  ctx.fillStyle=ink;ctx.fillRect(x,y,cell,cellH);
  const ch=activeVisible?cells[position]:' ';
  if(ch&&ch!==' ')glyph(ch,position,top,bg);
 }
 ctx.restore();
}
