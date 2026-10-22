/* V066: one version contract; authoritative value lives in three-v027.html.
 * No stateful app or browser API dependencies, so these rules are testable.
 */
export const BUILD_META_NAME='tetris-build';
export function getBuildVersion(document){
 const version=document.querySelector('meta[name="tetris-build"]')?.getAttribute('content');
 if(!/^[0-9]{3}$/.test(version||''))throw Error('Missing or invalid Tetris build metadata');
 return version;
}
export function parsePublishedBuild(html){
 if(typeof html!=='string')return null;
 const match=html.match(/<meta\s+name=["']tetris-build["']\s+content=["']([0-9]{3})["']\s*\/?\s*>/i);
 return match?match[1]:null;
}
export function shouldReloadBuild(current,published,{hidden=false,modalOpen=false,gameStatus='ready'}={}){
 if(!/^[0-9]{3}$/.test(current||'')||!/^[0-9]{3}$/.test(published||''))return false;
 return !hidden&&!modalOpen&&gameStatus==='ready'&&Number(published)>Number(current);
}
