#!/usr/bin/env python3
"""Opt-in technical browser smoke for current NOMAD Tetris (no terminal assumptions)."""
import os
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

browser_name = os.environ.get("FIELD_ATLAS_BROWSER", "chromium")
out = Path("work/browser-test")
out.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    flags = (["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader",
              "--enable-unsafe-swiftshader"] if browser_name == "chromium" else [])
    browser = getattr(p, browser_name).launch(headless=True, args=flags)
    page = browser.new_page(viewport={"width": 393, "height": 852},
                            device_scale_factor=2, is_mobile=True, has_touch=True)
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))

    page.goto("http://127.0.0.1:8765/tetris/", wait_until="domcontentloaded")
    page.wait_for_url("**/tetris/three-v027.html", timeout=15000)
    page.wait_for_function(
        "() => { const c=document.querySelector('#screen');"
        " return !!c && c.width >= 300 && c.height >= 700; }",
        timeout=30000,
    )
    page.wait_for_timeout(900)
    assert page.locator("#error").is_hidden(), page.locator("#error").text_content()
    assert not errors, errors

    # Detect blank or uninitialized output rather than comparing artwork.
    ready = out / f"{browser_name}-ready.png"
    page.screenshot(path=str(ready))
    lit = sum(1 for rgb in Image.open(ready).convert("RGB").getdata()
              if max(rgb) > 85)
    assert lit > 1000, f"Game compositor appears blank ({lit} bright pixels)"

    page.set_viewport_size({"width": 844, "height": 390})
    page.wait_for_function(
        "() => { const c=document.querySelector('#screen');"
        " return !!c && c.width >= 700 && c.height >= 300; }",
        timeout=15000,
    )
    page.wait_for_timeout(250)
    assert page.locator("#error").is_hidden(), page.locator("#error").text_content()
    assert not errors, errors
    page.screenshot(path=str(out / f"{browser_name}-landscape.png"))

    # Optional browser-level stress: ask the real WebGL context to disappear,
    # then return. No reliance on renderer internals or debug-only globals.
    supported = page.evaluate("""() => {
      const canvas = document.querySelector('#screen');
      const gl = canvas?.getContext('webgl2');
      const extension = gl?.getExtension('WEBGL_lose_context');
      if (!extension) return false;
      const probe = {lost:false,restored:false,extension};
      window.__nomadContextProbe = probe;
      canvas.addEventListener('webglcontextlost', () => {probe.lost=true;}, {once:true});
      canvas.addEventListener('webglcontextrestored', () => {probe.restored=true;}, {once:true});
      extension.loseContext();
      return true;
    }""")
    if supported:
        page.wait_for_function("() => window.__nomadContextProbe.lost === true", timeout=10000)
        page.evaluate("() => window.__nomadContextProbe.extension.restoreContext()")
        page.wait_for_function("() => window.__nomadContextProbe.restored === true", timeout=10000)
        page.wait_for_timeout(700)
        assert page.locator("#error").is_hidden(), page.locator("#error").text_content()
        assert not errors, errors
        recovered = out / f"{browser_name}-context-recovered.png"
        page.screenshot(path=str(recovered))
        pixels = Image.open(recovered).convert("RGB").getdata()
        assert sum(1 for rgb in pixels if max(rgb) > 85) > 1000, (
            "No visible output after WebGL context restoration"
        )
        print(f"{browser_name}: context loss/restoration smoke passed")
    else:
        print(f"{browser_name}: WEBGL_lose_context unavailable; stress check skipped")
    browser.close()

print(f"NOMAD browser smoke passed: {browser_name}")
