/* V074 - lightweight DOM boot, runs before Three.js downloads.
 * No fetch, no storage writes, no interaction with the game engine.
 */
(function(root){
 'use strict';
 const doc=root.document;
 const veil=doc.getElementById('boot-overlay');
 const log=doc.getElementById('boot-log');
 const cursor=doc.getElementById('boot-cursor');
 if(!veil||!log||!cursor)return;
 try{
  if(root.localStorage?.getItem('fieldAtlasThemeV06')==='amber')
   veil.classList.add('amber');
 }catch(e){}
 const lines=[
  'NOMAD / SYSTEM ROM 04.07',
  '> INITIALIZING DISPLAY BUS',
  '> ALLOCATING VIDEO BUFFER',
  '> PHOSPHOR MATRIX ...... OK',
  '> CALIBRATING CRT SIGNAL',
  '> INPUT CHANNEL ........ OK',
  '> MEMORY BANK .......... OK',
  '> ARCADE MODULE ........ OK',
  '> SIGNAL LOCK .......... OK',
  '> TETRIS SYSTEM ........ READY'
 ];
 let typed=false,ready=false,started=false,revealed=false;
 let startRolling=null;
 let row=0,column=0;
 function beginTransition(){
  if(!typed||!ready||started)return;
  started=true;
  // Terminal snaps shut; the underlying game stays covered in black.
  veil.classList.add('boot-off');
  root.setTimeout(()=>{
   if(typeof startRolling==='function')startRolling();
  },145);
 }
 function typeNext(){
  if(row>=lines.length){
   typed=true;
   cursor.classList.add('waiting');
   beginTransition();
   return;
  }
  const line=lines[row];
  if(column===0&&row>0)log.appendChild(doc.createTextNode('\n'));
  if(column<line.length){
   log.appendChild(doc.createTextNode(line[column++]));
   root.setTimeout(typeNext,10);
  }else{
   row++;column=0;
   root.setTimeout(typeNext,105);
  }
 }
 root.FieldAtlasTetrisBoot=Object.freeze({
  firstFrame(onStartRolling){
   if(ready)return;
   ready=true;
   startRolling=onStartRolling;
   beginTransition();
  },
  rollFrame(){
   if(!started||revealed)return;
   revealed=true;
   // Pop the fully rendered CRT on, already in its rolling state.
   veil.hidden=true;
  },
  // Two complete vertical revolutions: constant early speed, smooth stop.
  rollTurns(t){
   t=Math.max(0,Math.min(1,Number(t)||0));
   const linear=.36,tail=(t-linear)/(1-linear);
   const distance=t<=linear?t:
    linear+(1-linear)*(tail-tail*tail*tail+.5*Math.pow(tail,4));
   const full=linear+(1-linear)*.5;
   return 2*distance/full;
  }
 });
 root.setTimeout(typeNext,170);
})(window);
