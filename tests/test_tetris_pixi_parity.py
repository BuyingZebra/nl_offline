#!/usr/bin/env python3
"""GPU renderer migration: compare same live Tetris DOM against Pixi scene in one browser."""
import io
import os
from pathlib import Path
from PIL import Image,ImageChops,ImageStat
from playwright.sync_api import sync_playwright

engine=os.environ.get('FIELD_ATLAS_BROWSER','chromium')
evidence=Path('work/pixi-parity')
evidence.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=getattr(p,engine).launch(headless=True,args=(
        ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader',
         '--enable-unsafe-swiftshader'] if engine=='chromium' else []
    ))
    page=browser.new_page(viewport={'width':390,'height':844},
        device_scale_factor=2,is_mobile=True,has_touch=True)
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    url='http://127.0.0.1:8765/tetris/?renderer=pixi'
    page.on('console',lambda m: print(engine,'CONSOLE',m.type,m.text[:350]) if m.type=='error' else None)
    page.on('requestfailed',lambda r: print(engine,'FAILED RESOURCE',r.url))
    page.goto(url,wait_until='domcontentloaded',timeout=30000)
    page.wait_for_timeout(1200)
    print(engine,'INIT',page.evaluate("""() => ({
      pixiGlobal:typeof window.PIXI,renderer:typeof window.FieldAtlasPixiRenderer,
      rendererState:window.FieldAtlasPixiRenderer?.getState(),
      relevantScripts:[...document.scripts].map(s=>s.src).filter(s=>s.includes('pixi'))
    })"""),'ERRORS',errors)
    page.wait_for_function('() => window.FieldAtlasPixiRenderer?.getState().initialized===true',timeout=15000)
    page.add_style_tag(content='''#readyCursor,*{animation-duration:0s!important;transition-duration:0s!important}''')
    page.wait_for_timeout(900)
    def state():return page.evaluate('window.FieldAtlasPixiRenderer.getState()')
    def snap(label):
        file=evidence/(engine+'-'+label+'.png')
        return Image.open(io.BytesIO(page.locator('#app').screenshot())).convert('RGB')
    def diff(tag):
        page.evaluate('window.FieldAtlasPixiRenderer.disable()')
        page.wait_for_timeout(150)
        original=snap(tag+'-native')
        original.save(evidence/(engine+'-'+tag+'-native.png'))
        page.evaluate('window.FieldAtlasPixiRenderer.enable()')
        page.wait_for_timeout(450)
        converted=snap(tag+'-pixi')
        converted.save(evidence/(engine+'-'+tag+'-pixi.png'))
        dd=ImageChops.difference(original,converted)
        dd.save(evidence/(engine+'-'+tag+'-difference.png'))
        mae=round(sum(ImageStat.Stat(dd).mean)/3,3)
        changed=sum(any(pix) for pix in dd.getdata())/(original.width*original.height)
        print(engine,tag,'mean absolute RGB error',mae,'changed pixels',round(changed,4))
        return mae,changed
    print(engine,'state',state())
    assert state()['enabled'],state()
    assert state()['sourceCanvasCount']>=5,state()
    first=diff('ready')
    page.get_by_role('button',name='Display options').tap()
    page.wait_for_function("() => document.getElementById('options').open",timeout=5000)
    page.wait_for_timeout(250)
    settings=diff('settings')
    page.locator('#closeOptions').click()
    page.locator('#playButton').click()
    page.wait_for_function("() => document.getElementById('veil').classList.contains('hidden')",timeout=5000)
    page.wait_for_timeout(150)
    gameplay=diff('playing')
    assert not errors,errors
    print(engine,'READY',first,'SETTINGS',settings,'PLAYING',gameplay)
    browser.close()
