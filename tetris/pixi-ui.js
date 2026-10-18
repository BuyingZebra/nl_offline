/* FIELD ATLAS / TETRIS V028 — unified native PixiJS UI.
 * Exactly one visible rendering system: all game content AND menus are
 * persistent Pixi display objects. Grayscale pixels have no baked hue or glow.
 * Core rules + high scores are the established V027 modules, unchanged.
 */
(async function(){
 'use strict';
 const P=window.PIXI,Core=window.FieldAtlasBlocks,Scores=window.FieldAtlasScores,FX=window.FieldAtlasGPUCRT;
 const root=document.getElementById('game'),entry=document.getElementById('initialsNative');
 const fail=document.getElementById('fatal');
 if(!P?.Application||!Core?.Game||!Scores||!FX){
  fail.textContent='Tetris renderer unavailable. Reload to retry.';fail.hidden=false;return;
 }
 const C={bg:0x151515,panel:0x080808,solid:0x303030,ink:0xe3e3e3,
  bright:0xcecece,weak:0xaeaeae,border:0x6a6a6a,grid:0x292929,dark:0x060606};
 const FONT='ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
 const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
 const game=new Core.Game();
 const saved=(key,fallback)=>{try{const s=localStorage.getItem(key);return s===null?fallback:s;}catch(e){return fallback;}};
 const store=(key,value)=>{try{localStorage.setItem(key,String(value));}catch(e){}};
 const scores=Scores.read(window.localStorage);
 let highScores=scores,showGhost=saved('fieldAtlasTetrisGhost','yes')!=='no',
  soundOn=saved('fieldAtlasTetrisSound','yes')!=='no',
  theme=saved('fieldAtlasThemeV06','green')==='amber'?'amber':'green',
  glow=83,scan=51,vignette=49,sweep=57,
  gradients={screenTop:{enabled:true,length:135},screenBottom:{enabled:true,length:135}},
  experimental={noiseEnabled:true,noiseAmount:8,noiseSpeed:24,persistenceEnabled:true,
   persistenceAmount:35,persistenceDecay:765,softnessEnabled:true,softnessAmount:13};
 try{
  const a=JSON.parse(saved('fieldAtlasEffectsV06','null'));
  if(a){glow=clamp(Number(a.glow??83),0,100);scan=clamp(Number(a.scanlines??51),0,100);
   vignette=clamp(Number(a.vignette??49),0,100);}
  const b=JSON.parse(saved('fieldAtlasTetrisGradientsV01','null'));
  const m=JSON.parse(saved('fieldAtlasGradientsV20','null'));
  for(const key of Object.keys(gradients))Object.assign(gradients[key],m?.[key],b?.[key]);
  const c=JSON.parse(saved('fieldAtlasTetrisExperimentalV01','null'));
  if(c)Object.assign(experimental,c);
  sweep=clamp(Number(saved('fieldAtlasTetrisSweepV01','57')),0,100);
 }catch(e){}
 const renderApp=new P.Application();
 try{
  await renderApp.init({resizeTo:window,preference:'webgl',backgroundColor:C.bg,
   antialias:false,resolution:Math.min(devicePixelRatio||1,2),autoDensity:true,
   eventFeatures:{move:true,globalMove:true,click:true,wheel:true}});
 }catch(error){
  fail.textContent='WebGL2 failed to initialize: '+String(error);
  fail.hidden=false;return;
 }
 root.appendChild(renderApp.canvas);
 renderApp.canvas.id='tetrisCanvas';renderApp.canvas.setAttribute('aria-label','Tetris System game and display');
 renderApp.canvas.style.touchAction='none';
 const base=new P.Container();
 base.eventMode='passive';
 renderApp.stage.addChild(base);
 const crt=new FX.CRT(base);
 const initFX=()=>{
  crt.set('theme',theme);crt.set('glow',glow);crt.set('scan',scan);
  crt.set('vignette',vignette);crt.set('sweep',sweep);
  crt.set('top',gradients.screenTop.enabled?gradients.screenTop.length:0);
  crt.set('bottom',gradients.screenBottom.enabled?gradients.screenBottom.length:0);
  crt.set('softness',experimental.softnessEnabled?experimental.softnessAmount:0);
  crt.set('noise',experimental.noiseEnabled?experimental.noiseAmount:0);
  crt.apply();
 };
 initFX();
 let gameLayer,menuLayer,alertLayer,boardGraphic,boardBg,veilLayer,holdPreview,nextPreviews=[],
     bestLabel,levelLabel,scoreLabel,linesLabel,piecesLabel,eventLabel,veilTitle,veilSub,playLabel,
     controls={},modals={},currentModal=null,menuScroll=null,menuScrollY=0,menuMaxScroll=0,
     keyRegions=[],width=0,height=0,frameNum=0,lastNow=performance.now(),
     gameOverHandled=false,audioCtx=null,entries=[],fps=0,rafCount=0,rafStamp=performance.now(),
     lastFrameMs=0,lastRender=0,lastEffect=0;
 const state={drawing:false,lastError:'',fps:0,sceneBuilds:0,menuBuilds:0};
 const textStyle=(size=12,color=C.ink,weight=700,spacing=0)=>({
  fontFamily:FONT,fontSize:size,fill:color,fontWeight:String(weight),
  letterSpacing:spacing,lineHeight:size*1.4,whiteSpace:'pre'
 });
 const text=(parent,value,x,y,size=12,color=C.ink,align='left',weight=700,spacing=0)=>{
  const o=new P.Text({text:String(value),style:textStyle(size,color,weight,spacing)});
  o.anchor.set(align==='center'?.5:align==='right'?1:0,.5);o.position.set(x,y);
  parent.addChild(o);return o;
 };
 const box=(parent,x,y,w,h,color=C.panel,border=C.border,r=8)=>{
  const g=new P.Graphics();
  if(w>0&&h>0){
   g.roundRect(x,y,w,h,clamp(r,0,Math.min(w,h)/2)).fill({color});
   if(border!==null)g.roundRect(x+.5,y+.5,Math.max(0,w-1),Math.max(0,h-1),Math.max(0,r-.5))
     .stroke({color:border,width:1});
  }
  parent.addChild(g);return g;
 };
 const line=(parent,x1,y1,x2,y2,color=C.border)=>{
  const g=new P.Graphics().moveTo(x1,y1).lineTo(x2,y2).stroke({color,width:1});
  parent.addChild(g);return g;
 };
 const container=(parent,x=0,y=0)=>{const c=new P.Container();c.position.set(x,y);parent.addChild(c);return c;};
 const button=(parent,label,x,y,w,h,handler,opt={})=>{
  const o=container(parent,x,y);const face=new P.Graphics();o.addChild(face);
  const labelSize=opt.size||11,bright=!!opt.bright;
  const fg=bright?C.dark:C.ink,bg=bright?C.bright:C.bg,edge=bright?C.bright:C.border;
  const draw=(down)=>{
   face.clear().roundRect(.5,.5,w-1,h-1,8).fill({color:down?C.solid:bg})
     .roundRect(.5,.5,w-1,h-1,8).stroke({color:edge,width:1});
  };
  draw(false);
  const t=text(o,label,w/2,h/2,labelSize,fg,'center',700,opt.spacing||0);
  o.eventMode='static';o.cursor='pointer';o.hitArea=new P.Rectangle(0,0,w,h);
  let interval=null,delay=null,pressed=false;
  const stop=()=>{pressed=false;draw(false);if(delay)clearTimeout(delay);if(interval)clearInterval(interval);delay=null;interval=null;};
  const act=()=>{if(opt.disabled)return;handler();if(experimental.persistenceEnabled&&experimental.persistenceAmount>0){
   const copy=box(gameLayer,x,y,w,h,bright?C.bright:C.bg,null,8);
   copy.alpha=experimental.persistenceAmount/100*.28;copy.eventMode='none';
   const born=performance.now(),decay=experimental.persistenceDecay;
   const fade=(now)=>{if(copy.destroyed)return;
    const a=1-(now-born)/decay;
    if(a<=0){copy.destroy();return;}
    copy.alpha=experimental.persistenceAmount/100*.28*a;requestAnimationFrame(fade);
   };requestAnimationFrame(fade);
  }};
  o.on('pointerdown',()=>{if(opt.disabled)return;pressed=true;draw(true);act();
   if(opt.repeat){delay=setTimeout(()=>{interval=setInterval(act,82);},210);}
  });
  o.on('pointerup',stop);o.on('pointerupoutside',stop);o.on('pointercancel',stop);
  o.on('pointerout',()=>{if(pressed)stop();});
  o.on('pointertap',()=>{}); // pointerdown is the single action, no duplicates.
  return {o,face,t,stop};
 };
 const lightButton=(parent,label,x,y,w,h,handler,opt={})=>button(parent,label,x,y,w,h,handler,{...opt,bright:true});
 const settingSave=()=>{
  store('fieldAtlasEffectsV06',JSON.stringify({glow,scanlines:scan,vignette}));
  store('fieldAtlasTetrisSweepV01',sweep);
  store('fieldAtlasTetrisGradientsV01',JSON.stringify(gradients));
  store('fieldAtlasTetrisExperimentalV01',JSON.stringify(experimental));
  try{
   const m=JSON.parse(saved('fieldAtlasGradientsV20','null'))||{};
   for(const k of Object.keys(gradients))m[k]={...gradients[k]};
   store('fieldAtlasGradientsV20',JSON.stringify(m));
  }catch(e){}
 };
 const syncCRT=()=>{
  crt.set('glow',glow);crt.set('scan',scan);crt.set('vignette',vignette);
  crt.set('sweep',sweep);crt.set('theme',theme);
  crt.set('top',gradients.screenTop.enabled?gradients.screenTop.length:0);
  crt.set('bottom',gradients.screenBottom.enabled?gradients.screenBottom.length:0);
  crt.set('noise',experimental.noiseEnabled?experimental.noiseAmount:0);
  crt.set('softness',experimental.softnessEnabled?experimental.softnessAmount:0);
  crt.apply();
 };
 const tone=(freq,duration=.045)=>{
  if(!soundOn)return;
  try{
   const A=window.AudioContext||window.webkitAudioContext;
   if(!A)return;if(!audioCtx)audioCtx=new A();
   if(audioCtx.state==='suspended')audioCtx.resume();
   const oscillator=audioCtx.createOscillator(),gain=audioCtx.createGain();
   oscillator.type='square';oscillator.frequency.value=freq;
   gain.gain.setValueAtTime(.015,audioCtx.currentTime);
   gain.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+duration);
   oscillator.connect(gain).connect(audioCtx.destination);
   oscillator.start();oscillator.stop(audioCtx.currentTime+duration);
  }catch(e){}
 };
 const fmt=(n,d=6)=>String(n).padStart(d,'0');
 const onOver=()=>{
  if(game.status!=='over'||gameOverHandled)return;
  gameOverHandled=true;
  if(Scores.qualifies(highScores,game.score)){entry.value=saved('fieldAtlasTetrisInitials','AAA');openModal('entry');}
 };
 const action=(which)=>{
  const before=game.pieces,lines=game.lines,status=game.status;
  let ok=false;
  if(which==='left')ok=game.move(-1);
  else if(which==='right')ok=game.move(1);
  else if(which==='cw')ok=game.rotate(1);
  else if(which==='hard')ok=game.hardDrop();
  else if(which==='hold')ok=game.holdPiece();
  else if(which==='pause')ok=game.pause();
  else if(which==='start')ok=game.start();
  if(ok){
   if(status==='over'&&game.status==='playing')gameOverHandled=false;
   if(game.lines>lines)tone(600,.13);
   else if(game.pieces>before)tone(175,.04);
   else if(which==='cw')tone(305);
   else if(which==='hard')tone(185);
   else if(which==='hold')tone(265);
   onOver();syncGame();
  }
 };
 function preview(g,kind,w,h){
  g.clear();if(!kind)return;
  const matrix=Core.SHAPES[kind];
  const points=[];
  matrix.forEach((row,y)=>row.forEach((cell,x)=>{if(cell)points.push([x,y]);}));
  if(!points.length)return;
  const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0]));
  const minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
  const cols=maxX-minX+1,rows=maxY-minY+1;
  const cell=Math.min(20,(w-8)/cols,(h-8)/rows);
  const x0=(w-cols*cell)/2,y0=(h-rows*cell)/2;
  const intensity={I:.98,O:.93,T:.85,S:.76,Z:.73,J:.8,L:.9}[kind]||.85;
  const gray=Math.round(21+(206-21)*intensity);
  const fill=(gray<<16)|(gray<<8)|gray;
  points.forEach(([x,y])=>{
   const rx=x0+(x-minX)*cell,ry=y0+(y-minY)*cell;
   g.rect(rx+1,ry+1,Math.max(1,cell-2),Math.max(1,cell-2)).fill({color:fill});
  });
 }
 const cells=()=>game.cells();
 function paintBoard(){
  if(!boardGraphic)return;
  const g=boardGraphic;g.clear();
  const size=boardGraphic._tileSize||22;
  for(let row=0;row<20;row++)for(let col=0;col<10;col++){
   const x=col*size,y=row*size;
   g.rect(x,y,size,size).stroke({color:C.grid,alpha:.38,width:.5});
  }
  if(showGhost&&game.current&&game.status==='playing'){
   const p=game.current,gy=game.ghostY();
   for(let y=0;y<p.matrix.length;y++)for(let x=0;x<p.matrix[y].length;x++){
    if(!p.matrix[y][x])continue;const rx=p.x+x,ry=gy+y;
    if(rx>=0&&rx<10&&ry>=0&&ry<20)g.rect(rx*size+2,ry*size+2,size-4,size-4)
      .stroke({color:C.weak,alpha:.22,width:1});
   }
  }
  const intensity={I:1,O:.95,T:.89,S:.79,Z:.73,J:.84,L:.93};
  for(let y=0;y<20;y++)for(let x=0;x<10;x++){
   const kind=cellsCache[y][x];if(!kind)continue;
   const m=.23+(.75*(intensity[kind]||.85));
   const col=Math.round(21+(206-21)*m),color=(col<<16)|(col<<8)|col;
   g.rect(x*size+1,y*size+1,size-2,size-2).fill({color});
   g.rect(x*size+3,y*size+3,Math.max(1,size-6),2).fill({color:C.ink,alpha:.18});
  }
 }
 let cellsCache=game.cells();
 const updatePreview=()=>{
  if(holdPreview)preview(holdPreview,game.hold,80,60);
  for(let i=0;i<nextPreviews.length;i++)preview(nextPreviews[i],game.queue[i],80,44);
 };
 function syncGame(){
  cellsCache=game.cells();paintBoard();updatePreview();
  if(bestLabel)bestLabel.text=String(highScores[0]?.score||0);
  if(levelLabel)levelLabel.text=fmt(game.level,2);
  if(scoreLabel)scoreLabel.text=fmt(game.score);
  if(linesLabel)linesLabel.text=fmt(game.lines,2);
  if(piecesLabel)piecesLabel.text=String(game.pieces);
  if(eventLabel)eventLabel.text=game.lastEvent+' / '+(game.status==='ready'?'PRESS START':'LOCAL ARCADE ENGINE / V028');
  if(veilLayer){
   veilLayer.visible=game.status!=='playing';
   if(game.status==='ready'){veilTitle.text='TETRIS';veilSub.text='SURVIVE THE SOVIET CHALLENGE';playLabel.text='▶  START GAME';}
   else if(game.status==='paused'){veilTitle.text='PAUSED';veilSub.text='YOUR GAME IS SAFE';playLabel.text='▶  RESUME';}
   else if(game.status==='over'){veilTitle.text='GAME OVER';veilSub.text='TRY AGAIN';playLabel.text='▶  AGAIN';}
  }
 }
 const safeArea=()=>{
  const probe=document.getElementById('safeProbe');if(!probe)return {top:0,bottom:0};
  const css=getComputedStyle(probe);
  return {top:parseFloat(css.paddingTop)||0,bottom:parseFloat(css.paddingBottom)||0};
 };
 const createGame=()=>{
  const safe=safeArea(),landscape=width>height&&height<=600;
  const maxW=landscape?width:Math.min(width,520),offsetX=(width-maxW)/2;
  const app=container(base,offsetX,0);
  gameLayer=app;
  box(app,0,0,maxW,height,C.bg,null,0);
  const pad=11,inner=maxW-2*pad,gap=height<=730?6:9;
  let headY=safe.top+9,headH=height<=730?53:65,deckH=height<=730?160:172;
  let deckY=height-safe.bottom-30-deckH;
  let stageY=headY+headH+gap,stageH=deckY-gap-stageY;
  if(landscape){headY=8;headH=64;deckY=8;deckH=height-16;stageY=8;stageH=height-16;}
  const headerX=landscape?8:pad,headerW=landscape?Math.min(205,maxW*.25):inner;
  box(app,headerX,headY,headerW,headH,C.panel,C.border,12);
  text(app,'TETRIS SYSTEM',headerX+13,headY+headH/2,landscape?13:Math.min(21,Math.max(16,width*.05)),C.ink,'left',700,1.2);
  const themeX=headerX+headerW-(landscape?84:100);
  button(app,'◐',themeX,headY+9,44,Math.min(46,headH-16),()=>{
   theme=theme==='green'?'amber':'green';store('fieldAtlasThemeV06',theme);syncCRT();}, {size:17});
  button(app,'☷',themeX+51,headY+9,44,Math.min(46,headH-16),()=>openModal('options'),{size:17});
  let stageX=pad,stageW=inner;
  if(landscape){stageX=headerW+18;stageW=maxW-headerW-18-Math.min(255,maxW*.30)-12; }
  const sideW=landscape?93:93,boardW=Math.max(30,Math.min(305,stageW-103,(stageH-2)/2));
  const boardH=2*boardW,total=boardW+10+sideW;
  const boardX=stageX+Math.max(0,(stageW-total)/2),boardY=stageY+Math.max(0,(stageH-boardH)/2);
  boardBg=box(app,boardX,boardY,boardW,boardH,C.panel,C.border,7);
  const boardContent=container(app,boardX+2,boardY+2);
  boardGraphic=new P.Graphics();boardContent.addChild(boardGraphic);
  const tile=(boardW-4)/10;
  boardGraphic._tileSize=tile;
  boardGraphic.eventMode='static';boardGraphic.hitArea=new P.Rectangle(0,0,boardW-4,boardH-4);
  let drag=null;
  boardGraphic.on('pointerdown',e=>{drag={x:e.global.x,y:e.global.y};});
  boardGraphic.on('pointerup',e=>{
   if(!drag)return;const dx=e.global.x-drag.x,dy=e.global.y-drag.y;drag=null;
   if(Math.abs(dx)<16&&Math.abs(dy)<16)action('cw');
   else if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>=18){
    const n=clamp(Math.round(Math.abs(dx)/32),1,5);
    for(let i=0;i<n;i++)action(dx>0?'right':'left');
   }else if(dy>25)action('hard');
  });
  const sideX=boardX+boardW+10;
  const panelWidth=Math.min(sideW,stageX+stageW-sideX);
  const sideHeader=height<=730?43:60,holdH=sideHeader+26,queueH=height<=730?159:177;
  box(app,sideX,boardY,panelWidth,holdH,C.panel,C.border,9);
  text(app,'HOLD',sideX+panelWidth/2,boardY+13,9,C.weak,'center',700,1.1);
  holdPreview=new P.Graphics();holdPreview.position.set(sideX+Math.max(0,(panelWidth-80)/2),boardY+23);app.addChild(holdPreview);
  const queueY=boardY+holdH+6;
  box(app,sideX,queueY,panelWidth,queueH,C.panel,C.border,9);
  text(app,'NEXT',sideX+panelWidth/2,queueY+13,9,C.weak,'center',700,1.1);
  nextPreviews=[];
  for(let i=0;i<3;i++){
   const g=new P.Graphics();
   g.position.set(sideX+Math.max(0,(panelWidth-80)/2),queueY+27+i*((queueH-33)/3));
   app.addChild(g);nextPreviews.push(g);
  }
  const statsH=height<=730?73:84,statsY=boardY+boardH-statsH;
  box(app,sideX,statsY,panelWidth,statsH,C.panel,C.border,9);
  text(app,'BEST',sideX+panelWidth/2,statsY+12,9,C.weak,'center',700,1.1);
  bestLabel=text(app,'0',sideX+panelWidth/2,statsY+30,13,C.ink,'center');
  text(app,'PIECES',sideX+panelWidth/2,statsY+52,9,C.weak,'center',700,1);
  piecesLabel=text(app,'0',sideX+panelWidth/2,statsY+69,13,C.ink,'center');
  veilLayer=container(app,boardX+2,boardY+2);
  const vg=new P.Graphics().rect(0,0,boardW-4,boardH-4).fill({color:C.panel,alpha:.92});
  veilLayer.addChild(vg);
  veilTitle=text(veilLayer,'TETRIS',(boardW-4)/2,boardH/2-64,Math.min(21,boardW*.079),C.bright,'center',700,1.4);
  veilSub=text(veilLayer,'SURVIVE THE SOVIET CHALLENGE',(boardW-4)/2,boardH/2-27,Math.min(10,boardW*.033),C.weak,'center');
  const bw=boardW-32,bh=height<=730?44:50;
  const play=lightButton(veilLayer,'▶  START GAME',14,boardH/2+14,bw,bh,()=>action('start'),{size:Math.min(13,bw*.048)});
  playLabel=play.t;
  if(landscape){
   deckY=8;
  }
  const deckX=landscape?maxW-Math.min(255,maxW*.30)-8:pad,deckW=landscape?Math.min(255,maxW*.30):inner;
  box(app,deckX,deckY,deckW,deckH,C.panel,C.border,12);
  const dx=deckX+9,dw=deckW-18;
  let sy=deckY+16;
  text(app,'LEVEL',dx+2,sy,9,C.weak);
  text(app,'SCORE',dx+dw/2,sy,9,C.weak,'center');
  text(app,'LINES',dx+dw-2,sy,9,C.weak,'right');
  levelLabel=text(app,'01',dx+2,sy+23,Math.min(17,dw*.046));
  scoreLabel=text(app,'000000',dx+dw/2,sy+23,Math.min(17,dw*.046),C.ink,'center');
  linesLabel=text(app,'00',dx+dw-2,sy+23,Math.min(17,dw*.046),C.ink,'right');
  line(app,dx,deckY+55,dx+dw,deckY+55);
  const col=(dw-24)/5,py=deckY+64,buttonH=height<=730?45:53;
  controls.left=lightButton(app,'◀',dx,py,col,buttonH,()=>action('left'),{size:18,repeat:true});
  controls.hard=lightButton(app,'DROP',dx+col+6,py,col*2+6,buttonH,()=>action('hard'),{size:14});
  controls.right=lightButton(app,'▶',dx+col*3+18,py,col,buttonH,()=>action('right'),{size:18,repeat:true});
  controls.cw=button(app,'↻',dx+col*4+24,py,col,buttonH,()=>action('cw'),{size:22});
  const ey=py+buttonH+7,ex=dx+dw/2,extraW=Math.min(180,dw*.4),extraGap=8;
  controls.hold=button(app,'HOLD',ex-extraGap/2-extraW,ey,extraW,44,()=>action('hold'),{size:11});
  controls.pause=button(app,'PAUSE',ex+extraGap/2,ey,extraW,44,()=>action('pause'),{size:11});
  const footerY=height-safe.bottom-18;
  eventLabel=text(app,'READY / PRESS START',pad,footerY,9,C.weak);
  text(app,'LOCAL ARCADE ENGINE / V028',maxW-pad,footerY,9,C.weak,'right');
  syncGame();
  return {app,offsetX,safe,inner,headerY:headY,headerH:headH,boardX,boardY,boardW,boardH,deckY,deckH,deckX,deckW};
 };
