#!/usr/bin/env python3
"""Single-renderer Tetris migration smoke — browser UI, gameplay, shader and storage."""
import os
from pathlib import Path
from PIL import Image
import io,base64
from playwright.sync_api import sync_playwright

browser_name=os.environ.get('FIELD_ATLAS_BROWSER','chromium')
output=Path('work/tetris-pixi-v028')
output.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    opts=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] if browser_name=='chromium' else []
    browser=getattr(p,browser_name).launch(headless=True,args=opts)
    page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
    exceptions=[]
    page.on('pageerror',lambda e:exceptions.append(str(e)))
    page.on('console',lambda m:print('CONSOLE',m.type,m.text[:500]) if m.type=='error' else None)
    page.goto('http://127.0.0.1:8765/tetris/pixi.html',wait_until='domcontentloaded',timeout=30000)
    page.wait_for_function('() => !!window.FieldAtlasTetris',timeout=25000)
    page.wait_for_timeout(1400)
    state=lambda:page.evaluate('window.FieldAtlasTetris.getState()')
    print(browser_name,'READY STATE',state())
    print(browser_name,'SCENE DIAG',page.evaluate('window.FieldAtlasTetris.debugStage()'))
    page.evaluate('window.FieldAtlasTetris.debugForceRender()')
    assert state()['renderer']=='PixiJS'
    assert state()['luminanceOnly'] is True
    assert state()['gameStatus']=='ready'
    assert page.locator('canvas').count()==1
    assert page.locator('#board').count()==0
    assert not page.locator('#fatal').is_visible()
    assert not exceptions,exceptions
    assert not state()['errors'],state()['errors']
    page.screenshot(path=str(output/(browser_name+'-ready.png')))
    if browser_name=='webkit':
        page.evaluate('window.FieldAtlasTetris.debugBypassEffects(true)')
        page.wait_for_timeout(200)
        page.screenshot(path=str(output/(browser_name+'-raw.png')))
        page.evaluate('window.FieldAtlasTetris.debugBypassEffects(false)')

    page.evaluate("window.FieldAtlasTetris.action('start')")
    page.wait_for_timeout(160)
    assert state()['gameStatus']=='playing',state()
    page.evaluate("window.FieldAtlasTetris.action('hard')")
    assert state()['pieces']>=1
    page.evaluate("window.FieldAtlasTetris.action('pause')")
    assert state()['gameStatus']=='paused'
    page.screenshot(path=str(output/(browser_name+'-paused.png')))
    page.evaluate("window.FieldAtlasTetris.openModal('options')")
    assert state()['mode']=='options'
    page.wait_for_timeout(850)
    print(browser_name,'MODAL DIAG',page.evaluate('window.FieldAtlasTetris.debugModal()'))
    page.screenshot(path=str(output/(browser_name+'-options.png')))
    if browser_name=='webkit':
        page.evaluate('window.FieldAtlasTetris.debugBypassEffects(true)')
        page.wait_for_timeout(350)
        page.screenshot(path=str(output/(browser_name+'-raw-options.png')))
        page.evaluate('window.FieldAtlasTetris.debugBypassEffects(false)')
    if browser_name=='webkit':
        for label in ['ready','raw','options','raw-options']:
            img=Image.open(output/(browser_name+'-'+label+'.png')).convert('RGB')
            img.thumbnail((390,844))
            data=io.BytesIO();img.save(data,format='JPEG',quality=73)
            print('SCREENSHOT:'+label+':'+base64.b64encode(data.getvalue()).decode())
    page.evaluate("window.FieldAtlasTetris.closeModal()")
    page.evaluate("window.FieldAtlasTetris.openModal('scores')")
    assert state()['mode']=='scores'
    page.screenshot(path=str(output/(browser_name+'-scores.png')))
    page.evaluate("window.FieldAtlasTetris.closeModal()")
    page.evaluate("window.FieldAtlasTetris.openModal('restart')")
    assert state()['mode']=='restart'
    page.evaluate("window.FieldAtlasTetris.closeModal()")
    page.set_viewport_size({'width':844,'height':390})
    page.wait_for_timeout(350)
    assert state()['width']==844 and state()['height']==390,state()
    page.screenshot(path=str(output/(browser_name+'-landscape.png')))
    assert not exceptions,exceptions
    assert not state()['errors'],state()['errors']
    print(browser_name,'PASS unified renderer, preserved engine, screen shaders, menus and orientation')
    browser.close()
