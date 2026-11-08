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
