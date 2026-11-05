/* NOMAD V099 — continuous CRT controls and reference raster integration.
 * A single exponential persistence constant is an explicit idealization.
 * Refresh and decay are parameters, not phosphor chemistry presets.
 */
export const CRT_BOUNDS=Object.freeze({
 minHz:30,maxHz:120,defaultHz:60,
 minPersistenceMs:10,maxPersistenceMs:2000,
 stepPersistenceMs:10,defaultPersistenceMs:190
});
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export function normalizeCRTRefresh(value){
 const x=Number(value);
 return Number.isFinite(x)?Math.round(clamp(x,CRT_BOUNDS.minHz,CRT_BOUNDS.maxHz)):
  CRT_BOUNDS.defaultHz;
}
export function normalizePersistenceMs(value){
 const x=Number(value);
 return Number.isFinite(x)?
  clamp(Math.round(x/CRT_BOUNDS.stepPersistenceMs)*CRT_BOUNDS.stepPersistenceMs,
   CRT_BOUNDS.minPersistenceMs,CRT_BOUNDS.maxPersistenceMs):
  CRT_BOUNDS.defaultPersistenceMs;
}
export function crtRasterLines(height){
 return Math.max(1,Math.min(360,Math.floor(Math.max(1,height)/2.5)));
}
export function advanceCRTPhase(phase,seconds,refreshHz=60){
 const cycles=Math.max(0,Number(seconds)||0)*normalizeCRTRefresh(refreshHz);
 return (((Number(phase)||0)+cycles)%1+1)%1;
}
export function crtScanPosition(x,y,lines){
 const n=Math.max(1,Math.floor(lines));
 const row=Math.max(0,Math.min(n-1,Math.floor(y*n)));
 return (row+clamp(x,0,0.999999))/n;
}
// Number of beam visits and time since the newest visit in a frame interval.
export function rasterVisits(startPhase,seconds,hz,position){
 const refresh=normalizeCRTRefresh(hz);
 const cycles=Math.max(0,Number(seconds)||0)*refresh;
 const start=Number(startPhase)||0;
 const end=start+cycles;
 const eps=1e-8;
 const count=Math.max(0,Math.floor(end-position+eps)-Math.floor(start-position+eps));
 const ageCycles=((end-position)%1+1)%1;
 return {count,ageSeconds:ageCycles/refresh,phase:((end%1)+1)%1};
}
// Ideal first-order phosphor: each beam passage deposits enough energy so
// steady time-AVERAGED luminance equals the requested grayscale drive.
// The returned average is emission integrated over the presentation interval.
export function integratePhosphor({
 prior=0,drive=0,seconds=1/60,refreshHz=60,persistenceMs=190,
 phase=0,position=0,spot=1
}={}){
 const hz=normalizeCRTRefresh(refreshHz);
 const tau=normalizePersistenceMs(persistenceMs)/1000;
 const dt=Math.max(.000001,Math.min(.1,Number(seconds)||1/60));
 const start=Math.max(0,Number(prior)||0);
 const target=clamp(Number(drive)||0,0,1)*clamp(Number(spot)||0,0,1.1);
 const {count,ageSeconds}=rasterVisits(phase,dt,hz,position);
 const period=1/hz;
 const d=Math.exp(-dt/tau);
 const a=Math.exp(-ageSeconds/tau);
 const nSum=count?(1-Math.exp(-count*period/tau))/(1-Math.exp(-period/tau)):0;
 const impulse=target*period/tau;
 const end=start*d+impulse*a*nSum;
 const integrated=start*tau*(1-d)+
  impulse*tau*(count-a*nSum);
 const average=integrated/dt;
 return {end,average,count};
}
