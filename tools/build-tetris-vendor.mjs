import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Pin the renderer and toolchain. The resulting offline bundle is checked in,
// so playing, testing and deploying Tetris require no npm install.
const threeVersion = '0.180.0';
const esbuildVersion = '0.28.2';
const destination = fileURLToPath(new URL('../tetris/vendor/three/three.bundle.js', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'nomad-three-'));

try {
  execFileSync('npm', [
    'install', '--prefix', directory, '--no-save', '--no-package-lock', '--no-audit', '--no-fund',
    'three@' + threeVersion, 'esbuild@' + esbuildVersion,
  ], {stdio: 'inherit'});
  const entry = join(directory, 'three-entry.mjs');
  writeFileSync(entry, `
export {
  CanvasTexture, Color, DoubleSide, LinearFilter, Mesh, MeshBasicMaterial,
  NearestFilter, NoBlending, NoColorSpace, NoToneMapping, OrthographicCamera,
  PlaneGeometry, RepeatWrapping, RGBAFormat, Scene, ShaderMaterial, SRGBColorSpace,
  UnsignedByteType, Vector2, Vector3, Vector4, WebGLRenderer, WebGLRenderTarget,
} from 'three';
export {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
export {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
export {FullScreenQuad, Pass} from 'three/addons/postprocessing/Pass.js';
export {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
export {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
export {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
`);
  execFileSync(join(directory, 'node_modules', 'esbuild', 'bin', 'esbuild'), [
    entry, '--bundle', '--format=esm', '--minify', '--legal-comments=inline',
    '--banner:js=/* Three.js r180 (MIT), bundled for NOMAD Tetris. See LICENSE.txt. */',
    '--outfile=' + destination,
  ], {stdio: 'inherit'});
} finally {
  rmSync(directory, {recursive: true, force: true});
}
