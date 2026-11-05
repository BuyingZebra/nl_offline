/* Shared NOMAD Tetris tile renderer, extracted unchanged from terminal-screen.js V083.
 * Geometry and luminance are intentionally identical; this belongs to gameplay,
 * independently of the archived terminal startup.
 */
 const levels={I:.99,J:.8,L:.92,O:.94,S:.76,T:.85,Z:.73};
 const clamp=v=>Math.max(0,Math.min(255,Math.round(v)));
 const gray=n=>{const c=clamp(n);return 'rgb('+c+','+c+','+c+')'};
 // Temporary flat tile treatment for both gameplay and terminal.
 // Preserve each tetromino type's original luminance, geometry and spacing.
 export const drawTileFace=(g,x,y,w,h,kind)=>{
  const side=Math.min(w,h),gap=Math.max(.6,Math.min(1.3,side*.055));
  const level=28+190*(levels[kind]||.8);
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
