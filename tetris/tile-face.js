/* Shared NOMAD grayscale tile renderer.
 * Tetromino identity uses seven distinct hand-tuned grayscale values.
 * The original bevel geometry and contrast offsets are unchanged.
 */
import {PIECE_LUMINANCE} from './piece-luminance.js?v106';
export {PIECE_LUMINANCE};
 const clamp=v=>Math.max(0,Math.min(255,Math.round(v)));
 const gray=n=>{const c=clamp(n);return 'rgb('+c+','+c+','+c+')'};
 // Identical bevel offsets provide consistent shape detail for all levels.
 export const drawTileFace=(g,x,y,w,h,kind)=>{
  const side=Math.min(w,h),gap=Math.max(.6,Math.min(1.3,side*.055));
  const level=PIECE_LUMINANCE[kind]??160;
  const xx=x+gap,yy=y+gap,ww=Math.max(1,w-2*gap),hh=Math.max(1,h-2*gap);
  // Keep the two brightest bevel highlights distinct even at level 237.
 const highlightScale=Math.min(1,(255-level)/20);
 const rim=Math.max(.65,Math.min(1.35,side*.08));
  const rect=(a,b,c,d,t)=>{g.fillStyle=gray(t);g.fillRect(a,b,c,d);};
  rect(xx,yy,ww,hh,level-26);
  rect(xx,yy,ww,rim,level+18*highlightScale);
  rect(xx,yy,rim,hh,level+12*highlightScale);
  rect(xx,yy+hh-rim,ww,rim,level-38);
  rect(xx+ww-rim,yy,rim,hh,level-32);
  const inset=Math.min(3.2,Math.max(1.7,side*.145));
  const fx=xx+inset,fy=yy+inset,fw=Math.max(1,ww-2*inset),fh=Math.max(1,hh-2*inset);
  rect(fx,fy,fw,fh,level-10);
  rect(fx,fy,fw,Math.max(.65,Math.min(1.15,side*.055)),level+20*highlightScale);
  rect(fx,fy+fh-Math.max(.65,Math.min(1,side*.045)),fw,
   Math.max(.65,Math.min(1,side*.045)),level-27);
 };
