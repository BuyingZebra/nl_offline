/* Strict DMG-01 reference adapter for NOMAD.
 * Copyright (c) original shader contributors, Apache-2.0; see
 * ./dmg01-reference-lab/upstream/LICENSE.
 *
 * One 160×144 four-level electrically addressed LCD, source five-pass
 * shaders unmodified. No hybrid high-detail optical bypass or extra app mode.
 */
import * as THREE from './vendor/three/three.bundle.js';

const WIDTH=160, HEIGHT=144;
const VS='#version 300 es\nprecision highp float; out vec2 vTexCoord; void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));vTexCoord=p;gl_Position=vec4(p*2.-1.,0.,1.);}';
const FINAL_VS='#version 300 es\nprecision highp float; out vec2 vTexCoord; void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));vTexCoord=vec2(p.x,1.-p.y);gl_Position=vec4(p*2.-1.,0.,1.);}';
const NAMES=['dmg01-row-load-v2.slang','dmg01-crosstalk-summary-v3.slang','dmg01-response-v1.slang','dmg01-matrix-v1.slang','dmg01-display-v1.slang'];
const INCLUDE=['dmg01-crosstalk-phase-local.inc','dmg01-crosstalk-lumped.inc','dmg01-stn-surrogate.inc'];
const SOURCE_BASE='./dmg01-reference-lab/upstream/';
const REFERENCE=Object.freeze({
 DriveContrast:1,PanelTemperatureCelsius:20,IonicMobility:.05,
 StickingOpticalGain:.082,IonicChargeResponse:.000126777389,
 IonicReleaseResponse:.000007115625,IonicTimeScale:1,
 BakedScanout:1,CurrentDriveCoherence:0,LatchOffsetLines:1,
 RowCrosstalk:1,ColumnCrosstalk:1,LineVariation:0,PanelMottle:0,
 PixelFill:.875,PixelEdge:1,ShadowStrength:.18,
 ShadowOffsetX:.11,ShadowOffsetY:.13,Contrast:1,ContrastBias:0,
 ScreenBrightness:1,ScreenChroma:1,PolarizerAge:0,DebugView:0,DebugGain:12
});

export function physicalLCDGrid(){return {columns:WIDTH,rows:HEIGHT};}

async function loadSources(){
 const files=Object.fromEntries(await Promise.all([...NAMES,...INCLUDE].map(async name=>{
  const response=await fetch(SOURCE_BASE+name,{cache:'force-cache'});
  if(!response.ok)throw Error('DMG source unavailable: '+name+' / HTTP '+response.status);
  return [name,await response.text()];
 })));
 const expand=(src,depth=0)=>{
  if(depth>5)throw Error('DMG source include cycle');
  return src.replace(/^\s*#include\s+"([^"]+)"\s*$/gm,(_,name)=>{
   if(!Object.prototype.hasOwnProperty.call(files,name))throw Error('Missing DMG include '+name);
   return expand(files[name],depth+1);
  });
 };
 return NAMES.map(name=>{
  const src=files[name],vi=src.indexOf('#pragma stage vertex'),fi=src.indexOf('#pragma stage fragment');
  if(vi<0||fi<0)throw Error('Invalid upstream source stages: '+name);
  const defs=[...src.slice(0,vi).matchAll(/layout\s*\((?:push_constant|std140[^)]*)\)\s*uniform\s+(Push|UBO)\s*\{([\s\S]*?)\}\s*(params|global)\s*;/g)]
   .map(([,type,fields,instance])=>'struct '+type+' {'+fields+'}; uniform '+type+' '+instance+';').join('\n');
  if(!defs.includes('uniform UBO global'))throw Error('Missing upstream GL globals: '+name);
  const fragment=expand(src.slice(fi+'#pragma stage fragment'.length))
   .replace(/layout\s*\(set\s*=\s*\d+\s*,\s*binding\s*=\s*\d+\s*\)\s*/g,'')
   .replace(/layout\s*\(\s*location\s*=\s*\d+\s*\)\s*(?=in\s)/g,'')
   .replace(/^\s*#pragma.*$/gm,'');
  if(/#include|#pragma|layout\s*\(set\s*=|layout\s*\(\s*location\s*=\s*\d+\s*\)\s*in\b/.test(fragment))
   throw Error('Unconverted Vulkan GLSL directive: '+name);
  return {name,shader:'#version 300 es\nprecision highp float;\nprecision highp int;\n'+defs+'\n'+fragment};
 });
}

