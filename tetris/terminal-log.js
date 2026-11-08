/* NOMAD two-row scrolling terminal. Fixed character cells, uppercase typography and
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
 return {x:r.dx+5,y:r.footerY-25,w:Math.max(1,r.dw-10),h:36};
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
// One active line at the bottom, one faded history line above. New prompts
// enter from below as the prior completed line scrolls into the history row.
export function createTerminalLog({clock=()=>new Date(),typeMs=40,holdMs=1750,
 scrollMs=365,gapMs=120}={}){
 const capacity=160;
 let cells=Array(capacity).fill(' '),columns=36,cursor=0;
 let phase='new',current='',activeEntry=null,history='',historyEntry=null;
 let enteringEntry=null,nextAt=0,lastInput=0,scrollStart=0;
 let events=[{full:'SYSTEM: READY',short:'SYS: READY',at:clock()}];
 const write=(ch,now)=>{if(cursor<columns){cells[cursor++]=ch;lastInput=now;}};
 const prompt=now=>{cells.fill(' ');cursor=0;write('>',now);write(' ',now);};
 function enqueue(full,short=full,priority=false){
  const entry={full:String(full).toUpperCase(),short:String(short).toUpperCase(),at:clock()};
  if(priority)events=[entry];
  else{events.push(entry);if(events.length>6)events.splice(0,events.length-6);}
 }
 function setColumns(n){
  const next=Math.max(4,Math.min(capacity,Math.floor(Number(n)||4)));
  if(next===columns)return;
  columns=next;
  if(historyEntry)history='> '+composeTerminalMessage(historyEntry,columns);
  // During typing and the following hold, reflow before revealing another
  // character. Restart the current line only when old cells no longer fit.
  if(activeEntry&&phase!=='scroll'){
   const rewritten=composeTerminalMessage(activeEntry,columns);
   const alreadyTyped=cells.slice(2,cursor).join('');
   current=rewritten;
   if(!rewritten.startsWith(alreadyTyped)||cursor>=columns){
    prompt(lastInput);phase='type';nextAt=0;
   }
  }else cursor=Math.min(cursor,columns-1);
 }
 function start(now){
  activeEntry=events.shift()||null;
  if(!activeEntry){phase='hold';nextAt=now+holdMs;return false;}
  prompt(now);
  current=composeTerminalMessage(activeEntry,columns);
  phase='type';nextAt=now;
  return true;
 }
 function finishScroll(now){
  // At the end of the upward movement, the previous active line becomes
  // historical output, and the new prompt is exactly on the lower row.
  historyEntry=activeEntry;
  history=cells.slice(0,cursor).join('');
  activeEntry=enteringEntry;enteringEntry=null;
  prompt(now);
  current=composeTerminalMessage(activeEntry,columns);
  phase='type';nextAt=now+gapMs;
 }
 function advance(now){
  if(phase==='scroll'){
   if(now-scrollStart<scrollMs)return true; // Animate only the small HUD crop.
   finishScroll(now);return true;
  }
  if(now<nextAt)return false;
  if(phase==='new')return start(now);
  if(phase==='type'){
   const typed=cursor-2;
   if(typed<current.length){
    write(current[typed],now);nextAt=now+typeMs;return true;
   }
   phase='hold';nextAt=now+holdMs;return false;
  }
  if(phase==='hold'){
   if(!events.length)return false;
   enteringEntry=events.shift();
   phase='scroll';scrollStart=now;lastInput=now;
   return true;
  }
  return false;
 }
 function cursorVisible(now){
  const elapsed=Math.max(0,now-lastInput);
  return elapsed<500||Math.floor((elapsed-500)/480)%2===0;
 }
 function nextDelay(now){
  if(phase==='scroll')return 24;
  const elapsed=Math.max(0,now-lastInput);
  const blink=elapsed<500?500-elapsed:480-((elapsed-500)%480);
  const phaseWait=(phase==='hold'&&!events.length)?Infinity:Math.max(0,nextAt-now);
  return Math.max(16,Math.min(blink,phaseWait));
 }
 function snapshot(now=0){
  return {
   cells:cells.slice(0,columns),cursor,columns,phase,pending:events.length,
   history,scrollProgress:phase==='scroll'?
    Math.max(0,Math.min(1,(now-scrollStart)/scrollMs)):0
  };
 }
 return Object.freeze({enqueue,setColumns,advance,cursorVisible,nextDelay,snapshot});
}
export function drawTerminalLog(ctx,log,r,now,ink='#e3e3e3',bg='#080808',
 font='"Roboto Condensed",ui-monospace,Menlo,monospace'){
 const b=terminalLineBounds(r);
 // Match SURVIVE THE SOVIET CHALLENGE: same face, same 10px size.
 const fontSize=10;
 ctx.save();
 ctx.beginPath();ctx.rect(b.x,b.y,b.w,b.h);ctx.clip();
 ctx.font='700 '+fontSize+'px '+font;
 ctx.textBaseline='alphabetic';ctx.textAlign='left';
 ctx.letterSpacing='0px';
 if('fontKerning' in ctx)ctx.fontKerning='none';
 // Keep proportional title glyphs inside rigid character cells.
 const cell=Math.max(1,Math.ceil(Math.max(
  ...['M','W','@','0'].map(ch=>ctx.measureText(ch).width)
 ))+1);
 log.setColumns(Math.max(4,Math.floor(b.w/cell)));
 const {cells,cursor,history,phase,scrollProgress}=log.snapshot(now);
 const metrics=ctx.measureText('H');
 const ascent=metrics.actualBoundingBoxAscent||fontSize*.70;
 const descent=metrics.actualBoundingBoxDescent||0;
 const cellH=Math.ceil(ascent+descent)+4;
 const pitch=16,top=b.y+13,bottom=top+pitch;
 const progress=phase==='scroll'?1-Math.pow(1-scrollProgress,3):0;
 const shift=pitch*progress;
 const drawLine=(str,y,showCursor=false,position=0)=>{
  const baseline=y+(ascent-descent)/2;
  for(let i=0;i<str.length&&i<cells.length;i++){
   const ch=str[i];if(ch===' ')continue;
   const x=b.x+i*cell+(cell-ctx.measureText(ch).width)/2;
   ctx.fillStyle=ink;ctx.fillText(ch,x,baseline);
  }
  if(showCursor&&log.cursorVisible(now)&&position<cells.length){
   const x=b.x+position*cell;
   ctx.fillStyle=ink;ctx.fillRect(x,y-cellH/2,cell,cellH);
   const ch=str[position]||' ';
   if(ch!==' '){
    ctx.fillStyle=bg;
    ctx.fillText(ch,x+(cell-ctx.measureText(ch).width)/2,baseline);
   }
  }
 };
 // The old history row slides out, while the active line rises into history.
 if(phase==='scroll'){
  if(history)drawLine(history,top-shift);
  drawLine(cells.slice(0,cursor).join(''),bottom-shift);
  drawLine('> ',bottom+pitch-shift,true,2);
 }else{
  if(history)drawLine(history,top);
  drawLine(cells.slice(0,cursor).join(''),bottom,true,cursor);
 }
 // An invisible, unframed terminal viewport. Its upper gradient partially
 // hides older output without affecting the bottom reading position.
 const fade=ctx.createLinearGradient(0,b.y,0,b.y+pitch+6);
 fade.addColorStop(0,bg);
 fade.addColorStop(.52,'rgba(8,8,8,0.55)');
 fade.addColorStop(1,'rgba(8,8,8,0)');
 ctx.fillStyle=fade;ctx.fillRect(b.x,b.y,b.w,pitch+6);
 ctx.restore();
}
