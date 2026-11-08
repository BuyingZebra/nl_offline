/* V060: Pre-upload only newly changed CanvasTextures through Three.js's
 * supported WebGLRenderer.initTexture API. Measures CPU-side upload submission,
 * which may include graphics-driver waits; NOT actual GPU execution time.
 *
 * Tracks Texture.version (incremented by needsUpdate) independently for each
 * texture and never uploads the same version twice through this helper.
 */
export function createTextureUploadProfiler({renderer,onTiming=()=>{},now=()=>performance.now()}={}){
 const revisions=new WeakMap();
 function upload(texture,name){
  if(!texture||typeof renderer?.initTexture!=='function')return false;
  const revision=texture.version;
  if(revisions.get(texture)===revision)return false;
  const began=now();
  // Do not mark as synchronized until the upload API returned successfully.
  renderer.initTexture(texture);
  revisions.set(texture,revision);
  // Source dimensions are passed only as diagnostic metadata. They
  // estimate RGBA8 input pixels; they are not GPU timing or VRAM usage.
  const source=texture.image;
  try{onTiming(name,now()-began,{
   width:source?.width||0,height:source?.height||0
  });}catch(e){/* Profiling must not affect gameplay. */}
  return true;
 }
 return Object.freeze({upload});
}
