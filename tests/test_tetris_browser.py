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
    browser.close()

print(f"NOMAD browser smoke passed: {browser_name}")
