#!/usr/bin/env python3
"""Opt-in technical browser smoke for current NOMAD Tetris (no terminal assumptions)."""
import os
import io
import re
import subprocess
import tarfile
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import urlsplit
from PIL import Image
from playwright.sync_api import sync_playwright

browser_name = os.environ.get("FIELD_ATLAS_BROWSER", "chromium")
out = Path("work/browser-test")
out.mkdir(parents=True, exist_ok=True)


def check_worker_handoff(browser):
    """Serve two releases in succession at the same origin and scope."""
    root = Path(__file__).resolve().parents[1]
    marker = r'(<meta name="tetris-build" content=")(\d{3})'
    shell = "three-v027.html"
    current_html = (root / "tetris" / shell).read_text()
    current = re.search(marker, current_html)[2]
    previous = f"{int(current) - 1:03}"
    archive = subprocess.run(
        ["git", "archive", "HEAD^", "tetris"], cwd=root,
        capture_output=True, check=False,
    )
    with tempfile.TemporaryDirectory() as temp:
        prior_root = Path(temp)
        if archive.returncode == 0:
            with tarfile.open(fileobj=io.BytesIO(archive.stdout)) as bundle:
                bundle.extractall(prior_root, filter="data")
        prior_shell = prior_root / "tetris" / shell
        use_prior_release = (
            prior_shell.exists() and re.search(marker, prior_shell.read_text())[2] == previous
        )
        published = False

        class ReleaseHandler(SimpleHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                self.directory = str(prior_root if use_prior_release and not published else root)
                path = urlsplit(self.path).path
                if not published and not use_prior_release and path in (
                    f"/tetris/{shell}", "/tetris/sw.js"
                ):
                    source = (root / path.lstrip("/")).read_text()
                    if path.endswith(".html"):
                        source = re.sub(marker, rf"\g<1>{previous}", source, count=1)
                    else:
                        source = source.replace(f"CACHE_VERSION='v{current}'",
                                                f"CACHE_VERSION='v{previous}'", 1)
                    data = source.encode()
                    self.send_response(200)
                    self.send_header("Content-Type",
                                     "text/html" if path.endswith(".html") else "text/javascript")
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                    return
                super().do_GET()

        with ThreadingHTTPServer(("127.0.0.1", 0), ReleaseHandler) as server:
            Thread(target=server.serve_forever, daemon=True).start()
            context = browser.new_context(viewport={"width": 393, "height": 852})
            try:
                origin = f"http://127.0.0.1:{server.server_port}"
                game_url = f"{origin}/tetris/{shell}"
                read_build = """() => document.querySelector('meta[name="tetris-build"]')?.content"""
                read_best = "() => window.FieldAtlasScores.read(localStorage)?.score ?? 0"
                canvas_ready = "() => document.querySelector('#screen')?.height >= 700"
                observer = context.new_page()
                observer.goto(origin)
                idle = context.new_page()
                idle.goto(game_url, wait_until="domcontentloaded")
                idle.wait_for_function("() => !!navigator.serviceWorker.controller", timeout=45000)
                idle_registration = idle.evaluate_handle(
                    "() => navigator.serviceWorker.getRegistration()"
                )
                observer_registration = observer.evaluate_handle(
                    "() => navigator.serviceWorker.getRegistration('/tetris/')"
                )
                playing = context.new_page()
                playing.goto(game_url, wait_until="domcontentloaded")
                playing.wait_for_function(canvas_ready)
                assert playing.evaluate(read_build) == previous, playing.title()
                playing.bring_to_front()
                playing.keyboard.press("Enter")
                playing.keyboard.press("ArrowDown")
                playing.wait_for_function(f"() => ({read_best})() > 0")
                best = playing.evaluate(read_best)
                playing.evaluate("() => { window.handoffGameOpen = true; }")

                published = True
                idle_registration.evaluate("registration => registration.update()")
                idle.wait_for_function(
                    "registration => registration.waiting?.state === 'installed'",
                    arg=idle_registration, polling=100, timeout=45000,
                )
                idle_registration.evaluate("""registration =>
                    registration.waiting.postMessage({type: 'NOMAD_ACTIVATE_UPDATE'})""")
                idle.close()

                # With one old tab still open, the staged worker must stay waiting
                # and the old offline shell and live game must remain available.
                playing.wait_for_timeout(750)
                assert playing.evaluate("""async () =>
                    (await navigator.serviceWorker.getRegistration()).waiting?.state""") == "installed"
                assert playing.evaluate("() => window.handoffGameOpen") is True
                playing.keyboard.press("ArrowDown")
                playing.wait_for_function(f"score => ({read_best})() > score", arg=best)
                best = playing.evaluate(read_best)
                context.set_offline(True)
                assert playing.evaluate("""async url => {
                    const shell = new DOMParser().parseFromString(
                        await (await fetch(url)).text(), 'text/html');
                    return shell.querySelector('meta[name="tetris-build"]').content;
                }""", game_url) == previous
                playing.close()

                # Observe activation from outside the worker scope so the test
                # itself never keeps the previous release alive.
                observer.wait_for_function(
                    "reg => reg.active?.state === 'activated' && !reg.waiting",
                    arg=observer_registration, polling=100, timeout=30000,
                )
                assert not observer.evaluate("name => caches.has(name)",
                                             f"nomad-tetris-offline-v{previous}")
                reopened = context.new_page()
                reopened.goto(game_url, wait_until="domcontentloaded")
                reopened.wait_for_function(canvas_ready)
                assert reopened.evaluate(read_build) == current, reopened.title()
                assert reopened.evaluate(read_best) >= best
                assert reopened.locator("#error").is_hidden()
                print(f"chromium: v{previous} to v{current} two-tab update and offline reopen passed")
            finally:
                context.close()
                server.shutdown()


with sync_playwright() as p:
    flags = (["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader",
              "--enable-unsafe-swiftshader"] if browser_name == "chromium" else [])
    launch_args = {"headless": True, "args": flags}
    if browser_name == "chromium" and os.environ.get("FIELD_ATLAS_USE_CHROME") == "1":
        launch_args["channel"] = "chrome"
    browser = getattr(p, browser_name).launch(**launch_args)
    if browser_name == "chromium":
        check_worker_handoff(browser)
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
    # (header Options centered at y=103, START GAME near x=155,y=416).
    # Keep these smoke interactions separate from screenshot artwork tests.
    # Test against a static ready-state control so modal redraws cannot
    # conceal a missing afterglow. The PAUSE key has a visible button even
    # before a session starts; input is inert but phosphor still responds.

    # A genuine held input crosses multiple compositor frames. Instantaneous
    # synthetic down/up within one JS task never excites a physical raster.
    page.mouse.move(265, 722)
    page.mouse.down()
    # Software-rasterized WebKit can return an older framebuffer at first.
    # Take several frames while actually holding the button, use the
    # strongest measured excitation, then wait for the visible tail to fade.
    crop = (200, 699, 332, 746)
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
    hot_pixels = list(hot.crop(crop).getdata())
    cold_pixels = list(cold.crop(crop).getdata())
    glow_delta = (sum(hot_pixels) - sum(cold_pixels)) / len(hot_pixels)

    print("BUTTON GLOW DIAGNOSTIC:", {"hotMean":sum(hot_pixels)/len(hot_pixels),
          "coldMean":sum(cold_pixels)/len(cold_pixels),"delta":glow_delta,
          "pageErrors":errors,"consoleErrors":console_errors})
    shader_errors = [error for error in console_errors if "WebGLProgram" in error]
    assert not shader_errors, shader_errors
    assert glow_delta > 3, f"Button afterglow not visible or did not fade: {glow_delta:.2f}"
    page.mouse.click(353, 103)
    page.wait_for_timeout(150)
    settings_screen = page.screenshot()
    assert settings_screen != ready.read_bytes(), "Options did not change the screen"
    page.keyboard.press("Escape")
    page.wait_for_timeout(150)
    assert page.locator("#error").is_hidden(), page.locator("#error").text_content()
    page.keyboard.press("Enter")  # START GAME
    page.wait_for_timeout(300)
    read_best = "() => window.FieldAtlasScores.read(localStorage)?.score ?? 0"
    page.keyboard.press("ArrowDown")
    page.wait_for_function(f"() => ({read_best})() > 0")
    started_score = page.evaluate(read_best)
    assert started_score > 0, "Soft drop did not score after START GAME"

    # PAUSE transitions playing→paused during pointerdown. The pressed PAUSE
    # button must visibly brighten even though game status changes immediately.
    page.mouse.move(265, 722)
    page.mouse.down()
    pause_means = []
    for _ in range(6):
        page.wait_for_timeout(160)
        frame = Image.open(io.BytesIO(page.screenshot(scale="css"))).convert("L")
        roi = frame.crop(crop)
        pause_means.append(sum(roi.getdata()) / (roi.width*roi.height))
    page.mouse.up()
    page.wait_for_timeout(1200)
    cold_pause = Image.open(io.BytesIO(page.screenshot(scale="css"))).convert("L").crop(crop)
    cold_mean = sum(cold_pause.getdata()) / (cold_pause.width*cold_pause.height)
    delta_pause = max(pause_means) - cold_mean
    print("ACTIVE PAUSE LUMINANCE:", {"cold": cold_mean, "hot": max(pause_means),
                                    "delta": delta_pause})
    assert delta_pause > 1.0, (
        f"PAUSE lost its pressed luminance on status change: {delta_pause:.2f}"
    )
    page.keyboard.press("ArrowDown")
    assert page.evaluate(read_best) == started_score, "Soft drop still scored while paused"
    page.keyboard.press("Enter")  # Resume before gameplay/bfcache checks
    page.wait_for_timeout(150)

    page.keyboard.press("Space")  # Soft drop
    page.wait_for_function(f"score => ({read_best})() > score", arg=started_score)
    page.wait_for_timeout(150)
    playing_image = page.screenshot()
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

    # Short and tall portrait layouts share the same canvas-to-viewport mapping.
    for width, height in [(376, 583), (398, 758), (393, 852)]:
        page.set_viewport_size({"width": width, "height": height})
        page.wait_for_function("""([width, height]) => {
            const c = document.querySelector('#screen');
            const r = c.getBoundingClientRect();
            return Math.round(r.width) === width && Math.round(r.height) === height &&
                c.width === 2 * width && c.height === 2 * height;
        }""", arg=[width, height])

    # Rotation must preserve the open run, pause it, and require explicit resume.
    best_before_rotation = page.evaluate(read_best)
    page.keyboard.press("Enter")
    page.keyboard.press("ArrowDown")
    page.wait_for_function(f"score => ({read_best})() > score", arg=best_before_rotation)
    best_before_rotation = page.evaluate(read_best)
    page.set_viewport_size({"width": 844, "height": 390})
    page.locator("#rotateNotice").wait_for(state="visible")
    assert page.locator("#screen").is_hidden()
    page.keyboard.press("Enter")
    page.keyboard.press("ArrowDown")
    assert page.evaluate(read_best) == best_before_rotation
    page.screenshot(path=str(out / f"{browser_name}-landscape.png"))
    page.set_viewport_size({"width": 393, "height": 852})
    page.locator("#rotateNotice").wait_for(state="hidden")
    page.locator("#screen").wait_for(state="visible")
    page.keyboard.press("ArrowDown")
    assert page.evaluate(read_best) == best_before_rotation
    page.keyboard.press("Enter")
    page.keyboard.press("ArrowDown")
    page.wait_for_function(f"score => ({read_best})() > score", arg=best_before_rotation)
    assert page.locator("#error").is_hidden(), page.locator("#error").text_content()
    assert not errors, errors
    print(f"{browser_name}: portrait sizing and rotation pause/resume passed")

    # Interrupt a held Drop without sending pointerup or pointercancel.
    # Capture can be taken away by the browser while a pointer is still down.
    before_hold = page.evaluate(read_best)
    page.evaluate("""() => {
        const canvas = document.querySelector('#screen');
        canvas.addEventListener('pointerdown', event => {
            window.dropPointer = event.pointerId;
        }, {once: true});
        canvas.addEventListener('lostpointercapture', () => {
            window.dropCaptureLost = true;
        }, {once: true});
    }""")
    page.mouse.move(160, 666)
    page.mouse.down()
    try:
        page.wait_for_function(f"score => ({read_best})() >= score + 2", arg=before_hold)
        page.evaluate("""() => {
            const canvas = document.querySelector('#screen');
            if (!canvas.hasPointerCapture(window.dropPointer)) throw Error('Drop was not captured');
            canvas.releasePointerCapture(window.dropPointer);
        }""")
        page.mouse.move(161, 666)
        page.wait_for_function("() => window.dropCaptureLost === true")
        page.wait_for_timeout(200)  # Allow any already queued score save to settle.
        stopped_score = page.evaluate(read_best)
        page.wait_for_timeout(200)
        assert page.evaluate(read_best) == stopped_score, "Drop repeated after capture was lost"
    finally:
        page.mouse.up()
    page.mouse.click(160, 666)
    page.wait_for_function(f"score => ({read_best})() > score", arg=stopped_score)
    print(f"{browser_name}: held Drop stops on pointer capture loss and accepts the next press")

    # Real offline launch test. A successful service-worker install must cache
    # the entire local app before the page is taken offline. On Chromium this
    # is a required gate; WebKit uses the same best-effort path if supported.
    if browser_name == "chromium":
        page.wait_for_function(
            "() => Boolean(navigator.serviceWorker?.controller)",
            timeout=45000,
        )
        cache_count = page.evaluate("""async () => {
          const build = document.querySelector('meta[name="tetris-build"]').content;
          const names = await caches.keys();
          const name = names.find(n => n === 'nomad-tetris-offline-v' + build);
          if (!name) return 0;
          const cache = await caches.open(name);
          return (await cache.keys()).length;
        }""")
        assert cache_count >= 38, f"Incomplete offline cache: {cache_count} entries"

        page.evaluate("() => localStorage.setItem('nomad-smoke-marker','persist')")
        page.context.set_offline(True)
        try:
            page.reload(wait_until="domcontentloaded", timeout=30000)
            page.wait_for_function(
                "() => {const c=document.querySelector('#screen');"
                "return c && c.width >= 700 && c.height >= 1400;}",
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

    # Use distinct same-origin tabs and real IndexedDB transactions. Each tab
    # submits its independently selected score, then a new tab reads the winner.
    with browser.new_context() as score_context:
        score_context.route(
            "**/__score_smoke__",
            lambda route: route.fulfill(content_type="text/html",
                                        body='<script src="./scores.js"></script>'),
        )
        score_tabs = [score_context.new_page(), score_context.new_page()]
        for tab in score_tabs:
            tab.goto("http://127.0.0.1:8765/tetris/__score_smoke__")
            assert tab.evaluate("() => FieldAtlasScores.read(localStorage)") is None
        high, low = score_tabs
        for tab, score in [(high, 1200), (low, 300)]:
            tab.evaluate("""score => {
                const persist = FieldAtlasScores.createPersistence(null, indexedDB);
                window.scoreWrite = persist({score});
            }""", score)
        for tab in score_tabs:
            tab.evaluate("() => window.scoreWrite")
        reopened = score_context.new_page()
        reopened.goto("http://127.0.0.1:8765/tetris/__score_smoke__")
        best = reopened.evaluate("""async () => {
            const persist = FieldAtlasScores.createPersistence(null, indexedDB);
            return (await persist(null))?.score;
        }""")
        assert best == 1200, f"Reopened tab read the wrong personal best: {best}"
        print(f"{browser_name}: two-tab personal-best check passed")
    browser.close()

print(f"NOMAD browser smoke passed: {browser_name}")
