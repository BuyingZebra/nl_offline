/* Tetris System — direct, user-initiated copy with Safari fallback.
 * Call copyText synchronously from the pointer/key activation handler.
 */
export function createDebugClipboard({navigator,document}={}){
 function fallback(text){
  if(!document?.createElement||!document?.execCommand)return false;
  const field=document.createElement('textarea');
  const prior=document.activeElement;
  field.value=text;
  field.setAttribute('readonly','');
  field.style.cssText='position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none;';
  try{
   (document.body||document.documentElement).appendChild(field);
   field.focus();field.select();field.setSelectionRange?.(0,text.length);
   return Boolean(document.execCommand('copy'));
  }catch(e){return false;}
  finally{
   field.remove();
   try{prior?.focus?.({preventScroll:true});}catch(e){}
  }
 }
 function copyText(input){
  const text=String(input);
  try{
   if(navigator?.clipboard?.writeText){
    // Critical: this call occurs immediately inside the user gesture.
    return Promise.resolve(navigator.clipboard.writeText(text))
     .then(()=>true,()=>fallback(text));
   }
  }catch(e){/* Use the synchronous selection fallback. */}
  return Promise.resolve(fallback(text));
 }
 return Object.freeze({copyText});
}
