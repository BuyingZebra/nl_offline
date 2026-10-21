/* Tetris System V052 — Canvas2D drawing primitives.
 * Drawing targets and hitboxes are caller-owned and resolve on each draw,
 * allowing the same primitives to draw gameplay and modal canvases.
 */
export function createCanvasUI({getContext,getRegions,getPressed,C,FONT,
 LETTER_SPACING_EM,MAIN_ACTION_LABELS,BUTTON_ICON_LABELS,
 MAIN_ACTION_FONT_SIZE,BUTTON_FONT_SIZE,BUTTON_ICON_FONT_SIZE}){
function panel(x,y,w,h,r=8,fill=C.panel,border=C.border){
 const g=getContext();
 if(w<=0||h<=0)return;
 g.beginPath();g.roundRect(x+.5,y+.5,Math.max(1,w-1),Math.max(1,h-1),Math.min(r,w/2,h/2));
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
function text(str,x,y,size=12,color=C.ink,align='left',maxWidth=Infinity){
 const g=getContext();
 g.font='700 '+size+'px '+FONT;g.textAlign=align;g.textBaseline='middle';
 g.letterSpacing=(size*LETTER_SPACING_EM).toFixed(3)+'px';
 g.fillStyle=color;
 const lines=wrapText(str,maxWidth),step=size*1.2;
 for(let i=0;i<lines.length;i++)
  g.fillText(lines[i],x,y+(i-(lines.length-1)/2)*step);
 g.letterSpacing='0px';
}
function rect(x,y,w,h,color){const g=getContext();g.fillStyle=color;g.fillRect(x,y,w,h);}
function region(x,y,w,h,act,opts={}){getRegions().push({x,y,w,h,act,...opts});}
function key(label,x,y,w,h,act,{light=false,repeat=false,arrow=false,modalControl=false}={}){
 const size=MAIN_ACTION_LABELS.has(String(label))?MAIN_ACTION_FONT_SIZE:
  BUTTON_ICON_LABELS.has(String(label))?BUTTON_ICON_FONT_SIZE:BUTTON_FONT_SIZE;
 const down=getPressed()?.action===act&&getPressed()?.box?.x===x;
 panel(x,y,w,h,8,down?C.solid:(light?C.bright:C.button),light?C.bright:C.border);
 text(label,x+w/2,y+h/2,size,light?C.dark:C.ink,'center',Math.max(10,w-14));
 if(arrow)text('▶',x+17,y+h/2,BUTTON_ICON_FONT_SIZE,light?C.dark:C.ink,'center');
 region(x,y,w,h,act,{repeat,modalControl});
}

 return Object.freeze({panel,wrapText,text,rect,region,key});
}
