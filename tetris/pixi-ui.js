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
 const layoutDebug=window.FieldAtlasLayoutDebug;
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
  gradients={screenTop:{enabled:false,length:135},screenBottom:{enabled:false,length:135}},
  experimental={noiseEnabled:false,noiseAmount:8,noiseSpeed:24,persistenceEnabled:false,
   persistenceAmount:35,persistenceDecay:765,softnessEnabled:false,softnessAmount:13};
 // Raw layout baseline: no legacy compositor settings are restored.
 // No filters, gradients, noise, softness, persistence or saved-effects overrides.
 // Gameplay and high-score preferences are untouched.
 gradients.screenTop.enabled=false;
 gradients.screenBottom.enabled=false;
 experimental.noiseEnabled=false;
 experimental.softnessEnabled=false;
 experimental.persistenceEnabled=false;
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
  crt.set('noiseRate',experimental.noiseSpeed);
  crt.apply();
 };
 initFX();
 let gameLayer,menuLayer,alertLayer,boardGraphic,boardBg,veilLayer,holdPreview,nextPreviews=[],
     bestLabel,levelLabel,scoreLabel,linesLabel,piecesLabel,eventLabel,veilTitle,veilSub,playLabel,
     controls={},modals={},pausedNew=null,pausedScores=null,currentModal=null,menuScroll=null,menuScrollY=0,menuMaxScroll=0,
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
  crt.set('noiseRate',experimental.noiseSpeed);
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
  else if(which==='pause')ok=game.status==='playing'&&game.pause();
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
   if(pausedNew)pausedNew.visible=game.status==='paused';
   if(pausedScores)pausedScores.visible=game.status==='paused';
   if(game.status==='ready'){veilTitle.text='TETRIS';veilSub.text='SURVIVE THE SOVIET CHALLENGE';playLabel.text='START GAME';}
   else if(game.status==='paused'){veilTitle.text='PAUSED';veilSub.text='YOUR GAME IS SAFE';playLabel.text='RESUME';}
   else if(game.status==='over'){veilTitle.text='GAME OVER';veilSub.text='TRY AGAIN';playLabel.text='AGAIN';}
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
  let headY=safe.top+16,headH=height<=730?53:65,deckH=height<=730?160:172;
  let deckY=height-safe.bottom-60-deckH;
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
  const play=lightButton(veilLayer,'START GAME',14,boardH/2+14,bw,bh,()=>action('start'),{size:Math.min(13,bw*.048)});
  playLabel=play.t;
  text(veilLayer,'▶',14+18,boardH/2+14+bh/2,15,C.dark,'center');
  pausedNew=button(veilLayer,'NEW GAME',14,boardH/2+71,bw,40,()=>openModal('restart'),{size:11}).o;
  pausedScores=button(veilLayer,'HIGH SCORE',14,boardH/2+117,bw,40,()=>openModal('scores'),{size:11}).o;
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
  const footerY=height-safe.bottom-48;
  // Developer overlay uses these SAME computed layout rectangles. No parallel
  // sizing calculations, no changes to the scene, and no GPU composition.
  layoutDebug?.setLayout([
   {name:'APP',x:offsetX,y:0,w:maxW,h:height},
   {name:'HEADER',x:offsetX+headerX,y:headY,w:headerW,h:headH},
   {name:'STAGE',x:offsetX+stageX,y:stageY,w:stageW,h:stageH},
   {name:'BOARD',x:offsetX+boardX,y:boardY,w:boardW,h:boardH},
   {name:'SIDEBAR',x:offsetX+sideX,y:boardY,w:panelWidth,h:boardH},
   {name:'HOLD',x:offsetX+sideX,y:boardY,w:panelWidth,h:holdH},
   {name:'NEXT',x:offsetX+sideX,y:queueY,w:panelWidth,h:queueH},
   {name:'BEST',x:offsetX+sideX,y:statsY,w:panelWidth,h:statsH},
   {name:'CONTROLS',x:offsetX+deckX,y:deckY,w:deckW,h:deckH},
   {name:'FOOTER',x:offsetX+pad,y:footerY-12,w:inner,h:24}
  ]);
  eventLabel=text(app,'READY / PRESS START',pad,footerY,9,C.weak);
  text(app,'LOCAL ARCADE ENGINE / V028',maxW-pad,footerY,9,C.weak,'right');
  syncGame();
  return {app,offsetX,safe,inner,headerY:headY,headerH:headH,boardX,boardY,boardW,boardH,deckY,deckH,deckX,deckW};
 };

 const makeCheckbox=(parent,label,x,y,initial,onChange)=>{
  text(parent,label,x,y+16,11,C.ink);
  const g=new P.Graphics();g.position.set(x+309,y+6);parent.addChild(g);
  let current=!!initial;
  const paint=()=>{
   g.clear().rect(0,0,20,20).stroke({color:C.bright,width:1});
   if(current)g.rect(1,1,18,18).fill({color:C.bright});
  };
  paint();g.eventMode='static';g.cursor='pointer';g.hitArea=new P.Rectangle(-10,-6,40,38);
  g.on('pointerdown',()=>{current=!current;paint();onChange(current);});
  return {g,get value(){return current;},set value(v){current=!!v;paint();}};
 };
 const addSlider=(parent,title,x,y,w,value,min,max,onChange,unit='%',description='')=>{
  text(parent,title,x,y+12,10,C.ink);
  const out=text(parent,String(value)+unit,x+w,y+12,10,C.ink,'right');
  const graphics=new P.Graphics();graphics.position.set(x,y+33);parent.addChild(graphics);
  let val=value,down=false;
  function paint(){
   const t=clamp((val-min)/(max-min||1),0,1);
   graphics.clear().rect(0,17,w,6).fill({color:C.border})
    .rect(0,17,w*t,6).fill({color:C.bright})
    .rect(clamp(w*t-10.5,0,w-21),9.5,21,21).fill({color:C.bright});
   out.text=(typeof val==='number'?Math.round(val*10)/10:val)+unit;
  }
  paint();
  graphics.eventMode='static';graphics.cursor='pointer';graphics.hitArea=new P.Rectangle(0,0,w,44);
  const update=e=>{
   const local=graphics.toLocal(e.global);
   val=clamp(min+(max-min)*clamp(local.x/w,0,1),min,max);
   val=Math.round(val*10)/10;
   paint();onChange(val);
  };
  graphics.on('pointerdown',e=>{down=true;update(e);e.stopPropagation();});
  graphics.on('globalpointermove',e=>{if(down)update(e);});
  for(const event of ['pointerup','pointerupoutside','pointercancel'])graphics.on(event,()=>{down=false;});
  let used=78;
  if(description){
   const maxChars=Math.floor(w/6.2);
   const words=description.split(' '),rows=[''];
   for(const word of words){
    if((rows[rows.length-1]+' '+word).trim().length>maxChars)rows.push(word);
    else rows[rows.length-1]=(rows[rows.length-1]+' '+word).trim();
   }
   for(let i=0;i<rows.length;i++)text(parent,rows[i],x,y+76+i*14,9,C.weak);
   used+=rows.length*14;
  }
  return {height:used,set(v){val=v;paint();}};
 };
 const menuLayouts={};
 function buildModals(){
  menuLayer=container(base);menuLayer.visible=false;
  const scrim=box(menuLayer,0,0,width,height,0x000000,null,0);
  scrim.alpha=.73;scrim.eventMode='static';scrim.hitArea=new P.Rectangle(0,0,width,height);
  // Native dialogs lived inside #app: all modal pixels pass through the SAME GPU CRT.
  for(const name of ['options','scores','entry','restart']){
   const modal=container(menuLayer);modal.visible=false;
   const w=Math.min(410,width-22),h=name==='options'?Math.min(height*2/3,560):
       name==='scores'?Math.min(445,height-44):name==='entry'?Math.min(300,height-40):220;
   const x=(width-w)/2,y=(height-h)/2;
   modal.position.set(x,y);
   box(modal,0,0,w,h,C.panel,C.border,14);
   modal.eventMode='static';modal.hitArea=new P.Rectangle(0,0,w,h);
   modals[name]={modal,w,h,x,y};
  }
  buildOptions();
  buildScores();
  buildEntry();
  buildRestart();
 }
 function buildOptions(){
  const {modal,w,h}=modals.options;
  const back=button(modal,'RETURN TO GAME',18,17,w-36,45,()=>closeModal(),{size:11});
  line(modal,18,73,w-18,73,C.border);
  const viewport=container(modal,0,0);
  const clip=new P.Graphics().rect(12,82,w-24,h-97).fill({color:0xffffff});
  modal.addChild(clip);viewport.mask=clip;
  menuScroll=container(viewport,0,82);menuScrollY=0;
  let Y=6;const left=25,wide=w-50;
  const title=(s)=>{Y+=9;text(menuScroll,s,left,Y+8,10,C.weak);Y+=34;};
  const paragraph=(s)=>{
   const maxChars=Math.floor(wide/6.1),words=s.split(' '),rows=[''];
   for(const word of words){
    if((rows[rows.length-1]+' '+word).trim().length>maxChars)rows.push(word);
    else rows[rows.length-1]=(rows[rows.length-1]+' '+word).trim();
   }
   for(let i=0;i<rows.length;i++)text(menuScroll,rows[i],left,Y+i*14,9,C.weak);
   Y+=rows.length*14+8;
  };
  const divider=()=>{line(menuScroll,left,Y,left+wide,Y,C.border);Y+=17;};
  const check=(name,initial,onChange)=>{makeCheckbox(menuScroll,name,left,Y,initial,onChange);Y+=47;};
  const slid=(title,val,min,max,onChange,suffix='%',description='')=>{
   const res=addSlider(menuScroll,title,left,Y,wide,val,min,max,onChange,suffix,description);
   Y+=res.height;
  };
  check('GHOST PIECE',showGhost,v=>{showGhost=v;store('fieldAtlasTetrisGhost',v?'yes':'no');syncGame();});
  check('SOUND',soundOn,v=>{soundOn=v;store('fieldAtlasTetrisSound',v?'yes':'no');});
  divider();
  title('GRADIENT LENGTH / CSS PIXELS');
  for(const k of ['screenTop','screenBottom']){
   const upper=k==='screenTop'?'SCREEN TOP':'SCREEN BOTTOM';
   const rowY=Y,barX=left+143,barW=wide-188;
   const checkIcon=new P.Graphics();checkIcon.position.set(left,rowY+8);menuScroll.addChild(checkIcon);
   const redrawCheck=()=>{
    checkIcon.clear().rect(0,0,18,18).stroke({color:C.bright,width:1});
    if(gradients[k].enabled)checkIcon.rect(1,1,16,16).fill({color:C.bright});
   };
   redrawCheck();checkIcon.eventMode='static';checkIcon.cursor='pointer';
   checkIcon.hitArea=new P.Rectangle(-4,-8,24,36);
   checkIcon.on('pointerdown',()=>{gradients[k].enabled=!gradients[k].enabled;
    redrawCheck();settingSave();syncCRT();});
   text(menuScroll,upper,left+25,rowY+17,10,C.ink);
   const g=new P.Graphics();g.position.set(barX,rowY+4);menuScroll.addChild(g);
   const number=text(menuScroll,String(gradients[k].length)+'px',left+wide,rowY+17,10,C.weak,'right');
   const paint=()=>{const t=clamp(gradients[k].length/420,0,1);
    g.clear().rect(0,14,barW,6).fill({color:C.border})
      .rect(0,14,barW*t,6).fill({color:C.bright})
      .rect(clamp(t*barW-10.5,0,barW-21),6.5,21,21).fill({color:C.bright});
    number.text=String(gradients[k].length)+'px';
   };paint();
   g.eventMode='static';g.hitArea=new P.Rectangle(0,0,barW,44);
   let down=false;
   const update=e=>{const x=g.toLocal(e.global).x;
    gradients[k].length=Math.round(clamp(x/barW,0,1)*420/5)*5;
    paint();settingSave();syncCRT();};
   g.on('pointerdown',e=>{down=true;update(e);e.stopPropagation();});
   g.on('globalpointermove',e=>{if(down)update(e);});
   for(const ev of ['pointerup','pointerupoutside','pointercancel'])g.on(ev,()=>down=false);
   Y+=48;
  }
  paragraph('Screen top and bottom fades overlay the entire display, including gameplay and menus.');
  divider();
  slid('PHOSPHOR GLOW',glow,0,100,v=>{glow=v;settingSave();syncCRT();},'%',
    'Screen-wide phosphor bloom responds to the brightness of the complete composited image.');
  slid('CRT SCANLINES',scan,0,100,v=>{scan=v;settingSave();syncCRT();},'%',
    'Identical scanline processing for the entire display, including menus.');
  slid('EDGE VIGNETTE',vignette,0,100,v=>{vignette=v;settingSave();syncCRT();},'%',
    'At 100 percent, the screen edges become nearly black.');
  slid('REFRESH SWEEP',sweep,0,100,v=>{sweep=v;settingSave();syncCRT();},'%',
    'Strength of the traveling refresh line, independent of phosphor glow.');
  button(menuScroll,'RESET DISPLAY EFFECTS',left,Y,wide,44,()=>{
   glow=83;scan=51;vignette=49;sweep=57;
   gradients={screenTop:{enabled:false,length:135},screenBottom:{enabled:false,length:135}};
   settingSave();syncCRT();rebuildOptions();},{size:10});
  Y+=61;divider();title('EXPERIMENTAL CRT EFFECTS');
  paragraph('Independent grayscale GPU effects. Defaults are enabled. Settings are stored on this device.');
  for(const spec of [
   ['NOISE','noiseEnabled','noiseAmount',8,100,'%','Animated screen-space monochrome grain.'],
   ['PERSISTENCE','persistenceEnabled','persistenceAmount',35,100,'%','Button presses leave a fading imprint.'],
   ['SOFTNESS','softnessEnabled','softnessAmount',13,100,'%','Optical softness of the completed display.']
  ]){
   const [label,onKey,key,defaultV,max,suffix,description]=spec;
   check(label,experimental[onKey],v=>{experimental[onKey]=v;settingSave();syncCRT();});
   slid('AMOUNT',experimental[key],0,max,v=>{experimental[key]=v;settingSave();syncCRT();},suffix,description);
   if(key==='noiseAmount')slid('SPEED',experimental.noiseSpeed,1,24,v=>{
    experimental.noiseSpeed=v;settingSave();syncCRT();},' FPS');
   if(key==='persistenceAmount')slid('DECAY',experimental.persistenceDecay,100,1200,v=>{
    experimental.persistenceDecay=v;settingSave();},' MS');
  }
  button(menuScroll,'RESET EXPERIMENTAL EFFECTS',left,Y,wide,44,()=>{
   Object.assign(experimental,{noiseEnabled:false,noiseAmount:8,noiseSpeed:24,
    persistenceEnabled:false,persistenceAmount:35,persistenceDecay:765,
    softnessEnabled:false,softnessAmount:13});settingSave();syncCRT();rebuildOptions();
  },{size:10});Y+=65;
  divider();title('GPU COMPOSITOR / FULL SCREEN');
  paragraph('Each stage operates on the complete grayscale scene. Use the arrows to reorder GPU passes.');
  slid('BLOOM CUTOFF',crt.config.threshold,20,95,v=>{crt.set('threshold',v);},'%');
  slid('BLOOM RADIUS',crt.config.radius,.5,8,v=>{crt.set('radius',v);},'px');
  slid('GHOST AMOUNT',crt.config.ghost,0,100,v=>{crt.set('ghost',v);},'%');
  slid('GHOST DISTANCE',crt.config.ghostDistance,0,12,v=>{crt.set('ghostDistance',v);},'px');
  for(let i=0;i<crt.order.length;i++){
   const id=crt.order[i],ry=Y;
   check(id.toUpperCase(),crt.enabled[id],v=>{crt.toggle(id,v);});
   const up=button(menuScroll,'↑',left+wide-73,ry+2,33,34,()=>{
    crt.move(id,-1);rebuildOptions();},{size:16});
   const down=button(menuScroll,'↓',left+wide-35,ry+2,33,34,()=>{
    crt.move(id,1);rebuildOptions();},{size:16});
  }
  divider();paragraph('LEFT / RIGHT: MOVE. UP OR X: ROTATE. DOWN OR SPACE: DROP. C: HOLD. P: PAUSE.');
  Y+=18;menuMaxScroll=Math.max(0,Y-(h-100));
  const scrollSurface=modal;
  let dragY=null,scrollStart=0;
  const setScroll=v=>{menuScrollY=clamp(v,0,menuMaxScroll);menuScroll.y=82-menuScrollY;};
  setScroll(0);
  scrollSurface.on('wheel',e=>{setScroll(menuScrollY+e.deltaY);});
  scrollSurface.on('pointerdown',e=>{dragY=e.global.y;scrollStart=menuScrollY;});
  scrollSurface.on('globalpointermove',e=>{
   if(dragY===null)return;
   if(Math.abs(e.global.y-dragY)>8)setScroll(scrollStart+dragY-e.global.y);
  });
  for(const ev of ['pointerup','pointerupoutside','pointercancel'])scrollSurface.on(ev,()=>{dragY=null;});
  menuLayouts.options={setScroll,getScroll:()=>menuScrollY};
 }
 function rebuildOptions(){
  const was=currentModal==='options',scroll=menuScrollY;
  const {modal}=modals.options;
  modal.removeAllListeners();
  modal.removeChildren().forEach(c=>c.destroy({children:true}));
  box(modal,0,0,modals.options.w,modals.options.h,C.panel,C.border,14);
  buildOptions();
  menuLayouts.options.setScroll(scroll);
  modal.visible=was;
  state.menuBuilds++;
 }
 function buildScores(){
  const {modal,w,h}=modals.scores;
  text(modal,'FIELD ATLAS / TOP FIVE',w/2,32,15,C.ink,'center',700,1.4);
  line(modal,18,56,w-18,56,C.border);
  const holder=container(modal,0,67);
  const refresh=()=>{
   holder.removeChildren().forEach(c=>c.destroy({children:true}));
   const list=highScores.slice(0,5);
   for(let i=0;i<5;i++){
    const y=i*46,record=list[i];
    box(holder,18,y,w-36,42,C.bg,C.border,7);
    text(holder,String(i+1).padStart(2,'0'),28,y+21,10,C.weak);
    text(holder,record?.name||'---',64,y+21,12);
    text(holder,record?fmt(record.score):'------',w-29,y+21,12,C.ink,'right');
   }
  };
  modals.scores.refresh=refresh;refresh();
  text(modal,'High scores are stored locally on this device.',w/2,h-78,9,C.weak,'center');
  button(modal,'RETURN',18,h-60,w-36,44,()=>closeModal(),{size:11});
 }
 function buildEntry(){
  const {modal,w,h}=modals.entry;
  text(modal,'NEW HIGH SCORE',w/2,33,17,C.ink,'center');
  text(modal,'You reached the top five.',w/2,72,11,C.weak,'center');
  const score=text(modal,'000000',w/2,113,24,C.ink,'center');
  text(modal,'INITIALS / UP TO 3',24,151,10,C.weak);
  box(modal,22,168,w-44,50,C.bg,C.border,8);
  const value=text(modal,'AAA',w/2,193,19,C.ink,'center');
  modals.entry.value=value;modals.entry.score=score;
  const activate=box(modal,22,168,w-44,50,C.bg,null,8);
  activate.alpha=0;activate.eventMode='static';activate.hitArea=new P.Rectangle(0,0,w-44,50);
  activate.on('pointerdown',()=>entry.focus());
  button(modal,'SKIP',22,h-65,(w-50)/2,44,()=>{entry.blur();closeModal();},{size:11});
  button(modal,'SAVE',28+(w-50)/2,h-65,(w-50)/2,44,()=>{
   const name=Scores.initials(entry.value);if(Scores.qualifies(highScores,game.score)){
    highScores=Scores.add(highScores,{name,score:game.score,lines:game.lines,level:game.level,at:Date.now()});
    highScores=Scores.save(localStorage,highScores);
    store('fieldAtlasTetrisInitials',name);
   }
   entry.blur();closeModal();openModal('scores');},{size:11});
  entry.addEventListener('input',()=>{entry.value=entry.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3);value.text=entry.value;});
 }
 function buildRestart(){
  const {modal,w,h}=modals.restart;
  text(modal,'START NEW GAME?',w/2,38,16,C.ink,'center');
  text(modal,'Your current game and score',w/2,90,11,C.weak,'center');
  text(modal,'will be lost. Are you sure?',w/2,108,11,C.weak,'center');
  button(modal,'CANCEL',18,h-67,(w-43)/2,46,()=>closeModal(),{size:11});
  button(modal,'YES, RESTART',25+(w-43)/2,h-67,(w-43)/2,46,()=>{
   game.reset();game.start();gameOverHandled=false;closeModal();syncGame();
  },{size:11});
 }
 function openModal(name){
  if(currentModal)return;
  currentModal=name;menuLayer.visible=true;
  for(const [id,v] of Object.entries(modals))v.modal.visible=id===name;
  const m=modals[name];
  layoutDebug?.setModal({name:name.toUpperCase(),x:m.x,y:m.y,w:m.w,h:m.h});
  if(name==='options'){if(game.status==='playing'){game.pause();syncGame();}}
  if(name==='scores')modals.scores.refresh();
  if(name==='entry'){modals.entry.score.text=String(game.score);modals.entry.value.text=entry.value;}
 }
 function closeModal(){
  if(!currentModal)return;
  for(const item of Object.values(modals))item.modal.visible=false;
  currentModal=null;menuLayer.visible=false;
  layoutDebug?.setModal(null);
 }
 function resize(){
  width=Math.max(1,innerWidth);height=Math.max(1,innerHeight);
  if(gameLayer){base.removeChild(gameLayer);gameLayer.destroy({children:true});}
  if(menuLayer){base.removeChild(menuLayer);menuLayer.destroy({children:true});}
  gameLayer=null;menuLayer=null;boardGraphic=null;modals={};controls={};pausedNew=null;pausedScores=null;
  const name=currentModal;currentModal=null;
  layoutDebug?.setModal(null);
  createGame();
  buildModals();
  if(name)openModal(name);
  syncCRT();state.sceneBuilds++;
 }
 const keyboard={
  ArrowLeft:'left',ArrowRight:'right',ArrowUp:'cw',KeyX:'cw',
  ArrowDown:'hard',Space:'hard',KeyC:'hold',ShiftLeft:'hold',ShiftRight:'hold',KeyP:'pause',Escape:'pause'
 };
 document.addEventListener('keydown',e=>{
  if(document.activeElement===entry){
   if(e.code==='Escape'){entry.blur();closeModal();}return;
  }
  if(currentModal){
   if(e.code==='Escape'){e.preventDefault();closeModal();}
   return;
  }
  const a=keyboard[e.code];if(!a)return;
  e.preventDefault();
  if(e.repeat&&['hard','hold','pause'].includes(a))return;
  action(a);
 });
 window.addEventListener('resize',resize,{passive:true});
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&game.status==='playing'){game.pause();syncGame();}
  lastNow=performance.now();
 });
 resize();
 let lastFpsUpdate=performance.now(),count=0;
 renderApp.ticker.add(ticker=>{
  const now=performance.now(),dt=Math.min(100,Math.max(0,now-lastNow));
  lastNow=now;
  if(!document.hidden){
   if(!currentModal&&game.status==='playing'){
    const before=game.pieces,lines=game.lines;
    if(game.tick(dt)||game.pieces!==before||game.lines!==lines)syncGame();
    onOver();
   }
   crt.tick(now);
  }
  count++;
  if(now-lastFpsUpdate>1000){fps=Math.round(count*1000/(now-lastFpsUpdate));count=0;lastFpsUpdate=now;state.fps=fps;}
 });
 window.FieldAtlasTetris={
  getState:()=>({renderer:'PixiJS',webgl:Boolean(renderApp.renderer.gl),gameStatus:game.status,
   score:game.score,lines:game.lines,level:game.level,pieces:game.pieces,
   mode:currentModal,theme,showGhost,soundOn,width,height,fps,
   luminanceOnly:true,objectsReused:state.sceneBuilds,
   crt:crt.state(),errors:[...crt.errors,state.lastError].filter(Boolean)}),
  action,openModal,closeModal,game,reset:()=>{game.reset();syncGame();}

 };
})();
