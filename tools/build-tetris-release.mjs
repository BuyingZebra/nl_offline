import {readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../tetris/', import.meta.url));
const shellPath = join(root, 'three-v027.html');
const workerPath = join(root, 'sw.js');
const shell = readFileSync(shellPath, 'utf8');
const worker = readFileSync(workerPath, 'utf8');
const marker = /(<meta name="tetris-build" content=")(\d{3})(">)/;
const versionLine = /const CACHE_VERSION='v\d{3}';/;
const assetBlock = /const CORE_ASSETS=Object\.freeze\(\[[\s\S]*?\n\]\);/;
const current = shell.match(marker)?.[2];
const command = process.argv[2] ?? '--check';
const build = command === '--check' ? current : command;
if (!current || !/^\d{3}$/.test(build) || !versionLine.test(worker) || !assetBlock.test(worker)) {
  throw Error('Expected a valid release shell and worker. Usage: node tools/build-tetris-release.mjs [175|--check]');
}

function files(directory, pattern, recursive = false) {
  return readdirSync(join(root, directory), {withFileTypes: true}).flatMap(entry => {
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory() && recursive) return files(path, pattern, true);
    return entry.isFile() && pattern.test(entry.name) ? [path] : [];
  });
}

// Only runtime files enter the offline package. The asset comparison page,
// tests and pixel preview tiles are source material for development.
const assets = ['./', ...[
  'index.html', 'three-v027.html', 'manifest.webmanifest',
  ...files('', /^(?!sw\.js$)[^.]+\.(?:js|png|svg)$/),
  ...files('assets/frames', /\.mjs$/),
  'assets/frames/vector/brick.svg',
  ...files('assets/tiles', /\.mjs$/),
  ...files('assets/tiles/vector', /\.svg$/),
  ...files('vendor/three', /\.js$/, true),
].sort().map(path => `./${path}`)];
// Critical runtime imports are versioned from one release generator. The
// worker also verifies the version links from the staged network responses.
const pinnedImports = [
 ['three-v027.js',['platform.js']],
 ['platform.js',['input.js','render.js']],
 ['input.js',['render.js']],
 ['render.js',['diagnostics.js']]
];
const updatedModules = pinnedImports.map(([module,dependencies]) => {
 const file = join(root,module);
 const original = readFileSync(file,'utf8');
 let updated = original;
 for(const dependency of dependencies){
  const re=new RegExp('(\\./'+dependency.replaceAll('.','\\.')+'\\?v)\\d{3}','g');
  if(!re.test(updated))throw Error('Missing pinned import: '+module+' -> '+dependency);
  updated=updated.replace(re,(_,prefix)=>prefix+build);
 }
 return {file,original,updated};
});
const generated = `const CORE_ASSETS=Object.freeze([\n${assets.map(path => ` '${path}',`).join('\n')}\n]);`;
const nextWorker = worker
  .replace(/^(\/\* NOMAD Tetris V)\d{3}/, (_, prefix) => prefix + build)
  .replace(versionLine, `const CACHE_VERSION='v${build}';`)
  .replace(assetBlock, generated);
if (command === '--check') {
  if (nextWorker !== worker) throw Error('Offline manifest is stale. Run the release generator with the build number.');
  for(const {file,original,updated} of updatedModules)
   if(updated!==original)throw Error('Module version is stale: '+file);
} else {
  writeFileSync(shellPath, shell.replace(marker, (_, prefix, previous, suffix) => prefix + build + suffix));
  for(const {file,updated} of updatedModules)writeFileSync(file,updated);
  writeFileSync(workerPath, nextWorker);
}
