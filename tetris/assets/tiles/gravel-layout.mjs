/* NOMAD authored organic gravel v119.
 * Pixel positions are intentionally irregular and grid-constrained;
 * smooth variants share their original anchors, with stable subpixel jitter.
 * These are source coordinates, not board/screen coordinates.
 */
export const I_GRAVEL_BITS=Object.freeze([
 [3,3,1,1],[6,6,1,1],[9,3,1,1],[4,9,2,1],[10,8,1,1],
 [13,2,1,1],[16,5,2,1],[20,3,1,1],[14,9,1,1],[18,8,1,1],
 [22,7,1,1],[24,3,2,1],[27,6,1,1],[25,9,1,1],[30,2,1,1],
 [31,8,2,1],[34,5,1,1],[36,9,1,1],[39,3,1,1],[41,7,2,1],
 [45,4,1,1],[3,6,1,1],[7,8,1,1],[11,5,1,1],[17,2,1,1],
 [21,9,1,1],[27,2,1,1],[29,5,1,1],[35,2,1,1],[38,7,1,1],
 [44,9,1,1]
].map(point=>Object.freeze(point)));
export const J_GRAVEL_BITS=Object.freeze([
 [3,3,1,1],[8,2,1,1],[5,5,1,1],[9,6,1,1],[2,8,1,1],
 [6,8,1,1],[4,9,1,1],[8,9,1,1],[3,6,1,1]
].map(point=>Object.freeze(point)));

const drift=(i,axis)=>{
 const seed=((i+1)*37+(axis+1)*29+11)%23;
 return (seed-11)*0.027;
};
export function smoothGravelCenters(bits){
 return bits.map(([x,y,w,h],i)=>Object.freeze({
  x:x+w/2+drift(i,0),y:y+h/2+drift(i,1),
  radius:(w===2||h===2?.52:.36)+((i*7)%3)*.025
 }));
}
