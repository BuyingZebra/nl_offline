/* FIELD ATLAS / TETRIS — PixiJS grayscale content renderer migration.
 * One code path on main; existing DOM continues to own geometry, accessibility,
 * native input hit targets, persistence, and gameplay. The Pixi scene is GPU-owned.
 * No independent geometry constants, hue values, or per-button glow.
 * Native CRT overlays remain untouched until screen-compositor migration.
 */
(() => {
 'use strict';
 const appElement=document.getElementById('app');
 const Pixi=window.PIXI;
 if(!appElement||!Pixi?.Application)return;
 const prefersPixi=new URLSearchParams(location.search).get('renderer')==='pixi';
 const dpr=Math.min(2,Math.max(1,devicePixelRatio||1));
 const nativeEffects=new Set(['crtPostprocess','fxSoftness','fxNoise','buttonFxLayer','screenTopFade',
  'screenBottomFade','screenShade','screenScan','phosphorFilm','sweep','pixiContent']);
 const managed=new Set(['HEADER','MAIN','SECTION','DIALOG']);
 const appRect=()=>appElement.getBoundingClientRect();
 const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
 const rgba=(value)=>{
  const v=(value||'').trim().toLowerCase();
  if(!v||v==='transparent'||v==='none')return {color:0,alpha:0};
  const srgb=v.match(/^color\((?:srgb|display-p3)\s+([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)(?:\s*\/\s*([\d.+-]+))?\)$/);
  if(srgb)return {color:((clamp(Math.round(+srgb[1]*255),0,255)<<16)
   |(clamp(Math.round(+srgb[2]*255),0,255)<<8)
   |clamp(Math.round(+srgb[3]*255),0,255)),alpha:srgb[4]===undefined?1:clamp(+srgb[4],0,1)};
  const hex=v.match(/^#([0-9a-f]{3,8})$/);
  if(hex){
   let h=hex[1];
   if(h.length===3||h.length===4)h=h.split('').map(x=>x+x).join('');
   return {color:parseInt(h.slice(0,6),16),alpha:h.length===8?parseInt(h.slice(6,8),16)/255:1};
  }
  const match=v.match(/^rgba?\((.*)\)$/);
  if(match){
   const parts=match[1].replace(/\s*\/\s*/g,' ').split(/[,\s]+/).filter(Boolean);
   if(parts.length>=3){
    const rgb=parts.slice(0,3).map(s=>clamp(Math.round(s.endsWith('%')?parseFloat(s)*2.55:parseFloat(s)),0,255));
    const alpha=parts.length>3?clamp(parseFloat(parts[3]),0,1):1;
    return {color:rgb[0]*65536+rgb[1]*256+rgb[2],alpha};
   }
  }
  return {color:0,alpha:0};
 };
 let pixi=null,scene=null,dirty=true,enabled=false,sceneBuilds=0,copiedCanvases=0,
     lastSync=0,lastCanvasUpdate=0,lastError='',started=false;
 let sources=[],raf=null,dynamicFades=[];
 const paintRect=(container,el,style,r)=>{
  const background=rgba(style.backgroundColor);
  const border=rgba(style.borderTopColor);
  const borderWidth=style.borderTopStyle==='none'?0:parseFloat(style.borderTopWidth)||0;
  if(!background.alpha&&(!border.alpha||!borderWidth))return;
  const x=r.left-appRect().left,y=r.top-appRect().top;
  if(r.width<=0||r.height<=0)return;
  const g=new Pixi.Graphics();
  const radius=clamp(parseFloat(style.borderTopLeftRadius)||0,0,Math.min(r.width,r.height)/2);
  if(background.alpha){g.roundRect(x,y,r.width,r.height,radius)
   .fill({color:background.color,alpha:background.alpha});}
  if(border.alpha&&borderWidth){
   g.roundRect(x+borderWidth/2,y+borderWidth/2,Math.max(0,r.width-borderWidth),
     Math.max(0,r.height-borderWidth),Math.max(0,radius-borderWidth/2))
    .stroke({color:border.color,alpha:border.alpha,width:borderWidth});
  }
  container.addChild(g);
 };
 function lineSegments(node){
  const raw=node.textContent||'';
  if(!raw.trim())return [];
  const range=document.createRange();
  range.selectNodeContents(node);
  const rects=range.getClientRects();
  if(rects.length<=1)return [{text:raw.replace(/\s+/g,' '),rect:range.getBoundingClientRect()}];
  // DOM Range positions each span in the browser's actual line flow.
  const segments=[];let text='',lineTop=null,firstRect=null;
  for(let i=0;i<raw.length;i++){
   range.setStart(node,i);range.setEnd(node,i+1);
   const r=range.getBoundingClientRect();
   if(!r.width||!r.height)continue;
   const thisTop=Math.round(r.top*2)/2;
   if(lineTop!==null&&Math.abs(thisTop-lineTop)>2){
    segments.push({text,rect:firstRect});text='';firstRect=null;
   }
   if(!firstRect)firstRect={left:r.left,top:r.top,width:0,height:r.height};
   lineTop=thisTop;text+=raw[i];
  }
  if(text)segments.push({text,rect:firstRect});
  return segments;
 }
 const makeText=(container,node,style,opacity)=>{
  const color=rgba(style.color);
  if(!color.alpha||!node.textContent?.trim())return;
  const base=appRect();
  for(const segment of lineSegments(node)){
   const text=segment.text.replace(/\s+/g,' ').trim();
   if(!text||!segment.rect?.width)return;
   const size=parseFloat(style.fontSize)||12;
   const label=new Pixi.Text({
    text,
    style:{
     fontFamily:style.fontFamily||'monospace',
     fontSize:size,
     fontWeight:style.fontWeight||'400',
     fill:color.color,
     letterSpacing:parseFloat(style.letterSpacing)||0,
     whiteSpace:'pre',
     lineHeight:parseFloat(style.lineHeight)||size*1.2
    }
   });
   label.alpha=color.alpha*opacity;
   label.position.set(segment.rect.left-base.left,segment.rect.top-base.top);
   // CSS font metrics differ from Pixi CanvasText's; centre against the native
   // text run so dynamic content remains anchored to real DOM layout.
   if(segment.rect.width>0&&label.width>0){
    const align=style.textAlign;
    if(align==='center')label.x+=(segment.rect.width-label.width)/2;
    else if(align==='right'||align==='end')label.x+=segment.rect.width-label.width;
   }
   container.addChild(label);
  }
 };
 const paintInput=(container,el,style,rect)=>{
  const base=appRect();
  const x=rect.left-base.left,y=rect.top-base.top;
  const g=new Pixi.Graphics(),color=rgba(style.borderTopColor),fill=rgba(style.backgroundColor);
  if(el.type==='checkbox'){
   g.rect(x,y,rect.width,rect.height).stroke({color:color.color,alpha:color.alpha,width:1});
   if(el.checked)g.rect(x+1,y+1,rect.width-2,rect.height-2)
    .fill({color:rgba(getComputedStyle(document.documentElement).getPropertyValue('--bright')).color});
   container.addChild(g);return;
  }
  if(el.type==='range'){
   const bright=rgba(getComputedStyle(document.documentElement).getPropertyValue('--bright')).color;
   const border=rgba(getComputedStyle(document.documentElement).getPropertyValue('--border')).color;
   const t=clamp((Number(el.value)-Number(el.min))/(Number(el.max)-Number(el.min)||1),0,1);
   const ty=y+rect.height/2-3;
   g.rect(x,ty,rect.width,6).fill({color:border});
   g.rect(x,ty,rect.width*t,6).fill({color:bright});
   const tx=x+rect.width*t;
   g.rect(tx-10.5,y+rect.height/2-10.5,21,21).fill({color:bright});
   container.addChild(g);return;
  }
  if(el.type==='text'){
   // Keep the real input as the focusable keyboard/IME target; render its value
   // into the same GPU luminance scene rather than leaving it invisible.
   const label=new Pixi.Text({text:el.value||el.placeholder||'',
    style:{fontFamily:style.fontFamily,fontSize:parseFloat(style.fontSize)||19,
      fontWeight:style.fontWeight||'700',
      letterSpacing:parseFloat(style.letterSpacing)||0,fill:rgba(style.color).color}});
   const pad=parseFloat(style.paddingLeft)||12;
   label.position.set(x+pad,y+(rect.height-label.height)/2);
   if(!el.value)label.alpha=.55;
   container.addChild(label);
   if(document.activeElement===el){
    const caretX=Math.min(x+rect.width-12,x+pad+label.width+2);
    g.rect(caretX,y+10,2,Math.max(12,rect.height-20)).fill({color:rgba(style.color).color});
    container.addChild(g);
   }
  }
 };
 function renderNode(node,container,parentOpacity=1){
  if(node.nodeType===Node.TEXT_NODE){
   makeText(container,node,getComputedStyle(node.parentElement),parentOpacity);
   return;
  }
  if(node.nodeType!==Node.ELEMENT_NODE)return;
  const el=node;
  if(nativeEffects.has(el.id)||el.hidden)return;
  const style=getComputedStyle(el);
  if(style.display==='none'||style.visibility==='hidden')return;
  // The mirror makes its DOM sources transparent after initialization.
  const isMirroredRoot=el.parentElement===appElement;
  const ownAlpha=isMirroredRoot?1:clamp(parseFloat(style.opacity)||1,0,1);
  const opacity=parentOpacity*ownAlpha;
  if(opacity<=0)return;
  const r=el.getBoundingClientRect();
  // A transparent technical wrapper is no colour source of its own.
  const layer=new Pixi.Container();layer.alpha=ownAlpha;container.addChild(layer);
  if(el.id==='readyCursor')dynamicFades.push({node:el,layer});
  if(r.width>0&&r.height>0)paintRect(layer,el,style,r);
  if(el instanceof HTMLCanvasElement){
   try{
    const texture=Pixi.Texture.from(el);
    const sprite=new Pixi.Sprite(texture);
    sprite.x=r.left-appRect().left;sprite.y=r.top-appRect().top;
    sprite.width=r.width;sprite.height=r.height;
    layer.addChild(sprite);sources.push({el,texture,sprite});
   }catch(err){lastError=String(err);}
   return;
  }
  if(el instanceof HTMLInputElement){paintInput(layer,el,style,r);return;}
  let content=layer;
  if((style.overflow==='hidden'||style.overflowY==='auto'||style.overflowY==='scroll')
     &&r.width>0&&r.height>0&&el!==appElement){
   const mask=new Pixi.Graphics().rect(r.left-appRect().left,r.top-appRect().top,
    r.width,r.height).fill({color:0xffffff});
   layer.addChild(mask);
   content=new Pixi.Container();content.mask=mask;layer.addChild(content);
  }
  for(const child of el.childNodes)renderNode(child,content,opacity);
 }
 function renderScene(){
  if(!pixi)return;
  const next=new Pixi.Container();sources=[];dynamicFades=[];
  const groups=[':scope > header',':scope > #stage',':scope > #controlDeck',
    ':scope > #eventline',':scope > #modalScrim',
    ':scope > #options',':scope > #leaderboard',':scope > #scoreEntry',':scope > #restartConfirm'];
  for(const sel of groups){
   const element=appElement.querySelector(sel);
   if(element)renderNode(element,next);
  }
  const old=scene;scene=next;pixi.stage.addChild(scene);
  if(old){pixi.stage.removeChild(old);old.destroy({children:true,texture:false,textureSource:false});}
  dirty=false;sceneBuilds++;
 }
 function markDirty(){dirty=true;}
 function destroy(){
  if(raf)cancelAnimationFrame(raf);
  if(pixi){pixi.destroy({removeView:true},true);pixi=null;}
  appElement.classList.remove('pixi-display');
  enabled=false;
 }
 async function boot(){
  if(started)return;started=true;
  try{
   const instance=new Pixi.Application();
   await instance.init({
    resizeTo:appElement,preference:'webgl',backgroundAlpha:0,
    antialias:false,resolution:dpr,autoDensity:true,autoStart:false
   });
   pixi=instance;
   const canvas=instance.canvas;canvas.id='pixiContent';
   canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;z-index:25;pointer-events:none';
   appElement.append(canvas);
   if(prefersPixi){
    renderScene();appElement.classList.add('pixi-display');enabled=true;
   }
   const observer=new MutationObserver(records=>{
    if(!enabled)return;
    if(records.some(record=>record.target!==canvas&&record.target!==appElement))markDirty();
   });
   observer.observe(appElement,{
    subtree:true,childList:true,characterData:true,attributes:true,
    attributeFilter:['hidden','style','class','open','value','aria-hidden','inert']
   });
   addEventListener('resize',markDirty,{passive:true});
   appElement.addEventListener('scroll',markDirty,true);
   for(const event of ['pointerdown','pointerup','pointercancel','input','change','focusin','focusout']){
    appElement.addEventListener(event,markDirty,true);
   }
   const loop=(now)=>{
    if(!pixi)return;
    if(enabled){
     try{
      // CSS animations on the source do not produce mutations, but dialogs,
      // the cursor and responsive layout must continue to mirror them.
      if(dirty){renderScene();lastSync=now;}
      for(const fade of dynamicFades)fade.layer.alpha=clamp(parseFloat(getComputedStyle(fade.node).opacity)||0,0,1);
      if(now-lastCanvasUpdate>50){
       for(const item of sources)item.texture.source.update();
       copiedCanvases+=sources.length;lastCanvasUpdate=now;
      }
      pixi.renderer.render(pixi.stage);
     }catch(e){lastError=String(e);console.error('Pixi Tetris renderer fallback:',e);destroy();return;}
    }
    raf=requestAnimationFrame(loop);
   };
   raf=requestAnimationFrame(loop);
  }catch(err){
   lastError=String(err);console.warn('Pixi renderer unavailable; native Tetris preserved',err);
   destroy();
  }
 }
 window.FieldAtlasPixiRenderer={
  getState:()=>({initialized:Boolean(pixi),enabled,requested:prefersPixi,sceneBuilds,copiedCanvases,lastError,
   contentLuminance:'grayscale',nativeInput:true,sourceCanvasCount:sources.length}),
  enable:()=>{if(!pixi)return false;renderScene();enabled=true;appElement.classList.add('pixi-display');
   pixi.renderer.render(pixi.stage);return true;},
  disable:()=>{enabled=false;appElement.classList.remove('pixi-display');return true;},
  render:()=>{markDirty();},
  destroy
 };
 boot();
})();