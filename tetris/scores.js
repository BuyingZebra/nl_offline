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
 function read(storage){
  if(!storage)return null;
  try{
   let result=null;
   const raw=storage.getItem(KEY);
   if(raw!==null){
    try{result=sanitize(JSON.parse(raw));}catch(error){/* Legacy fallback below. */}
   }
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
   if(result&&(!raw||raw!==JSON.stringify(result))){
    try{storage.setItem(KEY,JSON.stringify(result));}
    catch(error){/* Read-only/private storage remains usable in memory. */}
   }
   return result;
  }catch(error){return null;}
 }
 function save(storage,record){
  const best=sanitize(record);
  if(best)try{storage?.setItem(KEY,JSON.stringify(best));}
  catch(error){/* Storage disabled; keep the current-session best. */}
  return best;
 }
 function update(storage,current,candidate){
  const existing=sanitize(current);
  const incoming=sanitize(candidate);
  return incoming&&(!existing||incoming.score>existing.score)?
   save(storage,incoming):(existing?current:null);
 }
 return Object.freeze({KEY,OLD_TOP_FIVE,LEGACY,sanitize,read,save,update});
});
