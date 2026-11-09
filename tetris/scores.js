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
 function read(storage){
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
   return result&&raw!==JSON.stringify(result)?save(storage,result):result;
  }catch(error){return null;}
 }
 function save(storage,record){
  const best=sanitize(record);
  if(!best||!storage)return best;
  let winner=best;
  try{
   const raw=storage.getItem(KEY);
   winner=better(parseRecord(raw),best);
   const serialized=JSON.stringify(winner);
   if(raw!==serialized)storage.setItem(KEY,serialized);
  }catch(error){/* Storage disabled; keep the current-session best. */}
  return winner;
 }
 function update(storage,current,candidate){
  const existing=sanitize(current);
  const incoming=sanitize(candidate);
  return incoming&&(!existing||incoming.score>existing.score)?
   save(storage,incoming):(existing?current:null);
 }
 function createPersistence(storage,indexedDB){
  if(!indexedDB)return null;
  let opening;
  return async function persist(candidate){
   const proposed=sanitize(candidate);
   try{
    opening??=new Promise((resolve,reject)=>{
     const request=indexedDB.open('nomad-tetris-scores',1);
     request.onupgradeneeded=()=>request.result.createObjectStore('records');
     request.onsuccess=()=>resolve(request.result);
     request.onerror=()=>reject(request.error);
    });
    const db=await opening;
    const best=await new Promise((resolve,reject)=>{
     const transaction=db.transaction('records','readwrite');
     const records=transaction.objectStore('records');
     const request=records.get(KEY);
     let winner;
     request.onsuccess=()=>{
      const existing=sanitize(request.result);
      winner=better(existing,proposed);
      if(winner&&winner!==existing)records.put(winner,KEY);
     };
     transaction.oncomplete=()=>resolve(winner);
     transaction.onabort=()=>reject(transaction.error);
    });
    // Preserve the legacy record as a compatibility mirror. The database
    // transaction is authoritative for concurrent writes.
    if(best)save(storage,best);
    return best;
   }catch(error){
    return proposed?save(storage,proposed):read(storage);
   }
  };
 }
 return Object.freeze({KEY,OLD_TOP_FIVE,LEGACY,sanitize,read,save,update,createPersistence});
});
