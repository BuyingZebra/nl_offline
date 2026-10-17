/* FIELD ATLAS / ARCADE — persisted, device-local top-five Tetris scores. */
(function (root, factory) {
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.FieldAtlasScores=api;
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:null),function(){
  'use strict';
  const KEY='fieldAtlasTetrisTopFiveV01',LEGACY='fieldAtlasTetrisBest';
  const LIMIT=5;
  const clampInt=(n)=>Number.isFinite(Number(n))?Math.max(0,Math.floor(Number(n))):0;
  function initials(s) {
    return String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3)||'AAA';
  }
  function sanitize(input) {
    if(!Array.isArray(input))return [];
    return input.filter(v=>v&&typeof v==='object'&&Number.isFinite(Number(v.score))&&Number(v.score)>=0)
      .map(v=>({name:initials(v.name),score:clampInt(v.score),
        lines:clampInt(v.lines),level:clampInt(v.level),at:clampInt(v.at)}))
      .sort((a,b)=>b.score-a.score||b.lines-a.lines||a.at-b.at)
      .slice(0,LIMIT);
  }
  function qualifies(entries, score) {
    const points=clampInt(score),list=sanitize(entries);
    return points>0&&(list.length<LIMIT||points>list.at(-1).score);
  }
  function add(entries, entry) {
    if(!qualifies(entries,entry&&entry.score))return sanitize(entries);
    return sanitize([...sanitize(entries),entry]);
  }
  function read(storage) {
    if(!storage)return [];
    try{
      const raw=storage.getItem(KEY);
      if(raw!==null) return sanitize(JSON.parse(raw));
      const best=clampInt(storage.getItem(LEGACY));
      return best>0?[{name:'OLD',score:best,lines:0,level:0,at:0}]:[];
    }catch(e){return [];}
  }
  function save(storage,entries) {
    const list=sanitize(entries);
    try{
      storage?.setItem(KEY,JSON.stringify(list));
      storage?.setItem(LEGACY,String(list[0]?.score||0));
    }catch(e){/* Private browsing may disable storage; gameplay continues. */}
    return list;
  }
  return Object.freeze({KEY,LIMIT,initials,sanitize,qualifies,add,read,save});
});