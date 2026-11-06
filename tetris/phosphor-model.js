/* NOMAD V103 — whole-display phosphor envelope.
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

/* Published CRT point-spread measurements motivate a narrow peaked spot
 * with non-Gaussian wings at high current. We sample a generalized Lorentzian
 * (Moffat-style) radial PSF. The whole light field is convolved, with
 * explicitly normalized weights: there is no independent 16% bloom blend.
 * Scale/exponent are artistic approximations, not calibrated measurements.
 */
export const PHOSPHOR_OPTICS=Object.freeze({
 radialScale:0.62,radialExponent:1.85,pixelPitch:1.7
});
export function radialPSFWeights(
 scale=PHOSPHOR_OPTICS.radialScale,
 exponent=PHOSPHOR_OPTICS.radialExponent
){
 const radius=Math.max(.1,Number(scale)||.62);
 const power=Math.max(1.01,Number(exponent)||1.85);
 const g=r=>Math.pow(1+(r/radius)**2,-power);
 const raw=[g(0),g(1),g(Math.SQRT2),g(2)];
 const denom=raw[0]+4*(raw[1]+raw[2]+raw[3]);
 const [center,axis,diagonal,outer]=raw.map(v=>v/denom);
 return {center,axis,diagonal,outer};
}
