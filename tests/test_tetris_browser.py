#!/usr/bin/env python3
"""Opt-in technical browser smoke for current NOMAD Tetris (no terminal assumptions)."""
import os
import io
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

browser_name = os.environ.get("FIELD_ATLAS_BROWSER", "chromium")
out = Path("work/browser-test")
out.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    flags = (["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader",
              "--enable-unsafe-swiftshader"] if browser_name == "chromium" else [])
    launch_args = {"headless": True, "args": flags}
    if browser_name == "chromium" and os.environ.get("FIELD_ATLAS_USE_CHROME") == "1":
        launch_args["channel"] = "chrome"
    browser = getattr(p, browser_name).launch(**launch_args)
    page = browser.new_page(viewport={"width": 393, "height": 852},
                            device_scale_factor=2, is_mobile=True, has_touch=True)
    errors = []
    failures = []
    console_errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))
    page.on("requestfailed", lambda req: failures.append((req.url, req.failure)))
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

    page.goto("http://127.0.0.1:8765/tetris/", wait_until="domcontentloaded")
    page.wait_for_url("**/tetris/three-v027.html", timeout=15000)
    try:
        page.wait_for_function(
            "() => { const c=document.querySelector('#screen');"
            " return !!c && c.width >= 300 && c.height >= 700; }",
            timeout=30000,
        )
    except Exception:
        state = page.evaluate("""() => ({
          url: location.href, ready: document.readyState,
          error: document.querySelector('#error')?.textContent,
          errorVisible: !document.querySelector('#error')?.hidden,
          width: document.querySelector('#screen')?.width,
          height: document.querySelector('#screen')?.height,
          build: document.querySelector('meta[name="tetris-build"]')?.content,
          worker: !!navigator.serviceWorker?.controller,
          webgl2: !!document.createElement('canvas').getContext('webgl2')
        })""")
        print("STARTUP DIAGNOSTICS:", state)
        print("JAVASCRIPT ERRORS:", errors)
        print("CONSOLE ERRORS:", console_errors[:12])
        print("FAILED REQUESTS:", failures[:12])
        raise
    # WebKit's headless software compositor may produce its first physical
    # pixels after the WebGL canvas has already reached the right dimensions.
    # Wait for visible output, not an arbitrary 900ms launch delay.
    ready = out / f"{browser_name}-ready.png"
    lit = 0
    for attempt in range(16):
        page.wait_for_timeout(250)
        page.screenshot(path=str(ready))
        lit = sum(1 for rgb in Image.open(ready).convert("RGB").getdata()
                  if max(rgb) > 85)
        if lit > 1000:
            break
    print("FIRST VISIBLE FRAME:", {"pixels": lit, "attempts": attempt+1})
    assert page.locator("#error").is_hidden(), page.locator("#error").text_content()
    assert not errors, errors
    if lit <= 1000:
        print("BLANK-FRAME JAVASCRIPT ERRORS:", errors)
        print("BLANK-FRAME CONSOLE ERRORS:", console_errors[:30])
        print("BLANK-FRAME FAILED REQUESTS:", failures[:12])
    assert lit > 1000, f"Game compositor appears blank ({lit} bright pixels)"

    # Exercise real canvas input and menu integration, not only rendering.
    # Coordinates are derived from the current deterministic portrait layout
    # (header Options at x=330..376, board center/start near x=147,y=390).
    # Keep these smoke interactions separate from screenshot artwork tests.
    # Test against a static ready-state control so modal redraws cannot
    # conceal a missing afterglow. The PAUSE key has a visible button even
    # before a session starts; input is inert but phosphor still responds.

    # A genuine held input crosses multiple compositor frames. Instantaneous
    # synthetic down/up within one JS task never excites a physical raster.
    page.mouse.move(265, 792)
    page.mouse.down()
    # Software-rasterized WebKit can return an older framebuffer at first.
    # Take several frames while actually holding the button, use the
    # strongest measured excitation, then wait for the visible tail to fade.
    crop = (200, 770, 332, 817)
    frames = []
    for _ in range(6):
        page.wait_for_timeout(220)
        frame = Image.open(io.BytesIO(page.screenshot(scale="css",animations="allow"))).convert("L")
        section = frame.crop(crop)
        mean = sum(section.getdata()) / (section.width*section.height)
        frames.append((mean,frame))
    best_hot,hot = max(frames, key=lambda pair:pair[0])
    page.mouse.up()
    page.wait_for_timeout(1200)
    cold = Image.open(io.BytesIO(page.screenshot(scale="css",animations="allow"))).convert("L")
    hot.save(out / f"{browser_name}-glow-hot.png")
    cold.save(out / f"{browser_name}-glow-cold.png")
    crop = (200, 770, 332, 817)
    hot_pixels = list(hot.crop(crop).getdata())
    cold_pixels = list(cold.crop(crop).getdata())
    glow_delta = (sum(hot_pixels) - sum(cold_pixels)) / len(hot_pixels)

    print("BUTTON GLOW DIAGNOSTIC:", {"hotMean":sum(hot_pixels)/len(hot_pixels),
          "coldMean":sum(cold_pixels)/len(cold_pixels),"delta":glow_delta,
          "pageErrors":errors,"consoleErrors":console_errors})
    assert glow_delta > 3, f"Button afterglow not visible or did not fade: {glow_delta:.2f}"
    page.mouse.click(353, 40)
    page.wait_for_timeout(150)
    settings_screen = page.screenshot()
    assert settings_screen != ready.read_bytes(), "Options did not change the screen"
    page.keyboard.press("Escape")
    page.wait_for_timeout(150)
    assert page.locator("#error").is_hidden(), page.locator("#error").text_content()
    page.mouse.click(147, 390)  # START GAME
    page.wait_for_timeout(300)
    playing_image = page.screenshot()
    assert playing_image != ready.read_bytes(), "Start did not change the game board"
    page.keyboard.press("Space")  # Hard drop / gameplay sound
    page.wait_for_timeout(150)
    # A temporary bfcache round-trip must pause gameplay but keep its WebGL
    # resources, canvas pixels and input handlers alive.
    page.evaluate("""() => {
      window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
      window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
    }""")
    page.wait_for_timeout(200)
    assert page.locator("#error").is_hidden(), page.locator("#error").text_content()
    assert not errors, errors
    paused_image = page.screenshot(path=str(out / f"{browser_name}-integrated-pause.png"))
    assert paused_image != playing_image, (
        "A suspended game did not visibly transition to its paused interface"
    )

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

    # Real offline launch test. A successful service-worker install must cache
    # the entire local app before the page is taken offline. On Chromium this
    # is a required gate; WebKit uses the same best-effort path if supported.
    if browser_name == "chromium":
        page.wait_for_function(
            "() => Boolean(navigator.serviceWorker?.controller)",
            timeout=45000,
        )
        cache_count = page.evaluate("""async () => {
          const names = await caches.keys();
          const name = names.find(n => n === 'nomad-tetris-offline-v103');
          if (!name) return 0;
          const cache = await caches.open(name);
          return (await cache.keys()).length;
        }""")
        assert cache_count >= 38, f"Incomplete V103 offline cache: {cache_count} entries"

        page.evaluate("() => localStorage.setItem('nomad-smoke-marker','persist')")
        page.context.set_offline(True)
        try:
            page.reload(wait_until="domcontentloaded", timeout=30000)
            page.wait_for_function(
                "() => {const c=document.querySelector('#screen');"
                "return c && c.width >= 700 && c.height >= 300;}",
                timeout=30000,
            )
            page.wait_for_timeout(600)
            assert page.locator("#error").is_hidden(), page.locator("#error").text_content()
            assert page.evaluate("() => localStorage.getItem('nomad-smoke-marker')") == "persist"
            assert not errors, errors
            offline = out / f"{browser_name}-offline.png"
            page.screenshot(path=str(offline))
            pixels = Image.open(offline).convert("RGB").getdata()
            assert sum(1 for rgb in pixels if max(rgb) > 85) > 1000, (
                "Offline NOMAD compositor is blank"
            )
        finally:
            page.context.set_offline(False)
            page.evaluate("() => localStorage.removeItem('nomad-smoke-marker')")
        print(f"{browser_name}: complete offline bundle and reload smoke passed")

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
