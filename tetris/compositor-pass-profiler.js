/* V059: opt-in-friendly, CPU-side per-pass instrumentation.
 * WebGL commands can queue asynchronously or block; elapsed time from these
 * wrappers is NOT GPU shader duration. Restore original methods on disposal.
 */
export function instrumentCompositorPasses(passes,labels,onTiming,now=()=>performance.now()){
 const originals=[];
 passes.forEach((pass,i)=>{
  const original=pass.render;
  if(typeof original!=='function')return;
  const name=labels[i]||('Pass '+(i+1));
  function timedRender(...args){
   const began=now();
   try{return original.apply(this,args);}
   finally{
    const elapsed=now()-began;
    try{onTiming(name,elapsed);}catch(e){/* Never break compositor */ }
   }
  }
  originals.push({pass,original,timedRender});
  pass.render=timedRender;
 });
 return Object.freeze({
  dispose(){
   for(const {pass,original,timedRender} of originals)
    if(pass.render===timedRender)pass.render=original;
  }
 });
}
