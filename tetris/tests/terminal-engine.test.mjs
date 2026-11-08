import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerminalEngine} from '../terminal-engine.js';

test('prompt and fixed cells accept characters without rewriting the prompt',()=>{
 const term=createTerminalEngine({columns:20});
 assert.equal(term.snapshot().cursor,2);
 term.feed('HELLO');
 assert.equal(term.snapshot().cells.slice(0,7).join(''),'> HELLO');
 assert.equal(term.snapshot().cursor,7);
});
test('CR rewinds output; BS overwrites; ANSI CSI K erases rightward',()=>{
 const term=createTerminalEngine({columns:20});
 term.feed('HELLO');
 term.feed('\rY');
 assert.equal(term.snapshot().cells.slice(0,7).join(''),'> YELLO');
 term.feed('\bZ\x1b[K');
 assert.equal(term.snapshot().cells.slice(0,7).join(''),'> Z    ');
});
test('CSI sequences can arrive across multiple chunks',()=>{
 const term=createTerminalEngine({columns:20});
 term.feed('HELLO');
 term.feed('\x1b[');
 term.feed('2');
 term.feed('K');
 assert.equal(term.snapshot().cells.join('').trim(),'>');
 assert.equal(term.snapshot().cursor,7,'erase line does not move terminal cursor');
 term.feed('\rNEXT');
 assert.equal(term.snapshot().cells.slice(0,6).join(''),'> NEXT');
});
test('LF commits one history line and clears only the active output row',()=>{
 const term=createTerminalEngine({columns:20});
 term.feed('OLD\nNEW');
 const out=term.snapshot();
 assert.equal(out.history,'> OLD');
 assert.equal(out.cells.slice(0,5).join(''),'> NEW');
 assert.equal(out.cursor,5);
});
test('responsive cell limit reserves the final block-cursor cell',()=>{
 const term=createTerminalEngine({columns:7});
 term.feed('123456789');
 assert.equal(term.snapshot().cursor,6);
 assert.equal(term.snapshot().cells.slice(0,6).join(''),'> 1234');
 term.setColumns(12);
 term.setHistory('> HISTORY LONG');
 assert.equal(term.snapshot().history,'> HISTORY L');
});
test('unsupported C0 controls do not render as printable characters',()=>{
 const term=createTerminalEngine({columns:20});
 term.feed('\x00\x01A\x7fB');
 assert.equal(term.snapshot().cells.slice(0,4).join(''),'> AB');
});
