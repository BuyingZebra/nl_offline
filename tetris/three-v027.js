/* FIELD ATLAS / TETRIS — V027 screen rebuilt in Canvas2D + THREE.JS.
 * Source remains grayscale; whole-screen GPU processes gameplay, panels and menus.
 * Engine and scores are the unchanged V027 modules, shared with live Tetris.
 */
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
const Core=window.FieldAtlasBlocks,Scores=window.FieldAtlasScores;
const screen=document.getElementById('screen'),display=document.getElementById('display');
const safeProbe=document.getElementById('safeArea'),initialsInput=document.getElementById('initials');
const fatal=document.getElementById('error');
if(!Core?.Game||!Scores){fatal.hidden=false;fatal.textContent='Tetris core missing';throw Error('Tetris core missing');}
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v)),fmt=(n,k=6)=>String(Math.max(0,Math.floor(n))).padStart(k,'0');
const gray=n=>{const v=clamp(Math.round(n),0,255);return 'rgb('+v+','+v+','+v+')'};
const C={bg:'#151515',panel:'#080808',button:'#151515',solid:'#303030',ink:'#e3e3e3',
 bright:'#cecece',weak:'#aeaeae',border:'#6a6a6a',grid:'#292929',dark:'#060606'};
const FONT='ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
const DEFAULT=Object.freeze({phosphor:true,bloom:true,bloomCutoff:.21,bloomStrength:.30,
 ghost:true,ghostX:2,ghostY:0,ghostStrength:22,noise:false,noiseAmount:20,noiseRate:15,noiseSize:2,
 softness:true,softnessStrength:.64,softnessRadius:3,
 vignette:true,vignetteAmount:.39,vignetteSpread:.57,roll:false,rollSpeed:20,rollOffset:0});
const PREF='fieldAtlasThreeV027FX01';
const load=(key,fallback)=>{try{return localStorage.getItem(key)??fallback}catch(e){return fallback}};
const store=(key,value)=>{try{localStorage.setItem(key,String(value))}catch(e){}};
let FX={...DEFAULT};
try{const s=JSON.parse(load(PREF,'null'));if(s&&typeof s==='object')for(const [k,v] of Object.entries(DEFAULT))if(typeof s[k]===typeof v)FX[k]=s[k];}catch(e){}
const persist=()=>store(PREF,JSON.stringify(FX));
const game=new Core.Game();
let highs=Scores.read(window.localStorage),overOffered=false;
let showGhost=load('fieldAtlasTetrisGhost','yes')!=='no';
let soundOn=load('fieldAtlasTetrisSound','yes')!=='no';
let theme=load('fieldAtlasThemeV06','green')==='amber'?'amber':'green';
let W=1,H=1,DPR=1,regions=[],layoutInfo=null,modal=null,modalView=null;
let optionsScroll=0,optionsMaxScroll=0,pressed=null,repeatDelay=null,repeatInterval=null;
let dirty=true,queued=false,lastTime=performance.now(),lastDraw=0,rollPhase=0,audioCtx=null,gamepadDrag=null;
const input=document.createElement('canvas'),g=input.getContext('2d',{alpha:false});
if(!g){fatal.hidden=false;fatal.textContent='Canvas2D missing';throw Error('Canvas2D missing');}
const texture=new THREE.CanvasTexture(input);
texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;
const renderer=new THREE.WebGLRenderer({canvas:screen,antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x151515);
const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=2;
const surface=new THREE.Mesh(new THREE.PlaneGeometry(2,2),
 new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));
surface.frustumCulled=false;scene.add(surface);

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
  uniforms:{tDiffuse:{value:null},uAmount:{value:.65},uRadius:{value:4},uSize:{value:new THREE.Vector2(1,1)}},
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
  uniforms:{tDiffuse:{value:null},uAmount:{value:.55},uStart:{value:.50}},
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


