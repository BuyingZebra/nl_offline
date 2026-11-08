import {buttonLevel,buttonInkLevel} from './button-feedback.js?v107';
import {makeRegion,makeButtonControl} from './ui-controls.js?v065';
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
 // Give solid buttons a visible but still flat bottom-to-top gradient,
 // like the approved blue-phosphor concept. Preserve the brightest stop
 // as the EXACT original solid luminance (206..255); only the lower
 // region darkens. No raised edges, highlights, or bevel geometry.
 let face=C.button;
 if(model.light){
  const gradient=getContext().createLinearGradient(
   model.x,model.y+model.h,model.x,model.y);
  gradient.addColorStop(0,grayLevel(buttonLevel(power)-40));
  gradient.addColorStop(1,lit);
  face=gradient;
 }
 panel(model.x,model.y,model.w,model.h,8,face,lit);
 text(model.label,model.x+model.w/2,model.y+model.h/2,size,
  model.light?inverseInk:lit,'center',Math.max(10,model.w-14));
 if(model.arrow)text('▶',model.x+17,model.y+model.h/2,
  BUTTON_ICON_FONT_SIZE,model.light?inverseInk:lit,'center');
 getRegions().push(model.hitbox);
 return model;
}

 return Object.freeze({panel,wrapText,text,rect,region,key,buttonLight});
}
