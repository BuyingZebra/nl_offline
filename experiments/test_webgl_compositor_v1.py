#!/usr/bin/env python3
"""Fast browser smoke check for the isolated WebGL2 compositor, not Tetris release QA."""
from io import BytesIO
from pathlib import Path
import os
from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright

engine=os.environ.get("LAB_BROWSER","chromium")
out=Path("work/compositor-v1")
out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=getattr(p,engine).launch(headless=True,args=["--no-sandbox"] if engine=="chromium" else [])
    context=browser.new_context(viewport={"width":390,"height":844},device_scale_factor=2,is_mobile=True,has_touch=True)
    page=context.new_page()
    errors=[]
    page.on("pageerror",lambda e:errors.append(str(e)))
    page.goto("http://127.0.0.1:8765/experiments/tetris-webgl-compositor-v1.html",wait_until="networkidle",timeout=30000)
    page.wait_for_function("window.__compositorLab?.getState().webgl2===true",timeout=10000)
    def state():return page.evaluate("window.__compositorLab.getState()")
    def screenshot(label):
        data=page.locator("#screen").screenshot()
        (out/(engine+"-"+label+".png")).write_bytes(data)
        return Image.open(BytesIO(data)).convert("RGB")
    def diff(a,b):
        return round(float(ImageStat.Stat(ImageChops.difference(a,b)).mean[0]),3)
    s=state()
    assert s["pixelWidth"]>=380 and s["pixelHeight"]>=680,s
    assert s["menusDrawnIntoSource"],s
    assert s["order"]==["scanlines","glow","phosphor"],s
    assert all(name in s["programs"] for name in ["scanlines","extract","blur","combine","tint"]),s
    before=screenshot("pipeline")
    page.locator("#effectsOn").uncheck()
    page.wait_for_timeout(90)
    raw=screenshot("raw")
    print(engine,"full-screen effect difference",diff(before,raw))
    assert diff(before,raw)>2.0,"Compositor rendered no significant output"
    page.locator("#effectsOn").check()
    page.evaluate("window.__compositorLab.setOrder(['phosphor','glow','scanlines'])")
    page.wait_for_timeout(90)
    swapped=screenshot("reordered")
    print(engine,"reordered difference",diff(before,swapped))
    assert diff(before,swapped)>0.15,"Changing pass order did not affect pixels"
    page.evaluate("window.__compositorLab.openMenu()")
    page.wait_for_timeout(90)
    menu=screenshot("menu")
    print(engine,"menu difference",diff(swapped,menu))
    assert diff(swapped,menu)>1.5,"In-screen menu not visible"
    page.evaluate("window.__compositorLab.closeMenu();window.__compositorLab.start()")
    page.wait_for_timeout(90)
    assert state()["gameStatus"]=="playing",state()
    screenshot("playing")
    assert not errors,errors
    print(engine,"PASS source",s["sourceCanvasSize"],"GPU",s["pixelWidth"],s["pixelHeight"])
    browser.close()
