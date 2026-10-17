/* FIELD ATLAS / ARCADE — local canvas display and iPhone controls. */
(function () {
  'use strict';
  const API=window.FieldAtlasBlocks;
  if(!API)throw Error('FIELD ATLAS arcade core failed to load');
  const game=new API.Game();
  const $=id=>document.getElementById(id);
  const board=$('board'),ctx=board.getContext('2d',{alpha:false});
  const root=document.documentElement;
  const BOARD_SIZE=30,BOARD_W=300,BOARD_H=600;
  const previewCanvases=[$('next1'),$('next2'),$('next3')];
  const options=$('options');
  const restartConfirm=$('restartConfirm');
  const names={ready:'STANDBY',playing:'ACTIVE',paused:'PAUSED',over:'GAME OVER'};
  let lastFrame=performance.now(),dirty=true,previousPieceCount=0,previousLines=0;
  let highScore=0,showGhost=true,soundOn=false,glow=45,scan=28,audioCtx=null;
  let palette=null;

  function read(key,fallback){
    try {const val=localStorage.getItem(key);return val===null?fallback:val;}catch(e){return fallback;}
  }
  function store(key,val){try{localStorage.setItem(key,String(val))}catch(e){}}
  highScore=Math.max(0,Number(read('fieldAtlasTetrisBest','0'))||0);
  const theme=read('fieldAtlasThemeV06','green');
  root.dataset.theme=theme==='amber'?'amber':'green';
  scan=Math.max(0,Math.min(90,Number(read('fieldAtlasTetrisScan','28'))||0));
  glow=Math.max(0,Math.min(100,Number(read('fieldAtlasTetrisGlow','45'))||0));
  showGhost=read('fieldAtlasTetrisGhost','yes')!=='no';
  soundOn=read('fieldAtlasTetrisSound','no')==='yes';
  $('scanControl').value=scan;$('glowControl').value=glow;
  $('ghostControl').checked=showGhost;$('soundControl').checked=soundOn;

  function css(name){return getComputedStyle(root).getPropertyValue(name).trim();}
  function hexRgb(hex){
    const h=hex.replace('#','');
    return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
  }
  function color(rgb,a=1){return 'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+','+a+')';}
  function mix(a,b,t){return a.map((v,i)=>Math.round(v+(b[i]-v)*t));}
  function refreshPalette(){
    palette={bright:hexRgb(css('--bright')),ink:hexRgb(css('--ink')),
      weak:hexRgb(css('--weak')),base:hexRgb(css('--bg')),border:hexRgb(css('--border')),
      grid:hexRgb(css('--grid')),dark:hexRgb(css('--shadow'))};
    root.style.setProperty('--scan',(scan/100).toFixed(2));
    root.style.setProperty('--glow',(glow/12).toFixed(1)+'px');
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
    if(glow>0){ctx.shadowColor=color(palette.bright,glow/230);ctx.shadowBlur=glow/15;}
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
  function updateHUD(){
    $('scoreValue').textContent=String(game.score).padStart(6,'0');
    $('linesValue').textContent=String(game.lines).padStart(2,'0');
    $('levelValue').textContent=String(game.level).padStart(2,'0');
    if(game.score>highScore) {
      highScore=game.score;
      store('fieldAtlasTetrisBest',highScore);
    }
    $('bestScore').textContent=highScore.toLocaleString('en-CA');
    $('pieceCount').textContent=game.pieces;
    $('eventText').textContent=game.lastEvent+' / '+game.dropMs+' MS';
    $('consoleState').textContent='[ARCADE] TETRIS / '+names[game.status];
    $('pauseButton').textContent=game.status==='paused'?'RESUME':'PAUSE';
    $('holdCanvas').style.opacity=game.canHold?'1':'.45';
    renderMini($('holdCanvas'),game.hold);
    previewCanvases.forEach((c,i)=>renderMini(c,game.queue[i]));
    const veil=$('veil');
    veil.classList.toggle('hidden',game.status==='playing');
    $('newGameButton').hidden=game.status!=='paused';
    if(game.status==='ready'){
      $('veilTitle').textContent='TETRIS';
      $('veilText').textContent='FALLING-BLOCK ARCADE / 7 PIECES / 10 × 20';
      $('playButton').textContent='▶ START GAME';
    }else if(game.status==='paused'){
      $('veilTitle').textContent='PAUSED';
      $('veilText').textContent='YOUR GAME IS SAFE UNTIL YOU RETURN';
      $('playButton').textContent='▶ RESUME';
    }else if(game.status==='over'){
      $('veilTitle').textContent='GAME OVER';
      $('veilText').textContent='SCORE '+game.score.toLocaleString('en-CA')+' / '+game.lines+' LINES';
      $('playButton').textContent='↻ PLAY AGAIN';
    }
  }
  function perform(action){
    const beforePiece=game.pieces,beforeLines=game.lines,beforeStatus=game.status;
    let performed=false;
    switch(action){
      case 'left':performed=game.move(-1);break;
      case 'right':performed=game.move(1);break;
      case 'down':performed=game.softDrop();break;
      case 'cw':performed=game.rotate(1);break;
      case 'ccw':performed=game.rotate(-1);break;
      case 'hard':performed=game.hardDrop();break;
      case 'hold':performed=game.holdPiece();break;
      case 'pause':performed=game.pause();break;
      case 'start':performed=game.start();break;
    }
    if(performed) {
      if(game.lines>beforeLines)playTone(game.lines-beforeLines===4?670:480,.15);
      else if(game.pieces>beforePiece)playTone(175,.035);
      else if(action==='cw'||action==='ccw')playTone(305,.035);
      else if(action==='hard')playTone(185,.05);
      else if(action==='hold')playTone(265,.045);
      if(beforeStatus!=='over'&&game.status==='over')playTone(100,.25);
      dirty=true;
    }
    return performed;
  }
  $('playButton').addEventListener('click',()=>perform('start'));
  // Starting over is only available from the PAUSED menu and always requires
  // an explicit second tap. Cancel retains the board and score unchanged.
  $('newGameButton').addEventListener('click',()=>{
    if(game.status==='paused'&&!restartConfirm.open)restartConfirm.showModal();
  });
  $('cancelRestart').addEventListener('click',()=>restartConfirm.close());
  $('confirmRestart').addEventListener('click',()=>{
    if(game.status!=='paused'){restartConfirm.close();return;}
    restartConfirm.close();
    game.reset();
    game.start();
    dirty=true;
  });
  restartConfirm.addEventListener('cancel',()=>{dirty=true;});
  $('themeToggle').addEventListener('click',()=>{
    const theme=root.dataset.theme==='amber'?'green':'amber';
    root.dataset.theme=theme;store('fieldAtlasThemeV06',theme);
    document.querySelector('meta[name="theme-color"]').content=theme==='amber'?'#140c05':'#06170e';
    refreshPalette();
  });
  $('optionsButton').addEventListener('click',()=>{
    if(game.status==='playing')perform('pause');
    options.showModal();
  });
  $('closeOptions').addEventListener('click',()=>options.close());
  options.addEventListener('cancel',()=>dirty=true);
  $('scanControl').addEventListener('input',e=>{
    scan=Math.min(90,Math.max(0,Number(e.target.value)));
    store('fieldAtlasTetrisScan',scan);refreshPalette();
  });
  $('glowControl').addEventListener('input',e=>{
    glow=Math.min(100,Math.max(0,Number(e.target.value)));
    store('fieldAtlasTetrisGlow',glow);refreshPalette();
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
    const repeating=['left','right','down'].includes(action);
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
        repeatTimer=setInterval(()=>perform(action),action==='down'?65:82);
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
    ArrowLeft:'left',ArrowRight:'right',ArrowDown:'down',
    ArrowUp:'cw',KeyX:'cw',KeyZ:'ccw',Space:'hard',KeyC:'hold',
    ShiftLeft:'hold',ShiftRight:'hold',KeyP:'pause',Escape:'pause',
    Enter:'start'
  };
  document.addEventListener('keydown',event=>{
    if(options.open||restartConfirm.open)return;
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
    }else if(dy< -30)perform('hard');
    else if(dy>25){
      const steps=Math.min(8,Math.max(1,Math.round(dy/25)));
      for(let i=0;i<steps;i++)perform('down');
    }
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
    if(changed)dirty=true;
    if(game.pieces>beforePieces){
      if(game.lines>beforeLines)playTone(game.lines-beforeLines===4?670:480,.15);
      else playTone(175,.04);
    }
    if(beforeStatus!=='over'&&game.status==='over')playTone(100,.24);
    if(dirty){paintBoard();updateHUD();dirty=false;}
    requestAnimationFrame(frame);
  }
  paintBoard();updateHUD();
  requestAnimationFrame(frame);

  if('serviceWorker' in navigator&&location.protocol==='https:'){
    navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
  }
})();