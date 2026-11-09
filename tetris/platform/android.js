/* Android browser adapter: browser chrome and standalone viewport support. */
export const androidAdapter=Object.freeze({
 id:'android',
 matches(nav={}){return /Android/i.test(String(nav.userAgent||''));},
 standalone(nav={},win={}){return Boolean(win.matchMedia?.('(display-mode: standalone)')?.matches);},
 applyRootMode(nav={},win={},doc={}){if(this.standalone(nav,win))doc.documentElement?.classList?.add?.('android-standalone');},
 attach(win={},resize=()=>{}){
  const view=win.visualViewport;
  if(!view?.addEventListener)return ()=>{};
  view.addEventListener('resize',resize);
  return ()=>view.removeEventListener?.('resize',resize);
 }
});
