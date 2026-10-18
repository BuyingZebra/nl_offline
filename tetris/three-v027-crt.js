import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';

/* FIELD ATLAS Three.js compositing system, adapted without filter approximations
   from the preserved approved three-effects-lab.html baseline. */
export function createCRT(renderer,scene,camera){
 const composer=new EffectComposer(renderer);
 composer.addPass(new RenderPass(scene,camera));
 const glow=new UnrealBloomPass(new THREE.Vector2(1,1),1.5,.42,.55);

 const passVertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
 // Vertical-sync roll: real image sampling with repeated UV coordinates.
 const verticalRoll=new ShaderPass({
  uniforms:{tDiffuse:{value:null},uOffset:{value:0}},
  vertexShader:passVertex,
  fragmentShader:`
   varying vec2 vUv;uniform sampler2D tDiffuse;uniform float uOffset;
   void main(){gl_FragColor=texture2D(tDiffuse,vec2(vUv.x,fract(vUv.y+uOffset)));}`
 });
 verticalRoll.enabled=false;
 composer.addPass(verticalRoll);

 // Analog ghost is a displaced image sample, not a duplicate HTML element.
 const ghostPass=new ShaderPass({
  uniforms:{tDiffuse:{value:null},uX:{value:8},uY:{value:0},uStrength:{value:.22},uSize:{value:new THREE.Vector2(1,1)}},
  vertexShader:passVertex,
  fragmentShader:`
   varying vec2 vUv;uniform sampler2D tDiffuse;
   uniform float uX,uY,uStrength;uniform vec2 uSize;
   void main(){
    vec3 currentImage=texture2D(tDiffuse,vUv).rgb;
    vec2 uv2=vUv+vec2(-uX/max(1.0,uSize.x),uY/max(1.0,uSize.y));
    float mask=step(0.0,uv2.x)*step(uv2.x,1.0)*step(0.0,uv2.y)*step(uv2.y,1.0);
    vec3 echo=texture2D(tDiffuse,clamp(uv2,vec2(0.0),vec2(1.0))).rgb;
    gl_FragColor=vec4(clamp(currentImage+echo*uStrength*mask,0.0,1.0),1.0);
   }`
 });
 ghostPass.enabled=false;
 composer.addPass(ghostPass);

 // Luminance-dependent monochrome noise belongs to the incoming signal.
 const grain=new ShaderPass({
  uniforms:{
   tDiffuse:{value:null},
   uAmount:{value:.20},
   uTick:{value:0},
   uDpr:{value:1},
   uGrainSize:{value:2}
  },
  vertexShader:passVertex,
  fragmentShader:`
   varying vec2 vUv;
   uniform sampler2D tDiffuse;
   uniform float uAmount,uTick,uDpr,uGrainSize;
   float hash12(vec2 p){
    vec3 p3=fract(vec3(p.xyx)*0.1031);
    p3+=dot(p3,p3.yzx+33.33);
    return fract((p3.x+p3.y)*p3.z);
   }
   void main(){
    vec3 sourceColor=texture2D(tDiffuse,vUv).rgb;
    vec2 grainCell=floor(gl_FragCoord.xy/max(1.0,uDpr*uGrainSize));
    vec2 seed=grainCell+vec2(uTick*17.31,uTick*41.83);
    // Derive visibility from the noise-free signal. No external masks.
    float lum=dot(sourceColor,vec3(.2126,.7152,.0722));
    float visibility=smoothstep(.02,.95,lum);
    float mixAmount=clamp(uAmount,0.0,1.0)*visibility;
    float mono=(hash12(seed)+hash12(seed+vec2(31.7,92.3))
               +hash12(seed+vec2(69.4,14.9)))/3.0;
    gl_FragColor=vec4(mix(sourceColor,vec3(mono),mixAmount),1.0);
   }`
 });
 grain.enabled=false;
 composer.addPass(grain);

 const tint=new ShaderPass({
  uniforms:{tDiffuse:{value:null},uEnabled:{value:0},uTint:{value:new THREE.Vector3(.28,1,.46)}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:'varying vec2 vUv;uniform sampler2D tDiffuse;uniform float uEnabled;uniform vec3 uTint;void main(){vec3 rgb=texture2D(tDiffuse,vUv).rgb;float lum=dot(rgb,vec3(.2126,.7152,.0722));gl_FragColor=vec4(mix(rgb,vec3(lum)*uTint,uEnabled),1.);}'
 });
 composer.addPass(tint);

 // Lens blur: normalized 7x7 Gaussian convolution, not shifted copies.
 const edgeSoftness=new ShaderPass({
  uniforms:{tDiffuse:{value:null},uAmount:{value:.64},uRadius:{value:3},uSize:{value:new THREE.Vector2(1,1)}},
  vertexShader:passVertex,
  fragmentShader:`
   varying vec2 vUv;uniform sampler2D tDiffuse;
   uniform float uAmount,uRadius;uniform vec2 uSize;
   void main(){
    vec4 sharp=texture2D(tDiffuse,vUv);
    vec2 distPx=min(vUv,1.0-vUv)*uSize;
    float d=min(distPx.x,distPx.y);
    float amount=clamp(uAmount*(1.0-smoothstep(0.0,min(uSize.x,uSize.y)*.36,d)),0.0,1.0);
    if(amount<.001||uRadius<.001){gl_FragColor=sharp;return;}
    vec2 pixel=1.0/max(vec2(1.0),uSize);
    float interval=max(.001,uRadius)/3.0;
    vec4 sum=vec4(0.0);float weights=0.0;
    for(int y=-3;y<=3;y++){
     for(int x=-3;x<=3;x++){
      vec2 offset=vec2(float(x),float(y));
      float weight=exp(-dot(offset,offset)/(2.0*1.25*1.25));
      sum+=texture2D(tDiffuse,clamp(vUv+offset*interval*pixel,vec2(0.0),vec2(1.0)))*weight;
      weights+=weight;
     }
    }
    gl_FragColor=mix(sharp,sum/max(.001,weights),amount);
   }`
 });
 edgeSoftness.enabled=false;
 // Independent optical falloff; hue and image content stay intact.
 const edgeVignette=new ShaderPass({
  uniforms:{tDiffuse:{value:null},uAmount:{value:.39},uStart:{value:.57}},
  vertexShader:passVertex,
  fragmentShader:`
   varying vec2 vUv;uniform sampler2D tDiffuse;
   uniform float uAmount,uStart;
   void main(){
    vec4 src=texture2D(tDiffuse,vUv);
    vec2 p=abs(vUv*2.0-1.0);
    float edge=smoothstep(uStart,1.0,max(p.x,p.y));
    float corners=smoothstep(.86,1.4,length(p))*.2;
    gl_FragColor=vec4(src.rgb*(1.0-uAmount*clamp(edge+corners,0.0,1.0)),1.0);
   }`
 });
 edgeVignette.enabled=false;
 // Bloom remains upstream of screen optics, as in the approved test.
 composer.addPass(glow);
 composer.addPass(edgeSoftness);

 composer.addPass(edgeVignette);
 composer.addPass(new OutputPass());
 let width=1,height=1,dpr=1,rollPhase=0,lastTime=0;
 const config={
  phosphor:true,bloom:true,cutoff:.21,bloomStrength:.30,
  vignette:true,vignetteAmount:.39,vignetteSpread:.57,
  softness:true,softnessAmount:.64,softnessRadius:3,
  ghost:true,ghostX:2,ghostY:0,ghostStrength:22,
  noise:false,noiseAmount:20,noiseSpeed:15,noiseSize:2,
  roll:false,rollSpeed:20,rollOffset:0,
  theme:'green'
 };
 // This is the same layer order and shader behaviour as the preserved test platform.
 function setSize(w,h,pixelRatio){
  width=Math.max(1,w);height=Math.max(1,h);
  dpr=Math.max(1,pixelRatio||1);
  composer.setPixelRatio(dpr);
  composer.setSize(width,height);
  edgeSoftness.uniforms.uSize.value.set(width,height);
  ghostPass.uniforms.uSize.value.set(width,height);
  grain.uniforms.uDpr.value=dpr;
 }
 function update(values){
  Object.assign(config,values);
 }
 function render(time){
  const now=Number.isFinite(time)?time:performance.now();
  const dt=lastTime?Math.min(.15,Math.max(0,(now-lastTime)/1000)):0;
  lastTime=now;
  const o=config;
  if(o.roll&&o.rollSpeed!==0)rollPhase=(rollPhase+dt*o.rollSpeed/100)%1;
  verticalRoll.enabled=!!o.roll;
  verticalRoll.uniforms.uOffset.value=((rollPhase+o.rollOffset/100)%1+1)%1;
  ghostPass.enabled=!!o.ghost;
  ghostPass.uniforms.uX.value=o.ghostX;
  ghostPass.uniforms.uY.value=o.ghostY;
  ghostPass.uniforms.uStrength.value=o.ghostStrength/100;
  grain.enabled=!!o.noise;
  grain.uniforms.uAmount.value=o.noiseAmount/100;
  grain.uniforms.uGrainSize.value=o.noiseSize;
  grain.uniforms.uTick.value=Math.floor(now/1000*o.noiseSpeed);
  tint.uniforms.uEnabled.value=o.phosphor?1:0;
  tint.uniforms.uTint.value.set(...(o.theme==='amber'?[1.0,.67,.31]:[.28,1.0,.46]));
  glow.enabled=!!o.bloom;
  glow.threshold=o.cutoff;
  glow.strength=o.bloomStrength;
  edgeSoftness.enabled=!!o.softness;
  edgeSoftness.uniforms.uAmount.value=o.softnessAmount;
  edgeSoftness.uniforms.uRadius.value=o.softnessRadius;
  edgeVignette.enabled=!!o.vignette;
  edgeVignette.uniforms.uAmount.value=o.vignetteAmount;
  edgeVignette.uniforms.uStart.value=o.vignetteSpread;
  composer.render();
 }
 return {composer,config,update,render,setSize,
  get animate(){return config.noise||(config.roll&&config.rollSpeed!==0);}};
}
