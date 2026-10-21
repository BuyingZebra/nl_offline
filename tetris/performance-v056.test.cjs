/* Tetris System V057 — mobile fill-rate and Gaussian weight regressions.
 * Run: node --test tetris/*.test.cjs
 */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const main=fs.readFileSync(path.join(__dirname,'three-v027.js'),'utf8');
const compositor=fs.readFileSync(path.join(__dirname,'compositor.js'),'utf8');
const report=fs.readFileSync(path.join(__dirname,'debug-report.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'three-v027.html'),'utf8');

test('retina render cap reduces iPhone 3x fill by 56%, while keeping CSS layout',()=>{
 assert.ok(main.includes('const MAX_RENDER_DPR=2;'));
 assert.ok(main.includes('Math.min(MAX_RENDER_DPR,Math.max(1,window.devicePixelRatio||1))'));
 assert.ok(main.includes('input.width=Math.round(W*DPR)'));
 assert.ok(main.includes('boardPopupCanvas.width=input.width'));
 assert.ok(main.includes('renderer.setPixelRatio(DPR);renderer.setSize(W,H,false)'));
 assert.ok(main.includes('compositor.resize(W,H,DPR)'));
 const before=(393*3)*(852*3),after=(393*2)*(852*2);
 assert.equal(before,3013524);
 assert.equal(after,1339344);
 assert.ok((before-after)/before>.55);
});
test('low-density phones preserve their original DPR',()=>{
 const effective=dpr=>Math.min(2,Math.max(1,dpr));
 assert.equal(effective(1),1);
 assert.equal(effective(1.5),1.5);
 assert.equal(effective(2),2);
 assert.equal(effective(3),2);
 assert.equal(effective(4),2);
});
test('edge blur retains 7x7 Gaussian footprint, radius, falloff and blending',()=>{
 const a=compositor.indexOf(' // Lens blur:');
 const b=compositor.indexOf(' edgeSoftness.enabled=false;',a);
 const source=compositor.slice(a,b);
 assert.ok(source.includes('for(int y=-3;y<=3;y++)'));
 assert.ok(source.includes('for(int x=-3;x<=3;x++)'));
 assert.ok(source.includes('float weight=gaussianWeight(x)*wy;'));
 assert.ok(source.includes('float amount=clamp(uAmount*(1.0-smoothstep'));
 assert.ok(source.includes('gl_FragColor=mix(sharp,sum/max(.001,weights),amount)'));
 assert.ok(!source.includes('exp('+'-dot(offset'));
});
test('precomputed blur weights numerically match the original Gaussian kernel',()=>{
 const sigma=1.25;
 const weights={0:1,1:.7261490371,2:.2780373005,3:.0561347628};
 let oldSum=0,newSum=0,maximumDiff=0;
 for(let y=-3;y<=3;y++)for(let x=-3;x<=3;x++){
  const original=Math.exp(-(x*x+y*y)/(2*sigma*sigma));
  const optimized=weights[Math.abs(x)]*weights[Math.abs(y)];
  oldSum+=original;newSum+=optimized;
  maximumDiff=Math.max(maximumDiff,Math.abs(original-optimized));
 }
 assert.ok(maximumDiff<1e-9,maximumDiff.toString());
 assert.ok(Math.abs(oldSum-newSum)<1e-8);
});
test('full-screen textured plane avoids unnecessary multisampled backbuffer',()=>{
 assert.ok(main.includes('antialias:false,alpha:false,powerPreference'));
 assert.ok(main.includes('const surface=new THREE.Mesh(new THREE.PlaneGeometry(2,2)'));
 assert.ok(main.includes('renderer.outputColorSpace=THREE.SRGBColorSpace'));
});
test('debug report differentiates physical phone pixels from render density',()=>{
 assert.ok(main.includes('deviceDpr:Math.max(1,window.devicePixelRatio||1)'));
 assert.ok(report.includes("'render DPR '+viewport.dpr"));
 assert.ok(report.includes("'device DPR '+value(viewport.deviceDpr)"));
});
test('visual-effect controls, compositor order and stable URL are retained',()=>{
 assert.ok(main.includes('const DEFAULT=Object.freeze({phosphor:true,bloom:true,bloomStrength:.30,'));
 assert.ok(main.includes("scanlines:true,scanlinePreset:'original',scanlineOpacity:20"));
 assert.ok(main.includes("from './compositor.js?v056'"));
 assert.ok(main.includes("from './perf-monitor.js?v057'"));
 assert.ok(main.includes("const THREE_BUILD_VERSION='057'"));
 assert.ok(html.includes('Tetris System V057'));
 assert.ok(main.includes("key('',debugX,headerButtonY,q.buttonH,q.buttonH,'copyDebug')"));
 assert.ok(compositor.includes('composer.addPass(new OutputPass())'));
});
