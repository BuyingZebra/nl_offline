/* Apple browser adapter. One shared game/renderer for all devices. */
export const appleAdapter=Object.freeze({
 id:'ios',
 matches(nav={}){return /iPhone|iPad|iPod/i.test(String(nav.userAgent||''))||(nav.platform==='MacIntel'&&Number(nav.maxTouchPoints)>1);},
 standalone(nav={},win={}){return nav.standalone===true||Boolean(win.matchMedia?.('(display-mode: standalone)')?.matches);},
 applyRootMode(nav={},win={},doc={}){if(nav.standalone===true)doc.documentElement?.classList?.add?.('ios-standalone');},
 attach(win={},resize=()=>{}){
  const view=win.visualViewport;
  if(!view?.addEventListener)return ()=>{};
  view.addEventListener('resize',resize);
  return ()=>view.removeEventListener?.('resize',resize);
 }
});
