#!/usr/bin/env python3
"""Isolated feasibility matrix: seven ordered SVG screen filters in Chromium/WebKit."""
from __future__ import annotations
import json
import os
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright

OUT = Path("work/browser-test")
OUT.mkdir(parents=True, exist_ok=True)
ENGINE = os.environ.get("FIELD_ATLAS_BROWSER", "chromium")
BASE_URL = "http://127.0.0.1:8765/tetris/prototypes/svg-compositor-lab.html"
EXPECTED = ["noise", "scanlines", "softness", "vignette", "fades", "glow", "phosphor"]


def capture(page, name):
    raw = page.screenshot(animations="disabled")
    (OUT / (ENGINE + "-svg-" + name + ".png")).write_bytes(raw)
    return Image.open(BytesIO(raw)).convert("RGB")


def diff_mean(a, b, box):
    crop_a, crop_b = a.crop(box), b.crop(box)
    return round(float(ImageStat.Stat(ImageChops.difference(crop_a, crop_b)).mean[0]), 3)


with sync_playwright() as p:
    browser_type = getattr(p, ENGINE)
    browser = browser_type.launch(headless=True, args=["--no-sandbox"] if ENGINE == "chromium" else [])
    context = browser.new_context(viewport={"width": 390, "height": 844},
                                  device_scale_factor=1, is_mobile=True, has_touch=True,
                                  reduced_motion="reduce")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))
    page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
    page.locator("#board").wait_for()
    original = page.evaluate("window.__stackTest.order()")
    assert original == EXPECTED, original
    all_css = page.locator("#display").evaluate("el=>getComputedStyle(el).filter")
    assert all_css.count("url(") == 7, all_css
    screen = page.locator("#display").bounding_box()
    rect_board = page.locator("#board").bounding_box()
    rect_buttons = page.locator("#buttons").bounding_box()

    def box(rect):
        return (int(rect["x"]), int(rect["y"]), int(rect["x"] + rect["width"]),
                int(rect["y"] + rect["height"]))

    board_box = box(rect_board)
    controls_box = box(rect_buttons)
    screen_box = box(screen)
    page.evaluate("""() => {
        const el=document.querySelector('#enable');
        el.checked=false;el.dispatchEvent(new Event('change'));
    }""")
    baseline = capture(page, "none")
    stage_results = {}
    for name in EXPECTED:
        page.locator("#display").evaluate(
            "(el, name) => el.style.filter = 'url(#fx-' + name + ')'", name
        )
        image = capture(page, "only-" + name)
        stage_results[name] = {
            "board_diff": diff_mean(image, baseline, board_box),
            "controls_diff": diff_mean(image, baseline, controls_box),
            "screen_diff": diff_mean(image, baseline, screen_box),
        }
    page.evaluate("""() => {
        const el=document.querySelector('#enable');
        el.checked=true;el.dispatchEvent(new Event('change'));
    }""")
    all_image = capture(page, "all")
    page.evaluate("window.__stackTest.move('phosphor', -1)")
    reordered_css = page.locator("#display").evaluate("el=>getComputedStyle(el).filter")
    assert reordered_css != all_css, (all_css, reordered_css)
    reversed_image = capture(page, "reordered")
    order_diff = diff_mean(all_image, reversed_image, screen_box)

    # Make sure the displayed settings and all menus are part of same filter scope.
    page.locator("#openMenu").click()
    modal_on = capture(page, "modal-on")
    page.evaluate("document.querySelector('#display').style.filter='none'")
    modal_off = capture(page, "modal-off")
    menu_diff = diff_mean(modal_on, modal_off, screen_box)

    # Re-enable the stack for a simple play-control regression.
    page.evaluate("window.__stackTest.apply()")
    page.locator("#closeMenu").click()
    page.locator("#drop").click()
    assert page.locator("#score").inner_text() == "000010"

    result = {
        "engine": ENGINE, "seven_filters": original,
        "actual_chain": all_css, "reordered_chain": reordered_css,
        "per_stage_screen_changes": stage_results,
        "reorder_pixel_change": order_diff,
        "modal_pixel_change": menu_diff,
        "page_errors": errors
    }
    (OUT / (ENGINE + "-svg-report.json")).write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))
    # A failure must be visible; never equate accepted CSS with rendered effects.
    assert not errors, errors
    assert all(v["screen_diff"] > 0.1 for v in stage_results.values()), stage_results
    assert order_diff > 0.1, order_diff
    assert menu_diff > 0.1, menu_diff
    context.close()
    browser.close()
