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

/** Independent instantaneous-equilibrium reference for measuring persistence.
 * Uses exactly the same physical_target(), optical lookup, and effective
 * row/column-corrected drive as the history-integrated material pass. */
export function makeEquilibriumDiagnostic(reference,surrogate){
 // No second STN integration shader: sample the exact effective drive already
 // packed into the main physical response's alpha channel, and calculate its
 // no-history optical equilibrium using the source's original lookup curves.
 // The generated lookup data is injected verbatim from upstream .inc.
 function extract(name){
  const anchor='float '+name+'(';
  const i=reference.indexOf(anchor);
  if(i<0||reference.indexOf(anchor,i+1)>=0)throw Error('Missing/duplicate physical function '+name);
  const open=reference.indexOf('{',i);if(open<0)throw Error('Missing function body '+name);
  let depth=0,close=-1;
  for(let p=open;p<reference.length;p++){
   if(reference[p]==='{')depth++;
   if(reference[p]==='}'&&--depth===0){close=p+1;break;}
  }
  if(close<0)throw Error('Unbalanced physical function '+name);
  return reference.slice(i,close);
 }
 const names=['condition_target','contrast_conditions','physical_target',
  'physical_optical_correction','physical_optical_state'];
 if(!surrogate.includes('DMG_PHYSICAL_TARGET_Q')||!surrogate.includes('DMG_PHYSICAL_OPTICAL'))
  throw Error('Missing original generated physical tables');
 return [
  '#version 300 es',
  'precision highp float;precision highp int;',
  'struct Push {float DriveContrast;}; uniform Push params;',
  'struct UBO {vec4 OriginalSize;}; uniform UBO global;',
  'in vec2 vTexCoord;out vec4 FragColor;',
  'uniform sampler2D Source;',
  surrogate,
  ...names.map(extract),
  'void main(){',
  ' ivec2 pos=clamp(ivec2(floor(vTexCoord*global.OriginalSize.xy)),',
  '    ivec2(0),textureSize(Source,0)-ivec2(1));',
  ' float effectiveDrive=fract(texelFetch(Source,pos,0).a)*4.;',
  ' float director=clamp(physical_target(effectiveDrive),0.,1.);',
  ' float optical=physical_optical_state(director);',
  ' FragColor=vec4(optical,clamp(effectiveDrive/3.,0.,1.),director,1.);',
  '}'
 ].join('\n');
}
export function makeShapeOptics(reference){
 const start=reference.lastIndexOf('void main()');
 if(start<0)throw Error('Source optics main() missing');
 return reference.slice(0,start)+[
  'uniform sampler2D ShapeCoverage;',
  'uniform sampler2D EquilibriumState;',
  'uniform float ShapeOpticalDebug;',
  'uniform float ShadowInspectionGain;',
  'float fineState(vec2 uv){',
  ' vec2 dimensions=vec2(textureSize(Source,0));',
  ' vec2 at=clamp(uv,vec2(0.),vec2(1.))*dimensions-.5;',
  ' ivec2 p=ivec2(floor(at));ivec2 hi=ivec2(dimensions)-1;',
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
  ' vec2 uv=vTexCoord;float mode=ShapeOpticalDebug;',
  ' float state=fineState(uv);',
  ' state=clamp((state-.25)*params.Contrast+.25+params.ContrastBias,0.,1.);',
  ' float target=texture(EquilibriumState,uv).r;',
  ' float drive=texture(EquilibriumState,uv).g;',
  ' vec3 background=optical_color(0.);',
  ' float front=activeCoverage(uv);',
  ' float gap=clamp(1.-params.PixelFill,0.,1.);',
  ' vec2 pitch=vec2(gap)/max(global.OriginalSize.xy,vec2(1.));',
  ' float dx=abs(activeCoverage(uv+vec2(pitch.x,0.))-activeCoverage(uv-vec2(pitch.x,0.)));',
  ' float dy=abs(activeCoverage(uv+vec2(0.,pitch.y))-activeCoverage(uv-vec2(0.,pitch.y)));',
  ' float contour=clamp(max(dx,dy),0.,1.);',
  ' float fill=clamp(params.PixelFill*params.PixelFill-gap*contour,0.,1.);',
  ' if(mode>1.5&&mode<2.5)fill=front;',
  ' else if(mode>3.5&&mode<4.5)fill=params.PixelFill*params.PixelFill;',
  ' vec3 color=mix(background,optical_color(state),fill);',
  ' vec2 offset=vec2(params.ShadowOffsetX,params.ShadowOffsetY)/global.OriginalSize.xy;',
  ' vec2 reflected=clamp(uv-offset,vec2(0.),vec2(1.));',
  ' float behind=activeCoverage(reflected);',
  ' float shadowGapMask=max(behind-min(front,behind),0.);',
  ' float shadowState=fineState(reflected);',
  ' float inspector=max(ShadowInspectionGain,1.);',
  ' vec3 shadow=background*params.ShadowStrength*shadowState*shadowGapMask;',
  ' if(mode>.5&&mode<1.5){FragColor=vec4(vec3(clamp(shadowGapMask*inspector,0.,1.)),1.);return;}',
  ' if(mode>2.5&&mode<3.5){FragColor=vec4(clamp(to_srgb(shadow*inspector),0.,1.),1.);return;}',
  ' if(mode>4.5&&mode<5.5){FragColor=vec4(vec3(contour),1.);return;}',
  ' if(mode>5.5&&mode<6.5){FragColor=vec4(vec3(drive),1.);return;}',
  ' if(mode>6.5&&mode<7.5){FragColor=vec4(vec3(state),1.);return;}',
  ' if(mode>7.5&&mode<8.5){',
  '  float residual=(state-target);float a=clamp(abs(residual)*10.,0.,1.);',
  '  FragColor=vec4(residual>0.?vec3(a,.05,a*.3):vec3(.05,a,a),1.);return;',
  ' }',
  ' if(mode>8.5&&mode<9.5){',
  '  float ionic=texture(Source,uv).a;',
  '  FragColor=vec4(vec3(clamp(ionic,0.,1.)),1.);return;',
  ' }',
  ' // Warm-edge hypothesis is NOT measured or part of the original DMG optics.',
  ' float warmEdge=clamp(front-activeCoverage(clamp(uv+vec2(.22,.17)/global.OriginalSize.xy,vec2(0.),vec2(1.))),0.,1.);',
  ' if(mode>9.5&&mode<10.5){FragColor=vec4(warmEdge,0.,0.,1.);return;}',
  ' color-=shadow*inspector;',
  ' if(mode>10.5)color=mix(color,vec3(.42,.035,.027),warmEdge*.60);',
  ' float lum=dot(color,vec3(.2126,.7152,.0722));',
  ' color=mix(vec3(lum),color,params.ScreenChroma)*params.ScreenBrightness;',
  ' FragColor=vec4(clamp(to_srgb(color),0.,1.),1.);',
  '}'
 ].join('\n');
}
