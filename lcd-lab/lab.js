
/*
 * LCD MATERIAL LAB — standalone WebGL2 optical presentation renderer.
 * Physical basis and DMG reference palette: JohnnySun/retro-display-lab
 * shaders/dmg01-display-v1.slang (Apache-2.0); see CREDITS.md.
 * A browser adaptation of the aperture-area and shifted reflector-shadow
 * model; optical illumination/glass is a separate experimental extension.
 */
import {LCD_W,LCD_H,PanelPhysics,makePicture} from './model.js';
import {PALETTE} from './physics-data.js';
const canvas=document.querySelector('#panel');
const status=document.querySelector('#status');
const physics=new PanelPhysics();
const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:'high-performance'});
if(!gl){
 status.textContent='WebGL2 is unavailable on this browser. This experiment requires WebGL2.';
 throw new Error('WebGL2 required for LCD Material Lab');
}
const vertex=`#version 300 es
in vec2 aPosition;out vec2 vUv;
void main(){vUv=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}`;
const fragment=`#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uState;
uniform vec2 uSourceSize,uOutputSize;
uniform vec3 uPalette[5];
uniform float uFill,uEdge,uShadow,uShadowX,uShadowY;
uniform float uContrast,uBias,uBrightness,uChroma;
uniform float uGlass,uLightAngle,uViewAngle;
uniform int uDebug;
float cl(float a){return clamp(a,0.,1.);}
vec3 srgb(vec3 x){
 vec3 low=12.92*x;
 vec3 high=1.055*pow(max(x,vec3(0.)),vec3(1./2.4))-.055;
 return mix(low,high,step(vec3(.0031308),x));
}
vec3 optical(float state){
 float t=cl(state)*4.;
 if(t<1.)return mix(uPalette[0],uPalette[1],t);
 if(t<2.)return mix(uPalette[1],uPalette[2],t-1.);
 if(t<3.)return mix(uPalette[2],uPalette[3],t-2.);
 return mix(uPalette[3],uPalette[4],t-3.);
}
ivec2 cellPos(vec2 p){
 return clamp(ivec2(floor(p)),ivec2(0),ivec2(uSourceSize)-ivec2(1));
}
float stateAt(vec2 p){return texelFetch(uState,cellPos(p),0).r;}
float overlap1D(float coordinate,float shift,float footprint){
 float center=fract(coordinate);
 float edgeLo=.5-uFill*.5+shift,edgeHi=.5+uFill*.5+shift;
 float low=center-footprint*.5,high=center+footprint*.5;
 float total=0.;
 for(int k=-1;k<=1;k++){
  float offset=float(k);
  total+=max(0.,min(high,edgeHi+offset)-max(low,edgeLo+offset));
 }
 return cl(total/max(.00001,footprint));
}
float aperture(vec2 p,vec2 footprint){
 return overlap1D(p.x,0.,footprint.x)*overlap1D(p.y,0.,footprint.y);
}
float jointAxis(float position,float offset,float footprint){
 float lo=.5-uFill*.5,hi=.5+uFill*.5;
 float srcBase=floor(position),shadowBase=floor(position-offset);
 float sampleLo=position-footprint*.5,sampleHi=position+footprint*.5;
 float coverage=0.;
 for(int a=-1;a<=1;a++){
  float aLo=srcBase+float(a)+lo,aHi=srcBase+float(a)+hi;
  for(int b=-1;b<=1;b++){
   float bLo=shadowBase+float(b)+offset+lo;
   float bHi=shadowBase+float(b)+offset+hi;
   coverage+=max(0.,min(sampleHi,min(aHi,bHi))-max(sampleLo,max(aLo,bLo)));
  }
 }
 return cl(coverage/max(.00001,footprint));
}
void main(){
 // Source logical y is top-down; WebGL's framebuffer y is bottom-up.
 vec2 p=vec2(vUv.x,1.-vUv.y)*uSourceSize;
 vec2 fp=max(uSourceSize/max(uOutputSize,vec2(1.))*max(uEdge,.001),vec2(.00001));
 float state=stateAt(p);
 state=cl((state-.25)*uContrast+.25+uBias);
 float coverage=aperture(p,fp);
 vec3 background=optical(0.);
 vec3 color=mix(background,optical(state),coverage);
 vec2 displacement=vec2(uShadowX,uShadowY);
 vec2 shifted=p-displacement;
 float shadowState=stateAt(shifted);
 float shadowMask=aperture(shifted,fp);
 float joint=jointAxis(p.x,displacement.x,fp.x)*jointAxis(p.y,displacement.y,fp.y);
 float shadowGap=max(shadowMask-joint,0.);
 color=max(vec3(0.),color-background*uShadow*shadowState*shadowGap);
 float y=dot(color,vec3(.2126,.7152,.0722));
 color=mix(vec3(y),color,uChroma)*uBrightness;
 if(uDebug==1)color=vec3(state);
 if(uDebug==2)color=vec3(coverage);
 if(uDebug==3)color=vec3(shadowGap*6.);
 if(uDebug==4)color=vec3(cl((state-.25)*1.333));
 // Optional experimental glass optics; never modifies the underlying LCD state.
 if(uDebug==0&&uGlass>0.){
  vec2 screen=vec2(vUv.x,1.-vUv.y);
  float rad=radians(uLightAngle);
  vec2 normal=normalize(vec2(cos(rad),sin(rad)));
  float center=dot(screen-vec2(.5),normal);
  float dx=(center-.14)/.16;float stripe=exp(-dx*dx);
  float angleFactor=abs(uViewAngle)/45.;
  float grazing=pow(cl(.08+angleFactor),3.);
  float reflection=(.037*stripe+.015*grazing)*uGlass;
  color=mix(color,vec3(.86,.92,.86),cl(reflection));
  color*=1.-uGlass*.045*pow(abs(screen.x-.5)*2.,5.);
 }
 outColor=vec4(clamp(srgb(max(color,vec3(0.))),0.,1.),1.);
}`;
function shader(type,text){
 const sh=gl.createShader(type);gl.shaderSource(sh,text);gl.compileShader(sh);
 if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){
  const error=gl.getShaderInfoLog(sh);gl.deleteShader(sh);throw new Error('LCD shader compile: '+error);
 }return sh;
}
let prog;
try{
 const vs=shader(gl.VERTEX_SHADER,vertex),fs=shader(gl.FRAGMENT_SHADER,fragment);
 prog=gl.createProgram();gl.attachShader(prog,vs);gl.attachShader(prog,fs);
 gl.linkProgram(prog);gl.deleteShader(vs);gl.deleteShader(fs);
 if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(prog));
}catch(error){status.textContent=String(error);throw error;}
gl.useProgram(prog);
const attrib=gl.getAttribLocation(prog,'aPosition');
const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
gl.enableVertexAttribArray(attrib);gl.vertexAttribPointer(attrib,2,gl.FLOAT,false,0,0);
const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,LCD_W,LCD_H,0,gl.RED,gl.UNSIGNED_BYTE,physics.getImage());
const uniform=name=>gl.getUniformLocation(prog,name==='uPalette'?'uPalette[0]':name);
const U={};
for(const id of ['State','SourceSize','OutputSize','Palette','Fill','Edge','Shadow','ShadowX','ShadowY','Contrast','Bias','Brightness','Chroma','Glass','LightAngle','ViewAngle','Debug'])U[id]=uniform('u'+id);
gl.uniform1i(U.State,0);
gl.uniform2f(U.SourceSize,LCD_W,LCD_H);
const srgbToLinear=x=>{x/=255;return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4);};
const reference=PALETTE;
const nomad=[[124,137,86],[180,198,139],[143,170,111],[87,128,94],[45,83,63]];
const UI={
 profile:'reference',scene:'title',animate:true,temperature:20,fill:.875,edge:1,
 shadow:.18,shadowX:.11,shadowY:.13,contrast:1,bias:0,
 brightness:1,chroma:1,glass:.8,lightAngle:35,viewAngle:0,debug:0
};
let offset=0,last=0,lastAdvance=0,dirty=true,initialized=false,lastStatus=0;
function readUI(){
 for(const key of Object.keys(UI)){
  const control=document.querySelector('[data-prop="'+key+'"]');
  if(!control)continue;
  if(control.type==='checkbox')UI[key]=control.checked;
  else if(control.tagName==='SELECT')UI[key]=control.value;
  else UI[key]=Number(control.value);
  const output=control.closest('.control')?.querySelector('output');
  if(output)output.textContent=control.type==='range'?control.value:'';
 }
 dirty=true;
}
const controls=document.querySelectorAll('[data-prop]');
for(const control of controls)control.addEventListener('input',()=>{
 const oldScene=UI.scene;readUI();
 if(oldScene!==UI.scene){offset=0;physics.setPicture(makePicture(UI.scene,offset));}
});
document.querySelector('#step').addEventListener('click',()=>{
 UI.scene='motion';document.querySelector('[data-prop="scene"]').value='motion';
 UI.animate=false;document.querySelector('[data-prop="animate"]').checked=false;
 offset=(offset+1)%9;physics.setPicture(makePicture('motion',offset));readUI();
});
document.querySelector('#reset').addEventListener('click',()=>{physics.reset();dirty=true;});
document.querySelector('#compare').addEventListener('click',()=>{
 UI.glass=UI.glass?0:.8;document.querySelector('[data-prop="glass"]').value=UI.glass;readUI();
});
readUI();physics.setPicture(makePicture(UI.scene,0));physics.reset();
function drawFrame(now){
 const delta=Math.min(.08,Math.max(0,last?(now-last)/1000:1/60));last=now;
 if(UI.scene==='motion'&&UI.animate&&now-lastAdvance>380){
  offset=(offset+1)%9;physics.setPicture(makePicture('motion',offset));
  lastAdvance=now;dirty=true;
 }
 physics.step(delta,{temperature:UI.temperature,retain:true});
 const dpr=Math.min(2,window.devicePixelRatio||1);
 const rect=canvas.getBoundingClientRect();
 const w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);dirty=true;}
 if(!initialized||dirty){
  const palette=(UI.profile==='nomad'?nomad:reference).flatMap(rgb=>rgb.map(srgbToLinear));
  gl.useProgram(prog);
  gl.uniform3fv(U.Palette,new Float32Array(palette));
  gl.uniform1f(U.Fill,UI.fill);gl.uniform1f(U.Edge,UI.edge);
  gl.uniform1f(U.Shadow,UI.shadow);gl.uniform1f(U.ShadowX,UI.shadowX);gl.uniform1f(U.ShadowY,UI.shadowY);
  gl.uniform1f(U.Contrast,UI.contrast);gl.uniform1f(U.Bias,UI.bias);
  gl.uniform1f(U.Brightness,UI.brightness);gl.uniform1f(U.Chroma,UI.chroma);
  gl.uniform1f(U.Glass,UI.glass);gl.uniform1f(U.LightAngle,UI.lightAngle);gl.uniform1f(U.ViewAngle,UI.viewAngle);
  gl.uniform1i(U.Debug,Number(UI.debug));initialized=true;dirty=false;
 }
 gl.uniform2f(U.OutputSize,w,h);
 gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
 gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,LCD_W,LCD_H,gl.RED,gl.UNSIGNED_BYTE,physics.getImage());
 gl.drawArrays(gl.TRIANGLES,0,6);
 if(now-lastStatus>800){
  const error=gl.getError();
  status.textContent=error===gl.NO_ERROR?
    'REFERENCE DATA: WS2 NOMINAL STN • 160 × 144 • '+(UI.profile==='nomad'?'EXPERIMENTAL NOMAD COLOUR':'DMG COLOUR'):
    'WEBGL ERROR '+error+' — try reloading or switching to a compatible browser';
  lastStatus=now;
 }
 requestAnimationFrame(drawFrame);
}
requestAnimationFrame(drawFrame);