const hues={green:new THREE.Vector3(.28,1,.46),amber:new THREE.Vector3(1,.72,.36)};
const brightness={I:.99,J:.8,L:.92,O:.94,S:.76,T:.85,Z:.73};
function tone(freq=240,len=.04){
 if(!soundOn)return;
 try{const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)return;if(!audioCtx)audioCtx=new AC();
  if(audioCtx.state==='suspended')void audioCtx.resume();
  const osc=audioCtx.createOscillator(),vol=audioCtx.createGain();
  osc.type='square';osc.frequency.value=freq;
  vol.gain.setValueAtTime(.014,audioCtx.currentTime);
  vol.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+len);
  osc.connect(vol).connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+len);
 }catch(e){}
}
function invalidate(){dirty=true;requestFrame();}
function openModal(name){modal=name;modalView=null;optionsScroll=0;invalidate();}
function onOver(){
 if(game.status!=='over'||overOffered)return;
 overOffered=true;
 if(Scores.qualifies(highs,game.score)){
  initialsInput.value=load('fieldAtlasTetrisInitials','AAA');
  openModal('entry');
 }
}
function perform(type){
 const was=game.status,pieces=game.pieces,lines=game.lines;
 let ok=false;
 if(type==='left')ok=game.move(-1);
 else if(type==='right')ok=game.move(1);
 else if(type==='cw')ok=game.rotate(1);
 else if(type==='hard')ok=game.hardDrop();
 else if(type==='hold')ok=game.holdPiece();
 else if(type==='pause')ok=game.pause();
 else if(type==='start')ok=game.start();
 if(ok){
  if(was==='over'&&game.status==='playing')overOffered=false;
  if(game.lines>lines)tone(610,.14);
  else if(game.pieces>pieces)tone(175);
  else if(type==='cw')tone(305);
  else if(type==='hard')tone(185);
  else if(type==='hold')tone(265);
  onOver();invalidate();
 }
 return ok;
}
function restart(){
 game.reset();game.start();overOffered=false;openModal(null);invalidate();
}
function options(){if(game.status==='playing')perform('pause');openModal('options');}
function scores(){if(game.status==='playing')perform('pause');openModal('scores');}
function saveScore(){
 const tag=Scores.initials(initialsInput.value);
 highs=Scores.save(window.localStorage,Scores.add(highs,
  {name:tag,score:game.score,lines:game.lines,level:game.level,at:Date.now()}));
 store('fieldAtlasTetrisInitials',tag);initialsInput.blur();openModal('scores');
}
initialsInput.addEventListener('input',()=>{
 initialsInput.value=initialsInput.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3);
 invalidate();
});
initialsInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveScore();}});
function panel(x,y,w,h,r=8,fill=C.panel,border=C.border){
 if(w<=0||h<=0)return;
 g.beginPath();g.roundRect(x+.5,y+.5,Math.max(1,w-1),Math.max(1,h-1),Math.min(r,w/2,h/2));
 if(fill){g.fillStyle=fill;g.fill();}
 if(border){g.strokeStyle=border;g.lineWidth=1;g.stroke();}
}
function text(str,x,y,size=12,color=C.ink,align='left',maxWidth=Infinity){
 g.font='700 '+size+'px '+FONT;g.textAlign=align;g.textBaseline='middle';
 g.fillStyle=color;g.fillText(String(str),x,y,maxWidth);
}
function rect(x,y,w,h,color){g.fillStyle=color;g.fillRect(x,y,w,h);}
function region(x,y,w,h,act,opts={}){regions.push({x,y,w,h,act,...opts});}
function key(label,x,y,w,h,act,{light=false,size=11,repeat=false,arrow=false}={}){
 const down=pressed?.action===act&&pressed?.box?.x===x;
 panel(x,y,w,h,8,down?C.solid:(light?C.bright:C.button),light?C.bright:C.border);
 text(label,x+w/2,y+h/2,size,light?C.dark:C.ink,'center',Math.max(10,w-14));
 if(arrow)text('▶',x+17,y+h/2,14,light?C.dark:C.ink,'center');
 region(x,y,w,h,act,{repeat});
}
function smallPiece(kind,x,y,w,h){
 if(!kind)return;
 const m=Core.SHAPES[kind],pts=[];
 for(let r=0;r<m.length;r++)for(let c=0;c<m[r].length;c++)if(m[r][c])pts.push([c,r]);
 if(!pts.length)return;
 const loX=Math.min(...pts.map(p=>p[0])),hiX=Math.max(...pts.map(p=>p[0]));
 const loY=Math.min(...pts.map(p=>p[1])),hiY=Math.max(...pts.map(p=>p[1]));
 const size=Math.min(20,(w-8)/(hiX-loX+1),(h-6)/(hiY-loY+1));
 const sx=x+(w-size*(hiX-loX+1))/2,sy=y+(h-size*(hiY-loY+1))/2;
 const shade=gray(28+190*(brightness[kind]||.8));
 for(const [col,row] of pts){
  const xx=sx+(col-loX)*size,yy=sy+(row-loY)*size;
  rect(xx+1,yy+1,size-2,size-2,shade);
  g.strokeStyle=C.bright;g.lineWidth=.6;g.strokeRect(xx+1.5,yy+1.5,size-3,size-3);
 }
}
function cell(x,y,col,row,size,kind,isGhost=false){
 if(!kind||col<0||row<0||col>=10||row>=20)return;
 const px=x+col*size,py=y+row*size;
 if(isGhost){
  g.setLineDash([3,3]);g.strokeStyle='#777';g.lineWidth=1;
  g.strokeRect(px+3,py+3,size-6,size-6);g.setLineDash([]);return;
 }
 const shade=gray(28+190*(brightness[kind]||.8));
 rect(px+1,py+1,size-2,size-2,shade);
 g.strokeStyle=C.bright;g.lineWidth=.6;g.strokeRect(px+1.5,py+1.5,size-3,size-3);
 rect(px+3,py+3,Math.max(1,size-6),2,'rgba(230,230,230,.18)');
}
function stage(r){
 const {boardX:x,boardY:y,boardW:w,boardH:h}=r;
 panel(x,y,w,h,7,C.panel);
 const offX=x+2,offY=y+2,tile=(w-4)/10;
 g.save();g.beginPath();g.rect(offX,offY,w-4,h-4);g.clip();
 rect(offX,offY,w-4,h-4,'#101010');
 g.globalAlpha=.42;g.strokeStyle=C.grid;g.lineWidth=.6;g.beginPath();
 for(let c=0;c<=10;c++){g.moveTo(offX+c*tile,offY);g.lineTo(offX+c*tile,offY+20*tile);}
 for(let row=0;row<=20;row++){g.moveTo(offX,offY+row*tile);g.lineTo(offX+10*tile,offY+row*tile);}
 g.stroke();g.globalAlpha=1;
 game.board.forEach((row,ry)=>row.forEach((kind,rx)=>cell(offX,offY,rx,ry,tile,kind)));
 if(game.current&&game.status!=='over'){
  const p=game.current;
  if(showGhost&&game.status==='playing'){
   const target=game.ghostY();
   p.matrix.forEach((row,ry)=>row.forEach((kind,rx)=>{if(kind)cell(offX,offY,p.x+rx,target+ry,tile,kind,true);}));
  }
  p.matrix.forEach((row,ry)=>row.forEach((kind,rx)=>{if(kind)cell(offX,offY,p.x+rx,p.y+ry,tile,kind);}));
 }
 g.restore();
 region(x,y,w,h,'board',{board:true});
 if(game.status!=='playing'){
  g.save();g.beginPath();g.roundRect(x+2,y+2,w-4,h-4,6);g.clip();
  rect(x+2,y+2,w-4,h-4,'rgba(0,0,0,.88)');g.restore();
  const type=game.status;
  const title=type==='paused'?'PAUSED':type==='over'?'GAME OVER':'TETRIS';
  const caption=type==='paused'?'RESUME':type==='over'?'PLAY AGAIN':'START GAME';
  const copy=type==='paused'?'YOUR GAME IS SAFE UNTIL YOU RETURN':type==='over'?'SCORE '+game.score+' / '+game.lines+' LINES':'SURVIVE THE SOVIET CHALLENGE';
  text(title,x+w/2,y+h/2-64,Math.min(21,w*.079),C.bright,'center',w-18);
  text(copy,x+w/2,y+h/2-27,Math.min(10,w*.034),C.weak,'center',w-18);
  const by=y+h/2+14,bw=w-32;
  key(caption,x+16,by,bw,50,'start',{light:true,size:Math.min(13,bw*.05),arrow:true});
  if(type==='paused'){
   key('NEW GAME',x+16,by+64,bw,40,'restart');
   key('HIGH SCORE',x+16,by+111,bw,40,'scores');
  }
 }
}
function insets(){
 const cs=getComputedStyle(safeProbe);
 return {top:parseFloat(cs.paddingTop)||0,bottom:parseFloat(cs.paddingBottom)||0};
}
function layout(){
 const safe=insets(),landscape=W>H&&H<=600;
 const width=landscape?W:Math.min(W,520),off=(W-width)/2,pad=11,inner=width-22;
 const gap=H<=730?6:9;
 let hy=safe.top+9,hh=H<=730?53:65,dh=H<=730?160:172,dy=H-safe.bottom-30-dh;
 let sy=hy+hh+gap,sh=dy-gap-sy;
 let hx=off+pad,hw=inner,sx=off+pad,sw=inner,dx=off+pad,dw=inner;
 if(landscape){
  const left=Math.min(205,width*.25),right=Math.min(255,width*.30);
  hy=8;hh=64;dy=8;dh=H-16;sy=8;sh=H-16;
  hx=off+8;hw=left;sx=off+left+18;sw=width-left-right-38;
  dx=off+width-right-8;dw=right;
 }
 const bw=Math.max(20,Math.min(305,sw-103,(sh-2)/2)),bh=bw*2;
 const bx=sx+Math.max(0,(sw-bw-103)/2),by=sy+Math.max(0,(sh-bh)/2);
 return {safe,landscape,width,off,pad,inner,hy,hh,hx,hw,
  sy,sh,sx,sw,boardX:bx,boardY:by,boardW:bw,boardH:bh,
  sideX:bx+bw+10,sideW:93,dx,dy,dw,dh,footerY:H-safe.bottom-18};
}
function paintGame(){
 regions=[];const r=layout();layoutInfo=r;
 rect(0,0,W,H,C.bg);
 panel(r.hx,r.hy,r.hw,r.hh,12,C.panel);
 text('TETRIS SYSTEM',r.hx+13,r.hy+r.hh/2,
  r.landscape?13:Math.min(21,Math.max(16,W*.05)),C.ink,'left',Math.max(10,r.hw-116));
 const tx=r.hx+r.hw-100,th=Math.min(46,r.hh-16);
 key('◐',tx,r.hy+9,44,th,'theme',{size:17});
 key('☷',tx+51,r.hy+9,44,th,'options',{size:17});
 stage(r);
 const short=H<=730,holdH=(short?43:60)+26,queueH=short?159:177;
 const sx=r.sideX,sw=Math.max(8,Math.min(93,r.sx+r.sw-r.sideX));
 panel(sx,r.boardY,sw,holdH,9,C.panel);
 text('HOLD',sx+sw/2,r.boardY+13,9,C.weak,'center');
 smallPiece(game.hold,sx+(sw-80)/2,r.boardY+23,80,Math.min(50,holdH-25));
 const qy=r.boardY+holdH+6;
 panel(sx,qy,sw,queueH,9,C.panel);
 text('NEXT',sx+sw/2,qy+13,9,C.weak,'center');
 for(let i=0;i<3;i++)smallPiece(game.queue[i],sx+(sw-80)/2,qy+27+i*((queueH-33)/3),80,Math.min(44,(queueH-33)/3));
 const statsH=short?73:84,statsY=r.boardY+r.boardH-statsH;
 panel(sx,statsY,sw,statsH,9,C.panel);
 text('BEST',sx+sw/2,statsY+12,9,C.weak,'center');
 text(Math.max(highs[0]?.score||0,game.score),sx+sw/2,statsY+30,13,C.ink,'center');
 text('PIECES',sx+sw/2,statsY+50,9,C.weak,'center');
 text(game.pieces,sx+sw/2,statsY+67,13,C.ink,'center');
 panel(r.dx,r.dy,r.dw,r.dh,12,C.panel);
 const px=r.dx+9,pw=r.dw-18,ly=r.dy+16,s=Math.min(17,pw*.046);
 text('LEVEL',px+2,ly,9,C.weak);
 text('SCORE',px+pw/2,ly,9,C.weak,'center');
 text('LINES',px+pw-2,ly,9,C.weak,'right');
 text(fmt(game.level,2),px+2,ly+23,s);
 text(fmt(game.score),px+pw/2,ly+23,s,C.ink,'center');
 text(fmt(game.lines,2),px+pw-2,ly+23,s,C.ink,'right');
 rect(px,r.dy+55,pw,1,C.border);
 const col=(pw-24)/5,cy=r.dy+64,ch=short?45:53;
 key('◀',px,cy,col,ch,'left',{light:true,size:18,repeat:true});
 key('DROP',px+col+6,cy,col*2+6,ch,'hard',{light:true,size:14});
 key('▶',px+col*3+18,cy,col,ch,'right',{light:true,size:18,repeat:true});
 key('↻',px+col*4+24,cy,col,ch,'cw',{size:22});
 const ey=cy+ch+7,ex=px+pw/2,ew=Math.min(180,pw*.4);
 key('HOLD',ex-4-ew,ey,ew,44,'hold');
 key('PAUSE',ex+4,ey,ew,44,'pause');
 text(game.status==='ready'?'READY / PRESS START':game.lastEvent+' / '+game.dropMs+' MS',
   r.off+11,r.footerY,9,C.weak,'left',r.inner*.52);
 text('LOCAL ARCADE ENGINE / V027',r.off+r.width-11,r.footerY,9,C.weak,'right',r.inner*.54);
 if(modal)paintModal();
 texture.needsUpdate=true;dirty=false;
}
function paintModal(){/* Extended controls & score modals are installed below. */}
