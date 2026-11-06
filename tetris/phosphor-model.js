/* NOMAD V104 — whole-display phosphor envelope.
 * No raster beam or refresh coupling. Rise is fast; falling light follows a
 * continuously adjustable exponential time constant. GPU uses the same model.
 * This is a neutral luminance approximation, not calibrated tube physics.
 */
export const PHOSPHOR_BOUNDS=Object.freeze({
 minPersistenceMs:10,maxPersistenceMs:120,
 stepPersistenceMs:10,defaultPersistenceMs:120,
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
 prior,drive,seconds,persistenceMs=PHOSPHOR_BOUNDS.defaultPersistenceMs,riseMs=PHOSPHOR_BOUNDS.riseMs
){
 const previous=clamp(Number(prior)||0,0,1);
 const target=clamp(Number(drive)||0,0,1);
 const duration=Math.max(0,Number(seconds)||0);
 const tau=(target>previous?Math.max(.001,riseMs):normalizePersistenceMs(persistenceMs))/1000;
 return target+(previous-target)*Math.exp(-duration/tau);
}

