/**
 * NOMAD material-physics laboratory — shader adapter.
 * The upstream .slang sources are fetched unchanged. This module adapts
 * only the spatial electrical driver and display aperture, retaining the
 * original measured response tables, temporal integration and optical palette.
 * The new structure describes a hypothetical shape-electrode STN screen, not
 * a claim that a stock Nintendo DMG-01 had nonrectangular electrodes.
 */
function uniqueReplace(source,from,to,label){
  if(source.split(from).length!==2)throw Error('Physics adaptation '+label+': anchor mismatch');
  return source.replace(from,to);
}
export function makeFineMaterialResponse(reference){
  // Do not replace the physical target/drift/ionic/temperature/exposure
  // functions. Only adapt the method supplying effective drive per sample.
  let source=uniqueReplace(reference,
    'uniform sampler2D PassFeedback2;',
    ['uniform sampler2D PassFeedback2;',
     'uniform sampler2D NativeCurrentInput,NativePreviousInput;',
     'uniform sampler2D NativeCurrentFeedback,NativePreviousFeedback;'].join('\n'),
    'native input textures');
  source=uniqueReplace(source,
    'return floor(clamp(1.0 - luma, 0.0, 1.0) * 3.0 + 0.5);',
    'return clamp(1.0 - luma, 0.0, 1.0) * 3.0;',
    'continuous source drive');
  const begin='vec2 phase_local_drive_coordinates(ivec2 p)';
  const end='float condition_target(';
  const i=source.indexOf(begin),j=source.indexOf(end,i+begin.length);
  if(i<0||j<i||source.indexOf(begin,i+1)!==-1)throw Error('Physics adaptation: phase function not unique');
  // Original native feedback packs the effective drive into the fractional
  // part of alpha: 2*index + 8*origin + drive/4. Recover the model-produced
  // deviation from the quantized native drive, not an invented effect.
  const adapter=[
    'vec2 correctionsAt(ivec2 cell){',
    ' ivec2 maxCell=textureSize(NativeCurrentInput,0)-ivec2(1);',
    ' cell=clamp(cell,ivec2(0),maxCell);',
    ' float driveNow=floor(gameboy_drive_index(texelFetch(NativeCurrentInput,cell,0).rgb)+.5);',
    ' float driveOld=floor(gameboy_drive_index(texelFetch(NativePreviousInput,cell,0).rgb)+.5);',
    ' float effectiveNow=fract(texelFetch(NativeCurrentFeedback,cell,0).a)*4.;',
    ' float effectiveOld=fract(texelFetch(NativePreviousFeedback,cell,0).a)*4.;',
    ' return vec2(effectiveNow-driveNow,effectiveOld-driveOld);',
    '}',
    'vec2 spatialMatrixCorrection(ivec2 fineCell){',
    ' vec2 uv=(vec2(fineCell)+.5)/global.OriginalSize.xy;',
    ' vec2 scale=vec2(textureSize(NativeCurrentInput,0));',
    ' vec2 center=uv*scale-.5;',
    ' ivec2 low=ivec2(floor(center));',
    ' vec2 f=fract(center);',
    ' vec2 a=correctionsAt(low);',
    ' vec2 b=correctionsAt(low+ivec2(1,0));',
    ' vec2 c=correctionsAt(low+ivec2(0,1));',
    ' vec2 d=correctionsAt(low+ivec2(1,1));',
    ' return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);',
    '}',
    'vec2 phase_local_drive_coordinates(ivec2 p){',
    ' vec2 drives=vec2(source_drive_at(p),previous_drive_at(p));',
    ' vec2 correction=spatialMatrixCorrection(p);',
    ' return clamp(drives+correction,vec2(0.),vec2(3.));',
    '}',
    ''
  ].join('\n');
  source=source.slice(0,i)+adapter+source.slice(j);
  source=uniqueReplace(source,[
   'int driveIndex = int(gameboy_drive_index(',
   '      texelFetch(Original, sourceCoord, 0).rgb',
   '   ));'].join('\n'),[
   'int driveIndex = int(floor(gameboy_drive_index(',
   '      texelFetch(Original, sourceCoord, 0).rgb',
   '   )+0.5));'].join('\n'),'current drive transition key');
  source=uniqueReplace(source,[
   'int previousDriveIndex = int(gameboy_drive_index(',
   '      texelFetch(OriginalHistory1, sourceCoord, 0).rgb',
   '   ));'].join('\n'),[
   'int previousDriveIndex = int(floor(gameboy_drive_index(',
   '      texelFetch(OriginalHistory1, sourceCoord, 0).rgb',
   '   )+0.5));'].join('\n'),'previous drive transition key');
  // Preserve the ORIGINAL DMG scanout: 144 active rows in 154 line
  // intervals, no matter how many independent material samples represent a
  // row. Without this remapping a 2x material grid would mis-time its lower
  // half and a 3x grid would exceed the whole DMG scan window.
  source=uniqueReplace(source,
    ['float latchFraction = (float(sourceCoord.y)',
     '         + clamp(params.LatchOffsetLines, 0.0, 1.0)) / 154.0;'].join('\n'),
    ['float nativeRow = max(0.0, (float(sourceCoord.y)+0.5)',
     '         * (144.0 / global.OriginalSize.y) - 0.5);',
     '      float latchFraction = (nativeRow',
     '         + clamp(params.LatchOffsetLines, 0.0, 1.0)) / 154.0;'].join('\n'),
    'native 154-line scanout across fine samples');
  // Remaining target/drift/ionic/Simpson functions and physical history
  // main() are unchanged from the reference.
  return source;
}
export function makeShapeOptics(reference){
  const start=reference.lastIndexOf('void main()');
  if(start<0)throw Error('Source optics main() missing');
  // Original optical_color() interpolates the measured sRGB reference
  // palette in linear light. No new colour curve is introduced.
  return reference.slice(0,start)+[
    'uniform sampler2D ShapeCoverage;',
    'uniform float ShapeOpticalDebug;',
    'uniform float ShadowInspectionGain;',
    'float fineState(vec2 uv){',
    ' vec2 dimensions=vec2(textureSize(Source,0));',
    ' vec2 at=clamp(uv,vec2(0.),vec2(1.))*dimensions-.5;',
    ' ivec2 p=ivec2(floor(at));',
    ' ivec2 hi=ivec2(dimensions)-ivec2(1);',
    ' vec2 w=fract(at);',
    ' float a=texelFetch(Source,clamp(p,ivec2(0),hi),0).r;',
    ' float b=texelFetch(Source,clamp(p+ivec2(1,0),ivec2(0),hi),0).r;',
    ' float c=texelFetch(Source,clamp(p+ivec2(0,1),ivec2(0),hi),0).r;',
    ' float d=texelFetch(Source,clamp(p+ivec2(1,1),ivec2(0),hi),0).r;',
    ' return mix(mix(a,b,w.x),mix(c,d,w.x),w.y);',
    '}',
    'float activeCoverage(vec2 uv){',
    ' return texture(ShapeCoverage,clamp(uv,vec2(0.),vec2(1.))).r;',
    '}',
    'void main(){',
    ' vec2 uv=vTexCoord;',
    ' float state=fineState(uv);',
    ' state=clamp((state-.25)*params.Contrast+.25+params.ContrastBias,0.,1.);',
    ' vec3 background=optical_color(0.);',
    ' float front=activeCoverage(uv);',
    ' // Homogenize the source 87.5% aperture fill across the continuous',
    ' // STN substrate. It is never constrained to the dark sprite mask.',
    ' // Otherwise the whole unmarked screen incorrectly becomes mustard.',
    ' float gap=clamp(1.-params.PixelFill,0.,1.);',
    ' vec2 gapPitch=vec2(gap)/max(global.OriginalSize.xy,vec2(1.));',
    ' float edgeX=abs(activeCoverage(uv+vec2(gapPitch.x,0.))',
    '               -activeCoverage(uv-vec2(gapPitch.x,0.)));',
    ' float edgeY=abs(activeCoverage(uv+vec2(0.,gapPitch.y))',
    '               -activeCoverage(uv-vec2(0.,gapPitch.y)));',
    ' float contour=clamp(max(edgeX,edgeY),0.,1.);',
    ' // Generalize the source inactive-gap colouring to the shapes only',
    ' // at contour boundaries. No hidden square cell graphics are added.',
    ' float shapeFill=clamp(params.PixelFill-gap*contour,0.,1.);',
    ' float pixelMask=shapeFill;',
    ' if(ShapeOpticalDebug>1.5 && ShapeOpticalDebug<2.5)',
    '  pixelMask=front; // prior shape-only aperture (mustard background)',
    ' else if(ShapeOpticalDebug>3.5 && ShapeOpticalDebug<4.5)',
    '  pixelMask=params.PixelFill; // continuous substrate without contour',
    ' vec3 color=mix(background,optical_color(state),pixelMask);',
    ' // Generalize the reference reflector intersection to a silhouette.',
    ' // The reflector projection retains the original displacement/strength.',
    ' vec2 offset=vec2(params.ShadowOffsetX,params.ShadowOffsetY)',
    '  /global.OriginalSize.xy;',
    ' vec2 reflected=clamp(uv-offset,vec2(0.),vec2(1.));',
    ' float behind=activeCoverage(reflected);',
    ' float shadowGapMask=max(behind-min(front,behind),0.);',
    ' float shadowState=fineState(reflected);',
    ' // Source geometry, displaced by the same original DMG offset.',
    ' // Diagnostic gains magnify visibility only, NEVER alter feedback state.',
    ' float inspector=max(ShadowInspectionGain,1.);',
    ' vec3 realShadow=background*params.ShadowStrength*shadowState*shadowGapMask;',
    ' if(ShapeOpticalDebug>4.5){',
    '  FragColor=vec4(vec3(contour),1.);return;',
    ' }',
    ' if(ShapeOpticalDebug>.5 && ShapeOpticalDebug<1.5){',
    '  FragColor=vec4(vec3(clamp(shadowGapMask*inspector,0.,1.)),1.);return;',
    ' }',
    ' if(ShapeOpticalDebug>2.5){',
    '  FragColor=vec4(clamp(to_srgb(realShadow*inspector),0.,1.),1.);return;',
    ' }',
    ' color-=realShadow*inspector;',
    ' float lum=dot(color,vec3(.2126,.7152,.0722));',
    ' color=mix(vec3(lum),color,params.ScreenChroma)*params.ScreenBrightness;',
    ' FragColor=vec4(clamp(to_srgb(color),0.,1.),1.);',
    '}'
  ].join('\n');
}
