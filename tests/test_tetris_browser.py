#!/usr/bin/env python3
"""Three.js Tetris mobile browser smoke: legacy redirect, boot, resize and graphics."""
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
    page = browser.new_page(viewport={"width": 390, "height": 844},
                            device_scale_factor=2, is_mobile=True, has_touch=True)
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))

    # Historical /tetris/ links now lead to the current Three.js app.
    page.goto("http://127.0.0.1:8765/tetris/", wait_until="domcontentloaded")
    page.wait_for_url("**/tetris/three-v027.html", timeout=15000)
    page.wait_for_function(
        "() => { const c=document.querySelector('#screen');"
        " return !!c && c.width > 200 && c.height > 300; }",
        timeout=30000,
    )
    page.wait_for_timeout(700)
    assert page.locator("#screen").count() == 1
    assert page.locator("#error").is_hidden(), page.locator("#error").text_content()
    assert not errors, errors

    # Screenshot proves this is actually painted by the WebGL compositor,
    # rather than a blank canvas or a passed-but-unused JS module.
    ready = out / (browser_name + "-three-ready.png")
    page.screenshot(path=str(ready))
    image = Image.open(ready).convert("RGB")
    illuminated = sum(1 for rgb in image.getdata() if max(rgb) > 85)
    assert illuminated > 1000, ("Three.js compositor appears blank", illuminated)

    # Exercise the real touch/keyboard menu transitions that previously left
    # mismatched or overlapping dialog artwork. Screenshots are CI artifacts.
    # Coordinates are reference touch targets for the 390x844 mobile viewport.
    def tap(x, y):
        page.touchscreen.tap(x, y)
        page.wait_for_timeout(260)

    def capture(label):
        path = out / (browser_name + "-" + label + ".png")
        page.screenshot(path=str(path))
        return Image.open(path).convert("RGB")

    top_inset = page.evaluate(
        "() => parseFloat(getComputedStyle(document.getElementById('safeArea')).paddingTop)||0"
    )
    tap(350, top_inset + 40)  # Header's display-settings button
    settings_shot = capture("three-settings")
    assert settings_shot.tobytes() != image.tobytes(), "Settings did not open"

    # V045: DISPLAY SYSTEM replaces the old modal header. It uses the same
    # single icon height as the main game header, and there is no accordion.
    page_height = page.evaluate("window.innerHeight")
    safe_bottom = page.evaluate(
        "() => parseFloat(getComputedStyle(document.getElementById('safeArea')).paddingBottom)||0"
    )
    menu_button_height = 46 if page_height > 730 else 42
    modal_top = top_inset + 6
    header_height = 80 if page_height > 730 else 58
    content_top = modal_top + header_height + 6

    # Effect row geometry: 24px SCREEN OVERLAYS label, then the full-width
    # phosphor card (88px) and the CRT card (145px).
    phosphor_y = content_top + 24 + 6
    scanline_y = phosphor_y + 88 + 6
    phosphor_switch = (275, phosphor_y + 24)
    scanline_selector = (310, scanline_y + 75)
    pattern_option_height = max(34, menu_button_height - 8)

    def fx_value(key):
        return page.evaluate(
            """(key) => {
                const stored = JSON.parse(localStorage.getItem('fieldAtlasThreeV027FX01') || 'null') || {};
                const defaults = {phosphor:true,scanlines:true,scanlinePreset:'original',bloomStrength:.30};
                return stored[key] ?? defaults[key];
            }""", key,
        )

    # The new single-row square must toggle and persist its associated effect.
    phosphor_before = fx_value("phosphor")
    tap(*phosphor_switch)
    assert fx_value("phosphor") != phosphor_before, "Phosphor row toggle did not save"
    tap(*phosphor_switch)
    assert fx_value("phosphor") == phosphor_before, "Phosphor row toggle did not restore"

    # The CRT pattern selector stays inside its full-width effect panel.
    tap(*scanline_selector)
    chooser_shot = capture("three-scanline-picker")
    assert chooser_shot.tobytes() != settings_shot.tobytes(), (
        "Scanline pattern selector did not expand"
    )
    off_y = scanline_y + 145 + pattern_option_height / 2
    tap(120, off_y)
    assert fx_value("scanlines") is False, "Scanline OFF did not persist"
    tap(*scanline_selector)
    tap(120, off_y + pattern_option_height + 6)
    assert fx_value("scanlines") is True, "Scanline preset did not re-enable"
    assert fx_value("scanlinePreset") == "original", "Original mask was not selected"

    # The central Restore action is pinned below the scroll view and resets
    # persisted effect values, while the X closes the Display System.
    tap(*phosphor_switch)
    assert fx_value("phosphor") is False
    restore_y = page_height - safe_bottom - 6 - menu_button_height / 2
    tap(195, restore_y)
    assert fx_value("phosphor") is True, "Restore Defaults did not reset phosphor"
    assert fx_value("bloomStrength") == .30, "Restore Defaults did not reset bloom"
    capture("three-restore-defaults")
    close_y = modal_top + (header_height - menu_button_height) / 2 + menu_button_height / 2
    tap(350, close_y)
    closed_shot = capture("three-settings-closed")
    assert closed_shot.tobytes() != settings_shot.tobytes(), (
        "X did not close Display System"
    )

    tap(145, top_inset + 386)  # START GAME button on the board
    page.keyboard.press("p")  # PAUSE via the normal keyboard input
    page.wait_for_timeout(260)
    tap(145, top_inset + 487)  # HIGH SCORE in paused-board popup
    scores_shot = capture("three-scores")
    assert scores_shot.tobytes() != settings_shot.tobytes(), (
        "Top Five did not replace Settings"
    )
    tap(195, 600)  # RETURN on the Top Five dialog
    tap(145, top_inset + 437)  # NEW GAME on paused-board popup
    restart_shot = capture("three-restart")
    assert restart_shot.tobytes() != scores_shot.tobytes(), (
        "Restart did not replace Top Five"
    )
    tap(110, 484)  # CANCEL should return to paused-board popup

    # Verify the single canvas continues to use the same responsive geometry.
    page.set_viewport_size({"width": 844, "height": 390})
    page.wait_for_function(
        "() => { const r=document.querySelector('#screen').getBoundingClientRect();"
        " return Math.abs(r.width-844)<2 && Math.abs(r.height-390)<2; }",
        timeout=15000,
    )
    page.wait_for_timeout(300)
    assert page.locator("#error").is_hidden(), page.locator("#error").text_content()
    page.screenshot(path=str(out / (browser_name + "-three-landscape.png")))
    assert not errors, errors
    print(browser_name, "PASS: redirected legacy URL, live Three.js compositor, responsive canvas")
    browser.close()
