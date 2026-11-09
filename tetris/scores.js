/* NOMAD V123 — one device-local personal best, with non-destructive
 * migration from the former top-five leaderboard and legacy numeric best.
 * No accounts, initials or network calls. Storage errors never stop gameplay.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.FieldAtlasScores=api;
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:null),function(){
 'use strict';
 const KEY='nomadTetrisPersonalBestV01';
 const OLD_TOP_FIVE='fieldAtlasTetrisTopFiveV01';
 const LEGACY='fieldAtlasTetrisBest';
 const positive=n=>{
  const value=Number(n);
  return Number.isFinite(value)?Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,Math.floor(value))):0;
 };
 function sanitize(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const score=positive(value.score);
  if(!score)return null;
  return Object.freeze({score,lines:positive(value.lines),
   level:positive(value.level),at:positive(value.at)});
 }
 function better(a,b){
  if(!a)return b;
  if(!b)return a;
  return b.score>a.score?b:a;
 }
 function parseRecord(raw){
  try{return sanitize(JSON.parse(raw));}catch(error){return null;}
 }
 function read(storage,locks){
  if(!storage)return null;
  try{
   const raw=storage.getItem(KEY);
   let result=parseRecord(raw);
   const old=storage.getItem(OLD_TOP_FIVE);
   if(old!==null){
    try{
     const list=JSON.parse(old);
     if(Array.isArray(list))
      for(const entry of list)result=better(result,sanitize(entry));
    }catch(error){/* Damaged old leaderboard. */}
   }
   const legacy=positive(storage.getItem(LEGACY));
   result=better(result,legacy>0?sanitize({score:legacy}):null);
   // A successful migration has no effect on the former backup records.
   return result&&raw!==JSON.stringify(result)?save(storage,result,locks):result;
  }catch(error){return null;}
 }
 function save(storage,record,locks){
  const best=sanitize(record);
  if(!best||!storage)return best;
  function persist(){
   let winner=best;
   try{
    const raw=storage.getItem(KEY);
    winner=better(parseRecord(raw),best);
    const serialized=JSON.stringify(winner);
    if(raw!==serialized)storage.setItem(KEY,serialized);
   }catch(error){/* Storage disabled; keep the current-session best. */}
   return winner;
  }
  if(!locks?.request)return persist();
  try{
   const visibleBest=better(parseRecord(storage.getItem(KEY)),best);
   // Serialize the shared read/compare/write across tabs without blocking
   // gameplay or delaying the current tab's personal-best display.
   void locks.request(KEY,persist).catch(persist);
   return visibleBest;
  }catch(error){return persist();}
 }
 function update(storage,current,candidate,locks){
  const existing=sanitize(current);
  const incoming=sanitize(candidate);
  return incoming&&(!existing||incoming.score>existing.score)?
   save(storage,incoming,locks):(existing?current:null);
 }
 return Object.freeze({KEY,OLD_TOP_FIVE,LEGACY,sanitize,read,save,update});
});
