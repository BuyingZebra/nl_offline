/* NOMAD V117 — seven Game Boy-era engraved phosphor tile faces.
 * Monochrome source only: the existing CRT compositor owns green/amber tint,
 * persistence and bloom. Board, NEXT and HOLD use this same renderer.
 * All tile artwork stays inside the caller's exact tile rectangle.
 */
import {PIECE_LUMINANCE} from './piece-luminance.js?v106';
export {PIECE_LUMINANCE};

const clamp=v=>Math.max(0,Math.min(255,Math.round(v)));
const gray=v=>{const n=clamp(v);return 'rgb('+n+','+n+','+n+')';};
const PATTERNS=Object.freeze({
 I:'grain', J:'hollow', L:'diagonal', O:'nested',
 S:'dotted', T:'raised', Z:'reverse'
});
export {PATTERNS as PIECE_PATTERNS};

export function drawTileFace(g,x,y,w,h,kind){
 if(!(w>0&&h>0))return;
 const s=Math.min(w,h),level=PIECE_LUMINANCE[kind]??PIECE_LUMINANCE.T;
 // Keep existing geometry and block-to-block spacing exactly as before.
 const gap=Math.max(.6,Math.min(1.3,s*.055));
 const xx=x+gap,yy=y+gap,ww=Math.max(0,w-2*gap),hh=Math.max(0,h-2*gap);
 if(!(ww>0&&hh>0))return;
 const rect=(a,b,c,d,v)=>{
  if(!(c>0&&d>0))return;
  g.fillStyle=gray(v);g.fillRect(a,b,c,d);
 };
 // Normalized coordinates keep every motif in the same square, regardless
 // of the mobile playfield / preview scale. No blur or extra render passes.
 const tile=(u,v,uw,vh,lum)=>rect(xx+u*ww,yy+v*hh,uw*ww,vh*hh,lum);
 const core=(u,v,uw,vh,lum)=>tile(u,v,uw,vh,lum);
 const rim=Math.min(1.35,Math.max(.65,s*.075));
 rect(xx,yy,ww,hh,level-48);
 rect(xx,yy,ww,rim,level+18);
 rect(xx,yy,rim,hh,level+11);
 rect(xx,yy+hh-rim,ww,rim,level-68);
 rect(xx+ww-rim,yy,rim,hh,level-53);
 const small=s<12;
 const pattern=PATTERNS[kind]||'raised';
 if(pattern==='nested'){
  // Bright inner square in a recessed double frame (approved O preview).
  core(.12,.12,.76,.76,level-15);
  core(.23,.23,.54,.54,level+8);
  core(.31,.31,.38,.38,level-78);
  core(.37,.37,.26,.26,level-25);
  if(!small)core(.39,.39,.22,.08,level+18);
 }else if(pattern==='hollow'){
  // Deep square hole with a crisp illuminated frame.
  core(.13,.13,.74,.74,level-18);
  core(.19,.19,.62,.08,level+13);
  core(.19,.19,.08,.62,level+6);
  core(.19,.73,.62,.08,level-46);
  core(.73,.19,.08,.62,level-38);
  core(.28,.28,.44,.44,level-88);
  if(!small)core(.36,.36,.28,.28,level-61);
 }else if(pattern==='diagonal'||pattern==='reverse'){
  // Paired angular facets, like the bevelled Game Boy diagonal glyphs.
  core(.12,.12,.76,.76,level-21);
  const flip=pattern==='reverse';
  const facets=small?3:4;
  for(let i=0;i<facets;i++){
   const u=.17+i*(.59/facets);
   const v=flip?.67-i*(.59/facets):.17+i*(.59/facets);
   core(u,v,.59/facets+.03,.16,level+14);
   core(u,flip?v-.085:v+.085,.59/facets+.03,.095,level-72);
  }
  core(flip?.13:.66,.13,.21,.13,level+23);
  core(flip?.66:.13,.73,.21,.12,level-56);
 }else if(pattern==='raised'){
  // Broad central relief, highlighted along its top and left edges.
  core(.10,.10,.80,.80,level-19);
  core(.18,.18,.64,.64,level+2);
  core(.18,.18,.64,.105,level+19);
  core(.18,.18,.105,.64,level+10);
  core(.18,.715,.64,.105,level-64);
  core(.715,.18,.105,.64,level-49);
  if(!small)core(.35,.35,.32,.32,level-12);
 }else{
  // Deterministic pixel-grain, differentiated by density for I versus S.
  core(.12,.12,.76,.76,level+5);
  const dense=pattern==='grain';
  const count=small?3:dense?5:4;
  const pitch=.68/count;
  for(let row=0;row<count;row++)for(let col=0;col<count;col++){
   const code=(row*11+col*7+(dense?3:1))%7;
   if(!dense&&code===1)continue;
   const u=.16+col*pitch+(code%3)*pitch*.1;
   const v=.16+row*pitch+(code%2)*pitch*.1;
   const dot=(dense?.36:.26)*pitch;
   core(u,v,dot,dot,level-(code%3===0?83:64));
  }
  if(dense){
   core(.13,.13,.69,.06,level+20);
   core(.13,.13,.06,.69,level+12);
  }
 }
}
