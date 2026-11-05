/* Shared NOMAD grayscale tile renderer.
 * Tetromino identity follows the luminance of familiar Tetris colours,
 * not the colours themselves. Bevel geometry is unchanged.
 */
import {PIECE_LUMINANCE} from './piece-luminance.js?v094';
export {PIECE_LUMINANCE};
 const clamp=v=>Math.max(0,Math.min(255,Math.round(v)));
 const gray=n=>{const c=clamp(n);return 'rgb('+c+','+c+','+c+')'};
 // The bevel geometry is unchanged; its numeric levels derive from sRGB.
 // Relative brightness is physically derived from each traditional RGB colour.
 export const drawTileFace=(g,x,y,w,h,kind)=>{
  const side=Math.min(w,h),gap=Math.max(.6,Math.min(1.3,side*.055));
  const level=PIECE_LUMINANCE[kind]??160;
  const xx=x+gap,yy=y+gap,ww=Math.max(1,w-2*gap),hh=Math.max(1,h-2*gap);
  const rim=Math.max(.65,Math.min(1.35,side*.08));
  const rect=(a,b,c,d,t)=>{g.fillStyle=gray(t);g.fillRect(a,b,c,d);};
  rect(xx,yy,ww,hh,level-26);
  rect(xx,yy,ww,rim,level+18);
  rect(xx,yy,rim,hh,level+12);
  rect(xx,yy+hh-rim,ww,rim,level-38);
  rect(xx+ww-rim,yy,rim,hh,level-32);
  const inset=Math.min(3.2,Math.max(1.7,side*.145));
  const fx=xx+inset,fy=yy+inset,fw=Math.max(1,ww-2*inset),fh=Math.max(1,hh-2*inset);
  rect(fx,fy,fw,fh,level-10);
  rect(fx,fy,fw,Math.max(.65,Math.min(1.15,side*.055)),level+20);
  rect(fx,fy+fh-Math.max(.65,Math.min(1,side*.045)),fw,
   Math.max(.65,Math.min(1,side*.045)),level-27);
 };