class ReferencePanel {
 constructor(){
  this.canvas=document.createElement('canvas');
  this.canvas.width=640;this.canvas.height=576;
  const gl=this.canvas.getContext('webgl2',{alpha:false,antialias:false,
   depth:false,stencil:false,preserveDrawingBuffer:true});
  if(!gl)throw Error('WebGL2 is required for strict DMG-01 physics');
  if(!gl.getExtension('EXT_color_buffer_float'))
   throw Error('RGBA32F render targets unavailable; strict DMG-01 physics not supported');
  this.gl=gl;
  this.programs=[];this.targets=[];
  this.frames=0;this.feedback=0;
  this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);
 }
 compile(type,src,label){
  const gl=this.gl,sh=gl.createShader(type);
  gl.shaderSource(sh,src);gl.compileShader(sh);
  if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){
   const reason=gl.getShaderInfoLog(sh);gl.deleteShader(sh);
   throw Error('DMG shader '+label+': '+reason);
  }
  return sh;
 }
 link(vs,fs,label){
  const gl=this.gl;
  const v=this.compile(gl.VERTEX_SHADER,vs,label+' vertex');
  const f=this.compile(gl.FRAGMENT_SHADER,fs,label+' fragment');
  const program=gl.createProgram();
  gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);
  gl.deleteShader(v);gl.deleteShader(f);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))
   throw Error('DMG program '+label+': '+gl.getProgramInfoLog(program));
  return {program,label,locations:new Map()};
 }
 location(p,name){
  if(!p.locations.has(name))p.locations.set(name,this.gl.getUniformLocation(p.program,name));
  return p.locations.get(name);
 }
 texture(w,h,format=this.gl.RGBA32F){
  const gl=this.gl,t=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,format,w,h,0,gl.RGBA,
   format===gl.RGBA8?gl.UNSIGNED_BYTE:gl.FLOAT,null);
  return t;
 }
 target(w,h){
  const gl=this.gl,t=this.texture(w,h),fb=gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)
   throw Error('DMG RGBA32F framebuffer is incomplete');
  gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
  return {texture:t,fb,w,h};
 }
 async init(){
  const shaders=await loadSources();
  this.programs=shaders.map((source,i)=>this.link(i===4?FINAL_VS:VS,source.shader,source.name));
  this.input=[this.texture(WIDTH,HEIGHT,this.gl.RGBA8),
              this.texture(WIDTH,HEIGHT,this.gl.RGBA8)];
  this.targets=[this.target(1,HEIGHT),this.target(WIDTH,1),
   this.target(WIDTH,HEIGHT),this.target(WIDTH,HEIGHT),null,
   this.target(WIDTH,HEIGHT)];
  return this;
 }
 program(p,inputs,target,w,h,sw,sh){
  const gl=this.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER,target?.fb||null);
  gl.viewport(0,0,w,h);gl.useProgram(p.program);
  gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);
  gl.bindVertexArray(this.vao);
  inputs.forEach(([name,texture],i)=>{
   const at=this.location(p,name);
   if(at===null)return;
   gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(at,i);
  });
  for(const [name,values] of [
   ['global.OutputSize',[w,h,1/w,1/h]],
   ['global.OriginalSize',[WIDTH,HEIGHT,1/WIDTH,1/HEIGHT]],
   ['global.SourceSize',[sw,sh,1/sw,1/sh]]
  ]){
   const at=this.location(p,name);
   if(at!==null)gl.uniform4fv(at,values);
  }
  for(const [name,value] of [['global.FrameCount',this.frames],
                             ['global.TotalSubFrames',1]]){
   const at=this.location(p,name);
   if(at!==null)gl.uniform1ui(at,value);
  }
  for(const [name,value] of Object.entries(REFERENCE)){
   const at=this.location(p,'params.'+name);
   if(at!==null)gl.uniform1f(at,value);
  }
  gl.drawArrays(gl.TRIANGLES,0,3);
  const error=gl.getError();
  if(error!==gl.NO_ERROR)throw Error('DMG pass '+p.label+' GPU error '+error);
 }
 reset(){
  this.frames=0;this.feedback=0;
  for(const i of [2,5]){
   this.gl.bindFramebuffer(this.gl.FRAMEBUFFER,this.targets[i].fb);
   this.gl.clearColor(0,0,0,0);this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }
 }
 render(pixels,width,height){
  const gl=this.gl;
  // The source pixels are exactly 160×144, RGBA8, with rows bottom-up.
  // Upload with UNPACK_FLIP_Y_WEBGL=false to match readRenderTargetPixels.
  const next=this.input[1],prev=this.input[0];
  for(const t of this.frames===0?[prev,next]:[next]){
   gl.bindTexture(gl.TEXTURE_2D,t);
   gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
   gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,WIDTH,HEIGHT,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  }
  this.program(this.programs[0],[['Source',next],['OriginalHistory1',prev]],
   this.targets[0],1,HEIGHT,WIDTH,HEIGHT);
  this.program(this.programs[1],[['Source',this.targets[0].texture],
    ['Original',next],['OriginalHistory1',prev]],
    this.targets[1],WIDTH,1,1,HEIGHT);
  const read=this.targets[this.feedback===0?5:2];
  const write=this.targets[this.feedback===0?2:5];
  this.program(this.programs[2],[['Source',this.targets[1].texture],
    ['Original',next],['OriginalHistory1',prev],
    ['PassOutput0',this.targets[0].texture],['PassFeedback2',read.texture]],
    write,WIDTH,HEIGHT,WIDTH,1);
  this.program(this.programs[3],[['Source',write.texture]],
    this.targets[3],WIDTH,HEIGHT,WIDTH,HEIGHT);
  this.feedback=1-this.feedback;
  this.input.reverse();this.frames++;
  const targetWidth=Math.max(640,Math.min(1440,Math.round(width)));
  const targetHeight=Math.round(targetWidth*HEIGHT/WIDTH);
  if(this.canvas.width!==targetWidth||this.canvas.height!==targetHeight){
   this.canvas.width=targetWidth;this.canvas.height=targetHeight;
  }
  this.program(this.programs[4],[['Source',this.targets[3].texture]],
   null,this.canvas.width,this.canvas.height,WIDTH,HEIGHT);
  gl.finish(); // The second WebGL context must sample completed LCD optics.
 }
 dispose(){
  const gl=this.gl;
  for(const p of this.programs)gl.deleteProgram(p.program);
  for(const t of this.targets)if(t){gl.deleteFramebuffer(t.fb);gl.deleteTexture(t.texture);}
  for(const t of this.input||[])gl.deleteTexture(t);
  gl.deleteVertexArray(this.vao);
 }
}

