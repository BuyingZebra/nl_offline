/* NOMAD V097 — phosphor reference profiles for comparative CRT testing.
 * Temporal model: I(t)=Af*exp(-t/tf)+As*exp(-t/ts).
 * The 10% target values come from historic tube tables. The dual-component
 * decomposition and faint-tail duration are MODEL ASSUMPTIONS, not curve fits.
 * References: HP Application Note 115 (hpmemoryproject.org/an/pdf/an_115.pdf);
 * Compton, Selecting phosphors for displays, Information Display (1989);
 * Di Lollo et al, Spatial Vision 10(4), 1997, doi:10.1163/156856897x00276.
 * Color triplets below are approximate illustrative chromaticities, not SPDs.
 */
export const PHOSPHOR_PROFILES=Object.freeze([
 Object.freeze({id:'p39',label:'P39 / LONG',color:'yellow-green',tint:[.64,1,.19],
  fastWeight:.98,slowWeight:.02,fastTau:.060,slowTau:1.2,riseTau:.20,
  tailMs:5000,referenceT10:.150}),
 Object.freeze({id:'p31',label:'P31 / SHORT',color:'green',tint:[.22,1,.25],
  fastWeight:.98,slowWeight:.02,fastTau:.000015,slowTau:.14,riseTau:.12,
  tailMs:900,referenceT10:.000038}),
 Object.freeze({id:'p1',label:'P1 / MEDIUM',color:'yellow-green',tint:[.50,1,.19],
  fastWeight:.98,slowWeight:.02,fastTau:.010,slowTau:.25,riseTau:.16,
  tailMs:1700,referenceT10:.024}),
 Object.freeze({id:'p4',label:'P4 / WHITE',color:'white',tint:[1,1,1],
  fastWeight:.98,slowWeight:.02,fastTau:.000024,slowTau:.08,riseTau:.08,
  tailMs:600,referenceT10:.000060})
]);
export function phosphorProfile(id){
 return PHOSPHOR_PROFILES.find(p=>p.id===id)||PHOSPHOR_PROFILES[0];
}
export function nextPhosphorProfile(id){
 const index=PHOSPHOR_PROFILES.findIndex(p=>p.id===id);
 return PHOSPHOR_PROFILES[(index+1)%PHOSPHOR_PROFILES.length].id;
}
export function phosphorEnvelope(profile,seconds){
 const p=typeof profile==='string'?phosphorProfile(profile):profile;
 const t=Math.max(0,Number(seconds)||0);
 return p.fastWeight*Math.exp(-t/p.fastTau)+p.slowWeight*Math.exp(-t/p.slowTau);
}
