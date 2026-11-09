/* Standards-first desktop and unknown-browser fallback. */
export const genericAdapter=Object.freeze({
 id:'generic',
 matches:()=>true,
 standalone(nav={},win={}){return Boolean(win.matchMedia?.('(display-mode: standalone)')?.matches);},
 applyRootMode:()=>{},
 attach:()=>()=>{}
});
