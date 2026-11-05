/* NOMAD V097: research-informed, NOT calibrated phosphor envelopes.
 * Compton (Information Display, 1989): P39 has seconds-long 0.1% tail.
 * Wolf & Deubel (Spatial Vision, 1997): P31 grating contrast ~1.4% at
 * 50 ms in one photopic measurement; contrast != luminance decay.
 * Other profiles are illustrative categories, NOT measured fitted curves.
 * The fast/slow amplitudes, excitation rise, and durations below are
 * engineering hypotheses for visual testing, not published constants.
 */
export const PHOSPHOR_PROFILES=Object.freeze([
 Object.freeze({id:'p39',label:'P39 / LONG GREEN',short:'P39',prompt:.48,
  fast:.28,slow:.24,fastTau:.16,slowTau:1.1,riseTau:.25,tailMs:7700}),
 Object.freeze({id:'p31',label:'P31 / SHORT GREEN',short:'P31',prompt:.70,
  fast:.28,slow:.02,fastTau:.008,slowTau:.13,riseTau:.08,tailMs:950}),
 Object.freeze({id:'p1',label:'P1 / MEDIUM GREEN',short:'P1',prompt:.66,
  fast:.29,slow:.05,fastTau:.03,slowTau:.25,riseTau:.16,tailMs:1700}),
 Object.freeze({id:'p4',label:'P4 / SHORT WHITE*',short:'P4',prompt:.81,
  fast:.18,slow:.01,fastTau:.005,slowTau:.06,riseTau:.05,tailMs:500})
]);
export function phosphorProfile(id){
 return PHOSPHOR_PROFILES.find(p=>p.id===id)||PHOSPHOR_PROFILES[0];
}
export function nextPhosphorProfile(id){
 const i=PHOSPHOR_PROFILES.findIndex(p=>p.id===id);
 return PHOSPHOR_PROFILES[(i+1)%PHOSPHOR_PROFILES.length].id;
}
export function phosphorEnvelope(profile,age,heldSeconds=1){
 const p=typeof profile==='string'?phosphorProfile(profile):profile;
 const t=Math.max(0,Number(age)||0);
 const exposure=1-Math.exp(-Math.max(0,heldSeconds)/p.riseTau);
 return (p.fast*Math.exp(-t/p.fastTau)+
  p.slow*exposure*Math.exp(-t/p.slowTau));
}
