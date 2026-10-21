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

    # V050: True perspective-separated game layers, plus live preview
    # thumbnails driven by their own effect values even when effects are off.
    # The original page/header/buttons/15px controls are preserved.
    page_height = page.evaluate("window.innerHeight")
    safe_bottom = page.evaluate(
        "() => parseFloat(getComputedStyle(document.getElementById('safeArea')).paddingBottom)||0"
    )
    menu_button_height = 46 if page_height > 730 else 42
    compact = page_height <= 620
    short = page_height <= 730
    modal_top = top_inset + (4 if compact else 9 if short else 0)
    header_height = 50 if compact else 58 if short else 80
    content_top = modal_top + header_height + 6

    row_height, row_gap = 102, 6
    phosphor_y = content_top
    scanline_y = content_top + (row_height + row_gap)
    vignette_y = content_top + 2 * (row_height + row_gap)
    bloom_y = content_top + 3 * (row_height + row_gap)
    ghost_y = content_top + 4 * (row_height + row_gap)
    # Preview frames don't change row geometry; Phosphor stays centered.
    # The header location now matches the home screen at every breakpoint.
    phosphor_switch = (111, phosphor_y + row_height / 2)
    # Scanline's title, slider and pattern selector fill the largest block.
    scanline_selector = (180, scanline_y + 81)
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
    off_y = scanline_y + row_height + choice_height / 2
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
    tap(122, ghost_y + 47)
    tap(269, ghost_y + 47)
    assert fx_value("ghostX") != ghost_x_before, "Ghost X slider did not change"
    assert fx_value("ghostY") != ghost_y_before, "Ghost Y slider did not change"

    # Preview changes are independent of whether the viewport effect is on.
    # This exercises the real slider and persisted value with bloom disabled.
    bloom_old = fx_value("bloomStrength")
    tap(110, bloom_y + 47)  # Bloom strength slider, not its enable square
    assert fx_value("bloomStrength") != bloom_old, (
        "Disabled-effect preview control failed to update its saved value"
    )
    tap(110, bloom_y + 47)  # idempotent repeated slider selection

    # Depth Parallax stays opt-in; sensitivity is adjustable without sensor
    # permission or enabling motion. Scroll to the new ninth settings row.
    assert page.evaluate(
        "localStorage.getItem('fieldAtlasTetrisDepthV050Enabled')"
    ) in (None, "no"), "Depth should not prompt automatically"
    page.mouse.move(300, 600)
    page.mouse.wheel(0, 3000)
    page.wait_for_timeout(500)
    depth_before = page.evaluate(
        "localStorage.getItem('fieldAtlasTetrisDepthV050Strength') || '45'"
    )
    tap(115, 748)
    depth_after = page.evaluate(
        "localStorage.getItem('fieldAtlasTetrisDepthV050Strength') || '45'"
    )
    assert depth_after != depth_before, "Depth preview slider did not save"
    capture("three-depth-preview")
    # Reset scroll via reversing the wheel so the original Phosphor row is
    # visible again for the existing Restore Defaults regression.
    page.mouse.wheel(0, -3000)
    page.wait_for_timeout(500)

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
    assert page.evaluate(
        "localStorage.getItem('fieldAtlasTetrisDepthV050Strength')"
    ) == "45", "Restore Defaults missed depth sensitivity"
    capture("three-restore-defaults")
    close_y = modal_top + header_height / 2
    tap(350, close_y)
    closed_shot = capture("three-settings-closed")
    assert closed_shot.tobytes() != settings_shot.tobytes(), "X did not close menu"

    # Re-opening the full-screen page must not reload the underlying game.
    # The game canvas/score remains in place; this is an in-app view change,
    # not a second URL, browser tab, or destructive canvas replacement.
    canvas_before = page.evaluate(
        "() => { window.__nomadTestCanvas=document.querySelector('#screen');"
        " return location.pathname; }"
    )
    tap(350, top_inset + 40)
    reopened_shot = capture("three-display-reopened")
    assert reopened_shot.tobytes() != closed_shot.tobytes(), (
        "Could not reopen the full-screen Display System page"
    )
    assert page.evaluate("location.pathname") == canvas_before, (
        "Display System unexpectedly navigated to another URL"
    )
    assert page.evaluate(
        "document.querySelector('#screen') === window.__nomadTestCanvas"
    ), "Display System replaced the active WebGL canvas"
    tap(350, close_y)

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
