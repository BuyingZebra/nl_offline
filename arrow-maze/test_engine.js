'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const g=require('./generator.js');
const hashes=new Set();
let count=0,arrows=0;
function check(level,seed,randomPlay){
  const pcs=g.generate(level,seed),spec=g.difficulty(level);
  assert.equal(pcs.length,spec.count);
  assert.equal(g.solveBoard(pcs).ok,true);
  assert(pcs.every(g.validArrowGeometry));
  assert.deepEqual(g.generate(level,seed),pcs);
  const fp=crypto.createHash('sha256').update(JSON.stringify(pcs)).digest('hex');
  assert(!hashes.has(fp),'duplicate puzzle');hashes.add(fp);
  let occupied=new Set();
  for(const p of pcs)for(const pt of p.points){const k=pt.join(',');assert(!occupied.has(k));occupied.add(k);}
  const metrics=g.analyzeBoard(pcs);
  assert.equal(metrics.arrows,pcs.length);
  assert(metrics.initialChoices>0 && metrics.longestDependencyChain<=pcs.length);
  if(randomPlay){
    let pending=pcs.slice(),salt=(seed^Math.imul(level,12833))>>>0;
    while(pending.length){
      const options=pending.filter(p=>g.canEscape(p,g.occupiedOf(pending.filter(q=>q!==p))));
      assert(options.length>0,'deadlock');
      salt=(Math.imul(salt,1664525)+1013904223)>>>0;
      pending=pending.filter(p=>p!==options[salt%options.length]);
      if(pending.length&&pending.length%7===0)assert(g.solveBoard(pending).ok);
    }
  }
  count++;arrows+=pcs.length;
}
for(let level=1;level<=1000;level++){
  check(level,0x95A3B11F,true);
  check(level,(Math.imul(level,2654435761)^0xA8E15729)>>>0,level%7===0);
}
for(let i=0;i<300;i++)check([11,15,43,47,100,1000][i%6],Math.imul(i+1,334214467)>>>0,i%6===0);
check(11,parseInt('1HSNS6X',36),true);
check(15,parseInt('UUZ8JY',36),true);
const p=g.generate(43,0x123);
const a=JSON.parse(JSON.stringify(p));a[0].points.push(a[0].points[0]);assert(!g.solveBoard(a).ok);
const b=JSON.parse(JSON.stringify(p));b[1].points[0]=b[0].points[0];assert(!g.solveBoard(b).ok);
console.log('PASS: '+count+' unique boards; '+arrows+' validated arrow paths');
