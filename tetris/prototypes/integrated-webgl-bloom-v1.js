/* FIELD ATLAS / TETRIS: isolated actual-UI WebGL light-layer experiment.
 * Renders the existing DOM, canvases, and layouts natively.
 * html2canvas creates a conservative luminance reference for genuine GPU bloom.
 * Only emitted light (never a replacement screenshot) is displayed.
 * V1 lab deliberately has no production codepath.
 */
(() => {
 'use strict';
 const app=document.getElementById('app'),canvas=document.getElementById('webglBloom');
 const info=document.getElementById('gpuLabStatus');
 const stats=document.getElementById('gpuLabStats');
 const ctl={
  enabled:document.getElementById('gpuLabOn'), cut:document.getElementById('gpuLabCut'),
  width:document.getElementById('gpuLabWidth'), strength:document.getElementById('glowControl'),
  capture:document.getElementById('gpuLabRate'), echo:document.getElementById('gpuLabEcho')
 };
 const out={cut:document.getElementById('gpuLabCutValue'),
  width:document.getElementById('gpuLabWidthValue'),
  rate:document.getElementById('gpuLabRateValue')};
 let active=true,cut=.58,radius=7,maxRate=8,echo=false,captures=0,processed=0,
     lastCapture=0,lastReport=performance.now(),frames=0,failures=0,
     busy=false,ready=false,sourceWidth=0,sourceHeight=0,texture=null,gl=null,
     latestError='',captureCost=0,realFPS=0,observed=0;
 const say=(message)=>{if(info)info.textContent=message;};
 if(!app||!canvas||!window.html2canvas){say('DOM renderer unavailable. Original Tetris remains playable.');return;}
 try{
  gl=canvas.getContext('webgl2',{alpha:true,antialias:false,depth:false,stencil:false,premultipliedAlpha:false});
  if(!gl)throw Error('WebGL2 unavailable');
 }catch(e){say('GPU unavailable: '+e.message+'. Original Tetris remains playable.');return;}
 const vertex='#version 300 es\nprecision highp float;out vec2 uv;void main(){vec2 p=vec2(gl_VertexID==1?3.0:-1.0,gl_VertexID==2?3.0:-1.0);uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
 const header='#version 300 es\nprecision highp float;in vec2 uv;out vec4 fragColor;uniform sampler2D t;uniform vec2 resolution;';
 const shader={
 extract:'uniform float cutoff;void main(){vec3 c=texture(t,uv).rgb;float y=dot(c,vec3(.2126,.7152,.0722));float mask=smoothstep(max(0.,cutoff-.10),min(1.,cutoff+.12),y);fragColor=vec4(c*mask,1.);}',
 blur:'uniform vec2 axis;uniform float sigma;void main(){vec3 sum=vec3(0.0);float total=0.0;for(int i=-6;i<=6;i++){float x=float(i);float w=exp(-.5*x*x/max(.1,sigma*sigma));sum+=texture(t,uv+axis*x/resolution).rgb*w;total+=w;}fragColor=vec4(sum/max(.01,total),1.0);}',
 emit:'uniform sampler2D narrow;uniform sampler2D wide;uniform vec3 tint;uniform float strength;uniform float echo;void main(){vec3 n=texture(narrow,uv).rgb,w=texture(wide,uv).rgb;float energy=dot(n*.45+w*.55,vec3(.2126,.7152,.0722));float a=clamp(energy*strength,0.0,.62);float dx=3.0/resolution.x;vec3 echoCol=texture(narrow,uv-vec2(dx,0.)).rgb;float e=clamp(dot(echoCol,vec3(.2126,.7152,.0722))*echo*.36,0.,.18);float alpha=clamp(a+e,0.,.72);fragColor=vec4(tint,alpha);}'
 };
 function compile(type,src){
  const obj=gl.createShader(type);gl.shaderSource(obj,src);gl.compileShader(obj);
  if(!gl.getShaderParameter(obj,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(obj));
  return obj;
 }
 const programs={};
 try{
  for(const [name,frag] of Object.entries(shader)){
   const p=gl.createProgram();
   gl.attachShader(p,compile(gl.VERTEX_SHADER,vertex));
   gl.attachShader(p,compile(gl.FRAGMENT_SHADER,header+frag));
   gl.linkProgram(p);
   if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(name+' '+gl.getProgramInfoLog(p));
   programs[name]={p,uniforms:Object.fromEntries(['t','narrow','wide','resolution','cutoff','axis','sigma','tint','strength','echo'].map(k=>[k,gl.getUniformLocation(p,k)]))};
  }
 }catch(e){say('Shader error: '+e.message);return;}
 function makeTarget(w,h){
  const tex=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Incomplete framebuffer');
  return {texture:tex,fbo,w,h};
 }
 let targets=[];
 const quad=gl.createVertexArray();gl.bindVertexArray(quad);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);
 const setup=(w,h)=>{
  if(w===sourceWidth&&h===sourceHeight)return;
  sourceWidth=w;sourceHeight=h;
  for(const t of targets){gl.deleteFramebuffer(t.fbo);gl.deleteTexture(t.texture);}
  if(texture)gl.deleteTexture(texture);
  // The original DOM stays native at full device resolution; effects masks run at reduced resolution.
  texture=makeTarget(w,h).texture;
  targets=[makeTarget(Math.ceil(w/2),Math.ceil(h/2)),makeTarget(Math.ceil(w/2),Math.ceil(h/2)),
           makeTarget(Math.ceil(w/4),Math.ceil(h/4)),makeTarget(Math.ceil(w/4),Math.ceil(h/4))];
  canvas.width=w;canvas.height=h;
 };
 function pass(name,input,target,options={}){
  const p=programs[name],u=p.uniforms;
  const w=target?target.w:sourceWidth,h=target?target.h:sourceHeight;
  gl.bindFramebuffer(gl.FRAMEBUFFER,target?target.fbo:null);
  gl.viewport(0,0,w,h);gl.useProgram(p.p);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,input);
  if(u.t)gl.uniform1i(u.t,0);
  if(u.resolution)gl.uniform2f(u.resolution,w,h);
  if(u.axis)gl.uniform2f(u.axis,options.ax||0,options.ay||0);
  if(u.sigma)gl.uniform1f(u.sigma,options.sigma||1);
  if(u.cutoff)gl.uniform1f(u.cutoff,cut);
  if(u.strength)gl.uniform1f(u.strength,Number(ctl.strength.value)/100*.95);
  if(u.echo)gl.uniform1f(u.echo,echo?1:0);
  if(u.tint){const rgb=getComputedStyle(document.documentElement).getPropertyValue('--phosphor-rgb').trim().split(',').map(v=>Number(v)/255);
    gl.uniform3f(u.tint,rgb[0]||0,rgb[1]||0,rgb[2]||0);}
  if(u.narrow){gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,targets[0].texture);gl.uniform1i(u.narrow,1);}
  if(u.wide){gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,targets[2].texture);gl.uniform1i(u.wide,2);}
  gl.drawArrays(gl.TRIANGLES,0,3);
 }
 function draw(image){
  setup(image.width,image.height);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,image);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  const sigNear=1.35,sigWide=Math.max(.4,radius*(sourceWidth/app.clientWidth)/4);
  pass('extract',texture,targets[0]);
  pass('blur',targets[0].texture,targets[1],{ax:1,sigma:sigNear});
  pass('blur',targets[1].texture,targets[0],{ay:1,sigma:sigNear});
  pass('extract',texture,targets[2]);
  pass('blur',targets[2].texture,targets[3],{ax:1,sigma:sigWide});
  pass('blur',targets[3].texture,targets[2],{ay:1,sigma:sigWide});
  pass('emit',texture,null);
  processed++;
 }
 function snapshotClone(doc){
  const root=doc.getElementById('app');if(!root)return;
  root.style.filter='none';
  // html2canvas 1.4.1 does not support CSS color-mix() or several modern blend modes.
  // These overrides apply ONLY to the off-screen clone, never to the actual visible game.
  root.style.setProperty('--panel','#080808');root.style.setProperty('--card-bg','#080808');
  const veil=doc.getElementById('veil');if(veil)veil.style.background='rgba(8,8,8,.82)';
  // Normalize legacy html2canvas-incompatible color-mix() only in snapshot clone.
  // The actual game's computed CSS and luminance design remain untouched.
  for(const id of ['webglBloom','phosphorFilm','screenScan','screenShade','screenTopFade','screenBottomFade','sweep','fxSoftness','fxNoise','buttonFxLayer']){
   const node=doc.getElementById(id);if(node)node.style.setProperty('display','none','important');
  }
  const dialogs=doc.querySelectorAll('dialog');dialogs.forEach(d=>{if(!d.open)d.style.display='none';});
 }
 async function capture(){
  if(busy||!active||document.hidden)return;
  busy=true;
  const t0=performance.now();
  try{
   const image=await window.html2canvas(app,{
    backgroundColor:'#151515',scale:Math.min(window.devicePixelRatio||1,1.25),
    logging:false,removeContainer:true,useCORS:true,
    onclone:snapshotClone,
    ignoreElements:el=>el.id==='webglBloom'||el.id==='gpuLabStatus'||el.id==='gpuLabStats'
   });
   if(!active){gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);return;}
   draw(image);captures++;ready=true;failures=0;
   captureCost=0.75*captureCost+0.25*(performance.now()-t0);
   say('GPU BLOOM ACTIVE · native game remains interactive');
  }catch(err){
   latestError=String(err&&err.message||err);failures++;
   if(failures<=2||failures%20===0)console.warn('Tetris integrated compositor capture:',err);
   say('DOM capture failed: '+latestError.slice(0,140)+'. Native game remains usable.');
   if(failures>=4)active=false;
  }finally{busy=false;}
 }
 const apply=()=>{
  active=ctl.enabled.checked;cut=Number(ctl.cut.value)/100;radius=Number(ctl.width.value);
  maxRate=Number(ctl.capture.value);echo=ctl.echo.checked;
  out.cut.textContent=ctl.cut.value+'%';out.width.textContent=ctl.width.value+'px';out.rate.textContent=ctl.capture.value+'/sec';
  canvas.style.display=active?'block':'none';
  if(active&&!busy)void capture();
  if(!active)say('GPU bloom bypassed; original app visuals remain active.');
 };
 for(const c of [ctl.enabled,ctl.cut,ctl.width,ctl.capture,ctl.echo,ctl.strength]){
  c.addEventListener('input',apply);c.addEventListener('change',apply);
 }
 const observation=new ResizeObserver(()=>{lastCapture=0;});observation.observe(app);
 function frame(now){
  frames++;
  if(now-lastReport>=1000){realFPS=Math.round(frames*1000/(now-lastReport));frames=0;lastReport=now;
   if(stats)stats.textContent='UI animation '+realFPS+' FPS · DOM captures '+captures+' · GPU frames '+processed+
    ' · avg capture '+Math.round(captureCost)+' ms';
  }
  const interval=1000/maxRate;
  if(active&&!busy&&now-lastCapture>=interval){lastCapture=now;void capture();}
  requestAnimationFrame(frame);
 }
 // GPU layer never participates in pointer hit-testing or modal event routing.
 ready=true;say('WebGL2 ready · obtaining first native DOM capture…');
 apply();
 requestAnimationFrame(frame);
 window.__integratedGpuLab={
  getState:()=>({webgl2:true,ready,active,cut,radius,maxRate,echo,captures,processed,captureCost:Math.round(captureCost),uiFPS:realFPS,lastError:latestError,sourceWidth,sourceHeight,realDOM:Boolean(document.getElementById('board')&&document.getElementById('options'))}),
  forceCapture:()=>capture()
 };
})();