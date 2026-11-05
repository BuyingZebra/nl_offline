/* Shared NOMAD grayscale tile renderer.
 * Tetromino identity follows the luminance of familiar Tetris colours,
 * not the colours themselves. Bevel geometry is unchanged.
 */
 const TETROMINO_RGB=Object.freeze({
  I:[0,255,255],   // cyan
  J:[0,0,255],     // blue
  L:[255,153,0],   // orange
  O:[255,255,0],   // yellow
  S:[0,255,0],     // green
  T:[160,32,240],  // purple
  Z:[255,0,0]     // red
 });
 const toLinear=channel=>{
  const c=channel/255;
  return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);
 };
 const toSRGB=value=>{
  const c=value<=.0031308?12.92*value:1.055*Math.pow(value,1/2.4)-.055;
  return Math.round(Math.max(0,Math.min(1,c))*255);
 };
 export const PIECE_LUMINANCE=Object.freeze(Object.fromEntries(
  Object.entries(TETROMINO_RGB).map(([kind,[r,g,b]])=>[
   kind,toSRGB(.2126*toLinear(r)+.7152*toLinear(g)+.0722*toLinear(b))
  ])
 ));
 const clamp=v=>Math.max(0,Math.min(255,Math.round(v)));
 const gray=n=>{const c=clamp(n);return 'rgb('+c+','+c+','+c+')'};
 // Temporary flat tile treatment for both gameplay and terminal.
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
