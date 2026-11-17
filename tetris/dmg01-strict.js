/* Strict DMG-01 reference adapter for NOMAD.
 * Copyright (c) original shader contributors, Apache-2.0; see
 * ./dmg01-reference-lab/upstream/LICENSE.
 *
 * Fixed 640 × 1388 electrode grid; all five LCD physical passes retained.
 * Original five-pass physics, regenerated nominal WS5 row/column calibration.
 * No hybrid high-detail optical bypass or extra app mode.
 */
import * as THREE from './vendor/three/three.bundle.js';
import {extendDmgCalibration} from './dmg01-portrait-calibration.js?v281';

const WIDTH=640, PANEL_HEIGHT=1388, DMG_HEIGHT=144;
const SEAMLESS_OPTICS=new URLSearchParams(window.location.search).get('lcdCells')==='hidden';
const PRECOMPUTED='nomad-crosstalk-640x1388.inc';
function panelRows(){return PANEL_HEIGHT;}
const VS='#version 300 es\nprecision highp float; out vec2 vTexCoord; void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));vTexCoord=p;gl_Position=vec4(p*2.-1.,0.,1.);}';
// NOMAD source comes from a GPU framebuffer (bottom-up). Unlike the 2D
// canvas-origin laboratory fixture, it must NOT be inverted on output.
const FINAL_VS=VS;
// Cell drive sampling is deliberately INSIDE the LCD engine. The full
// resolution, unchanged composed scene is transferred as linear RGBA8.
// Each electrode integrates its own source footprint and receives exactly
// one of the four historical drive codes. The five physical passes follow.
const CELL_DRIVE_FS=`#version 300 es
precision highp float;
in vec2 vTexCoord;
layout(location=0) out vec4 FragColor;
uniform sampler2D RawSource;
uniform vec2 uPanelSize;
vec3 encode_srgb(vec3 x) {
 vec3 low=12.92*x;
 vec3 high=1.055*pow(max(x,vec3(0.)),vec3(1.0/2.4))-.055;
 return mix(low,high,step(vec3(.0031308),x));
}
void main() {
 vec2 origin=floor(vTexCoord*uPanelSize)/uPanelSize;
 vec2 footprint=1.0/uPanelSize;
 float encodedLuma=0.0;
 for(int row=0;row<4;row++) {
  for(int column=0;column<4;column++) {
   vec2 uv=origin+footprint*(vec2(float(column),float(row))+0.5)*0.25;
   vec3 raw=texture(RawSource,uv).rgb;
   encodedLuma+=dot(encode_srgb(raw),vec3(.2126,.7152,.0722));
  }
 }
 float normalized=clamp(encodedLuma/16.0,0.0,1.0);
 float drive=floor((1.0-normalized)*3.0+0.5);
 float encoded=1.0-drive/3.0;
 FragColor=vec4(vec3(encoded),1.0);
}`;
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

export function physicalLCDGrid(width=WIDTH,height=PANEL_HEIGHT){
 return {columns:WIDTH,rows:panelRows(width,height)};
}

