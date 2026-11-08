/* NOMAD one-line terminal. Fixed character cells, uppercase typography and
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
 return {x:r.dx+5,y:r.footerY-12,w:Math.max(1,r.dw-10),h:24};
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
export function createTerminalLog({clock=()=>new Date(),typeMs=40,eraseMs=22,holdMs=1750,gapMs=250}={}){
 let cells=Array(160).fill(' '),columns=36,cursor=0,phase='new';
 let current='',nextAt=0,lastInput=0;
 let events=[{full:'SYSTEM: READY',short:'SYS: READY',at:clock()}];
 const write=(ch,now)=>{if(cursor<columns){cells[cursor++]=ch;lastInput=now;}};
 function command(op,now){
  if(op==='CR')cursor=0;
  else if(op==='EL')cells.fill(' ');
  else if(op==='BS')cursor=Math.max(0,cursor-1);
  else if(op==='SP')write(' ',now);
 }
 function enqueue(full,short=full,priority=false){
  const entry={full:String(full).toUpperCase(),short:String(short).toUpperCase(),at:clock()};
  if(priority)events=[entry];
  else{events.push(entry);if(events.length>6)events.splice(0,events.length-6);}
 }
 function setColumns(n){
  const newColumns=Math.max(4,Math.min(cells.length,Math.floor(Number(n)||4)));
  if(columns===newColumns)return;
  columns=newColumns;
  // A resized viewport will format the next event at the new width.
  // Keep any already typed characters in their existing cells.
  cursor=Math.min(cursor,columns-1);
  current=current.slice(0,Math.max(0,columns-3));
 }
 function start(now){
  const entry=events.shift();
  if(!entry){phase='hold';nextAt=now+holdMs;return;}
  command('CR',now);command('EL',now);
  write('>',now);write(' ',now);
  current=composeTerminalMessage(entry,columns);
  phase='type';nextAt=now;
 }
 function advance(now){
  if(now<nextAt)return false;
  if(phase==='new'){start(now);return true;}
  if(phase==='type'){
   const typed=cursor-2;
   if(typed<current.length){write(current[typed],now);nextAt=now+typeMs;return true;}
   phase='hold';nextAt=now+holdMs;return false;
  }
  if(phase==='hold'){
   if(events.length===0)return false;
   phase='erase';nextAt=now;return false;
  }
  if(phase==='erase'){
   if(cursor>2){
    // Literal terminal BS SP BS: erase a single character cell.
    command('BS',now);command('SP',now);command('BS',now);
    nextAt=now+eraseMs;return true;
   }
   phase='gap';nextAt=now+gapMs;return false;
  }
  if(phase==='gap'){phase='new';nextAt=now;return false;}
  return false;
 }
 function cursorVisible(now){
  const elapsed=now-lastInput;
  return elapsed<500||Math.floor((elapsed-500)/480)%2===0;
 }
 function nextDelay(now){
  const elapsed=Math.max(0,now-lastInput);
  const blink=elapsed<500?500-elapsed:480-((elapsed-500)%480);
  const phaseWait=(phase==='hold'&&!events.length)?Infinity:Math.max(0,nextAt-now);
  return Math.max(16,Math.min(blink,phaseWait));
 }
 function snapshot(){return {cells:cells.slice(0,columns),cursor,columns,phase,pending:events.length};}
 return Object.freeze({enqueue,setColumns,advance,cursorVisible,nextDelay,snapshot});
}
export function drawTerminalLog(ctx,log,r,now,ink='#e3e3e3',bg='#080808',
 font='"Roboto Condensed",ui-monospace,Menlo,monospace'){
 const b=terminalLineBounds(r);
 const fontSize=b.w<320?16:17;
 ctx.save();
 ctx.beginPath();ctx.rect(b.x,b.y,b.w,b.h);ctx.clip();
 // Match NOMAD/TETRIS SYSTEM title's Roboto Condensed Bold face.
 // Proportional glyphs are individually centred in identically sized cells,
 // preserving monospaced cursor and dot-leader alignment.
 ctx.font='700 '+fontSize+'px '+font;
 ctx.textBaseline='alphabetic';ctx.textAlign='left';
 ctx.letterSpacing='0px';
 if('fontKerning' in ctx)ctx.fontKerning='none';
 const cell=Math.max(1,Math.ceil(Math.max(
  ...['M','W','@','0'].map(ch=>ctx.measureText(ch).width)
 ))+1);
 const columns=Math.max(4,Math.floor(b.w/cell));
 log.setColumns(columns);
 const {cells,cursor}=log.snapshot();
 const metrics=ctx.measureText('H');
 const ascent=metrics.actualBoundingBoxAscent||fontSize*.70;
 const descent=metrics.actualBoundingBoxDescent||0;
 const cellH=Math.ceil(ascent+descent)+4;
 const centerY=b.y+b.h/2;
 const baseline=centerY+(ascent-descent)/2;
 const cursorY=centerY-cellH/2;
 const cursorOn=log.cursorVisible(now);
 for(let i=0;i<columns;i++){
  const ch=cells[i],x=b.x+i*cell;
  const glyphX=x+(cell-ctx.measureText(ch).width)/2;
  if(cursorOn&&i===cursor){
   ctx.fillStyle=ink;ctx.fillRect(x,cursorY,cell,cellH);
   if(ch!==' '){ctx.fillStyle=bg;ctx.fillText(ch,glyphX,baseline);}
  }else if(ch!==' '){
   ctx.fillStyle=ink;ctx.fillText(ch,glyphX,baseline);
  }
 }
 ctx.restore();
}
