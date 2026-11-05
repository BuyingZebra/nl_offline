/* NOMAD V098: independent neutral decay and raster timing.
 * t10 checkpoints are approximate historic data. Component weights are
 * experimental, NOT calibrated fits. Hue is applied later by the compositor.
 */
export const CRT_REFRESH_RATES=Object.freeze([50,60,75]);
export const PHOSPHOR_PROFILES=Object.freeze([
 Object.freeze({id:'balanced',label:'CUSTOM / SHORT-MEDIUM',fastWeight:.98,
  slowWeight:.02,fastTau:.005,slowTau:.19,riseTau:.14,tailMs:1500,referenceT10:null}),
 Object.freeze({id:'p39',label:'P39 / LONG',fastWeight:.98,
  slowWeight:.02,fastTau:.060,slowTau:1.2,riseTau:.20,tailMs:5000,referenceT10:.150}),
 Object.freeze({id:'p31',label:'P31 / SHORT',fastWeight:.98,
  slowWeight:.02,fastTau:.000015,slowTau:.14,riseTau:.12,tailMs:900,referenceT10:.000038}),
 Object.freeze({id:'p1',label:'P1 / MEDIUM',fastWeight:.98,
  slowWeight:.02,fastTau:.010,slowTau:.25,riseTau:.16,tailMs:1700,referenceT10:.024}),
 Object.freeze({id:'p4',label:'P4 / SHORT',fastWeight:.98,
  slowWeight:.02,fastTau:.000024,slowTau:.08,riseTau:.08,tailMs:600,referenceT10:.000060})
]);
export function phosphorProfile(id){
 return PHOSPHOR_PROFILES.find(p=>p.id===id)||PHOSPHOR_PROFILES[0];
}
export function nextPhosphorProfile(id){
 const i=PHOSPHOR_PROFILES.findIndex(p=>p.id===id);
 return PHOSPHOR_PROFILES[(i+1)%PHOSPHOR_PROFILES.length].id;
}
export function phosphorEnvelope(profile,seconds){
 const p=typeof profile==='string'?phosphorProfile(profile):profile;
 const t=Math.max(0,Number(seconds)||0);
 return p.fastWeight*Math.exp(-t/p.fastTau)+p.slowWeight*Math.exp(-t/p.slowTau);
}
export function normalizeCRTRefresh(value){
 const n=Number(value);return CRT_REFRESH_RATES.includes(n)?n:60;
}
export function nextCRTRefresh(value){
 const i=CRT_REFRESH_RATES.indexOf(normalizeCRTRefresh(value));
 return CRT_REFRESH_RATES[(i+1)%CRT_REFRESH_RATES.length];
}
// Two sample rows per virtual beam line minimum avoids aliasing.
export function crtRasterLines(historyPixelHeight){
 return Math.max(1,Math.min(360,Math.floor(Math.max(1,historyPixelHeight)/2.5)));
}
export function advanceCRTPhase(phase,seconds,refreshHz=60){
 const cycles=Math.max(0,Number(seconds)||0)*normalizeCRTRefresh(refreshHz);
 return (Math.max(0,Number(phase)||0)+cycles)%1;
}
export function crtScanPosition(x,y,lines){
 const row=Math.max(0,Math.min(lines-1,Math.floor(y*lines)));
 return (row+Math.max(0,Math.min(1,x)))/lines;
}
export function beamHitsPixel(startPhase,cycles,scanPos){
 if(cycles>=1)return true;
 if(cycles<=0)return false;
 const end=(startPhase+cycles)%1;
 const age=(end-scanPos+1)%1;
 return age<=cycles;
}
