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

    # V046: one uninterrupted list of 8 effect cards, no category headings
    # or descriptions. All slider thumbs and toggles are the same 15px square.
    page_height = page.evaluate("window.innerHeight")
    safe_bottom = page.evaluate(
        "() => parseFloat(getComputedStyle(document.getElementById('safeArea')).paddingBottom)||0"
    )
    menu_button_height = 46 if page_height > 730 else 42
    modal_top = top_inset + 6
    header_height = 80 if page_height > 730 else 58
    content_top = modal_top + header_height + 6

    # The first preview card starts immediately below DISPLAY SYSTEM:
    # phosphor (80), scanlines (116), vignette (80), bloom (80), ghost (112).
    phosphor_y = content_top
    scanline_y = phosphor_y + 80 + 6
    vignette_y = scanline_y + 116 + 6
    bloom_y = vignette_y + 80 + 6
    ghost_y = bloom_y + 80 + 6
    phosphor_switch = (111, phosphor_y + 23)
    scanline_selector = (180, scanline_y + 91)
    choice_height = max(34, menu_button_height - 8)

    def fx_value(key):
        return page.evaluate(
            """(key) => {
                const saved = JSON.parse(localStorage.getItem('fieldAtlasThreeV027FX01') || 'null') || {};
                const defaults = {phosphor:true,scanlines:true,scanlinePreset:'original',
                    ghostX:2,ghostY:0,bloomStrength:.30};
                return saved[key] ?? defaults[key];
            }""", key,
        )

    # Toggle the 15x15 square and make sure persistence is unchanged.
    phosphor_before = fx_value("phosphor")
    tap(*phosphor_switch)
    assert fx_value("phosphor") != phosphor_before, "Phosphor toggle not applied"
    tap(*phosphor_switch)
    assert fx_value("phosphor") == phosphor_before, "Phosphor toggle not restored"

    # The CRT pattern selector expands inside its own full-width effect row.
    tap(*scanline_selector)
    chooser_shot = capture("three-scanline-picker")
    assert chooser_shot.tobytes() != settings_shot.tobytes(), (
        "CRT pattern selector failed to open"
    )
    off_y = scanline_y + 116 + choice_height / 2
    tap(120, off_y)
    assert fx_value("scanlines") is False, "CRT OFF selection failed"
    tap(*scanline_selector)
    tap(120, off_y + choice_height + 6)
    assert fx_value("scanlines") is True, "CRT pattern did not re-enable"
    assert fx_value("scanlinePreset") == "original", "Wrong CRT pattern"

    # Independent X/Y ghost displacement uses pixel values and two
    # half-width sliders, with a separate full-width Strength slider.
    ghost_x_before = fx_value("ghostX")
    ghost_y_before = fx_value("ghostY")
    tap(122, ghost_y + 56)
    tap(269, ghost_y + 56)
    assert fx_value("ghostX") != ghost_x_before, "Ghost X slider did not change"
    assert fx_value("ghostY") != ghost_y_before, "Ghost Y slider did not change"

    # RESTORE DEFAULTS and X retain fixed safe-area positions, regardless
    # of how far the property list is scrolled.
    tap(*phosphor_switch)
    assert fx_value("phosphor") is False
    restore_y = page_height - safe_bottom - 6 - menu_button_height / 2
    tap(195, restore_y)
    assert fx_value("phosphor") is True, "Restore Defaults missed phosphor"
    assert fx_value("ghostX") == 2 and fx_value("ghostY") == 0, (
        "Restore Defaults missed ghost offsets"
    )
    assert fx_value("bloomStrength") == .30, "Restore Defaults missed bloom"
    capture("three-restore-defaults")
    close_y = modal_top + header_height / 2
    tap(350, close_y)
    closed_shot = capture("three-settings-closed")
    assert closed_shot.tobytes() != settings_shot.tobytes(), "X did not close menu"

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
