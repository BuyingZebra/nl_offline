/* NOMAD single-row VT terminal: fixed cells and real control-character semantics.
 * No DOM, WebGL, or game-rule ownership. Rendering is a separate Canvas2D step.
 */
const pad=n=>String(n).padStart(2,'0');
function stamped(date){
 const d=date instanceof Date&&Number.isFinite(date.getTime())?date:new Date();
 return '['+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds())+'] ';
}
export function terminalLineBounds(r){
 return {x:r.dx+5,y:r.footerY-12,w:Math.max(1,r.dw-10),h:24};
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
  columns=Math.max(4,Math.min(cells.length,Math.floor(Number(n)||4)));
  cursor=Math.min(cursor,columns-1);
  if(current.length>columns-3)current=current.slice(0,columns-3);
 }
 function start(now){
  const entry=events.shift();
  if(!entry){phase='hold';nextAt=now+holdMs;return;}
  command('CR',now);command('EL',now);
  write('>',now);write(' ',now);
  const max=columns-3;
  const full=stamped(entry.at)+entry.full;
  const short=stamped(entry.at)+entry.short;
  current=(full.length<=max?full:short).slice(0,max);
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
    // On a character terminal: BS, SP, BS. One occupied cell is
    // erased per tick, and the cursor finishes at that cell.
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
export function drawTerminalLog(ctx,log,r,now,ink='#e3e3e3',bg='#080808'){
 const b=terminalLineBounds(r);
 const fontSize=b.w<320?17:18;
 ctx.save();
 ctx.beginPath();ctx.rect(b.x,b.y,b.w,b.h);ctx.clip();
 ctx.font='400 '+fontSize+'px "VT323","Share Tech Mono",ui-monospace,Menlo,monospace';
 ctx.textBaseline='alphabetic';ctx.textAlign='left';
 ctx.letterSpacing='0px';
 if('fontKerning' in ctx)ctx.fontKerning='none';
 const cell=Math.max(1,ctx.measureText('M').width);
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
  const ch=cells[i];
  const x=b.x+i*cell;
  if(cursorOn&&i===cursor){
   // Full-width, full-height VT block. Reverse video for occupied cells.
   ctx.fillStyle=ink;ctx.fillRect(x,cursorY,cell,cellH);
   if(ch!==' '){ctx.fillStyle=bg;ctx.fillText(ch,x,baseline);}
  }else if(ch!==' '){
   ctx.fillStyle=ink;ctx.fillText(ch,x,baseline);
  }
 }
 ctx.restore();
}
