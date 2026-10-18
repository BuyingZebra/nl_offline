/* FIELD ATLAS / ARCADE — local canvas display and iPhone controls. */
(function () {
  'use strict';
  const API=window.FieldAtlasBlocks;
  const Scores=window.FieldAtlasScores;
  if(!API||!Scores)throw Error('FIELD ATLAS arcade modules failed to load');
  const game=new API.Game();
  const $=id=>document.getElementById(id);
  // iOS can report a dynamic CSS viewport shorter than the actual phone
  // display even with viewport-fit=cover. The map's 100dvh shell is the
  // baseline; fill the remaining device screen only on portrait handsets.
  // Never grow a desktop browser window or extend landscape controls.
  function fitPhoneViewport(){
    const app=$('app');
    const viewport=Math.max(
      Number(window.innerHeight)||0,
      Number(document.documentElement.clientHeight)||0,
      Number(window.visualViewport?.height)||0
    );
    const portrait=window.matchMedia('(orientation: portrait)').matches;
    const handset=window.matchMedia('(pointer: coarse)').matches
      && Math.min(Number(window.screen?.width)||0,Number(window.screen?.height)||0)<=650;
    let height=viewport;
    if(portrait&&handset){
      const fullScreen=Number(window.screen?.height)||0;
      const difference=fullScreen-viewport;
      if(difference>0&&difference<=Math.min(160,viewport*.25)){
        height=fullScreen;
      }
    }
    if(height>0)app.style.setProperty('--arcade-shell-height',Math.ceil(height)+'px');
  }
  fitPhoneViewport();
  window.addEventListener('resize',fitPhoneViewport,{passive:true});
  window.addEventListener('orientationchange',fitPhoneViewport,{passive:true});
  window.visualViewport?.addEventListener('resize',fitPhoneViewport,{passive:true});
  const board=$('board'),ctx=board.getContext('2d',{alpha:false});
  const root=document.documentElement;
  const BOARD_SIZE=30,BOARD_W=300,BOARD_H=600;
  const previewCanvases=[$('next1'),$('next2'),$('next3')];
  const options=$('options');
  const restartConfirm=$('restartConfirm');
  const leaderboard=$('leaderboard'),scoreEntry=$('scoreEntry');
  // Dialogs stay in the FIELD ATLAS app compositor (not the browser's
  // top layer). This gives GAME, PAUSE, DISPLAY and HIGH SCORES the exact
  // same *single* screen-space CRT/scanline/vignette/colour pass.
  const modalPanels=[options,leaderboard,scoreEntry,restartConfirm];
  const modalFocus=new WeakMap();
  const modalBackground=[...document.querySelectorAll(
    '#app > header,#app > #stage,#app > #controlDeck,#app > #eventline'
  )];
  function syncModalState(){
    const opened=modalPanels.some(panel=>panel.open);
    $('modalScrim').hidden=!opened;
    for(const element of modalBackground)element.inert=opened;
    dirty=true;
  }
  function openPanel(panel){
    if(panel.open)return true;
    if(modalPanels.some(other=>other.open))return false;
    modalFocus.set(panel,document.activeElement);
    panel.show(); // nonmodal DOM layer, manually guarded as a modal
    panel.setAttribute('aria-modal','true');
    syncModalState();
    const focusable=panel.querySelector(
      panel===scoreEntry?'#initialsEntry':
      'button:not([disabled]):not([hidden]),input:not([disabled]):not([hidden])'
    );
    focusable?.focus({preventScroll:true});
    return true;
  }
  function closePanel(panel){
    if(!panel.open)return false;
    panel.close();
    panel.removeAttribute('aria-modal');
    syncModalState();
    const returnTo=modalFocus.get(panel);
    if(returnTo&&returnTo.isConnected&&typeof returnTo.focus==='function'&&
       !modalPanels.some(other=>other.contains(returnTo))&&!returnTo.closest('[inert]'))
      returnTo.focus({preventScroll:true});
    return true;
  }
  // Match the native modal's keyboard behavior without elevating the dialog
  // above our screen overlay. Escape cancels; Tab cannot escape the menu.
  document.addEventListener('keydown',event=>{
    const active=modalPanels.find(panel=>panel.open);
    if(!active)return;
    if(event.key==='Escape'){
      event.preventDefault();
      event.stopImmediatePropagation();
      closePanel(active);
      return;
    }
    if(event.key!=='Tab')return;
    const controls=[...active.querySelectorAll(
      'button:not([disabled]):not([hidden]),input:not([disabled]):not([hidden])'
    )].filter(node=>node.getClientRects().length);
    if(!controls.length){event.preventDefault();return;}
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey){
      if(document.activeElement===first||!active.contains(document.activeElement)){
        event.preventDefault();last.focus();
      }
    }else if(document.activeElement===last||!active.contains(document.activeElement)){
      event.preventDefault();first.focus();
    }
  },true);

  let lastFrame=performance.now(),dirty=true;
  let highScore=0,showGhost=true,soundOn=false,glow=65,scan=26,vignette=30,sweep=65,audioCtx=null;
  let gameOverHandled=false,highScores=[],storage=null;
  const fadeKeys=['screenTop','screenBottom'];
  const defaultGradients={
    screenTop:{enabled:true,length:165},screenBottom:{enabled:false,length:110}
  };
  let gradients=JSON.parse(JSON.stringify(defaultGradients));
  let palette=null;

  function read(key,fallback){
    try {const val=localStorage.getItem(key);return val===null?fallback:val;}catch(e){return fallback;}
  }
  function store(key,val){try{localStorage.setItem(key,String(val))}catch(e){}}
  const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
  // Independent screen-space experimental overlays never modify game cells,
  // UI surfaces or the phosphor colour pass.
  let experimental=null;
  try{experimental=window.FieldAtlasExperimentalFX?.create(document)||null;}
  catch(e){console.warn('Experimental CRT overlays unavailable; game continues',e);}
  sweep=clamp(Number(read('fieldAtlasTetrisSweepV01','65'))||0,0,100);
  try{storage=window.localStorage;}catch(e){storage=null;}
  highScores=Scores.read(storage);
  highScore=highScores[0]?.score||0;
  const theme=read('fieldAtlasThemeV06','green');
  root.dataset.theme=theme==='amber'?'amber':'green';
  try{
    const saved=JSON.parse(read('fieldAtlasEffectsV06','null'));
    if(saved&&typeof saved==='object'){
      glow=Number.isFinite(saved.glow)?clamp(Math.round(saved.glow),0,100):glow;
      scan=Number.isFinite(saved.scanlines)?clamp(Math.round(saved.scanlines),0,100):scan;
      vignette=Number.isFinite(saved.vignette)?clamp(Math.round(saved.vignette),0,100):vignette;
    }else{
      scan=clamp(Number(read('fieldAtlasTetrisScan','26'))||0,0,100);
      glow=clamp(Number(read('fieldAtlasTetrisGlow','65'))||0,0,100);
    }
  }catch(e){}
  // Screen fades are post-processing overlays for all arcade content.
  // Legacy playfield fade settings are ignored.
  try{
    const mapGradients=JSON.parse(read('fieldAtlasGradientsV20','null'));
    for(const key of ['screenTop','screenBottom']){
      if(mapGradients?.[key]&&typeof mapGradients[key]==='object'){
        if(typeof mapGradients[key].enabled==='boolean')
          gradients[key].enabled=mapGradients[key].enabled;
        if(Number.isFinite(mapGradients[key].length))
          gradients[key].length=clamp(Math.round(mapGradients[key].length/5)*5,0,420);
      }
    }
    const saved=JSON.parse(read('fieldAtlasTetrisGradientsV01','null'));
    if(saved&&typeof saved==='object'){
      for(const key of fadeKeys){
        if(saved[key]&&typeof saved[key]==='object'){
          if(typeof saved[key].enabled==='boolean')gradients[key].enabled=saved[key].enabled;
          if(Number.isFinite(saved[key].length))
            gradients[key].length=clamp(Math.round(saved[key].length/5)*5,0,420);
        }
      }
    }
  }catch(e){}
  showGhost=read('fieldAtlasTetrisGhost','yes')!=='no';
  soundOn=read('fieldAtlasTetrisSound','no')==='yes';
  $('ghostControl').checked=showGhost;$('soundControl').checked=soundOn;

  function css(name){return getComputedStyle(root).getPropertyValue(name).trim();}
  function hexRgb(hex){
    const h=hex.replace('#','');
    return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
  }
  function color(rgb,a=1){return 'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+','+a+')';}
  function mix(a,b,t){return a.map((v,i)=>Math.round(v+(b[i]-v)*t));}
  function saveEffects(){
    store('fieldAtlasEffectsV06',JSON.stringify({glow,scanlines:scan,vignette}));
  }
  function gradientHeight(key){return gradients[key].enabled?gradients[key].length+'px':'0px';}
  function applyGradientFades(){
    $('screenTopFade').style.height=gradientHeight('screenTop');
    $('screenBottomFade').style.height=gradientHeight('screenBottom');
    root.style.setProperty('--screen-top-fade',gradientHeight('screenTop'));
    root.style.setProperty('--screen-bottom-fade',gradientHeight('screenBottom'));
  }
  function saveGradients(){
    store('fieldAtlasTetrisGradientsV01',JSON.stringify(gradients));
    // Keep the two shared screen gradients in sync with the map without
    // touching the map's geographically anchored north/south fade settings.
    try{
      const map=JSON.parse(read('fieldAtlasGradientsV20','null'))||{};
      for(const key of ['screenTop','screenBottom'])map[key]={...gradients[key]};
      store('fieldAtlasGradientsV20',JSON.stringify(map));
    }catch(e){}
  }
  function rangeDisplay(input,output,value,suffix='%'){
    input.value=value;
    input.style.setProperty('--fill',Math.round(value/Number(input.max)*100)+'%');
    output.textContent=value+suffix;
  }
  function updateDisplaySettings(){
    rangeDisplay($('glowControl'),$('glowValue'),glow);
    rangeDisplay($('scanControl'),$('scanValue'),scan);
    rangeDisplay($('vignetteControl'),$('vignetteValue'),vignette);
    rangeDisplay($('sweepControl'),$('sweepValue'),sweep);
    for(const key of fadeKeys){
      $('fade-'+key+'-on').checked=gradients[key].enabled;
      rangeDisplay($('fade-'+key),$('fade-'+key+'-value'),gradients[key].length,'px');
    }
  }
  function refreshPalette(){
    palette={bright:hexRgb(css('--bright')),ink:hexRgb(css('--ink')),
      weak:hexRgb(css('--weak')),base:hexRgb(css('--bg')),border:hexRgb(css('--border')),
      grid:hexRgb(css('--grid')),dark:hexRgb(css('--shadow'))};
    const k=glow/100;
    // CSS properties live on the document root so modal top-layer
    // buttons and game controls share identical phosphor settings.
    const app=root;
    app.style.setProperty('--scan-intensity',String(scan/100));
    app.style.setProperty('--vignette-intensity',String(vignette/100));
    app.style.setProperty('--glow-level',k.toFixed(3));
    app.style.setProperty('--sweep-intensity',(sweep/100).toFixed(3));
    app.style.setProperty('--glow-radius',(17*k).toFixed(2)+'px');
    app.style.setProperty('--glow-strength',(88*k).toFixed(1)+'%');
    applyGradientFades();
    updateDisplaySettings();
    dirty=true;
  }
  refreshPalette();
  const pieceIntensity={I:1,O:.95,T:.89,S:.79,Z:.73,J:.84,L:.93};

  function playTone(freq=240,duration=.045){
    if(!soundOn)return;
    try{
      const AC=window.AudioContext||window.webkitAudioContext;
      if(!AC)return;
      if(!audioCtx)audioCtx=new AC();
      if(audioCtx.state==='suspended')audioCtx.resume();
      const osc=audioCtx.createOscillator(),gain=audioCtx.createGain(),now=audioCtx.currentTime;
      osc.type='square';osc.frequency.setValueAtTime(freq,now);
      gain.gain.setValueAtTime(.035,now);
      gain.gain.exponentialRampToValueAtTime(.001,now+duration);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);osc.stop(now+duration);
    }catch(e){/* Optional sound does not affect gameplay. */}
  }
  function cell(x,y,kind,ghost=false){
    if(x<0||y<0||x>=API.COLS||y>=API.ROWS)return;
    const margin=.9,cx=x*BOARD_SIZE+margin,cy=y*BOARD_SIZE+margin,size=BOARD_SIZE-2*margin;
    const k=pieceIntensity[kind]||.8;
    if(ghost){
      ctx.strokeStyle=color(palette.ink,.42);
      ctx.lineWidth=1.6;
      ctx.setLineDash([4,3]);ctx.strokeRect(cx+3,cy+3,size-6,size-6);ctx.setLineDash([]);
      return;
    }
    const body=mix(palette.base,palette.bright,.25+k*.42);
    const edge=mix(palette.base,palette.ink,.30+k*.54);
    ctx.save();
    if(glow>0){
      // Bloom follows each tile's actual fill, not a uniform phosphor tint.
      const emission=glow/100;
      // Physically darker tiles emit less; luminous bloom inherits the
      // computed cell fill, never the palette's uniform highlight colour.
      ctx.shadowColor=color(body,emission*(.18+.55*k));
      ctx.shadowBlur=17*emission*(.3+.7*k);
    }
    ctx.fillStyle=color(body,.98);
    ctx.fillRect(cx+1,cy+1,size-2,size-2);
    ctx.shadowBlur=0;
    ctx.strokeStyle=color(edge,.95);
    ctx.lineWidth=1.4;
    ctx.strokeRect(cx+1.2,cy+1.2,size-2.4,size-2.4);
    ctx.fillStyle=color(palette.ink,.2);
    ctx.fillRect(cx+4,cy+4,size-8,3);
    ctx.fillStyle=color(palette.dark,.32);
    ctx.fillRect(cx+5,cy+size-6,size-10,2.2);
    ctx.restore();
  }
  function pieceOnBoard(p,y,ghost=false){
    if(!p)return;
    for(let row=0;row<p.matrix.length;row++)for(let col=0;col<p.matrix[row].length;col++){
      const kind=p.matrix[row][col];
      if(kind)cell(p.x+col,y+row,kind,ghost);
    }
  }
  function paintBoard(){
    if(!palette)return;
    const c=ctx;
    // Game-board pixels are a distinct dark display, not a UI button.
    c.fillStyle=color(mix(palette.dark,palette.base,.55));
    c.fillRect(0,0,BOARD_W,BOARD_H);
    c.strokeStyle=color(palette.grid,.32);
    c.lineWidth=.7;
    c.beginPath();
    for(let x=0;x<=API.COLS;x++){c.moveTo(x*BOARD_SIZE+.5,0);c.lineTo(x*BOARD_SIZE+.5,BOARD_H);}
    for(let y=0;y<=API.ROWS;y++){c.moveTo(0,y*BOARD_SIZE+.5);c.lineTo(BOARD_W,y*BOARD_SIZE+.5);}
    c.stroke();
    for(let y=0;y<API.ROWS;y++)for(let x=0;x<API.COLS;x++){
      const v=game.board[y][x];if(v)cell(x,y,v);
    }
    if(game.current){
      if(showGhost&&game.status!=='over')pieceOnBoard(game.current,game.ghostY(),true);
      pieceOnBoard(game.current,game.current.y);
    }
  }
  function renderMini(canvas,kind){
    const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
    c.clearRect(0,0,w,h);
    if(!kind)return;
    const m=API.SHAPES[kind];
    const occupied=[];
    for(let y=0;y<m.length;y++)for(let x=0;x<m[y].length;x++)if(m[y][x])occupied.push([x,y]);
    if(!occupied.length)return;
    const left=Math.min(...occupied.map(x=>x[0])),right=Math.max(...occupied.map(x=>x[0]));
    const top=Math.min(...occupied.map(x=>x[1])),bottom=Math.max(...occupied.map(x=>x[1]));
    const n=Math.min(21,(w-12)/(right-left+1),(h-10)/(bottom-top+1));
    const sx=(w-n*(right-left+1))/2,sy=(h-n*(bottom-top+1))/2;
    const fill=mix(palette.base,palette.bright,.3+(pieceIntensity[kind]||.8)*.4);
    for(const [x,y] of occupied){
      const px=sx+(x-left)*n,py=sy+(y-top)*n;
      c.fillStyle=color(fill,.95);
      c.fillRect(px+1,py+1,n-2,n-2);
      c.strokeStyle=color(palette.ink,.8);
      c.lineWidth=1;c.strokeRect(px+1.5,py+1.5,n-3,n-3);
    }
  }
  const readyMessage='SURVIVE THE SOVIET CHALLENGE';
  function showReadyMessage(){
    const parent=$('veilText');
    let text=$('readyText'),cursor=$('readyCursor');
    if(!text||!cursor){
      text=document.createElement('span');
      text.id='readyText';
      cursor=document.createElement('span');
      cursor.id='readyCursor';
      cursor.setAttribute('aria-hidden','true');
      parent.replaceChildren(text,cursor);
    }
    // Only the separate terminal block blinks; the tagline never types.
    text.textContent=readyMessage;
    parent.setAttribute('aria-label',readyMessage);
  }
  function showOtherMessage(message){
    const parent=$('veilText');
    parent.removeAttribute('aria-label');
    if(parent.textContent!==message)parent.textContent=message;
  }
  // Live counters have their own update path. A blocked/offscreen canvas
  // redraw must never prevent scoring, levels, or lines from reaching the HUD.
  function syncLiveStats(){
    const values={
      scoreValue:String(game.score).padStart(6,'0'),
      linesValue:String(game.lines).padStart(2,'0'),
      levelValue:String(game.level).padStart(2,'0'),
      bestScore:Math.max(highScore,game.score).toLocaleString('en-CA'),
      pieceCount:String(game.pieces),
      eventText:game.lastEvent+' / '+game.dropMs+' MS'
    };
    for(const [id,value] of Object.entries(values)){
      const node=$(id);
      if(node.textContent===value)continue;
      node.textContent=value;
      // Make a real update unmistakable when six-digit zero-padding makes
      // the numerical difference visually subtle under CRT scanlines.
      if((id==='scoreValue'||id==='levelValue'||id==='linesValue')&&game.status==='playing'){
        node.classList.remove('hud-changed');
        void node.offsetWidth;
        node.classList.add('hud-changed');
      }
    }
  }
  function updateHUD(){
    syncLiveStats();
    // PAUSE is a consistently lit, clickable control in every state.
    // The action handler only pauses while playing; ▶ RESUME on the
    // board remains the only way to continue an existing game.
    $('holdCanvas').style.opacity=game.canHold?'1':'.45';
    renderMini($('holdCanvas'),game.hold);
    previewCanvases.forEach((c,i)=>renderMini(c,game.queue[i]));
    const veil=$('veil');
    veil.classList.toggle('hidden',game.status==='playing');
    $('newGameButton').hidden=game.status!=='paused';
    $('pausedScoresButton').hidden=game.status!=='paused';
    if(game.status==='ready'){
      $('veilTitle').textContent='TETRIS';
      showReadyMessage();
      $('playButton').textContent='▶ START GAME';
    }else if(game.status==='paused'){
      $('veilTitle').textContent='PAUSED';
      showOtherMessage('YOUR GAME IS SAFE UNTIL YOU RETURN');
      $('playButton').textContent='▶ RESUME';
    }else if(game.status==='over'){
      $('veilTitle').textContent='GAME OVER';
      showOtherMessage('SCORE '+game.score.toLocaleString('en-CA')+' / '+game.lines+' LINES');
      $('playButton').textContent='↻ PLAY AGAIN';
    }
  }

  function renderHighScores(){
    const container=$('scoreRows');
    container.replaceChildren();
    for(let rank=0;rank<Scores.LIMIT;rank++){
      const entry=highScores[rank];
      const row=document.createElement('div');
      row.className='score-row'+(entry?'':' empty');
      const spans=[
        ['rank',String(rank+1).padStart(2,'0')],
        ['player',entry?.name||'---'],
        ['record',entry?entry.lines+' LINES / LV '+entry.level:'NO RECORD'],
        ['points',entry?entry.score.toLocaleString('en-CA'):'------']
      ];
      for(const [name,value] of spans){
        const node=document.createElement('span');
        node.className=name;
        node.textContent=value;
        row.append(node);
      }
      container.append(row);
    }
  }
  function openHighScores(){
    if(game.status==='playing')perform('pause');
    if(options.open)closePanel(options);
    if(restartConfirm.open||scoreEntry.open)return;
    renderHighScores();
    if(!leaderboard.open)openPanel(leaderboard);
    dirty=true;
  }
  function offerScoreOnGameOver(){
    if(game.status!=='over'||gameOverHandled)return;
    gameOverHandled=true;
    dirty=true;
    if(!Scores.qualifies(highScores,game.score))return;
    $('entryScore').textContent=game.score.toLocaleString('en-CA')+' POINTS';
    $('initialsEntry').value=read('fieldAtlasTetrisInitials','AAA');
    if(!scoreEntry.open)openPanel(scoreEntry);
  }
  function saveQualifyingScore(){
    if(!scoreEntry.open||game.status!=='over')return;
    const initials=Scores.initials($('initialsEntry').value);
    const at=Date.now();
    highScores=Scores.add(highScores,{name:initials,score:game.score,
      lines:game.lines,level:game.level,at});
    highScores=Scores.save(storage,highScores);
    highScore=highScores[0]?.score||0;
    store('fieldAtlasTetrisInitials',initials);
    closePanel(scoreEntry);
    renderHighScores();
    openPanel(leaderboard);
    dirty=true;
  }
  $('pausedScoresButton').addEventListener('click',openHighScores);
  $('closeLeaderboard').addEventListener('click',()=>closePanel(leaderboard));
  $('saveScore').addEventListener('click',saveQualifyingScore);
  $('initialsEntry').addEventListener('keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();saveQualifyingScore();}
  });
  $('initialsEntry').addEventListener('input',()=>{
    const input=$('initialsEntry'),start=input.selectionStart;
    input.value=input.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3);
    try{input.setSelectionRange(Math.min(start,input.value.length),Math.min(start,input.value.length));}catch(e){}
  });
  $('skipScore').addEventListener('click',()=>{closePanel(scoreEntry);dirty=true;});

  function perform(action){
    const beforePiece=game.pieces,beforeLines=game.lines,beforeStatus=game.status;
    let performed=false;
    switch(action){
      case 'left':performed=game.move(-1);break;
      case 'right':performed=game.move(1);break;
      case 'cw':performed=game.rotate(1);break;
      case 'hard':performed=game.hardDrop();break;
      case 'hold':performed=game.holdPiece();break;
      case 'pause':performed=game.status==='playing'&&game.pause();break;
      case 'start':performed=game.start();break;
    }
    if(performed) {
      if(beforeStatus==='over'&&game.status==='playing')gameOverHandled=false;
      if(game.lines>beforeLines)playTone(game.lines-beforeLines===4?670:480,.15);
      else if(game.pieces>beforePiece)playTone(175,.035);
      else if(action==='cw')playTone(305,.035);
      else if(action==='hard')playTone(185,.05);
      else if(action==='hold')playTone(265,.045);
      if(beforeStatus!=='over'&&game.status==='over')playTone(100,.25);
      offerScoreOnGameOver();
      syncLiveStats();
      dirty=true;
    }
    return performed;
  }
  $('playButton').addEventListener('click',()=>perform('start'));
  // Starting over is only available from the PAUSED menu and always requires
  // an explicit second tap. Cancel retains the board and score unchanged.
  $('newGameButton').addEventListener('click',()=>{
    if(game.status==='paused'&&!restartConfirm.open)openPanel(restartConfirm);
  });
  $('cancelRestart').addEventListener('click',()=>closePanel(restartConfirm));
  $('confirmRestart').addEventListener('click',()=>{
    if(game.status!=='paused'){closePanel(restartConfirm);return;}
    closePanel(restartConfirm);
    game.reset();
    game.start();
    gameOverHandled=false;
    syncLiveStats();
    dirty=true;
  });
  restartConfirm.addEventListener('cancel',()=>{dirty=true;});
  function toggleTheme(){
    const theme=root.dataset.theme==='amber'?'green':'amber';
    root.dataset.theme=theme;store('fieldAtlasThemeV06',theme);
    document.querySelector('meta[name="theme-color"]').content='#151515';
    refreshPalette();
    // Canvas is a separate paint surface. Redraw synchronously when the
    // phosphor theme changes; hue is applied by the screen film, not the canvas.
    paintBoard();
    updateHUD();
    dirty=false;
  }
  $('themeToggle').addEventListener('click',toggleTheme);
  $('optionsButton').addEventListener('click',()=>{
    if(game.status==='playing')perform('pause');
    openPanel(options);
  });
  $('closeOptions').addEventListener('click',()=>closePanel(options));
  options.addEventListener('cancel',()=>dirty=true);
  for(const [id,key] of [['glowControl','glow'],['scanControl','scan'],['vignetteControl','vignette']]){
    $(id).addEventListener('input',event=>{
      const value=clamp(Math.round(Number(event.target.value)),0,100);
      if(key==='glow')glow=value;
      else if(key==='scan')scan=value;
      else vignette=value;
      saveEffects();
      refreshPalette();
    });
  }
  $('sweepControl').addEventListener('input',event=>{
    sweep=clamp(Math.round(Number(event.target.value)||0),0,100);
    store('fieldAtlasTetrisSweepV01',sweep);
    refreshPalette();
  });
  // Resize triggers game redraw; the display itself remains unwarped.
  window.addEventListener('resize',()=>{dirty=true;},{passive:true});
  for(const key of fadeKeys){
    $('fade-'+key+'-on').addEventListener('change',event=>{
      gradients[key].enabled=event.target.checked;
      saveGradients();refreshPalette();
    });
    $('fade-'+key).addEventListener('input',event=>{
      gradients[key].length=clamp(Math.round(Number(event.target.value)/5)*5,0,420);
      saveGradients();refreshPalette();
    });
  }
  $('resetEffects').addEventListener('click',()=>{
    glow=65;scan=26;vignette=30;sweep=65;
    store('fieldAtlasTetrisSweepV01',sweep);
    saveEffects();refreshPalette();
  });
  $('ghostControl').addEventListener('change',e=>{
    showGhost=e.target.checked;store('fieldAtlasTetrisGhost',showGhost?'yes':'no');dirty=true;
  });
  $('soundControl').addEventListener('change',e=>{
    soundOn=e.target.checked;store('fieldAtlasTetrisSound',soundOn?'yes':'no');
    if(soundOn)playTone(520,.055);
  });

  // One pointer event stream per button. Pointerdown acts immediately; holding
  // movement/down buttons repeats, and release reliably cancels timers.
  for(const button of document.querySelectorAll('[data-action]')){
    const action=button.dataset.action;
    const repeating=['left','right'].includes(action);
    let startTimer=null,repeatTimer=null,pointer=null;
    const stop=()=>{
      if(startTimer!==null)clearTimeout(startTimer);
      if(repeatTimer!==null)clearInterval(repeatTimer);
      startTimer=repeatTimer=null;
      pointer=null;
    };
    button.addEventListener('pointerdown',event=>{
      if(event.button!==0&&event.pointerType==='mouse')return;
      event.preventDefault();
      stop();
      pointer=event.pointerId;
      try{button.setPointerCapture(pointer)}catch(e){}
      perform(action);
      if(repeating)startTimer=setTimeout(()=>{
        repeatTimer=setInterval(()=>perform(action),82);
      },210);
    });
    for(const evt of ['pointerup','pointercancel','lostpointercapture'])
      button.addEventListener(evt,stop);
    // Keyboard activation via the accessibility tree still works.
    button.addEventListener('click',event=>{
      if(event.detail===0)perform(action);
    });
  }
  const keyboard={
    ArrowLeft:'left',ArrowRight:'right',
    ArrowUp:'cw',KeyX:'cw',
    ArrowDown:'hard',Space:'hard',KeyC:'hold',
    ShiftLeft:'hold',ShiftRight:'hold',KeyP:'pause',Escape:'pause'
  };
  document.addEventListener('keydown',event=>{
    if(options.open||restartConfirm.open||leaderboard.open||scoreEntry.open)return;
    const action=keyboard[event.code];
    if(!action)return;
    event.preventDefault();
    if(event.repeat&&['hard','hold','pause','start'].includes(action))return;
    perform(action);
  });
  // Gesture shortcuts on the board; on-screen buttons remain the primary path.
  let drag=null;
  board.addEventListener('pointerdown',e=>{
    e.preventDefault();
    drag={id:e.pointerId,x:e.clientX,y:e.clientY};
    try{board.setPointerCapture(e.pointerId)}catch(err){}
  });
  board.addEventListener('pointerup',e=>{
    if(!drag||drag.id!==e.pointerId)return;
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    drag=null;
    const ax=Math.abs(dx),ay=Math.abs(dy);
    if(ax<16&&ay<16)perform('cw');
    else if(ax>ay&&ax>=18){
      const steps=Math.min(5,Math.max(1,Math.round(ax/32)));
      for(let i=0;i<steps;i++)perform(dx>0?'right':'left');
    }else if(dy>25)perform('hard');
  });
  board.addEventListener('pointercancel',()=>drag=null);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden&&game.status==='playing')perform('pause');
    lastFrame=performance.now();
  });
  // Gameplay never depends on timers firing while Safari is in the background.
  function frame(t){
    const dt=t-lastFrame;
    lastFrame=t;
    const beforePieces=game.pieces,beforeLines=game.lines,beforeStatus=game.status;
    const changed=game.tick(dt);
    // Gravity, locks and line clears can change scores without a pointer event.
    if(game.status==='playing'||changed)syncLiveStats();
    if(changed)dirty=true;
    if(game.pieces>beforePieces){
      if(game.lines>beforeLines)playTone(game.lines-beforeLines===4?670:480,.15);
      else playTone(175,.04);
    }
    if(beforeStatus!=='over'&&game.status==='over')playTone(100,.24);
    offerScoreOnGameOver();
    if(dirty){paintBoard();updateHUD();dirty=false;}
    requestAnimationFrame(frame);
  }

  // The experimental persistence toggle now owns ALL button afterimages.
  // There is no separate always-on flash that can bypass this setting.
  const appSurface=$('app');
  function flashPhosphor(button){
    if(button.disabled||!experimental)return;
    const bounds=button.getBoundingClientRect();
    const appBounds=appSurface.getBoundingClientRect();
    if(!bounds.width||!bounds.height)return;
    experimental.onButton(button,bounds,appBounds);
  }
  function installPhosphorFeedback(button){
    button.addEventListener('pointerdown',()=>flashPhosphor(button));
    button.addEventListener('click',event=>{
      if(event.detail===0)flashPhosphor(button);
    });
  }
  document.querySelectorAll('button').forEach(installPhosphorFeedback);
  document.addEventListener('click',event=>{
    if(event.detail===0)return;
    const target=event.target.closest?.('button,input[type="checkbox"]');
    if(target&&document.activeElement===target)target.blur();
  });
  paintBoard();updateHUD();
  requestAnimationFrame(frame);

  if('serviceWorker' in navigator&&location.protocol==='https:'){
    navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
  }
})();