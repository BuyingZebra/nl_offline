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

    read_best = "() => window.FieldAtlasScores.read(localStorage)?.score ?? 0"
    page.keyboard.press("Enter")
    # Interrupt a held Drop without sending pointerup or pointercancel.
    # Capture can be taken away by the browser while a pointer is still down.
    before_hold = page.evaluate(read_best)
    page.evaluate("""() => {
        const canvas = document.querySelector('#screen');
        canvas.addEventListener('gotpointercapture', event => {
            window.dropPointer = event.pointerId;
        }, {once: true});
        canvas.addEventListener('lostpointercapture', () => {
            window.dropCaptureLost = true;
        }, {once: true});
    }""")
    page.mouse.move(160, 666)
    page.mouse.down()
    try:
        page.mouse.move(161, 666)
        page.wait_for_function("() => Number.isInteger(window.dropPointer)")
        page.wait_for_function(f"score => ({read_best})() >= score + 2", arg=before_hold)
        page.evaluate("""() => {
            const canvas = document.querySelector('#screen');
            if (!canvas.hasPointerCapture(window.dropPointer)) throw Error('Drop was not captured');
            canvas.releasePointerCapture(window.dropPointer);
        }""")
        page.mouse.move(162, 666)
        page.wait_for_function("() => window.dropCaptureLost === true")
        page.wait_for_timeout(200)  # Allow any already queued score save to settle.
        stopped_score = page.evaluate(read_best)
        page.wait_for_timeout(200)
        assert page.evaluate(read_best) == stopped_score, "Drop repeated after capture was lost"
    finally:
        page.mouse.up()
    page.mouse.move(160, 666)
    page.mouse.down()
    try:
        assert page.evaluate("""() => document.querySelector('#screen')
            .hasPointerCapture(window.dropPointer)"""), "The next Drop press was not captured"
    finally:
        page.mouse.up()
    print(f"{browser_name}: held Drop stops on pointer capture loss and accepts the next press")

    browser.close()
