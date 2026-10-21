/* V063 — single owner of Canvas layer invalidation.
 * Marking a layer is independent of scheduling the next compositor frame.
 * take() consumes one pending paint; markAll handles resize/restart.
 */
export function createDirtyLayers(names=['base','board','sidebar','controls']){
 const known=new Set(names),dirty=new Set(names);
 function mark(...ids){
  for(const id of ids){if(!known.has(id))throw Error('Unknown canvas layer: '+id);dirty.add(id);}
 }
 function take(id){
  if(!known.has(id))throw Error('Unknown canvas layer: '+id);
  if(!dirty.has(id))return false;
  dirty.delete(id);return true;
 }
 function has(id){return dirty.has(id);}
 function markAll(){mark(...names);}
 return Object.freeze({mark,take,has,markAll,pending:()=>[...dirty]});
}
