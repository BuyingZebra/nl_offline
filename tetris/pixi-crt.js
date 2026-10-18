/* FIELD ATLAS / Tetris — full-screen PixiJS WebGL2 CRT pipeline.
 * Input is exactly ONE grayscale PixiJS scene. Every enabled pass processes
 * the entire scene, including modal panels; no DOM capture, CSS shadow or SVG.
 * Pass order is data, not a baked stack. Native WebGL2 is required.
 */
(function(global){
 'use strict';
 const P=global.PIXI;
 if(!P)return;
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const VERTEX=String.raw`
 in vec2 aPosition;
 out vec2 vTextureCoord;
 uniform vec4 uInputSize, uOutputFrame, uOutputTexture;
 void main(){
  vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;
  p.x=p.x*(2.0/uOutputTexture.x)-1.0;
  p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;
  gl_Position=vec4(p,0.0,1.0);
  vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);
 }`;
 const HEADER='in vec2 vTextureCoord;out vec4 finalColor;uniform sampler2D uTexture;uniform vec4 uInputSize;';
 const snippets={
  glow:{
   body: `uniform float uStrength,uThreshold,uRadius;
   float emitting(vec3 c){float y=dot(c,vec3(.2126,.7152,.0722));return smoothstep(uThreshold-.12,uThreshold+.12,y);}
   void main(){
    vec4 base=texture(uTexture,vTextureCoord);vec3 sum=vec3(0.0);float total=0.0;
    for(int x=-3;x<=3;x++)for(int y=-3;y<=3;y++){
     vec2 d=vec2(float(x),float(y));
     float w=exp(-dot(d,d)/5.5);
     vec3 source=texture(uTexture,vTextureCoord+d*uInputSize.zw*uRadius).rgb;
     sum+=source*emitting(source)*w;total+=w;
    }
    vec3 light=(sum/max(total,.001))*uStrength*1.05;
    finalColor=vec4(1.0-(1.0-base.rgb)*(1.0-clamp(light,0.,.9)),base.a);
   }`,
   defaults:{uStrength:[.68,'f32'],uThreshold:[.56,'f32'],uRadius:[2.6,'f32']}
  },
  ghost:{
   body:`uniform float uStrength,uDistance;
   void main(){
    vec4 c=texture(uTexture,vTextureCoord);
    vec3 a=texture(uTexture,vTextureCoord-vec2(uDistance,0.)*uInputSize.zw).rgb;
    vec3 b=texture(uTexture,vTextureCoord-vec2(uDistance*2.,0.)*uInputSize.zw).rgb;
    vec3 light=(a*.7+b*.3)*uStrength;
    finalColor=vec4(1.0-(1.0-c.rgb)*(1.0-clamp(light,0.,.6)),c.a);
   }`,
   defaults:{uStrength:[.24,'f32'],uDistance:[3,'f32']}
  },
  scanlines:{
   body:`uniform float uStrength;
   void main(){vec4 c=texture(uTexture,vTextureCoord);
     float y=mod(gl_FragCoord.y,4.0);
     float dark=(y<1.0?.08:y<2.0?.16:y<3.0?.58:.35);
     finalColor=vec4(c.rgb*(1.0-uStrength*dark),c.a);
   }`,
   defaults:{uStrength:[.51,'f32']}
  },
  softness:{
   body:`uniform float uStrength;
   void main(){
    vec4 c=texture(uTexture,vTextureCoord);
    vec2 p=uInputSize.zw;
    vec3 around=(texture(uTexture,vTextureCoord+vec2(p.x,0.)).rgb+
      texture(uTexture,vTextureCoord-vec2(p.x,0.)).rgb+
      texture(uTexture,vTextureCoord+vec2(0.,p.y)).rgb+
      texture(uTexture,vTextureCoord-vec2(0.,p.y)).rgb)*.25;
    finalColor=vec4(mix(c.rgb,around,uStrength),c.a);
   }`,
   defaults:{uStrength:[.13,'f32']}
  },
  noise:{
   body:`uniform float uStrength,uTime;
   float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   void main(){vec4 c=texture(uTexture,vTextureCoord);
     float n=hash(floor(vTextureCoord*uInputSize.xy/2.)+floor(uTime*24.));
     finalColor=vec4(clamp(c.rgb+(n-.5)*uStrength*.23,0.,1.),c.a);
   }`,
   defaults:{uStrength:[.08,'f32'],uTime:[0,'f32']}
  },
  vignette:{
   body:`uniform float uStrength,uTop,uBottom,uSweep,uTime;
   void main(){
    vec4 c=texture(uTexture,vTextureCoord);
    vec2 q=(vTextureCoord-vec2(.5))*vec2(1.4,1.55);
    float v=1.-smoothstep(.22,.84,length(q))*uStrength*.92;
    float top=smoothstep(0.,max(.001,uTop),vTextureCoord.y);
    float bottom=smoothstep(0.,max(.001,uBottom),1.0-vTextureCoord.y);
    float scanY=fract(uTime/13.);
    float sweep=(1.-smoothstep(0.,.095,abs(vTextureCoord.y-scanY)))*uSweep*.07;
    finalColor=vec4(clamp(c.rgb*v*top*bottom+sweep,0.,1.),c.a);
   }`,
   defaults:{uStrength:[.49,'f32'],uTop:[.15,'f32'],uBottom:[.15,'f32'],uSweep:[.57,'f32'],uTime:[0,'f32']}
  },
  phosphor:{
   body:`uniform vec3 uTint;
   void main(){vec4 c=texture(uTexture,vTextureCoord);
    float y=dot(c.rgb,vec3(.2126,.7152,.0722));
    float target=dot(uTint,vec3(.2126,.7152,.0722));
    finalColor=vec4(clamp(uTint*y/max(.001,target),0.,1.),c.a);
   }`,
   defaults:{uTint:[[108/255,1,156/255],'vec3<f32>']}
  }
 };
 class CRT{
  constructor(scene){
   this.scene=scene;
   this.order=['glow','ghost','softness','noise','scanlines','vignette','phosphor'];
   this.enabled={glow:true,ghost:false,softness:true,noise:true,scanlines:true,vignette:true,phosphor:true};
   this.config={glow:68,threshold:56,radius:2.6,ghost:24,ghostDistance:3,
    softness:13,noise:8,scan:51,vignette:49,sweep:57,top:135,bottom:135,
    theme:'green'};
   this.filters={};this.errors=[];
   for(const [id,spec] of Object.entries(snippets)){
    const resources={fx:{}};
    for(const [k,[value,type]] of Object.entries(spec.defaults))resources.fx[k]={value,type};
    try{
     this.filters[id]=P.Filter.from({gl:{vertex:VERTEX,fragment:HEADER+spec.body},resources});
    }catch(error){this.errors.push(id+': '+String(error));}
   }
   this.apply();
  }
  uniform(id,key,value){
   const f=this.filters[id];if(!f)return;
   f.resources.fx.uniforms[key]=value;
  }
  set(key,value){
   this.config[key]=value;
   const c=this.config;
   this.uniform('glow','uStrength',clamp(+c.glow/100,0,2));
   this.uniform('glow','uThreshold',clamp(+c.threshold/100,0,1));
   this.uniform('glow','uRadius',clamp(+c.radius,.5,9));
   this.uniform('ghost','uStrength',clamp(+c.ghost/100,0,1));
   this.uniform('ghost','uDistance',clamp(+c.ghostDistance,0,12));
   this.uniform('softness','uStrength',clamp(+c.softness/100,0,1));
   this.uniform('noise','uStrength',clamp(+c.noise/100,0,1));
   this.uniform('scanlines','uStrength',clamp(+c.scan/100,0,1));
   this.uniform('vignette','uStrength',clamp(+c.vignette/100,0,1));
   this.uniform('vignette','uSweep',clamp(+c.sweep/100,0,1));
   const h=Math.max(1,innerHeight);
   this.uniform('vignette','uTop',clamp(+c.top/h,0,1));
   this.uniform('vignette','uBottom',clamp(+c.bottom/h,0,1));
   this.uniform('phosphor','uTint',c.theme==='amber'?[1,196/255,100/255]:[108/255,1,156/255]);
  }
  apply(){
   for(const k of Object.keys(this.config))this.set(k,this.config[k]);
   const queue=this.order.filter(k=>this.enabled[k]&&this.filters[k]).map(k=>this.filters[k]);
   this.scene.filters=queue.length?queue:null;
  }
  toggle(id,value){this.enabled[id]=!!value;this.apply();}
  move(id,delta){
   const i=this.order.indexOf(id),j=i+delta;
   if(i<0||j<0||j>=this.order.length)return;
   [this.order[i],this.order[j]]=[this.order[j],this.order[i]];
   this.apply();
  }
  tick(now){
   this.uniform('noise','uTime',now/1000);
   this.uniform('vignette','uTime',now/1000);
  }
  state(){return {order:[...this.order],enabled:{...this.enabled},config:{...this.config},errors:[...this.errors]};}
 }
 global.FieldAtlasGPUCRT={CRT};
})(window);