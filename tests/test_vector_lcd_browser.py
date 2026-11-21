"""Vector LCD in a real browser: GPU physics, renderer contract, app smoke.

Runs tests/vector-lcd-gpu.mjs (the GPU equals each screen's JavaScript model,
every renderer meets the contract, a resize keeps the panel's state), then
opens the app and switches through every screen.

    python tests/test_vector_lcd_browser.py
"""

import functools
import os
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
browser_name = os.environ.get("FIELD_ATLAS_BROWSER", "chromium")


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve():
    server = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}"


def gpu_checks(page, base):
    page.goto(base + "/tests/", wait_until="domcontentloaded")
    results = page.evaluate("async () => (await import('/tests/vector-lcd-gpu.mjs')).runAll()")
    for r in results:
        print(("ok    " if r["ok"] else "FAIL  ") + r["name"] + ": " + r["detail"])
    return all(r["ok"] for r in results)


def app_smoke(page, base):
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(base + "/vector-lcd/", wait_until="domcontentloaded")
    page.wait_for_function("window.vectorLCD && window.vectorLCD.renderer.info().width > 0", timeout=30000)
    ids = page.evaluate("[...document.querySelectorAll('[data-family]')].map(b => b.dataset.family)")
    seen = []
    for family in ids:
        page.click(f"[data-family={family}]")
        page.wait_for_timeout(600)
        count = page.locator("#profiles button").count()
        for i in range(count):
            page.locator("#profiles button").nth(i).click()
            page.wait_for_timeout(600)
            screen = page.evaluate("window.vectorLCD.screen.id")
            controls = page.locator("#device input").count()
            seen.append(f"{screen} ({controls} device controls)")
    page.click("#tabInfo")
    facts = page.locator("#facts dt").count()
    page.click("#tabDemo")
    print("app: " + ", ".join(seen) + f"; Info lists {facts} facts")
    ok = not errors and facts > 5 and page.locator("#error").is_hidden()
    if errors:
        print("page errors:", errors)
    return ok


with sync_playwright() as p:
    flags = (["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader",
              "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] if browser_name == "chromium" else [])
    launch_args = {"headless": True, "args": flags}
    if browser_name == "chromium" and os.environ.get("FIELD_ATLAS_USE_CHROME") == "1":
        launch_args["channel"] = "chrome"
    if os.environ.get("CHROME_PATH"):
        launch_args["executable_path"] = os.environ["CHROME_PATH"]
    browser = getattr(p, browser_name).launch(**launch_args)
    server, base = serve()
    try:
        page = browser.new_page(viewport={"width": 393, "height": 852})
        passed = gpu_checks(page, base)
        passed = app_smoke(page, base) and passed
    finally:
        server.shutdown()
        browser.close()

sys.exit(0 if passed else 1)