const SOURCE_VS='varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
// The raw image is generated at full device resolution upstream; only this
// input stage reduces it to the native four-level drive resolution.
// Explicit linear -> encoded RGB conversion matches Retro Display Lab input.
const SOURCE_FS='varying vec2 vUv;uniform sampler2D tDiffuse;uniform float uAspect;'
 +'vec3 srgb(vec3 c){vec3 lo=12.92*c;vec3 hi=1.055*pow(max(c,vec3(0.)),vec3(1.0/2.4))-.055;'
 +'return mix(lo,hi,step(vec3(.0031308),c));}'
 +'void main(){float panelAspect=160.0/144.0;float ratio=uAspect/panelAspect;'
 +'vec2 extent=ratio<1.0?vec2(ratio,1.):vec2(1.,1./ratio);'
 +'vec2 point=(vUv-(.5-.5*extent))/extent;'
 +'float visible=step(0.,point.x)*step(point.x,1.)*step(0.,point.y)*step(point.y,1.);'
 +'vec3 original=texture2D(tDiffuse,clamp(point,vec2(0.),vec2(1.))).rgb;'
 +'gl_FragColor=vec4(srgb(mix(vec3(1.),original,visible)),1.); }';

const OUTPUT_FS='varying vec2 vUv; uniform sampler2D tLCD; uniform float uAspect;'
 +'vec3 linearize(vec3 x){vec3 lo=x/12.92;vec3 hi=pow((max(x,vec3(0.))+.055)/1.055,vec3(2.4));'
 +'return mix(lo,hi,step(vec3(.04045),x));}'
 +'void main(){float panelAspect=160.0/144.0;float ratio=uAspect/panelAspect;'
 +'vec2 extent=ratio<1.0?vec2(ratio,1.):vec2(1.,1./ratio);'
 +'vec2 point=(vUv-(.5-.5*extent))/extent;'
 +'float visible=step(0.,point.x)*step(point.x,1.)*step(0.,point.y)*step(point.y,1.);'
 +'vec3 optical=texture2D(tLCD,clamp(point,vec2(0.),vec2(1.))).rgb;'
 +'vec3 field=vec3(.015);gl_FragColor=vec4(mix(field,linearize(optical),visible),1.); }';

