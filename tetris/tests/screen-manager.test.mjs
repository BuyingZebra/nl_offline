/* NOMAD Tetris V086: pure screen-state and navigation behaviour tests.
 * Run with Node 22+: node --test tetris/tests/screen-manager.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createScreenManager,SCREENS} from '../screen-manager.js';

function harness(initial='ready'){
 let status=initial,pauses=0;
 const transitions=[];
 const screens=createScreenManager({
  getGameStatus:()=>status,
  pauseGame:()=>{pauses++;status='paused';return true;},
  onChange:(from,to)=>transitions.push({from,to,gameStatus:status})
 });
 return {
  screens,transitions,
  get status(){return status;},set status(next){status=next;},
  get pauses(){return pauses;}
 };
}

test('starts on gameplay screen without opening a modal',()=>{
 const {screens}=harness();
 assert.equal(screens.screen,SCREENS.GAME);
 assert.equal(screens.active,null);
 assert.equal(screens.hasModal,false);
 assert.equal(screens.isOptions,false);
 assert.equal(screens.isScores,false);
 assert.equal(screens.paintsModalLayer,false);
});

test('opening Display System pauses active gameplay before the UI transition',()=>{
 const h=harness('playing');
 assert.equal(h.screens.openOptions(),true);
 assert.equal(h.status,'paused');
 assert.equal(h.pauses,1);
 assert.deepEqual(h.transitions,[{from:null,to:'options',gameStatus:'paused'}]);
 assert.equal(h.screens.active,SCREENS.OPTIONS);
 assert.equal(h.screens.paintsModalLayer,true);
});

test('high scores pause active gameplay but continue painting into the board popup',()=>{
 const h=harness('playing');
 h.screens.openScores();
 assert.equal(h.status,'paused');
 assert.equal(h.pauses,1);
 assert.equal(h.screens.isScores,true);
 assert.equal(h.screens.paintsModalLayer,false);
 assert.deepEqual(h.transitions,[{from:null,to:'scores',gameStatus:'paused'}]);
});

test('opening settings or high scores from ready/paused/over does not pause',()=>{
 for(const status of ['ready','paused','over']){
  const h=harness(status);
  h.screens.openOptions();
  h.screens.close();
  h.screens.openScores();
  assert.equal(h.pauses,0);
  assert.equal(h.status,status);
 }
});

test('restart uses the paused board action without opening a modal',()=>{
 const {screens}=harness('paused');
 assert.equal(screens.screen,SCREENS.GAME);
 assert.equal(screens.requestRestart,undefined);
 assert.equal(SCREENS.RESTART,undefined);
 assert.equal(screens.paintsModalLayer,false);
});

test('there is no initials-entry modal; one personal record uses the existing board overlay',()=>{
 const h=harness('over');
 assert.equal(SCREENS.ENTRY,undefined);
 assert.equal(h.screens.openHighScoreEntry,undefined);
 h.screens.openScores();
 assert.equal(h.screens.active,SCREENS.SCORES);
 assert.equal(h.pauses,0);
 assert.deepEqual(h.transitions.map(x=>[x.from,x.to]),[[null,'scores']]);
});
test('closing always returns to the existing gameplay status and clears overlay state',()=>{
 const h=harness('playing');
 h.screens.openOptions();
 assert.equal(h.screens.close(),true);
 assert.equal(h.screens.screen,SCREENS.GAME);
 assert.equal(h.screens.active,null);
 assert.equal(h.screens.hasModal,false);
 assert.equal(h.status,'paused'); // Same as old V085: never auto-resume.
 assert.deepEqual(h.transitions.at(-1),{from:'options',to:null,gameStatus:'paused'});
});

test('reopening the same screen reissues UI-reset callback',()=>{
 const h=harness('paused');
 h.screens.openOptions();
 h.screens.openOptions();
 assert.deepEqual(h.transitions.map(x=>[x.from,x.to]),[
  [null,'options'],['options','options']
 ]);
 assert.equal(h.pauses,0);
});

test('Screen Manager has no render or gameplay state ownership',()=>{
 const h=harness('ready');
 assert.equal(Object.isFrozen(h.screens),true);
 assert.equal(h.screens.screen,SCREENS.GAME);
 assert.equal('board' in h.screens,false);
 assert.equal('renderer' in h.screens,false);
 assert.equal('game' in h.screens,false);
});
