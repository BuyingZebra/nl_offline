import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createVectorTileRenderer,spriteIdentity,VECTOR_PIECE_KINDS} from '../vector-tile-renderer.js';
import {renderIFragmentSVG,renderSmoothTileSVG} from '../assets/tiles/smooth-geometry.mjs';

function mock(){
 const images=[],canvases=[],painted=[];
 let dpr=2,redraws=0;
 const renderer=createVectorTileRenderer({
  createImage(){
   const image={onload:null,onerror:null,src:null};
   images.push(image);return image;
  },
  createCanvas(){
   const canvas={width:0,height:0,calls:[],getContext(){
    return {drawImage:(...args)=>canvas.calls.push(args),imageSmoothingEnabled:false,
     imageSmoothingQuality:'medium'};
   }};
   canvases.push(canvas);return canvas;
  },
  pixelRatio:()=>dpr,
  onReady:()=>{redraws++;}
 });
 const g={drawImage:(...args)=>painted.push(args),fillRect(){},fillStyle:''};
 return {renderer,g,images,canvases,painted,get redraws(){return redraws;},
  setDpr:value=>{dpr=value;}};
}

test('all seven authored SVG assets preload before gameplay without per-frame parsing',()=>{
 const m=mock();
 m.renderer.preload();
 assert.equal(m.images.length,7);
 assert.equal(m.renderer.imageCount,7);
 const sources=m.images.map(img=>img.src);
 for(const kind of VECTOR_PIECE_KINDS)
  assert.ok(sources.some(src=>src==='./assets/tiles/vector/'+kind+'.svg?v121'),kind);
 assert.equal(m.renderer.rasterCount,0);
 m.images.forEach(img=>img.onload());
 assert.equal(m.redraws,7);
});

test('smooth SVG is drawn after loading and cached at physical display resolution',()=>{
 const m=mock();
 assert.equal(m.renderer.drawTile(m.g,12,20,20,20,'O'),false);
 assert.equal(m.painted.length,0,'pixel fallback until SVG loads');
 assert.equal(m.images.length,1);
 assert.equal(m.images[0].src,'./assets/tiles/vector/O.svg?v121');
 m.images[0].onload();
 assert.equal(m.renderer.drawTile(m.g,12,20,20,20,'O'),true);
 assert.equal(m.canvases.length,1);
 assert.equal(m.canvases[0].width,40);
 assert.equal(m.canvases[0].height,40);
 assert.equal(m.canvases[0].calls.length,1,'SVG rasterized once');
 assert.equal(m.painted.length,1);
 m.renderer.drawTile(m.g,40,20,20,20,'O');
 assert.equal(m.canvases.length,1,'positions reuse the same raster');
 m.setDpr(3);
 m.renderer.drawTile(m.g,40,20,20,20,'O');
 assert.equal(m.canvases.length,2);
 assert.equal(m.canvases[1].width,60);
});

test('NEXT, HOLD and active piece all use the same vector renderer',()=>{
 const m=mock();
 const tiles=[{x:0,y:0,size:20},{x:20,y:0,size:20},{x:0,y:20,size:20},{x:20,y:20,size:20}];
 m.renderer.drawPiece(m.g,tiles,'O');
 assert.equal(m.images.length,1,'O shape has exactly one SVG image source');
 m.images[0].onload();
 m.renderer.drawPiece(m.g,tiles,'O');
 assert.equal(m.painted.length,4,'four cells use one decoded SVG');
 assert.equal(m.canvases.length,1,'four cells reuse one raster');
 m.renderer.drawPiece(m.g,tiles,'O');
 assert.equal(m.painted.length,8);
 assert.equal(m.canvases.length,1);
});

test('I-piece fragments preserve source offset, length and all four rotation directions',()=>{
 assert.equal(spriteIdentity('I',{sourceOffset:2,length:2,rotation:3}),'I:2:2:3');
 assert.throws(()=>spriteIdentity('I',{sourceOffset:3,length:2}),RangeError);
 const m=mock();
 m.renderer.drawIFragment(m.g,5,7,20,40,{sourceOffset:2,length:2,rotation:3});
 assert.equal(m.images.length,1);
 const src=m.images[0].src;
 assert.ok(src.startsWith('data:image/svg+xml;charset=utf-8,'));
 const xml=decodeURIComponent(src.split(',').slice(1).join(','));
 assert.match(xml,/data-source-offset="2"/);
 assert.match(xml,/data-source-length="2"/);
 assert.match(xml,/data-rotation="3"/);
 assert.match(xml,/viewBox="0 0 12 24"/);
 assert.match(xml,/rotate\(270\)/);
 m.images[0].onload();
 assert.equal(m.renderer.drawIFragment(m.g,5,7,20,40,{sourceOffset:2,length:2,rotation:3}),true);
 assert.equal(m.canvases[0].width,40);
 assert.equal(m.canvases[0].height,80);
});

test('each rotation preserves the exact original I-piece gravel artwork',()=>{
 for(let rotation=0;rotation<4;rotation++){
  const xml=renderIFragmentSVG({sourceOffset:1,length:2,rotation});
  assert.ok(xml.includes('data-rotation="'+rotation+'"'));
  assert.match(xml,rotation%2?/viewBox="0 0 12 24"/:/viewBox="0 0 24 12"/);
  assert.equal((xml.match(/<circle /g)||[]).length,
   (renderIFragmentSVG({sourceOffset:1,length:2,rotation:0}).match(/<circle /g)||[]).length);
 }
 assert.match(renderIFragmentSVG({orientation:'vertical'}),/rotate\(90\)/);
 assert.doesNotMatch(renderSmoothTileSVG('O'),/rx=|<image/);
});

test('the authored pixel renderer remains a functioning fallback for asset errors',()=>{
 const m=mock();
 assert.equal(m.renderer.drawTile(m.g,0,0,24,24,'S'),false);
 const im=m.images[0];im.onerror();
 assert.equal(m.renderer.drawTile(m.g,0,0,24,24,'S'),false);
 assert.equal(m.painted.length,0);
 assert.equal(m.redraws,1);
 m.renderer.dispose();
 assert.equal(m.renderer.imageCount,0);
 assert.equal(m.renderer.rasterCount,0);
 assert.equal(m.renderer.drawTile(m.g,0,0,24,24,'S'),false);
});

test('the live app uses vector art everywhere and owns its offline fallback',()=>{
 const js=readFileSync(new URL('../three-v027.js',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../three-v027.html',import.meta.url),'utf8');
 assert.match(js,/createVectorTileRenderer\(/);
 assert.match(js,/vectorTiles\.preload\(\)/);
 assert.match(js,/vectorTiles\.drawTile\(g,x,y,w,h,kind\)/);
 assert.match(js,/vectorTiles\.drawPiece\(g,fitPreviewCells\(/);
 assert.match(js,/vectorTiles\.drawIFragment\(g,offX\+run\.x\*tile,offY\+run\.y\*tile,/);
 assert.match(js,/vectorTiles\.drawPiece\(g,activeTiles,'I',\{rotation:p.rotation\}\)/);
 assert.match(js,/vectorTiles\.dispose\(\)/);
 assert.match(sw,/CACHE_VERSION='v121'/);
 for(const kind of VECTOR_PIECE_KINDS)
  assert.ok(sw.includes("'./assets/tiles/vector/"+kind+".svg'"));
 assert.match(sw,/'.\/assets\/tiles\/smooth-geometry\.mjs'/);
 assert.match(sw,/'.\/assets\/tiles\/gravel-layout\.mjs'/);
 assert.match(html,/name="tetris-build" content="121"/);
});
