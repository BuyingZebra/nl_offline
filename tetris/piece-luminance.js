/* NOMAD V094 — perceived monochrome brightness for traditional Tetris colors.
 * Convert standard sRGB tetromino colors to relative Rec.709 luminance in
 * linear light, then encode a neutral sRGB grayscale value for Canvas2D.
 * NO colored piece pixels enter the phosphor/CRT compositor.
 */
export const TETROMINO_RGB=Object.freeze({
 I:'#00f0f0', // cyan
 J:'#0000f0', // blue
 L:'#f0a000', // orange
 O:'#f0f000', // yellow
 S:'#00f000', // green
 T:'#a000f0', // purple
 Z:'#f00000'  // red
});
const srgbToLinear=c=>{
 const x=c/255;
 return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
};
const linearToSrgb=x=>x<=.0031308?x*12.92:1.055*x**(1/2.4)-.055;
export function srgbLuminance(hex){
 if(!/^#[0-9a-f]{6}$/i.test(hex))throw new TypeError('Expected #rrggbb');
 const components=[1,3,5].map(offset=>srgbToLinear(parseInt(hex.slice(offset,offset+2),16)));
 const linear=.2126*components[0]+.7152*components[1]+.0722*components[2];
 return Math.round(Math.min(1,Math.max(0,linearToSrgb(linear)))*255);
}
export const PIECE_LUMINANCE=Object.freeze(
 Object.fromEntries(Object.entries(TETROMINO_RGB).map(([kind,color])=>[
  kind,srgbLuminance(color)
 ]))
);
export function pieceLuminance(kind){return PIECE_LUMINANCE[kind]??PIECE_LUMINANCE.T;}