async function loadSources(rows){
 const files=Object.fromEntries(await Promise.all([...NAMES,...INCLUDE,PRECOMPUTED].map(async name=>{
  const response=await fetch(SOURCE_BASE+name,{cache:'force-cache'});
  if(!response.ok)throw Error('DMG source unavailable: '+name+' / HTTP '+response.status);
  return [name,await response.text()];
 })));
 // Regenerate the original author's nominal RC baselines for the additional
 // rows. Fail closed if the original 144-row tables cannot be reproduced.
 // Precomputed from the same source equations so the iPhone doesn't
 // spend ~30 seconds regenerating 1388-row baselines during every launch.
 const calibrated=WIDTH===640&&rows===1388
  ? files[PRECOMPUTED]
  : extendDmgCalibration(files['dmg01-crosstalk-lumped.inc'],rows,WIDTH);
 if(!calibrated.includes('DMG_CROSSTALK_ROWS = '+rows+';')||
    !calibrated.includes('DMG_CROSSTALK_COLUMNS = '+WIDTH+';'))
  throw Error('LCD electrical calibration dimensions do not match the panel');
 files['dmg01-crosstalk-lumped.inc']=calibrated;
 // The original source packs two row-counts into one float using an 8-bit
 // radix. Counts now reach 320, so the exact same two-count representation
 // needs a 9-bit radix. This does not alter any RC or STN equations.
 if(WIDTH>255){
  const phase=files['dmg01-crosstalk-phase-local.inc'];
  const original='mod(exact, 256.0), floor(exact / 256.0)';
  if(!phase.includes(original))throw Error('Unexpected source count unpacking');
  files['dmg01-crosstalk-phase-local.inc']=phase.replace(
   original,'mod(exact, 1024.0), floor(exact / 1024.0)');
 }
 const expand=(src,depth=0)=>{
  if(depth>5)throw Error('DMG source include cycle');
  return src.replace(/^\s*#include\s+"([^"]+)"\s*$/gm,(_,name)=>{
   if(!Object.prototype.hasOwnProperty.call(files,name))throw Error('Missing DMG include '+name);
   return expand(files[name],depth+1);
  });
 };
 return NAMES.map(name=>{
  let src=files[name];
  if(name==='dmg01-row-load-v2.slang'&&WIDTH>160){
   const loop='for (int x = 0; x < 160; ++x)';
   const pack='256.0 * vec3(previousCounts)';
   if(!src.includes(loop)||!src.includes(pack))
    throw Error('Upstream row-count packer has changed');
   src=src.replace(loop,'for (int x = 0; x < 640; ++x)')
    .replace(pack,'1024.0 * vec3(previousCounts)');
  }
  if(name==='dmg01-response-v1.slang'&&rows!==DMG_HEIGHT){
   const original=') / 154.0;';
   if(!src.includes(original))throw Error('Upstream scan-latch timing expression changed');
   src=src.replace(original,') / float(DMG_CROSSTALK_ROWS + 10);');
  }
  const vi=src.indexOf('#pragma stage vertex'),fi=src.indexOf('#pragma stage fragment');
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
 constructor(rows){
  this.rows=rows;
  this.canvas=document.createElement('canvas');
  this.canvas.width=640;this.canvas.height=Math.round(640*rows/WIDTH);
  const gl=this.canvas.getContext('webgl2',{alpha:false,antialias:false,
   depth:false,stencil:false,preserveDrawingBuffer:true});
  if(!gl)throw Error('WebGL2 is required for strict DMG-01 physics');
  if(!gl.getExtension('EXT_color_buffer_float'))
   throw Error('RGBA32F render targets unavailable; strict DMG-01 physics not supported');
  this.gl=gl;
  this.programs=[];this.targets=[];
  this.rawTexture=null;this.rawWidth=0;this.rawHeight=0;
  this.driveFbo=gl.createFramebuffer();this.driveProgram=null;
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
  const shaders=await loadSources(this.rows);
  this.programs=shaders.map((source,i)=>this.link(i===4?FINAL_VS:VS,source.shader,source.name));
  this.driveProgram=this.link(VS,CELL_DRIVE_FS,'native LCD cell address/drive');
  this.input=[this.texture(WIDTH,this.rows,this.gl.RGBA8),
              this.texture(WIDTH,this.rows,this.gl.RGBA8)];
  this.targets=[this.target(1,this.rows),this.target(WIDTH,1),
   this.target(WIDTH,this.rows),this.target(WIDTH,this.rows),null,
   this.target(WIDTH,this.rows)];
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
   ['global.OriginalSize',[WIDTH,this.rows,1/WIDTH,1/this.rows]],
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
   if(at!==null){
    // Geometry-only comparison. The entire five-pass electronics, temporal
    // state and palette remain identical. Only final electrode aperture
    // boundaries and their associated gap shadows are visually suppressed.
    const seamless=SEAMLESS_OPTICS&&p===this.programs[4];
    const opticalValue=seamless&&name==='PixelFill'?1.0:
                       seamless&&name==='ShadowStrength'?0.0:value;
    gl.uniform1f(at,opticalValue);
   }
  }
  const panelSize=this.location(p,'uPanelSize');
  if(panelSize!==null)gl.uniform2f(panelSize,WIDTH,this.rows);
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
 render(rawPixels,rawWidth,rawHeight,width){
  const gl=this.gl;
  // Transfer the ORIGINAL fully-composed scene. No image reduction takes
  // place in NOMAD or at the renderer boundary. Only the LCD's own
  // electrical input stage converts raw optical coverage into four drives.
  if(this.rawWidth!==rawWidth||this.rawHeight!==rawHeight){
   if(this.rawTexture)gl.deleteTexture(this.rawTexture);
   this.rawTexture=this.texture(rawWidth,rawHeight,gl.RGBA8);
   gl.bindTexture(gl.TEXTURE_2D,this.rawTexture);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
   this.rawWidth=rawWidth;
   this.rawHeight=rawHeight;
  }
  gl.bindTexture(gl.TEXTURE_2D,this.rawTexture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,rawWidth,rawHeight,gl.RGBA,gl.UNSIGNED_BYTE,rawPixels);
  const next=this.input[1],prev=this.input[0];
  // The source drive converter is internal to the physical panel and writes
  // one encoded electrode drive per cell. Its output enters the unmodified
  // upstream row/column, STN response, matrix and optical passes.
  for(const driveTarget of this.frames===0?[prev,next]:[next]){
   gl.bindFramebuffer(gl.FRAMEBUFFER,this.driveFbo);
   gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,
     gl.TEXTURE_2D,driveTarget,0);
   if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)
    throw Error('LCD drive electrode framebuffer incomplete');
   this.program(this.driveProgram,[['RawSource',this.rawTexture]],
     {fb:this.driveFbo},WIDTH,this.rows,rawWidth,rawHeight);
  }
  this.program(this.programs[0],[['Source',next],['OriginalHistory1',prev]],
   this.targets[0],1,this.rows,WIDTH,this.rows);
  this.program(this.programs[1],[['Source',this.targets[0].texture],
    ['Original',next],['OriginalHistory1',prev]],
    this.targets[1],WIDTH,1,1,this.rows);
  const read=this.targets[this.feedback===0?5:2];
  const write=this.targets[this.feedback===0?2:5];
  this.program(this.programs[2],[['Source',this.targets[1].texture],
    ['Original',next],['OriginalHistory1',prev],
    ['PassOutput0',this.targets[0].texture],['PassFeedback2',read.texture]],
    write,WIDTH,this.rows,WIDTH,1);
  this.program(this.programs[3],[['Source',write.texture]],
    this.targets[3],WIDTH,this.rows,WIDTH,this.rows);
  this.feedback=1-this.feedback;
  this.input.reverse();this.frames++;
  const targetWidth=Math.max(640,Math.min(1440,Math.round(width)));
  const targetHeight=Math.round(targetWidth*this.rows/WIDTH);
  if(this.canvas.width!==targetWidth||this.canvas.height!==targetHeight){
   this.canvas.width=targetWidth;this.canvas.height=targetHeight;
  }
  this.program(this.programs[4],[['Source',this.targets[3].texture]],
   null,this.canvas.width,this.canvas.height,WIDTH,this.rows);
  gl.finish(); // Synchronize the second WebGL context for the optical image.
 }
 dispose(){
  const gl=this.gl;
  for(const p of this.programs)gl.deleteProgram(p.program);
  if(this.driveProgram)gl.deleteProgram(this.driveProgram.program);
  if(this.driveFbo)gl.deleteFramebuffer(this.driveFbo);
  if(this.rawTexture)gl.deleteTexture(this.rawTexture);
  for(const t of this.targets)if(t){gl.deleteFramebuffer(t.fb);gl.deleteTexture(t.texture);}
  for(const t of this.input||[])gl.deleteTexture(t);
  gl.deleteVertexArray(this.vao);
 }
}

