import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function domElement(context2d, noop) {
  return {
    value: '', textContent: '', className: '', disabled: false, hidden: false, dataset: {}, children: [],
    style: { setProperty: noop },
    classList: { add: noop, remove: noop, toggle: noop },
    replaceChildren(...items) { this.children = [...items]; },
    appendChild(item) { this.children.push(item); return item; },
    getContext: () => context2d,
  };
}

export function createRuntime({ addresses = false } = {}) {
  const noop = () => {};
  const context2d = new Proxy({ measureText: text => ({ width: String(text).length * 6 }) }, {
    get: (target, property) => property in target ? target[property] : noop,
    set: (target, property, value) => { target[property] = value; return true; },
  });
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, domElement(context2d, noop));
      return elements.get(id);
    },
    createElement: () => domElement(context2d, noop),
    body: domElement(context2d, noop),
  };
  let sandbox = {
    document, atob, Uint8Array, Uint16Array, Int32Array, Float64Array, DataView,
    Map, Set, Math, Infinity, JSON, String, Array, Object, Number, isFinite, console,
  };
  sandbox.window = sandbox;
  sandbox = vm.createContext(sandbox);
  const run = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });

  run('data.js'); run('ferry.js');
  for (let i = 0; i < 13; i++) run(`roadmeta-part-${String(i).padStart(2, '0')}.js`);
  run('roadmeta.js');
  if (addresses) {
    for (let i = 0; i < 34; i++) run(`addressmeta-part-${String(i).padStart(2, '0')}.js`);
    run('addressmeta.js');
  }
  run('core.js');
  if (addresses) run('addresses.js');
  run('routing.js'); run('route-path.js'); run('guidance.js');
  return sandbox;
}

export function evaluate(sandbox, source) {
  return vm.runInContext(source, sandbox);
}
