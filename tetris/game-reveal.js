/* V081: fade in the entire finished game screen as ONE image.
 * The mask lives in the grayscale scene BEFORE the existing CRT compositor,
 * so scanlines, bloom, phosphor selection and vignette stay stationary.
 * The previous staggered header/grid/controls build remains in Git history.
 */
export const GAME_REVEAL_DURATION_MS=850;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export function gameRevealProgress(elapsed){
 const t=Math.max(0,Number(elapsed)||0);
 const x=clamp(t/GAME_REVEAL_DURATION_MS,0,1);
 // Smooth fade with no stepping, vertical roll or UI-region geometry.
 return x*x*(3-2*x);
}
export function paintGameRevealMask(ctx,_layout,width,height,elapsed){
 const w=Math.max(1,Number(width)||1),h=Math.max(1,Number(height)||1);
 const progress=gameRevealProgress(elapsed);
 ctx.setTransform(1,0,0,1,0,0);
 ctx.clearRect(0,0,w,h);
 if(progress>=1)return {complete:true,progress};
 ctx.fillStyle='#080808';
 ctx.globalAlpha=1-progress;
 ctx.fillRect(0,0,w,h);
 ctx.globalAlpha=1;
 return {complete:false,progress};
}
