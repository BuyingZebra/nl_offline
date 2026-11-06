/* NOMAD V102 — whole-display phosphor envelope.
 * No raster beam or refresh coupling. Rise is fast; falling light follows a
 * continuously adjustable exponential time constant. GPU uses the same model.
 * This is a neutral luminance approximation, not calibrated tube physics.
 */
export const PHOSPHOR_BOUNDS=Object.freeze({
 minPersistenceMs:10,maxPersistenceMs:2000,
 stepPersistenceMs:10,defaultPersistenceMs:190,
 riseMs:12
});
const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));
export function normalizePersistenceMs(value){
 const n=Number(value);
 return Number.isFinite(n)?
  clamp(Math.round(n/PHOSPHOR_BOUNDS.stepPersistenceMs)*
   PHOSPHOR_BOUNDS.stepPersistenceMs,
   PHOSPHOR_BOUNDS.minPersistenceMs,PHOSPHOR_BOUNDS.maxPersistenceMs):
  PHOSPHOR_BOUNDS.defaultPersistenceMs;
}
// Fast excitation plus a slower fall after the incoming video loses light.
// No artificial reset is needed for a menu, pause, or gameplay transition.
export function integratePhosphorResponse(
 prior,drive,seconds,persistenceMs=190,riseMs=PHOSPHOR_BOUNDS.riseMs
){
 const previous=clamp(Number(prior)||0,0,1);
 const target=clamp(Number(drive)||0,0,1);
 const duration=Math.max(0,Number(seconds)||0);
 const tau=(target>previous?Math.max(.001,riseMs):normalizePersistenceMs(persistenceMs))/1000;
 return target+(previous-target)*Math.exp(-duration/tau);
}

/* Low-cost separable approximation of a Gaussian CRT point-spread function.
 * Published measurements support Gaussian spots at modest beam current
 * (Knudson 1968); real high-current spots can have broader tails
 * (Infante 1993). No unmeasured physical length scale is claimed here.
 */
export const PHOSPHOR_OPTICS=Object.freeze({
 spreadFraction:0.16,
 gaussianSigmaQuarterPixels:1.4,
 gaussianRadiusQuarterPixels:2
});
export function gaussianKernel1D(sigma=PHOSPHOR_OPTICS.gaussianSigmaQuarterPixels,
 radius=PHOSPHOR_OPTICS.gaussianRadiusQuarterPixels){
 const width=Math.max(1,Math.round(radius));
 const n=Math.max(.05,Number(sigma)||1.4);
 const values=Array.from({length:width*2+1},(_,i)=>{
  const x=i-width;
  return Math.exp(-.5*(x/n)**2);
 });
 const total=values.reduce((sum,value)=>sum+value,0);
 return values.map(value=>value/total);
}
