import test from 'node:test';
import assert from 'node:assert/strict';
import {PanelPhysics,PIXELS,LCD_W,LCD_H} from './model.js';
import {TARGET_Q,OPTICAL_LUT,DRIFT_Q,PALETTE} from './physics-data.js';

test('historical panel geometry and data are present',()=>{
 assert.equal(LCD_W,160);assert.equal(LCD_H,144);assert.equal(PIXELS,23040);
 assert.equal(TARGET_Q.length,4);assert.equal(DRIFT_Q.length,4*65);
 assert.equal(OPTICAL_LUT.length,65);assert.equal(PALETTE.length,5);
});

test('nominal four logical drive levels have increasing optical darkness state',()=>{
 const p=new PanelPhysics();const levels=[];
 for(let shade=0;shade<4;shade++){
  p.setPicture(new Uint8Array(PIXELS).fill(shade));p.reset();
  levels.push(p.getImage()[0]);
 }
 assert.deepEqual(levels,[64,128,191,255]);
});

test('darkening and clearing are stateful, not an image-space blur',()=>{
 const p=new PanelPhysics(),fixture=new Uint8Array(PIXELS),spot=83+51*LCD_W;
 fixture[spot]=3;p.setPicture(fixture);
 const old=p.getImage()[spot];p.step(1/60);
 const first=p.getImage()[spot];
 assert.ok(first>old&&first<255,'dark segment transitions gradually');
 for(let k=0;k<20;k++)p.step(1/60);
 const dark=p.getImage()[spot];assert.ok(dark>=250,'settles dark');
 fixture[spot]=0;p.setPicture(fixture);p.step(1/60);
 const leaving=p.getImage()[spot];
 assert.ok(leaving<dark&&leaving>64,'previous dark transmission is retained');
 for(let k=0;k<45;k++)p.step(1/60);
 assert.ok(p.getImage()[spot]<=65,'returns to light');
 assert.equal(p.getImage()[spot+1],64,'unchanged neighbour remains independent');
});

test('cell state remains bounded at cold and warm temperatures',()=>{
 const p=new PanelPhysics();const shades=new Uint8Array(PIXELS);
 for(let k=0;k<PIXELS;k++)shades[k]=k%4;
 p.setPicture(shades);p.reset();
 for(let k=0;k<10;k++)p.step(1/60,{temperature:k%2?5:40});
 const result=p.getImage();
 assert.equal(result.length,PIXELS);
 for(const v of result)assert.ok(v>=64&&v<=255,'bound optical output');
});
