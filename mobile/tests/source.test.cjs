const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function read(name) { return fs.readFileSync(path.join(root, name), 'utf8'); }
function collect(directory) {
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry => {
    const p = path.join(directory,entry.name);
    return entry.isDirectory() ? collect(p) : /\.tsx?$/.test(entry.name) ? [p] : [];
  });
}
test('all TypeScript source compiles syntactically', () => {
  for (const file of collect(path.join(root,'src'))) {
    const r=ts.transpileModule(fs.readFileSync(file,'utf8'),{
      fileName:file, reportDiagnostics:true, compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}});
    const errors=(r.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error);
    assert.equal(errors.length,0,`${file}: ${errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')).join('; ')}`);
  }
});
test('map style uses actual vector layer types', () => {
  const src=read('src/map/createMapStyle.ts');
  for (const layer of ['building','transportation','transportation_name','water','place']) {
    assert.match(src,new RegExp(`'source-layer': '${layer}'`));
  }
});
test('offline test pack scope is intentionally bounded and under theoretical 3000 tile cap', () => {
  const src=read('src/core/offline/regions.ts');
  const m=src.match(/CARBONEAR_BOUNDS[^=]*=\s*\[([^\]]+)\]/);
  assert.ok(m,'offline test bounds missing');
  const [west,south,east,north]=m[1].split(',').map(Number);
  assert.ok(west<east && south<north);
  const y=(lat,z)=>{const rad=lat*Math.PI/180;return (1-Math.asinh(Math.tan(rad))/Math.PI)/2*Math.pow(2,z);};
  let tiles=0;
  for(let z=10;z<=16;z++){
    const countX=Math.floor((east+180)/360*2**z)-Math.floor((west+180)/360*2**z)+1;
    const countY=Math.floor(y(south,z))-Math.floor(y(north,z))+1;
    tiles+=countX*countY;
  }
  assert.ok(tiles<3000,`${tiles} tiles exceeds published cap`);
});
test('app config targets phones and declares location privacy purpose', () => {
  const app=JSON.parse(read('app.json')).expo;
  assert.equal(app.ios.supportsTablet,false);
  assert.ok(app.ios.infoPlist.NSLocationWhenInUseUsageDescription);
  assert.ok(app.plugins.some(p=>p==='@maplibre/maplibre-react-native'));
});
