/* V075: original NOMAD memory-dump concept, in grayscale Canvas2D.
 * One source serves the immediate loading cover and the real CRT compositor.
 * No tint/glow/scanline is baked into this image: the game owns all FX.
 * The tetromino face function is shared with gameplay (no visual duplicates).
 */
(function(root){
 'use strict';
 const levels={I:.99,J:.8,L:.92,O:.94,S:.76,T:.85,Z:.73};
 const clamp=v=>Math.max(0,Math.min(255,Math.round(v)));
 const gray=n=>{const c=clamp(n);return 'rgb('+c+','+c+','+c+')'};
 const blocks=(g,x,y,w,h,kind)=>{
  const side=Math.min(w,h),gap=Math.max(.6,Math.min(1.3,side*.055));
  const level=28+190*(levels[kind]||.8);
  const xx=x+gap,yy=y+gap,ww=Math.max(1,w-2*gap),hh=Math.max(1,h-2*gap);
  const rim=Math.max(.65,Math.min(1.35,side*.08));
  const rect=(a,b,c,d,t)=>{g.fillStyle=gray(t);g.fillRect(a,b,c,d);};
  rect(xx,yy,ww,hh,level-26);
  rect(xx,yy,ww,rim,level+18);
  rect(xx,yy,rim,hh,level+12);
  rect(xx,yy+hh-rim,ww,rim,level-38);
  rect(xx+ww-rim,yy,rim,hh,level-32);
  const inset=Math.min(3.2,Math.max(1.7,side*.145));
  const fx=xx+inset,fy=yy+inset,fw=Math.max(1,ww-2*inset),fh=Math.max(1,hh-2*inset);
  rect(fx,fy,fw,fh,level-10);
  rect(fx,fy,fw,Math.max(.65,Math.min(1.15,side*.055)),level+20);
  rect(fx,fy+fh-Math.max(.65,Math.min(1,side*.045)),fw,
   Math.max(.65,Math.min(1,side*.045)),level-27);
 };
 // Fixed, deterministic sample board. All 4-cell previews are legal
 // Tetris shapes; the same face draws real falling and saved board blocks.
 const preview=[
  [3,6,'J'],[3,7,'J'],[3,8,'J'],[4,8,'J'],
  [0,16,'O'],[1,16,'O'],[0,17,'O'],[1,17,'O'],
  [3,17,'T'],[2,18,'T'],[3,18,'T'],[4,18,'T'],
  [7,16,'L'],[7,17,'L'],[7,18,'L'],[8,18,'L'],
  [0,18,'I'],[1,18,'I'],[2,18,'I'],[3,18,'I'],
  [5,18,'S'],[6,18,'S'],[4,19,'S'],[5,19,'S']
 ];
 const words=[
  '0x1000  3F A2 6C 90  |.?..l.|',
  '0x1010  9C 4E 2B F0  |.N+...|',
  '0x1020  6C 30 D1 A0  |..0...|',
  '0x1030  F0 9A 4C 21  |...L!.|',
  '0x1040  3E 7F 88 10  |>.....|',
  '0x1050  D4 2A 6F 90  |.*o...|',
  '0x1060  8C B1 0E 73  |...s..|',
  '0x1070  19 5F C4 2D  |._-...|',
  '0x1080  90 EE 11 6A  |...j..|',
  '0x1090  4B 7D 3C F0  |K}<...|',
  '0x10A0  C2 10 A9 5E  |...^..|',
  '0x10B0  7E 61 D2 84  |~a....|',
  '0x10C0  8F 33 16 C7  |.3....|',
  '0x10D0  5A 9D 40 18  |Z.@...|',
  '0x10E0  E1 77 2C 3B  |.w,;..|',
  '0x10F0  0A C6 91 FE  |......|',
  '0x1100  6D 25 B8 03  |m%....|',
  '0x1110  BE 14 7A 9E  |..z...|',
  '0x1120  F9 6C 20 41  |.l A..|',
  '0x1130  3D 8B E0 55  |=...U.|',
  '0x1140  91 47 6F 12  |.Go...|',
  '0x1150  D8 03 A5 7C  |......|',
  '0x1160  2F 96 1D 60  |/..'+'..|',
  '0x1170  0C 48 F3 29  |.H.)..|',
  '0x1180  A7 5E 09 B4  |.^....|'
 ];
 const checks=[
  ['BOOT SEQUENCE INITIATED','OK'],
  ['MEMORY CHECK','OK'],['DISPLAY BUS','OK'],['VIDEO BUFFER','OK'],
  ['INPUT DEVICE','OK'],['ARCADE MODULE','OK'],
  ['TETRIS MATRIX','READY'],['PIECE LOGIC','READY'],['GAME BOARD','READY']
 ];
 function paint(g,w,h,elapsedMs=0,version='077',canContinue=false){
  // Align proportions to the approved FIRST concept (not the later panels).
  // At landscape breakpoints a centered, full-height portrait viewport
  // prevents unreadable columns or unsafe horizontal clipping.
  const scale=Math.min(w/393,h/852);
  g.save();
  g.fillStyle='#080808';g.fillRect(0,0,w,h);
  g.translate((w-393*scale)/2,(h-852*scale)/2);
  g.scale(scale,scale);
  const x0=31,x1=362;
  const font=(size,weight=400,terminal=true)=>{
   g.font=(weight===700?'700 ':'400 ')+size+'px '+
    (terminal?'"Share Tech Mono",ui-monospace,monospace':
     '"Roboto Condensed",ui-monospace,monospace');
  };
  const txt=(v,x,y,size=10,tone=195,weight=400,align='left',terminal=true)=>{
   g.fillStyle=gray(tone);font(size,weight,terminal);
   g.textBaseline='middle';g.textAlign=align;
   g.fillText(String(v),x,y);
  };
  const rule=(y,a=x0,b=x1)=>{g.strokeStyle=gray(119);g.lineWidth=.75;
   g.beginPath();g.moveTo(a,y+.5);g.lineTo(b,y+.5);g.stroke();};
  const elapsed=Math.max(0,Number(elapsedMs)||0);
  txt('NOMAD // TETRIS SYSTEM',x0,81,22,218,700,'left',false);
  txt('version: '+version,362,93,8,151,400,'right');
  rule(112);
  const checksVisible=Math.min(checks.length,Math.floor(Math.max(0,elapsed-130)/125));
  for(let i=0;i<checksVisible;i++){
   const [label,status]=checks[i],y=136+i*15.7;
   txt(label,34,y,10,193);
   txt('[ '+status+' ]',353,y,10,211,400,'right');
  }
  rule(285);
  // The first concept has a dense hex dump and a small integrated board
  // alongside it, not a large second-app UI with oversized cards.
  const revealed=Math.min(words.length,Math.floor(Math.max(0,elapsed-1090)/47));
  for(let i=0;i<revealed;i++)txt(words[i],32,307+i*14.2,9.1,194);
  const px=278,py=303,c=8.8,pw=10*c,ph=20*c;
  g.fillStyle='#101010';g.fillRect(px,py,pw,ph);
  g.strokeStyle=gray(119);g.lineWidth=.8;g.strokeRect(px-.8,py-.8,pw+1.6,ph+1.6);
  g.strokeStyle=gray(41);g.lineWidth=.5;g.beginPath();
  for(let k=1;k<10;k++){g.moveTo(px+k*c,py);g.lineTo(px+k*c,py+ph)}
  for(let k=1;k<20;k++){g.moveTo(px,py+k*c);g.lineTo(px+pw,py+k*c)}
  g.stroke();
  const pieceCount=Math.min(preview.length,Math.floor(Math.max(0,elapsed-1050)/61));
  for(let i=0;i<pieceCount;i++){
   const [col,row,type]=preview[i];
   blocks(g,px+col*c,py+row*c,c,c,type);
  }
  // Small status column follows the same typographic hierarchy.
  const mini=(title,y,rows)=>{
   rule(y,px,366);txt(title,px,y+14,10,205,700);
   rows.forEach(([k,v],i)=>{
    txt(k,px,y+30+i*15.5,8.7,184);
    txt(v,365,y+30+i*15.5,8.7,197,400,'right');
   });
  };
  if(elapsed>1250)mini('MODULES',496,[['CORE SYS','OK'],['VIDEO','OK'],['LOGIC','OK'],['PIECES','OK']]);
  if(elapsed>1700)mini('MEMORY',589,[['SYSTEM RAM','64 KB'],['VIDEO RAM','32 KB'],['BUFFER','OK']]);
  if(elapsed>2060)mini('SIGNAL',662,[['DISPLAY','LOCK'],['REFRESH','59.94'],['MODE','ACTIVE']]);
  rule(711,32,269);
  if(elapsed>2250)txt('TETRIS MATRIX INITIALIZED.',32,739,11,204);
  if(elapsed>2390)txt('ALL SYSTEMS NOMINAL.',32,758,11,204);
  if(elapsed>2560)txt(canContinue?'TOUCH SCREEN TO CONTINUE':'READY TO PLAY.',32,777,11,214);
  if(elapsed>2690){
   txt('>',32,805,13,216);
   // A genuine block cursor, not a Unicode character with font mismatch.
   if(Math.floor(elapsed/420)%2===0){
    g.fillStyle=gray(221);g.fillRect(48,798,8,14);
   }
  }
  g.restore();
 }
 root.FieldAtlasTerminal=Object.freeze({paint,tileFace:blocks,checks,words,preview});
})(window);
