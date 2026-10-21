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

    # Screen Overlays is the default expanded category in V041.
    # Derive hit centers from the menu's shared 6px token and button height.
    page_height = page.evaluate("window.innerHeight")
    safe_bottom = page.evaluate(
        "() => parseFloat(getComputedStyle(document.getElementById('safeArea')).paddingBottom)||0"
    )
    modal_height = min(680, page_height * .82)
    modal_top = top_inset + (page_height - top_inset - safe_bottom - modal_height) / 2
    menu_button_height = 46 if page_height > 730 else 42
    heading_height = max(30, menu_button_height - 12)
    content_top = modal_top + 6 + menu_button_height + 6 + menu_button_height + 6
    gameplay_y = content_top + heading_height / 2
    overlay_y = content_top + heading_height + 6 + heading_height / 2
    phosphor_y = content_top + 2 * (heading_height + 6) + menu_button_height / 2
    pattern_top = content_top + 2 * (heading_height + 6) + menu_button_height + 6
    pattern_y = pattern_top + menu_button_height + 6 + menu_button_height / 2
    off_y = pattern_top + 2 * menu_button_height + 2 * 6 + menu_button_height / 2

    # The phosphor checkbox is a binary tint toggle. Hue still belongs to the
    # on-screen theme button, not a duplicate colour menu.
    def fx_value(key):
        return page.evaluate(
            """(key) => {
                const saved = JSON.parse(localStorage.getItem('fieldAtlasThreeV027FX01') || 'null') || {};
                const defaults = {phosphor:true, scanlines:true, scanlinePreset:'original'};
                return saved[key] ?? defaults[key];
            }""",
            key,
        )

    phosphor_before = fx_value("phosphor")
    tap(345, phosphor_y)
    assert fx_value("phosphor") != phosphor_before, "Phosphor toggle did not persist"
    tap(345, phosphor_y)
    assert fx_value("phosphor") == phosphor_before, "Phosphor toggle did not restore"

    # CRT pattern selector is one actual expandable choice list: OFF and all
    # five available mask patterns. Selecting OFF must persist; selecting a
    # pattern turns it back on.
    tap(170, pattern_y)
    chooser_shot = capture("three-scanline-picker")
    assert chooser_shot.tobytes() != settings_shot.tobytes(), (
        "CRT scanline dropdown did not expand"
    )
    tap(170, off_y)
    assert fx_value("scanlines") is False, "OFF did not disable CRT scanlines"
    tap(170, pattern_y)
    tap(170, off_y + menu_button_height + 6)
    assert fx_value("scanlines") is True, "Selecting a CRT pattern did not enable it"
    assert fx_value("scanlinePreset") == "original", "Original CRT preset not selected"

    # Changing categories must collapse the previous section. Gameplay's
    # binary control still persists and can be toggled back.
    tap(180, gameplay_y)
    gameplay_shot = capture("three-gameplay")
    assert gameplay_shot.tobytes() != chooser_shot.tobytes(), (
        "Gameplay category did not replace Screen Overlays"
    )
    ghost_y = content_top + heading_height + 6 + menu_button_height / 2
    before = page.evaluate("localStorage.getItem('fieldAtlasTetrisGhost') || 'yes'")
    tap(345, ghost_y)
    after = page.evaluate("localStorage.getItem('fieldAtlasTetrisGhost')")
    assert after in ("yes", "no") and after != before, "Ghost Piece switch did not save"
    tap(345, ghost_y)
    assert page.evaluate("localStorage.getItem('fieldAtlasTetrisGhost')") == before, (
        "Ghost Piece setting did not restore"
    )

    # Restore Defaults is pinned below the scrollable settings: the action
    # must remain reachable without expanding a category or scrolling.
    if page.evaluate("localStorage.getItem('fieldAtlasTetrisGhost') || 'yes'") != "no":
        tap(345, ghost_y)
    assert page.evaluate("localStorage.getItem('fieldAtlasTetrisGhost')") == "no"
    restore_y = modal_top + modal_height - 6 - menu_button_height / 2
    tap(195, restore_y)
    assert page.evaluate("localStorage.getItem('fieldAtlasTetrisGhost')") == "yes", (
        "Restore Defaults did not reset Gameplay switches"
    )
    assert fx_value("phosphor") is True, "Restore Defaults did not reset phosphor"
    assert fx_value("bloomStrength") == .30, (
        "Restore Defaults did not reset bloom strength"
    )
    capture("three-restore-defaults")

    # Exit via the shared menu-height RETURN TO GAME button.
    back_y = modal_top + 6 + menu_button_height + 6 + menu_button_height / 2
    tap(195, back_y)
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
