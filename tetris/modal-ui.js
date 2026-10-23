import {makeSliderControl} from './ui-controls.js?v065';
/* V064 — isolated Canvas2D settings and modal interface.
 * All original drawing primitives/layout measurements are preserved.
 * State is limited to menu scroll, scanline picker, status and view hit area.
 * No WebGL, frame-scheduler, or gameplay dependencies.
 */
export function createModalUI({
 document,SHAPES,DISPLAY_EFFECTS,SCANLINE_CHOICES,
 getViewport,layout,insets,clearRegions,getContext,
 panel,text,rect,region,key,gray,clamp,fmt,C,UI_SPACE,BUTTON_ICON_FONT_SIZE,
 getFX,activeScanlinePreset,settingValue,persist,invalidate,setScrollVelocity,
 getHighs,getGame,getInitialsInput,getModal
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
 // In portrait the Top Five screen fills the game's physical playfield.
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
 const wanted=name==='restart'?2*pad+2*buttonH+2*gap+40:
  2*pad+4*buttonH+4*gap+18;
 const w=Math.max(0,Math.min(410,W-2*UI_SPACE.padX));
 const h=Math.max(0,Math.min(wanted,usable-2*gap));
 return {w,h,x:(W-w)/2,y:safe.top+(usable-h)/2,pad,gap,buttonH};
}
function modalPanel(title,q){
 const {W,H}=getViewport();
 clearRegions();region(0,0,W,H,'block');
 panel(q.x,q.y,q.w,q.h,13,C.panel,C.border);
 text(title,q.x+q.pad,q.y+q.pad+q.buttonH/2,14,C.bright,'left',q.w-2*q.pad);
}
function modalBodyTop(q){return q.y+q.pad+q.buttonH+q.gap;}
function modalActionRow(q,items){
 const x=q.x+q.pad,y=q.y+q.h-q.pad-q.buttonH;
 const width=q.w-2*q.pad,n=items.length;
 const buttonW=(width-(n-1)*q.gap)/n;
 items.forEach(([label,act,light],i)=>
  key(label,x+i*(buttonW+q.gap),y,buttonW,q.buttonH,act,{light:Boolean(light)}));
 return y;
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
// Match the existing rounded panel outline around every thumbnail, with a
// subtle 1px light-top/left and dark-bottom/right rim for terminal-style bevel.
function drawEffectThumbnail(id,x,y,size){
 const g=getContext();
 panel(x,y,size,size,9,C.panel,C.border);
 const inset=3,inner=Math.max(1,size-2*inset);
 g.save();
 g.beginPath();
 g.roundRect(x+inset,y+inset,inner,inner,Math.min(6,inner/2));
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
 const FX=getFX();
 FX.scanlines=id!=='off';
 if(id!=='off')FX.scanlinePreset=id;
 scanlineMenuOpen=false;persist();setScrollVelocity(0);invalidate();
}
function settingSquare(x,y,size,active){
 const g=getContext();
 g.lineWidth=1;
 if(active){g.fillStyle=C.bright;g.fillRect(x,y,size,size);}
 else{g.strokeStyle=C.bright;g.strokeRect(x+.5,y+.5,size-1,size-1);}
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
 const controls=effect.id==='ghost'||effect.id==='softness'?2:
  effect.sliders?.length?1:0;
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
 rect(trackX,y-1.5,trackW,3,C.border);
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
function drawDebugBug(cx,cy){
 const g=getContext();
 g.save();
 g.strokeStyle=C.ink;g.lineWidth=1.5;g.lineCap='round';g.lineJoin='round';
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
 if(debugCopyState==='copied'||debugCopyState==='failed')
  text(debugCopyState==='copied'?'✓':'!',debugX+q.buttonH/2,
   headerButtonY+q.buttonH/2,BUTTON_ICON_FONT_SIZE,C.ink,'center');
 else drawDebugBug(debugX+q.buttonH/2,headerButtonY+q.buttonH/2);
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
  settingSquare(ctrlX,titleY-SETTINGS_SQUARE_SIZE/2,
   SETTINGS_SQUARE_SIZE,Boolean(settingValue(effect.toggle)));
  text(effect.title,ctrlX+SETTINGS_SQUARE_SIZE+gap,titleY,12,C.bright,
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
   drawSettingsSlider(ctrlX,firstY,ctrlW,effect.sliders[0]);
  }
  if(effect.pattern){
   // Pattern picker belongs to Scanlines; no new category or separate row.
   const selectY=blockTop+SETTINGS_TITLE_H+gap+
    SETTINGS_CONTROL_H+gap,selectH=SETTINGS_SELECT_H;
   panel(ctrlX,selectY,ctrlW,selectH,5,C.button,C.border);
   const current=SCANLINE_CHOICES.find(o=>o.id===selectedScanlineChoice());
   const shortNames={horizontal:'HORIZONTAL',aperture:'APERTURE',
    slot:'SLOT MASK',dot:'DOT MASK'};
   text(shortNames[current?.id]||current?.name||'ORIGINAL',
    ctrlX+gap,selectY+selectH/2,10,C.ink,'left',
    Math.max(10,ctrlW-3*gap-BUTTON_ICON_FONT_SIZE));
   settingsExpandArrow(ctrlX+ctrlW-gap-BUTTON_ICON_FONT_SIZE/2,
    selectY+selectH/2,scanlineMenuOpen,C.ink);
   region(ctrlX,selectY,ctrlW,selectH,'patternSelect',{modalControl:true});
   if(scanlineMenuOpen)SCANLINE_CHOICES.forEach((option,i)=>{
    const cy=y+row.rowHeight+i*(row.choiceHeight+gap);
    const chosen=option.id===selectedScanlineChoice();
    settingSquare(contentX+3*gap,
     cy+(row.choiceHeight-SETTINGS_SQUARE_SIZE)/2,
     SETTINGS_SQUARE_SIZE,chosen);
    text(option.name,contentX+5*gap+SETTINGS_SQUARE_SIZE,
     cy+row.choiceHeight/2,11,chosen?C.bright:C.ink,
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
 // Concept 1: Top Five in the existing playfield, grayscale source through CRT.
 const {W,H}=getViewport(),{x,y,w,h,pad,gap}=q;
 clearRegions();region(0,0,W,H,'block');
 panel(x,y,w,h,5,null,C.border);
 const inner=w-2*pad,secondaryH=q.secondaryH,buttonW=w*UI_SPACE.overlayButtonWidthScale;
 const titleSize=Math.min(20,Math.max(15,w*.082));
 const titleH=titleSize+4,iconH=13,headerH=16;
 const rowH=Math.max(18,Math.min(42,
  (h-2*pad-titleH-iconH-headerH-secondaryH-6*gap)/5));
 const contentH=titleH+iconH+headerH+5*rowH+secondaryH+6*gap;
 let top=y+Math.max(pad,(h-contentH)/2);
 text('HIGH SCORES',x+w/2,top+titleH/2,titleSize,C.bright,'center',inner);
 top+=titleH+gap;
 // Small custom winged-circle divider, with no coloured image or extra texture.
 const c=getContext(),cx=x+w/2,cy=top+iconH/2;
 rect(x+pad,cy-.5,inner*.30,1,C.border);
 rect(x+w-pad-inner*.30,cy-.5,inner*.30,1,C.border);
 c.save();c.strokeStyle=C.bright;c.lineWidth=1.25;
 c.beginPath();c.ellipse(cx,cy,4,4,0,0,Math.PI*2);c.stroke();c.restore();
 rect(cx-2,cy-2,4,4,C.bright);
 rect(cx-13,cy-2,7,1,C.bright);rect(cx+6,cy-2,7,1,C.bright);
 rect(cx-13,cy+1,7,1,C.border);rect(cx+6,cy+1,7,1,C.border);
 top+=iconH+gap;
 const ix=x+pad;
 // Centered chart columns; the ranking column needs no '#' heading.
 const centers={rank:ix+inner*.067,name:ix+inner*.255,
  score:ix+inner*.532,lvl:ix+inner*.766,lines:ix+inner*.927};
 const headSize=Math.min(9,Math.max(7,w*.033)),headY=top+headerH/2;
 for(const [label,column] of [['NAME','name'],['SCORE','score'],
  ['LVL','lvl'],['LINES','lines']])
  text(label,centers[column],headY,headSize,C.weak,'center');
 top+=headerH;
 const entries=getHighs(),font=Math.min(10,Math.max(8,w*.039));
 // Single transparent chart outline with only four beveled outer corners.
 // Straight internal lines complete the square outline of all five rows.
 const tableH=5*rowH;
 panel(ix,top,inner,tableH,8,null,C.border);
 for(let i=1;i<5;i++)
  rect(ix+1,top+i*rowH-.5,inner-2,1,C.border);
 for(let i=0;i<5;i++){
  const s=entries[i],middle=top+(i+.5)*rowH;
  const shade=i===0?C.bright:C.ink;
  text(String(i+1),centers.rank,middle,font,C.weak,'center',Infinity,'terminal');
  text(s?.name||'---',centers.name,middle,font,shade,'center',inner*.21,'terminal');
  text(s?Number(s.score).toLocaleString('en-CA'):'—',
   centers.score,middle,font,shade,'center',inner*.32,'terminal');
  text(s?String(s.level):'-',centers.lvl,middle,font,C.weak,'center',Infinity,'terminal');
  text(s?String(s.lines):'-',centers.lines,middle,font,C.weak,'center',Infinity,'terminal');
 }
 const by=top+tableH+2*gap,bx=x+(w-buttonW)/2;
 key('RETURN',bx,by,buttonW,secondaryH,'close',{light:true});
}
function drawRestart(q){
 modalPanel('START NEW GAME?',q);
 const footerY=modalActionRow(q,[['CANCEL','close'],['YES, RESTART','restartYes',true]]);
 const bodyTop=modalBodyTop(q);
 text('Your current game and score will be lost.',q.x+q.w/2,
  (bodyTop+footerY-q.gap)/2,10,C.weak,'center',q.w-2*q.pad);
}
function drawEntry(q){
 const game=getGame(),initialsInput=getInitialsInput();
 modalPanel('NEW HIGH SCORE',q);
 const {x,w,pad,gap,buttonH}=q;
 const top=modalBodyTop(q);
 panel(x+pad,top,w-2*pad,buttonH,8,C.button,C.border);
 text('YOUR SCORE: '+game.score.toLocaleString('en-CA'),x+w/2,top+buttonH/2,
  12,C.bright,'center',w-4*pad,'terminal');
 const labelY=top+buttonH+gap;
 text('INITIALS / UP TO THREE',x+w/2,labelY+9,10,C.weak,'center',w-2*pad);
 const inputY=labelY+18+gap;
 key(initialsInput.value||'TAP TO ENTER',x+pad,inputY,w-2*pad,buttonH,'typeInitials');
 modalActionRow(q,[['SKIP','skipScore'],['SAVE SCORE','saveScore',true]]);
}
function paintModal(q){
 const modal=getModal();
 if(modal==='options')drawOptions(q);
 else if(modal==='scores')drawScores(q);
 else if(modal==='restart')drawRestart(q);
 else if(modal==='entry')drawEntry(q);
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
