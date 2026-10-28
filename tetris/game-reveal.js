/* V082: shared game-side luminance curve.
 * The GPU receives one progress value for the finished combined image.
 * Regional and canvas-mask reveal experiments remain in Git history.
 */
export const GAME_REVEAL_DURATION_MS=850;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export function gameRevealProgress(elapsed){
 const t=Math.max(0,Number(elapsed)||0);
 const x=clamp(t/GAME_REVEAL_DURATION_MS,0,1);
 return x*x*(3-2*x);
}
