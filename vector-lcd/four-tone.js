/* 4-tone version of a tile, for screens with four drive levels (DMG-01, CRT).
 * Same shapes; every grey snaps to white, light, dark or black. The tile's
 * body (its first fill) becomes dark, tones lighter than the body become
 * light, and darker tones black, so bevels and details keep their order. */
export const FOUR_TONES=Object.freeze({light:170,dark:85,black:0});
export function fourToneSVG(svg){
 const greys=[...svg.matchAll(/fill="rgb\((\d+),\d+,\d+\)"/g)].map(m=>Number(m[1]));
 if(!greys.length)return svg;
 const body=greys[0];
 return svg.replace(/fill="rgb\((\d+),\d+,\d+\)"/g,(_,v)=>{
  const g=Number(v),t=g===body?FOUR_TONES.dark:g>body?FOUR_TONES.light:FOUR_TONES.black;
  return 'fill="rgb('+t+','+t+','+t+')"';
 });
}
