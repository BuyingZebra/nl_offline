#!/usr/bin/env python3
"""Headless iPhone-sized visual and interaction QA for FIELD ATLAS arcade."""
from __future__ import annotations
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = os.environ.get("FIELD_ATLAS_ARCADE_URL", "http://127.0.0.1:8765/tetris/")
EVIDENCE = Path("work/browser-test")
EVIDENCE.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    context = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=2,
        is_mobile=True,
        has_touch=True,
        reduced_motion="reduce",
    )
    page = context.new_page()
    exceptions = []
    page.on("pageerror", lambda err: exceptions.append(str(err)))
    try:
        page.goto(URL + "?qa=visual-compositing", wait_until="networkidle", timeout=30000)
        page.locator("#board").wait_for()
        assert page.locator("#scoreValue").inner_text() == "000000"
        assert page.locator("#modalScrim").is_hidden()
        assert page.locator("#phosphorFilm").count() == 1
        assert page.locator("#screenScan").count() == 1
        assert page.locator("#screenShade").count() == 1
        assert page.locator("dialog .modal-camera-fx").count() == 0

        # Menu is in the SAME compositor, below the global overlay stack.
        page.get_by_role("button", name="Display options").tap()
        assert page.locator("#options").get_attribute("open") is not None
        assert page.locator("#modalScrim").is_visible()
        assert page.locator("#fade-screenTop-on").count() == 1
        assert page.locator("#fade-screenBottom-on").count() == 1
        assert page.locator("#fade-playfieldTop-on").count() == 0
        z = page.evaluate("""() => ({
          dialog: +getComputedStyle(document.querySelector('#options')).zIndex,
          crt: +getComputedStyle(document.querySelector('#screenScan')).zIndex,
          vignette: +getComputedStyle(document.querySelector('#screenShade')).zIndex,
          colour: +getComputedStyle(document.querySelector('#phosphorFilm')).zIndex,
          sweep: +getComputedStyle(document.querySelector('#sweep')).zIndex
        })""")
        assert z["crt"] > z["dialog"] and z["vignette"] > z["dialog"]
        assert z["colour"] > z["dialog"] and z["sweep"] > z["dialog"], z

        # Adjusting the vignette while the menu is open affects the entire
        # compositor. It must not cover the menu with a second FX copy.
        page.locator("#vignetteControl").evaluate(
            """el => {el.value='75';el.dispatchEvent(new Event('input',{bubbles:true}))}"""
        )
        opacity = page.locator("#screenShade").evaluate(
            "el => Number(getComputedStyle(el).opacity)"
        )
        assert abs(opacity-0.75)<0.01, opacity
        page.screenshot(path=str(EVIDENCE/"tetris-menu-green.png"))

        # Theme toggle lives on the main screen. Return is at the top.
        assert page.locator("#themeSetting").count() == 0
        assert page.locator("#closeOptions").is_visible()
        assert page.evaluate("""() => (
          document.querySelector('#closeOptions').getBoundingClientRect().top <
          document.querySelector('#ghostControl').getBoundingClientRect().top
        )""")
        assert page.locator('#options input[type="checkbox"]').evaluate_all(
          """els => els.every(el => getComputedStyle(el).borderTopLeftRadius==='0px')"""
        )
        assert page.locator('#screenScan').evaluate(
          """el => getComputedStyle(el).backgroundImage.includes('repeating-linear-gradient')"""
        )
        page.locator("#closeOptions").tap()
        assert page.locator("#options").get_attribute("open") is None
        assert page.locator("#modalScrim").is_hidden()
        page.locator("#themeToggle").tap()
        assert page.locator("html").get_attribute("data-theme") == "amber"
        page.get_by_role("button", name="Display options").tap()
        page.screenshot(path=str(EVIDENCE/"tetris-menu-amber.png"))
        page.locator("#closeOptions").tap()

        page.get_by_role("button", name="View top five high scores").tap()
        assert page.locator("#leaderboard").get_attribute("open") is not None
        assert page.locator("#scoreRows .score-row").count() == 5
        page.screenshot(path=str(EVIDENCE/"tetris-high-scores-amber.png"))
        page.get_by_role("button", name="RETURN", exact=True).tap()

        # A pending game cannot be reset from the gameplay buttons.
        page.get_by_role("button", name="START GAME").tap()
        page.locator('button[data-action="hard"]').tap()
        # The game renders its HUD on requestAnimationFrame, not synchronously
        # inside the button's pointerdown handler.
        page.wait_for_function(
            "() => Number(document.querySelector('#scoreValue').textContent)>0",
            timeout=6000,
        )
        previous_score = page.locator("#scoreValue").inner_text()
        assert int(previous_score)>0
        assert page.locator('button[data-action="restart"]').count() == 0
        page.locator("#pauseButton").tap()
        # Pause menu visibility is committed on the next animation frame.
        page.locator("#newGameButton").wait_for(state="visible", timeout=5000)
        page.locator("#newGameButton").tap()
        assert page.locator("#restartConfirm").get_attribute("open") is not None
        page.locator("#cancelRestart").tap()
        assert page.locator("#scoreValue").inner_text() == previous_score
        assert page.locator("#restartConfirm").get_attribute("open") is None
        assert not exceptions, exceptions
        print("PASS: single global CRT stack, display menu, themes, high scores, protected restart")
    finally:
        try:
            page.screenshot(path=str(EVIDENCE/"tetris-final.png"))
        except Exception:
            pass
        context.close()
        browser.close()
