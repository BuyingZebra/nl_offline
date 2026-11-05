/* NOMAD Tetris V087 — platform boundary regression tests.
 * Run with Node 22+: node --test tetris/tests/platform-manager.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlatformManager,measureDisplayViewport} from '../platform-manager.js';

function createHarness(){
 let bounds={width:393,height:852};
 const events={window:new Map(),document:new Map()};
 const metrics={observed:0,disconnected:0,intervals:[],cleared:[],fetches:[],reloads:0,viewports:[],visibility:[]};
 let observer;
 let currentTime=20000,gameStatus='ready',screenOpen=false;
 let response={ok:true,text:async()=>'<meta name="tetris-build" content="086">'};
 let fetchImpl=async()=>response;
 const display={getBoundingClientRect:()=>({...bounds})};
 const safeProbe={};
 const document={hidden:false,addEventListener:(k,fn)=>events.document.set(k,fn),
  removeEventListener:(k)=>events.document.delete(k)};
 const window={devicePixelRatio:3,getComputedStyle:()=>({
  paddingTop:'59px',paddingBottom:'34px',paddingLeft:'0px',paddingRight:'0px'
 }),addEventListener:(k,fn)=>events.window.set(k,fn),
 removeEventListener:(k)=>events.window.delete(k),
 ResizeObserver:class {
  constructor(fn){this.fn=fn;observer=this;}
  observe(el){assert.equal(el,display);metrics.observed++;}
  disconnect(){metrics.disconnected++;}
 },
 setInterval:(fn,delay)=>{metrics.intervals.push({fn,delay});return 7;},
 clearInterval:id=>metrics.cleared.push(id),
 fetch:async(url,options)=>{
  metrics.fetches.push({url:String(url),options});return fetchImpl(url,options);
 },
 location:{reload:()=>metrics.reloads++}
 };
 const platform=createPlatformManager({
  window,document,display,safeProbe,
  baseModuleURL:'https://buyingzebra.github.io/nl_offline/tetris/three-v027.js',
  buildVersion:'086',getGameStatus:()=>gameStatus,isScreenOpen:()=>screenOpen,
  onViewport:(metrics,forced)=>{h.metrics.viewports.push({metrics,forced});},
  onVisibility:hidden=>h.metrics.visibility.push(hidden),
  now:()=>currentTime
 });
 const h={platform,window,document,display,safeProbe,metrics,
  emit:(where,name)=>events[where].get(name)?.(),
  get events(){return events;},
  get observer(){return observer;},
  setBounds:b=>{bounds=b;},
  setTime:n=>{currentTime=n;},
  setStatus:s=>{gameStatus=s;},
  setScreenOpen:v=>{screenOpen=v;},
  setResponse:r=>{response=r;},
  setFetch:fn=>{fetchImpl=fn;}
 };
 return h;
}

test('viewport preserves the 2x render DPR cap and CSS pixel rounding',()=>{
 const el={getBoundingClientRect:()=>({width:393.3,height:851.7})};
 assert.deepEqual(measureDisplayViewport(el,3),{width:393,height:852,dpr:2});
 assert.deepEqual(measureDisplayViewport(el,1.5),{width:393,height:852,dpr:1.5});
 assert.deepEqual(measureDisplayViewport({getBoundingClientRect:()=>({width:0,height:0})},0),
  {width:1,height:1,dpr:1});
});

test('start observes viewport; unchanged resizes do not trigger extra work',()=>{
 const h=createHarness();
 assert.equal(h.platform.start(),true);
 assert.equal(h.platform.start(),false);
 assert.equal(h.metrics.observed,1);
 assert.deepEqual(h.metrics.viewports.map(v=>v.metrics),[{width:393,height:852,dpr:2}]);
 assert.equal(h.metrics.intervals[0].delay,60000);
 h.observer.fn();
 assert.equal(h.metrics.viewports.length,1);
 h.emit('window','orientationchange');
 assert.equal(h.metrics.viewports.length,2);
 assert.equal(h.metrics.viewports[1].forced,true);
 assert.equal(h.metrics.viewports[1].metrics.height,852);
});

test('size and DPR changes propagate, while safe-area measurements cache until resize',()=>{
 const h=createHarness();
 let reads=0,top='59px';
 h.window.getComputedStyle=()=>{reads++;return {paddingTop:top,paddingBottom:'34px',paddingLeft:'0px',paddingRight:'0px'};};
 h.platform.start();
 assert.equal(h.platform.safeInsets().top,59);
 top='66px';
 assert.equal(h.platform.safeInsets().top,59);
 assert.equal(reads,1);
 h.setBounds({width:430,height:900});
 h.observer.fn();
 assert.equal(h.platform.viewport.width,430);
 assert.equal(h.platform.safeInsets().top,66);
 assert.equal(reads,2);
 h.window.devicePixelRatio=1.5;
 h.observer.fn();
 assert.equal(h.platform.viewport.dpr,1.5);
 assert.equal(h.metrics.viewports.length,3);
});

test('visibility, page show, focus and orientation each have separate lifecycle hooks',()=>{
 const h=createHarness();h.platform.start();
 h.document.hidden=true;h.emit('document','visibilitychange');
 h.document.hidden=false;h.emit('document','visibilitychange');
 assert.deepEqual(h.metrics.visibility,[true,false]);
 assert.equal(h.events.window.has('pageshow'),true);
 assert.equal(h.events.window.has('focus'),true);
 assert.equal(h.events.window.has('orientationchange'),true);
});

test('a newer build reloads only after an uncached HTML fetch while idle',async()=>{
 const h=createHarness();h.platform.start();
 h.setResponse({ok:true,text:async()=>'<meta name="tetris-build" content="087">'});
 assert.equal(await h.platform.checkForNewBuild(),true);
 assert.equal(h.metrics.reloads,1);
 assert.equal(h.metrics.fetches.length,1);
 assert.equal(h.metrics.fetches[0].options.cache,'no-store');
 assert.match(h.metrics.fetches[0].url,/\/tetris\/three-v027\.html\?update-check=20000$/);
 assert.equal(await h.platform.checkForNewBuild(),false);
 assert.equal(h.metrics.fetches.length,1);
});

test('active play, pause, game over, open screen and background all block update checks',async()=>{
 const h=createHarness();h.platform.start();
 for(const status of ['playing','paused','over']){
  h.setStatus(status);
  assert.equal(await h.platform.checkForNewBuild(),false);
 }
 h.setStatus('ready');h.setScreenOpen(true);
 assert.equal(await h.platform.checkForNewBuild(),false);
 h.setScreenOpen(false);h.document.hidden=true;
 assert.equal(await h.platform.checkForNewBuild(),false);
 assert.equal(h.metrics.fetches.length,0);
});

test('a running game or open menu during network response prevents a late reload',async()=>{
 const h=createHarness();h.platform.start();
 h.setResponse({ok:true,text:async()=>{
  h.setStatus('playing');
  return '<meta name="tetris-build" content="087">';
 }});
 assert.equal(await h.platform.checkForNewBuild(),false);
 assert.equal(h.metrics.reloads,0);
 h.setStatus('ready');h.setTime(36000);
 h.setResponse({ok:true,text:async()=>{
  h.setScreenOpen(true);
  return '<meta name="tetris-build" content="088">';
 }});
 assert.equal(await h.platform.checkForNewBuild(),false);
 assert.equal(h.metrics.reloads,0);
});

test('unavailable, malformed, stale or offline updates cannot interrupt a game',async()=>{
 const h=createHarness();h.platform.start();
 for(const response of [
  {ok:false},
  {ok:true,text:async()=>'<html>missing build</html>'},
  {ok:true,text:async()=>'<meta name="tetris-build" content="085">'},
  {ok:true,text:async()=>'<meta name="tetris-build" content="086">'}
 ]){
  h.setResponse(response);
  assert.equal(await h.platform.checkForNewBuild(),false);
  h.setTime(h.metrics.fetches.length*16000+20000);
 }
 h.setFetch(async()=>{throw Error('offline');});
 assert.equal(await h.platform.checkForNewBuild(),false);
 assert.equal(h.metrics.reloads,0);
});

test('only one pending network check is active at a time',async()=>{
 const h=createHarness();h.platform.start();
 let finish;
 h.setFetch(()=>new Promise(resolve=>{finish=resolve;}));
 const first=h.platform.checkForNewBuild();
 assert.equal(await h.platform.checkForNewBuild(),false);
 assert.equal(h.metrics.fetches.length,1);
 finish({ok:true,text:async()=>'<meta name="tetris-build" content="086">'});
 await first;
 assert.equal(h.metrics.reloads,0);
});

test('stop unregisters listeners, disconnects observer and prevents late reloads',async()=>{
 const h=createHarness();h.platform.start();
 let finish;
 h.setFetch(()=>new Promise(resolve=>{finish=resolve;}));
 const pending=h.platform.checkForNewBuild();
 assert.equal(h.platform.stop(),true);
 assert.equal(h.platform.stop(),false);
 assert.equal(h.metrics.disconnected,1);
 assert.deepEqual(h.metrics.cleared,[7]);
 assert.equal(h.events.document.size,0);
 assert.equal(h.events.window.size,0);
 finish({ok:true,text:async()=>'<meta name="tetris-build" content="087">'});
 assert.equal(await pending,false);
 assert.equal(h.metrics.reloads,0);
});