export function createPhysicalLCDPass(){
 const pass=new THREE.Pass();
 pass.needsSwap=true;
 const sourceRT=new THREE.WebGLRenderTarget(WIDTH,HEIGHT,{
  depthBuffer:false,stencilBuffer:false,format:THREE.RGBAFormat,
  type:THREE.UnsignedByteType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter
 });
 sourceRT.texture.colorSpace=THREE.NoColorSpace;
 const samples=new Uint8Array(WIDTH*HEIGHT*4);
 const sourceMaterial=new THREE.ShaderMaterial({
  uniforms:{tDiffuse:{value:null},uAspect:{value:1}},
  vertexShader:SOURCE_VS,fragmentShader:SOURCE_FS,depthWrite:false,depthTest:false
 });
 const textureCanvas=document.createElement('canvas');
 const texture=new THREE.CanvasTexture(textureCanvas);
 texture.colorSpace=THREE.NoColorSpace;
 texture.minFilter=THREE.LinearFilter;
 texture.magFilter=THREE.LinearFilter;
 texture.generateMipmaps=false;
 const outputMaterial=new THREE.ShaderMaterial({
  uniforms:{tLCD:{value:texture},uAspect:{value:1}},
  vertexShader:SOURCE_VS,fragmentShader:OUTPUT_FS,depthWrite:false,depthTest:false
 });
 const inputQuad=new THREE.FullScreenQuad(sourceMaterial);
 const outputQuad=new THREE.FullScreenQuad(outputMaterial);
 let core=null,failure=null,configured=false;
 let lastPhysicalTime=0,frameDebt=0;
 const physicalFrameMs=1000/59.7275;
 const ready=new ReferencePanel();
 ready.init().then(value=>{core=value;}).catch(error=>{
  failure=error;console.error('Strict DMG-01 initialization failed:',error);
 });
 pass.enabled=false;
 pass.setSize=()=>{};
 pass.configure=({width=160,height=144}={})=>{
  sourceMaterial.uniforms.uAspect.value=width/Math.max(1,height);
  outputMaterial.uniforms.uAspect.value=width/Math.max(1,height);
  configured=true;
 };
 pass.reset=()=>{core?.reset();lastPhysicalTime=0;frameDebt=0;};
 pass.render=(renderer,writeBuffer,readBuffer)=>{
  if(!configured)pass.configure({width:readBuffer.width,height:readBuffer.height});
  if(failure)throw failure;
  if(!core){
   // Never replace missing physical simulation with a fake LCD texture.
   renderer.setRenderTarget(pass.renderToScreen?null:writeBuffer);
   renderer.clear();
   return;
  }
  sourceMaterial.uniforms.tDiffuse.value=readBuffer.texture;
  renderer.setRenderTarget(sourceRT);
  inputQuad.render(renderer);
  renderer.readRenderTargetPixels(sourceRT,0,0,WIDTH,HEIGHT,samples);
  const size=renderer.getDrawingBufferSize(new THREE.Vector2());
  // Run exactly one electrical update per simulated DMG frame. Source
  // content is held between address latches if the browser redraws slower.
  // Do not speed up or slow down STN response based on requestAnimationFrame.
  const timestamp=performance.now();
  if(lastPhysicalTime===0)frameDebt=physicalFrameMs;
  else frameDebt+=Math.min(100,timestamp-lastPhysicalTime);
  lastPhysicalTime=timestamp;
  const steps=Math.min(6,Math.floor(frameDebt/physicalFrameMs));
  frameDebt-=steps*physicalFrameMs;
  if(steps>0){
   for(let i=0;i<steps;i++)
    core.render(samples,Math.min(size.x,size.y));
   texture.image=core.canvas;
   texture.needsUpdate=true;
  }
  renderer.setRenderTarget(pass.renderToScreen?null:writeBuffer);
  outputQuad.render(renderer);
 };
 pass.dispose=()=>{
  core?.dispose();sourceRT.dispose();texture.dispose();
  sourceMaterial.dispose();outputMaterial.dispose();inputQuad.dispose();outputQuad.dispose();
 };
 return pass;
}
