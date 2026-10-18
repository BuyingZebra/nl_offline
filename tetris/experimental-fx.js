/* FIELD ATLAS / Tetris experimental CRT compositor.
 * All persistent geometry and gameplay remain untouched. These are grayscale
 * screen-space artifacts; #phosphorFilm supplies hue after this layer stack.
 */
(function (win) {
  'use strict';
  const KEY='fieldAtlasTetrisExperimentalV01';
  const DEFAULTS=Object.freeze({
    noiseEnabled:false,noiseAmount:18,noiseSpeed:12,
    persistenceEnabled:false,persistenceAmount:35,persistenceDecay:450,
    softnessEnabled:false,softnessAmount:25,
    interferenceEnabled:false,interferenceAmount:20,interferenceRate:6,
    glitchEnabled:false,glitchAmount:20,glitchRate:3
  });
  const CONTROLS={
    noiseAmount:[100,'%'],noiseSpeed:[24,' FPS'],
    persistenceAmount:[100,'%'],persistenceDecay:[1200,' MS'],
    softnessAmount:[100,'%'],
    interferenceAmount:[100,'%'],interferenceRate:[20,'/MIN'],
    glitchAmount:[100,'%'],glitchRate:[20,'/MIN']
  };
  const ENABLES=['noiseEnabled','persistenceEnabled','softnessEnabled',
    'interferenceEnabled','glitchEnabled'];

  function create(doc) {
    const app=doc.getElementById('app');
    const canvas=doc.getElementById('fxNoise');
    const softness=doc.getElementById('fxSoftness');
    const interference=doc.getElementById('fxInterference');
    const glitch=doc.getElementById('fxGlitch');
    const buttonLayer=doc.getElementById('buttonFxLayer');
    if(!app||!canvas||!softness||!interference||!glitch||!buttonLayer)
      throw Error('Tetris experimental compositor layers are missing');
    const ctx=canvas.getContext('2d',{alpha:true});
    if(!ctx)throw Error('Tetris experimental noise canvas is unavailable');
    let values={...DEFAULTS};
    try {
      const saved=JSON.parse(win.localStorage.getItem(KEY)||'null');
      if(saved&&typeof saved==='object'){
        for(const key of Object.keys(DEFAULTS)){
          if(typeof DEFAULTS[key]==='boolean'){
            if(typeof saved[key]==='boolean')values[key]=saved[key];
          }else if(Number.isFinite(saved[key])){
            const max=CONTROLS[key][0];
            values[key]=Math.max(0,Math.min(max,Math.round(saved[key])));
          }
        }
      }
    }catch(e){/* Private browsing may block storage. */}
    const reduced=win.matchMedia('(prefers-reduced-motion: reduce)');
    let noiseFrame=0,noisePrevious=0,noisePixels=null;
    const pulseTimers={interference:0,glitch:0};
    const hideTimers={interference:0,glitch:0};
    const bands={interference,glitch};
    const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
    const motionAllowed=()=>!reduced.matches&&!doc.hidden;

    function save(){
      try{win.localStorage.setItem(KEY,JSON.stringify(values));}catch(e){}
    }
    function drawNoise(){
      const w=Math.max(1,Math.ceil(app.clientWidth/3));
      const h=Math.max(1,Math.ceil(app.clientHeight/3));
      if(canvas.width!==w||canvas.height!==h){
        canvas.width=w;canvas.height=h;
        noisePixels=ctx.createImageData(w,h);
      }
      if(!noisePixels)noisePixels=ctx.createImageData(w,h);
      const data=noisePixels.data;
      for(let p=0;p<data.length;p+=4){
        const shade=Math.random()<.5?0:255;
        data[p]=shade;data[p+1]=shade;data[p+2]=shade;
        data[p+3]=20+Math.floor(Math.random()*75);
      }
      ctx.putImageData(noisePixels,0,0);
    }
    function noiseTick(now){
      if(!values.noiseEnabled||values.noiseAmount<=0||!motionAllowed()){
        noiseFrame=0;return;
      }
      if(now-noisePrevious>=1000/Math.max(1,values.noiseSpeed)){
        drawNoise();noisePrevious=now;
      }
      noiseFrame=win.requestAnimationFrame(noiseTick);
    }
    function syncNoise(){
      const active=values.noiseEnabled&&values.noiseAmount>0&&motionAllowed();
      canvas.style.display=active?'block':'none';
      canvas.style.opacity=String(values.noiseAmount/100*.58);
      if(!active){
        if(noiseFrame)win.cancelAnimationFrame(noiseFrame);
        noiseFrame=0;noisePrevious=0;
      }else if(!noiseFrame){
        noiseFrame=win.requestAnimationFrame(noiseTick);
      }
    }
    function stopBand(type){
      win.clearTimeout(pulseTimers[type]);win.clearTimeout(hideTimers[type]);
      pulseTimers[type]=0;hideTimers[type]=0;
      bands[type].style.opacity='0';
      bands[type].style.display='none';
    }
    function scheduleBand(type){
      stopBand(type);
      const on=values[type+'Enabled'],amount=values[type+'Amount'];
      const rate=values[type+'Rate'];
      if(!on||amount===0||rate===0||!motionAllowed())return;
      const el=bands[type];
      el.style.display='block';
      function pulse(){
        if(!values[type+'Enabled']||!motionAllowed())return;
        const area=Math.max(30,app.clientHeight);
        el.style.top=Math.floor(Math.random()*area)+'px';
        el.style.height=(type==='glitch'?2+Math.floor(Math.random()*9):8)+'px';
        el.style.left=(type==='glitch'?Math.floor(Math.random()*16):0)+'%';
        el.style.width=(type==='glitch'?70+Math.floor(Math.random()*30):100)+'%';
        el.style.opacity=String(amount/100*(type==='glitch'?.75:.55));
        hideTimers[type]=win.setTimeout(()=>{el.style.opacity='0';},type==='glitch'?75:130);
        queue();
      }
      function queue(){
        const delay=clamp((60000/Math.max(1,rate))*(.7+Math.random()*.6),750,100000);
        pulseTimers[type]=win.setTimeout(pulse,delay);
      }
      queue();
    }
    function sync(){
      const blur=(values.softnessAmount/100*1.6).toFixed(2);
      const softened=values.softnessEnabled&&values.softnessAmount>0;
      softness.style.display=softened?'block':'none';
      softness.style.backdropFilter='blur('+blur+'px)';
      softness.style.webkitBackdropFilter='blur('+blur+'px)';
      syncNoise();
      scheduleBand('interference');
      scheduleBand('glitch');
    }
    function paintControls(){
      for(const name of ENABLES)doc.getElementById('fx'+name[0].toUpperCase()+name.slice(1)).checked=values[name];
      for(const [name,[max,suffix]] of Object.entries(CONTROLS)){
        const id='fx'+name[0].toUpperCase()+name.slice(1);
        const input=doc.getElementById(id);
        input.value=String(values[name]);
        input.style.setProperty('--fill',Math.round(values[name]/max*100)+'%');
        doc.getElementById(id+'Value').textContent=values[name]+suffix;
      }
    }
    for(const name of ENABLES){
      const input=doc.getElementById('fx'+name[0].toUpperCase()+name.slice(1));
      input.addEventListener('change',()=>{
        values[name]=input.checked;save();sync();
      });
    }
    for(const [name,[max,suffix]] of Object.entries(CONTROLS)){
      const id='fx'+name[0].toUpperCase()+name.slice(1);
      const input=doc.getElementById(id);
      input.addEventListener('input',()=>{
        values[name]=clamp(Math.round(Number(input.value)||0),0,max);
        input.style.setProperty('--fill',Math.round(values[name]/max*100)+'%');
        doc.getElementById(id+'Value').textContent=values[name]+suffix;
        save();sync();
      });
    }
    doc.getElementById('resetExperimental').addEventListener('click',()=>{
      values={...DEFAULTS};
      buttonLayer.querySelectorAll('.fx-persistence-ghost').forEach(el=>el.remove());
      save();paintControls();sync();
    });
    function onButton(button,bounds,appBounds){
      if(!values.persistenceEnabled||values.persistenceAmount<=0||!motionAllowed())return;
      const style=win.getComputedStyle(button);
      const ghost=doc.createElement('span');
      ghost.className='fx-persistence-ghost';
      ghost.textContent=button.textContent||'';
      ghost.style.left=(bounds.left-appBounds.left)+'px';
      ghost.style.top=(bounds.top-appBounds.top)+'px';
      ghost.style.width=bounds.width+'px';
      ghost.style.height=bounds.height+'px';
      ghost.style.borderRadius=style.borderRadius;
      ghost.style.backgroundColor=style.backgroundColor;
      ghost.style.color=style.color;
      ghost.style.borderColor=style.borderTopColor;
      ghost.style.fontSize=style.fontSize;
      ghost.style.fontWeight=style.fontWeight;
      ghost.style.fontFamily=style.fontFamily;
      ghost.style.letterSpacing=style.letterSpacing;
      ghost.style.setProperty('--fx-persistence-opacity',
        String((values.persistenceAmount/100*.65).toFixed(3)));
      ghost.style.animationDuration=values.persistenceDecay+'ms';
      ghost.addEventListener('animationend',()=>ghost.remove(),{once:true});
      const earlier=buttonLayer.querySelectorAll('.fx-persistence-ghost');
      if(earlier.length>=12)earlier[0].remove();
      buttonLayer.appendChild(ghost);
    }
    doc.addEventListener('visibilitychange',sync);
    if(reduced.addEventListener)reduced.addEventListener('change',sync);
    else if(reduced.addListener)reduced.addListener(sync);
    win.addEventListener('resize',()=>{noisePixels=null;syncNoise();},{passive:true});
    paintControls();sync();
    return Object.freeze({onButton,getValues:()=>({...values})});
  }
  win.FieldAtlasExperimentalFX=Object.freeze({create,KEY,DEFAULTS});
})(window);
