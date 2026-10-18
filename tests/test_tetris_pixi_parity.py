#!/usr/bin/env python3
"""Compare fresh native and Pixi pages without toggling browser compositing mid-dialog."""
import io
import os
from pathlib import Path
from PIL import Image,ImageChops,ImageStat
from playwright.sync_api import sync_playwright

engine=os.environ.get('FIELD_ATLAS_BROWSER','chromium')
evidence=Path('work/pixi-parity')
evidence.mkdir(parents=True,exist_ok=True)
cases={}
with sync_playwright() as p:
    browser=getattr(p,engine).launch(headless=True,args=(
        ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader',
         '--enable-unsafe-swiftshader'] if engine=='chromium' else []
    ))
    for mode in ['dom','pixi']:
        page=browser.new_page(viewport={'width':390,'height':844},
            device_scale_factor=2,is_mobile=True,has_touch=True)
        errors=[]
        page.on('pageerror',lambda e: errors.append(str(e)))
        page.add_init_script("""(() => {let seed=42;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);})();""")
        page.goto(f'http://127.0.0.1:8765/tetris/?renderer={mode}',
            wait_until='domcontentloaded',timeout=30000)
        if mode=='pixi':
            page.wait_for_function(
                '() => window.FieldAtlasPixiRenderer?.getState().initialized===true',
                timeout=20000)
            assert page.evaluate("window.FieldAtlasPixiRenderer.getState().enabled")
        page.add_style_tag(content='''*,*::before,*::after{
            animation-duration:0s!important;transition-duration:0s!important;
            }''')
        page.wait_for_timeout(350 if mode=='dom' else 700)
        def capture(label):
            img=Image.open(io.BytesIO(page.locator('#app').screenshot())).convert('RGB')
            img.save(evidence/(engine+'-'+label+'-'+mode+'.png'))
            cases[(mode,label)]=img
        capture('ready')
        page.locator('#optionsButton').tap()
        page.wait_for_function("() => document.getElementById('options').open",timeout=8000)
        page.wait_for_timeout(500 if mode=='dom' else 850)
        capture('settings')
        page.locator('#closeOptions').tap()
        page.locator('#playButton').tap()
        page.wait_for_function("() => document.getElementById('veil').classList.contains('hidden')",timeout=8000)
        page.wait_for_timeout(200 if mode=='dom' else 350)
        capture('playing')
        print(engine,mode,'DOM geometry',
            page.evaluate("""() => ['app','boardShell','controlDeck'].map(id=>{
              let r=document.getElementById(id).getBoundingClientRect();
              return [id,Math.round(r.width),Math.round(r.height)];})"""))
        if mode=='pixi':
            print(engine,'Pixi scene',page.evaluate('window.FieldAtlasPixiRenderer.getState()'))
        assert not errors,(mode,errors)
        page.close()
    for label in ['ready','settings','playing']:
        native=cases[('dom',label)]
        pixi=cases[('pixi',label)]
        assert native.size==pixi.size,(label,native.size,pixi.size)
        image=ImageChops.difference(native,pixi)
        image.save(evidence/(engine+'-'+label+'-difference.png'))
        mae=round(sum(ImageStat.Stat(image).mean)/3,3)
        different=sum(1 for rgb in image.getdata() if max(rgb)>8)/(image.width*image.height)
        print(engine,label,'MAE',mae,'fraction with per-channel difference > 8',round(different,5))
        if label=='settings':
            native.thumbnail((390,844));pixi.thumbnail((390,844))
            import base64
            for kind,img in [('dom',native),('pixi',pixi)]:
                buff=io.BytesIO();img.save(buff,format='PNG',optimize=True)
                print('PIXIVIEW:'+kind+':'+base64.b64encode(buff.getvalue()).decode())
    browser.close()
