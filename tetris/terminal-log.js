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
 return {x:r.dx+5,y:r.dy+r.dh+1,w:Math.max(1,r.dw-10),h:29};
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
// Line-oriented display: active event on top, the previous event fades on
// the bottom. Existing text disappears at once, then reappears as history
// after 250 ms; after another 250 ms the new event begins typing. Prompts
// never move. 57 WPM = 57*5 standard characters per minute.
export function createTerminalLog({clock=()=>new Date(),
 typeMs=60000/(57*5),holdMs=1750,offMs=250,pretypeMs=250}={}){
 const capacity=160;
 const cells=Array(capacity).fill(' ');
 let columns=36,cursor=2,phase='new';
 let current='',activeEntry=null,history='',historyEntry=null;
 let nextAt=0,lastInput=0;
 const events=[{full:'SYSTEM: READY',short:'SYS: READY',at:clock()}];
 const clearActive=now=>{
  cells.fill(' ');cursor=2;lastInput=now;
 };
 const write=(ch,now)=>{
  if(cursor<columns){cells[cursor++]=ch;lastInput=now;}
 };
 function enqueue(full,short=full,priority=false){
  const entry={full:String(full).toUpperCase(),short:String(short).toUpperCase(),at:clock()};
  if(priority)events.splice(0,events.length,entry);
  else{events.push(entry);if(events.length>6)events.splice(0,events.length-6);}
 }
 function setColumns(n){
  const next=Math.max(4,Math.min(capacity,Math.floor(Number(n)||4)));
  if(next===columns)return;
  columns=next;
  if(historyEntry)history='> '+composeTerminalMessage(historyEntry,columns);
  if(activeEntry&&phase!=='snap-off'){
   const rewritten=composeTerminalMessage(activeEntry,columns);
   const alreadyTyped=cells.slice(2,cursor).join('');
   current=rewritten;
   if(!rewritten.startsWith(alreadyTyped)||cursor>=columns){
    // Reflow an active message only if its old character grid cannot fit.
    clearActive(lastInput);
    if(phase==='hold')phase='type';
    nextAt=0;
   }
  }else cursor=Math.min(cursor,columns-1);
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
   const typed=cursor-2;
   if(typed<current.length){
    write(current[typed],now);nextAt=now+typeMs;return true;
   }
   phase='hold';nextAt=now+holdMs;
   return false;
  }
  if(phase==='hold'){
   if(events.length===0)return false;
   // Content snaps OFF the top row immediately; stationary prompts remain.
   phase='snap-off';nextAt=now+offMs;lastInput=now;
   return true;
  }
  if(phase==='snap-off'){
   // A quarter-second later the old message snaps ON the bottom row.
   historyEntry=activeEntry;
   history='> '+composeTerminalMessage(historyEntry,columns);
   activeEntry=events.shift();
   clearActive(now);
   current=composeTerminalMessage(activeEntry,columns);
   phase='pretype';nextAt=now+pretypeMs;
   return true;
  }
  if(phase==='pretype'){
   // The new top-row cursor waits another quarter-second before typing.
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
  return {cells:cells.slice(0,columns),cursor,columns,phase,
   pending:events.length,history,activeVisible:phase!=='snap-off'};
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
 const pitch=14,top=b.y+8,bottom=top+pitch;
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
 const fade=ctx.createLinearGradient(0,b.y+10,0,b.y+b.h);
 fade.addColorStop(0,'rgba(8,8,8,0)');
 fade.addColorStop(.55,'rgba(8,8,8,0.40)');
 fade.addColorStop(1,bg);
 ctx.fillStyle=fade;ctx.fillRect(b.x,b.y+10,b.w,b.h-10);
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
