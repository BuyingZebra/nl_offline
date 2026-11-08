import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pieceShadowOccupancy,drawPieceShadowGradients} from '../piece-drop-shadow.js';

const board=()=>Array.from({length:20},()=>Array(10).fill(null));
function mockCanvas(){
 const linear=[],radial=[],rects=[];
 const ctx={
  createLinearGradient(...coords){
   const g={coords,stops:[],addColorStop(pos,color){this.stops.push([pos,color]);}};
   linear.push(g);return g;
  },
  createRadialGradient(...coords){
   const g={coords,stops:[],addColorStop(pos,color){this.stops.push([pos,color]);}};
   radial.push(g);return g;
  },
  fillRect(...coords){rects.push({coords,style:this.fillStyle});}
 };
 return {ctx,linear,radial,rects};
}

test('locked and falling pieces contribute to one clipped shadow silhouette',()=>{
 const b=board();
 b[9][3]='T';b[9][4]='T';b[9][5]='T';b[8][4]='T';
 const active={x:8,y:-1,matrix:[['I',null],[null,'I'],['I','I']]};
 const cells=pieceShadowOccupancy(b,active,new Set([9]));
 assert.equal(cells.length,20);
 assert.equal(cells[0].length,10);
 assert.equal(cells[9][3],false,'flashing row does not leave a shadow');
 assert.equal(cells[8][4],true);
 assert.equal(cells[0][8],false);
 assert.equal(cells[0][9],true);
 assert.equal(cells[1][8],true);
 assert.equal(cells[1][9],true);
 assert.equal(cells.flat().filter(Boolean).length,4);
});
test('2x2 tetromino shadows ONLY outer edges, with inset-matched gradients',()=>{
 const b=board();for(let y=6;y<=7;y++)for(let x=3;x<=4;x++)b[y][x]='O';
 const {ctx,linear,radial,rects}=mockCanvas();
 drawPieceShadowGradients(ctx,pieceShadowOccupancy(b),10,20,20);
 assert.equal(linear.length,4,'four coalesced perimeter edges; no internal seams');
 assert.equal(radial.length,4,'four smooth exposed corners');
 assert.equal(rects.length,8);
 // Exact board inset falloff distance at a 20px tile is 16px.
 const [top,bottom,left,right]=linear;
 assert.deepEqual(top.coords,[70,140,70,124]);
 assert.deepEqual(bottom.coords,[70,180,70,196]);
 assert.deepEqual(left.coords,[70,140,54,140]);
 assert.deepEqual(right.coords,[110,140,126,140]);
 assert.deepEqual(linear.map(g=>g.stops),[
  [[0,'rgba(0,0,0,0.24)'],[1,'rgba(0,0,0,0)']],
  [[0,'rgba(0,0,0,0.58)'],[1,'rgba(0,0,0,0)']],
  [[0,'rgba(0,0,0,0.24)'],[1,'rgba(0,0,0,0)']],
  [[0,'rgba(0,0,0,0.42)'],[1,'rgba(0,0,0,0)']]
 ]);
 assert.equal(radial.at(-1).stops[0][1],'rgba(0,0,0,0.58)');
});
test('shadow length is clamped to the same 8–20px range as board inset',()=>{
 const b=board();b[5][5]='T';
 for(const [tile,expected] of [[5,8],[20,16],[40,20]]){
  const {ctx,linear}=mockCanvas();
  drawPieceShadowGradients(ctx,pieceShadowOccupancy(b),0,0,tile);
  const bottom=linear.find(g=>g.stops[0][1]==='rgba(0,0,0,0.58)');
  assert.ok(bottom);
  assert.equal(bottom.coords[3]-bottom.coords[1],expected);
 }
});
test('grid is shaded after stroke and BEFORE artwork; older blur shadow removed',()=>{
 const renderer=fs.readFileSync(new URL('../three-v027.js',import.meta.url),'utf8');
 const part=renderer.slice(renderer.indexOf('function stage('),
  renderer.indexOf('function drawSharpBoardInsetShadow('));
 const grid=part.indexOf('g.stroke();g.globalAlpha=1;');
 const shade=part.indexOf('drawPieceShadowGradients(g,shadowCells,offX,offY,tile);');
 const faces=part.indexOf('displayBoard.forEach((row,ry)=>row.forEach((kind,rx)=>{',shade);
 assert.ok(grid>=0&&shade>grid&&faces>shade);
 assert.doesNotMatch(part,/g\.shadowBlur=5\.5|g\.shadowOffsetY=4\.5/);
 assert.match(renderer,/piece-shadow\.js|piece-drop-shadow\.js/);
});