const SOURCE_VS='varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
// No source-image filtering, gamma conversion or drive reduction at the
// app->panel boundary. This is an exact same-size linear scene copy.
// Full RGBA data is transferred into the LCD engine.
const RAW_SCENE_FS='varying vec2 vUv;uniform sampler2D tDiffuse;'
 +'void main(){gl_FragColor=texture2D(tDiffuse,vUv);}';

const OUTPUT_FS='varying vec2 vUv; uniform sampler2D tLCD;'
 +'vec3 linearize(vec3 x){vec3 lo=x/12.92;vec3 hi=pow((max(x,vec3(0.))+.055)/1.055,vec3(2.4));'
 +'return mix(lo,hi,step(vec3(.04045),x));}'
 +'void main(){gl_FragColor=vec4(linearize(texture2D(tLCD,vUv).rgb),1.); }';

export function createPhysicalLCDPass(){
 const pass=new THREE.Pass();
 pass.needsSwap=true;
 let rawSceneRT=null,rawScenePixels=null,rawWidth=0,rawHeight=0;
 let rows=0,generation=0;
 const sourceMaterial=new THREE.ShaderMaterial({
  uniforms:{tDiffuse:{value:null}},
  vertexShader:SOURCE_VS,fragmentShader:RAW_SCENE_FS,depthWrite:false,depthTest:false
 });
 const textureCanvas=document.createElement('canvas');
 const texture=new THREE.CanvasTexture(textureCanvas);
 texture.colorSpace=THREE.NoColorSpace;
 texture.minFilter=THREE.LinearFilter;
 texture.magFilter=THREE.LinearFilter;
 texture.generateMipmaps=false;
 const outputMaterial=new THREE.ShaderMaterial({
  uniforms:{tLCD:{value:texture}},
  vertexShader:SOURCE_VS,fragmentShader:OUTPUT_FS,depthWrite:false,depthTest:false
 });
 const inputQuad=new THREE.FullScreenQuad(sourceMaterial);
 const outputQuad=new THREE.FullScreenQuad(outputMaterial);
 let core=null,failure=null,configured=false;
 let lastPhysicalTime=0,frameDebt=0;
 const physicalFrameMs=1000/59.7275;
 const targetOptions={depthBuffer:false,stencilBuffer:false,
  format:THREE.RGBAFormat,type:THREE.UnsignedByteType,
  minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter};
 pass.enabled=false;
 pass.setSize=()=>{};
 pass.configure=({width=WIDTH,height=PANEL_HEIGHT}={})=>{
  const required=panelRows(width,height);
  if(required!==rows){
   rows=required;generation++;
   core?.dispose();core=null;failure=null;
   rawSceneRT?.dispose();rawSceneRT=null;
   rawScenePixels=null;rawWidth=0;rawHeight=0;
   lastPhysicalTime=0;frameDebt=0;
   const current=generation;
   const candidate=new ReferencePanel(rows);
   candidate.init().then(value=>{
    if(current===generation)core=value;
    else value.dispose();
   }).catch(error=>{
    if(current===generation)failure=error;
    console.error('Extended LCD reference initialization failed:',error);
   });
  }
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
  const size=renderer.getDrawingBufferSize(new THREE.Vector2());
  // The DMG's own fixed refresh interval advances its electrical state.
  const timestamp=performance.now();
  if(lastPhysicalTime===0)frameDebt=physicalFrameMs;
  else frameDebt+=Math.min(100,timestamp-lastPhysicalTime);
  lastPhysicalTime=timestamp;
  const steps=Math.min(6,Math.floor(frameDebt/physicalFrameMs));
  frameDebt-=steps*physicalFrameMs;
  if(steps>0){
   // Read the full-resolution composed scene rather than a pre-sampled
   // 640-column image. The transfer is byte RGBA to bridge the independent
   // WebGL2 physical panel; vector geometry and screen art stay untouched.
   const sourceWidth=readBuffer.width,sourceHeight=readBuffer.height;
   if(!rawSceneRT||rawWidth!==sourceWidth||rawHeight!==sourceHeight){
    rawSceneRT?.dispose();
    rawSceneRT=new THREE.WebGLRenderTarget(sourceWidth,sourceHeight,targetOptions);
    rawSceneRT.texture.colorSpace=THREE.NoColorSpace;
    rawScenePixels=new Uint8Array(sourceWidth*sourceHeight*4);
    rawWidth=sourceWidth;rawHeight=sourceHeight;
   }
   sourceMaterial.uniforms.tDiffuse.value=readBuffer.texture;
   renderer.setRenderTarget(rawSceneRT);
   inputQuad.render(renderer);
   renderer.readRenderTargetPixels(rawSceneRT,0,0,rawWidth,rawHeight,rawScenePixels);
   for(let i=0;i<steps;i++)
    core.render(rawScenePixels,rawWidth,rawHeight,Math.min(size.x,size.y));
   texture.image=core.canvas;
   texture.needsUpdate=true;
  }
  renderer.setRenderTarget(pass.renderToScreen?null:writeBuffer);
  outputQuad.render(renderer);
 };
 pass.dispose=()=>{
  generation++;core?.dispose();rawSceneRT?.dispose();texture.dispose();
  sourceMaterial.dispose();outputMaterial.dispose();inputQuad.dispose();outputQuad.dispose();
 };
 return pass;
}
