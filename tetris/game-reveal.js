/* V081 game-screen initialization.
 * A grayscale source mask progressively reveals the REAL completed game
 * interface. The phosphor/CRT compositor is downstream and NEVER animated.
 * Old analog roll shader remains installed but is not used in this build.
 */
export const GAME_REVEAL_DURATION_MS=2800;
export const GAME_REVEAL_SCHEDULE=Object.freeze([
 Object.freeze({id:'header',start:120,end:540,axis:'x'}),
 Object.freeze({id:'board',start:640,end:1580,axis:'y'}),
 Object.freeze({id:'hold',start:970,end:1230,axis:'x'}),
 Object.freeze({id:'next',start:1280,end:1710,axis:'y'}),
 Object.freeze({id:'stats',start:1760,end:1990,axis:'x'}),
 Object.freeze({id:'controls',start:2050,end:2600,axis:'y'}),
 Object.freeze({id:'footer',start:2580,end:2790,axis:'x'})
]);
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export function gameRevealProgress(elapsed){
 const t=Math.max(0,Number(elapsed)||0);
 return Object.fromEntries(GAME_REVEAL_SCHEDULE.map(x=>[
  x.id,clamp((t-x.start)/(x.end-x.start),0,1)
 ]));
}
export function paintGameRevealMask(ctx,layout,width,height,elapsed){
 const w=Math.max(1,Number(width)||1),h=Math.max(1,Number(height)||1);
 const t=Math.max(0,Number(elapsed)||0),progress=gameRevealProgress(t);
 ctx.setTransform(1,0,0,1,0,0);
 ctx.clearRect(0,0,w,h);
 if(t>=GAME_REVEAL_DURATION_MS)return {complete:true,progress};
 ctx.fillStyle='#080808';
 ctx.fillRect(0,0,w,h);
 if(!layout)return {complete:false,progress};
 const r=layout;
 const items=[
  {id:'header',x:r.hx,y:r.hy,w:r.hw,h:r.hh},
  {id:'board',x:r.boardX,y:r.boardY,w:r.boardW,h:r.boardH},
  {id:'hold',...r.holdPanel},
  {id:'next',...r.nextPanel},
  {id:'stats',...r.statsPanel},
  {id:'controls',x:r.dx,y:r.dy,w:r.dw,h:r.dh},
  {id:'footer',x:r.off,y:r.footerY-12,w:r.width,h:24}
 ];
 for(const box of items){
  const stage=GAME_REVEAL_SCHEDULE.find(x=>x.id===box.id);
  const p=progress[box.id];
  if(!p||!box.w||!box.h)continue;
  const x=clamp(box.x,0,w),y=clamp(box.y,0,h);
  const bw=Math.max(0,Math.min(box.w,w-x));
  const bh=Math.max(0,Math.min(box.h,h-y));
  if(!bw||!bh)continue;
  // A rising raster initializes the game board and the deck;
  // the header, previews, stats and version are written left-to-right.
  if(stage.axis==='y')ctx.clearRect(x,y,bw,bh*p);
  else ctx.clearRect(x,y,bw*p,bh);
 }
 return {complete:false,progress};
}
