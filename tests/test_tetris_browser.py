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
        reduced_motion="no-preference",
    )
    page = context.new_page()
    exceptions = []
    page.on("pageerror", lambda err: exceptions.append(str(err)))
    try:
        page.goto(URL + "?qa=visual-compositing", wait_until="networkidle", timeout=30000)
        page.locator("#board").wait_for()
        assert page.locator("#scoreValue").inner_text() == "000000"
        assert page.locator("#crtFilterDefs").count() == 1
        assert page.locator("#crtDisplacementMap").count() == 1
        assert page.locator("#curvatureControl").count() == 1
        assert page.locator("#crtDisplacementImage").get_attribute("href").startswith(
            "data:image/png;base64,"
        )
        assert float(page.locator("#crtDisplacementMap").get_attribute("scale")) > 0
        assert "fieldAtlasCRTBarrel" in page.locator("#app").evaluate(
            "el => getComputedStyle(el).filter"
        )
        assert page.locator("#console").count() == 0
        assert page.locator("#consoleState").count() == 0
        # One large, central drop button replaces two rotation buttons.
        # Preserve left/right arrows, a single clockwise rotate, and the
        # already functioning phosphor feedback surface.
        assert page.locator("#pad button").count() == 4
        assert page.locator("#extras button").count() == 2
        assert page.locator("#pad").locator("button").evaluate_all(
            "els => els.map(el=>el.dataset.action)"
        ) == ["left", "hard", "right", "cw"]
        assert page.locator("#extras").locator("button").evaluate_all(
            "els => els.map(el=>el.dataset.action)"
        ) == ["hold", "pause"]
        assert page.locator('[data-action="down"]').count() == 0
        assert page.locator('[data-action="ccw"]').count() == 0
        assert page.locator(".drop-arrow").count() == 0
        assert page.locator(".drop-label").count() == 0
        assert page.locator('button[data-action="hard"]').inner_text() == "DROP"
        # The three directional keys have the same bright, filled phosphor
        # background and shadow-coloured foreground in either screen theme.
        directional_style = page.locator(
            '#pad button[data-action="left"], #pad button[data-action="hard"], #pad button[data-action="right"]'
        ).evaluate_all("""els => els.map(el=>{
          const css=getComputedStyle(el);
          return {background:css.backgroundColor,color:css.color,border:css.borderTopColor};
        })""")
        assert len(directional_style) == 3
        assert len({s["background"] for s in directional_style}) == 1
        assert len({s["color"] for s in directional_style}) == 1
        assert len({s["border"] for s in directional_style}) == 1
        assert page.locator('button[data-action="cw"]').inner_text() == "↻"
        positions=page.evaluate("""() => {
          const selectors=['[data-action="left"]','[data-action="hard"]',
            '[data-action="right"]','[data-action="cw"]'];
          return selectors.map(s=>{
            const r=document.querySelector(s).getBoundingClientRect();
            return {left:r.left,right:r.right,width:r.width,top:r.top,bottom:r.bottom};
          });
        }""")
        assert all(
            positions[i]["right"]<=positions[i+1]["left"]+1
            for i in range(3)
        ), positions
        assert positions[1]["width"]>positions[0]["width"]*1.8, positions
        assert positions[1]["width"]>positions[3]["width"]*1.8, positions
        assert abs(positions[0]["top"]-positions[3]["top"])<2
        hold_rect=page.locator('button[data-action="hold"]').bounding_box()
        pause_rect=page.locator("#pauseButton").bounding_box()
        deck_rect=page.locator("#controlDeck").bounding_box()
        assert hold_rect and pause_rect and deck_rect
        center=(hold_rect["x"]+pause_rect["x"]+pause_rect["width"])/2
        desired=deck_rect["x"]+deck_rect["width"]/2
        assert abs(center-desired)<3, (center,desired)
        board_rect=page.locator("#boardShell").bounding_box()
        assert board_rect and board_rect["height"]>=300, board_rect
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
        # True barrel/fish-eye distortion has a live, persistent slider.
        # Zero MUST disable the SVG filter, not just fade a fake vignette.
        page.locator("#curvatureControl").evaluate(
            """el => {el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}))}"""
        )
        assert page.locator("#curvatureValue").inner_text() == "0%"
        assert page.locator("#app").evaluate("el => getComputedStyle(el).filter") == "none"
        assert page.evaluate(
            "localStorage.getItem('fieldAtlasTetrisCurvatureV01')"
        ) == "0"
        page.locator("#curvatureControl").evaluate(
            """el => {el.value='75';el.dispatchEvent(new Event('input',{bubbles:true}))}"""
        )
        assert page.locator("#curvatureValue").inner_text() == "75%"
        assert float(page.locator("#crtDisplacementMap").get_attribute("scale")) > 10
        assert "fieldAtlasCRTBarrel" in page.locator("#app").evaluate(
            "el => getComputedStyle(el).filter"
        )
        assert page.evaluate(
            "localStorage.getItem('fieldAtlasTetrisCurvatureV01')"
        ) == "75"
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
        # Settings are deliberately smaller than the screen (not resized
        # fullscreen) and the original SF Mono/system face is reinstated.
        menu_rect = page.locator("#options").bounding_box()
        assert menu_rect is not None
        assert menu_rect["height"] <= 844 * 2 / 3 + 2, menu_rect
        assert menu_rect["height"] > 200, menu_rect
        assert page.locator("#displayTitle").count() == 0
        assert "Courier New" not in page.locator("#options").evaluate(
            "el => getComputedStyle(el).fontFamily"
        )
        assert page.evaluate("""() => {
          const returnButton=getComputedStyle(document.querySelector('#closeOptions'));
          const resetButton=getComputedStyle(document.querySelector('#resetEffects'));
          const menu=document.querySelector('#options');
          const button=document.querySelector('#closeOptions');
          const font=getComputedStyle(document.body).fontFamily;
          return returnButton.backgroundColor===resetButton.backgroundColor
            && returnButton.borderRadius===resetButton.borderRadius
            && returnButton.fontFamily===font
            && button.getBoundingClientRect().width >= menu.clientWidth-38;
        }""")
        # The menu scrolls, not the whole page; return remains accessible.
        page.locator("#options").evaluate("el => el.scrollTop=el.scrollHeight")
        assert page.locator("#closeOptions").is_visible()
        assert page.locator("#closeOptions").evaluate(
            "el => {const p=el.closest('#options').getBoundingClientRect();const r=el.getBoundingClientRect();return r.top>=p.top && r.bottom<p.bottom;}"
        )
        assert page.locator('#options input[type="checkbox"]').evaluate_all(
          """els => els.every(el => getComputedStyle(el).borderTopLeftRadius==='0px')"""
        )
        assert page.locator('#screenScan').evaluate(
          """el => getComputedStyle(el).backgroundImage.includes('repeating-linear-gradient')"""
        )
        page.locator("#closeOptions").tap()
        assert page.locator("#options").get_attribute("open") is None
        assert page.locator("#modalScrim").is_hidden()
        # Test actual pixel displacement independently of curved-glass
        # vignette and animations: snapshots must differ with the SVG
        # barrel filter enabled versus disabled.
        page.add_style_tag(content="""
          #crtGlass {opacity:0!important}
          #sweep {display:none!important}
          #buttonFxLayer {display:none!important}
        """)
        warped=page.screenshot(animations="disabled")
        page.evaluate("""() => {
          const slider=document.querySelector('#curvatureControl');
          slider.value='0';
          slider.dispatchEvent(new Event('input',{bubbles:true}));
        }""")
        flat=page.screenshot(animations="disabled")
        assert flat != warped, "CRT filter did not visually distort the output"
        assert page.locator("#app").evaluate("el => getComputedStyle(el).filter") == "none"
        # Return to the mild first-pass curvature; test reset separately.
        page.evaluate("""() => {
          const slider=document.querySelector('#curvatureControl');
          slider.value='16';
          slider.dispatchEvent(new Event('input',{bubbles:true}));
        }""")
        page.locator("#themeToggle").tap()
        assert page.locator("html").get_attribute("data-theme") == "amber"
        page.get_by_role("button", name="Display options").tap()
        page.screenshot(path=str(EVIDENCE/"tetris-menu-amber.png"))
        page.locator("#closeOptions").tap()

        # No independent scoreboard shortcut clutters the TETRIS SYSTEM
        # header. High scores are accessible after pausing the game.
        assert page.locator("header h1").inner_text() == "TETRIS SYSTEM"
        assert page.locator("header small").count() == 0
        assert page.locator("#scoresButton").count() == 0
        assert page.locator("#buttonFxLayer").count() == 1

        # READY has a friendly game description, not technical piece metrics.
        assert page.locator("#veilText").inner_text() == (
            "Stack the blocks. Clear complete rows. Keep the board from filling up."
        )
        # PAUSE is always visibly enabled. It does nothing before the
        # game starts but retains its reactive button flash.
        assert page.locator("#pauseButton").is_enabled()
        page.locator("#pauseButton").tap()
        assert page.locator("#playButton").inner_text().strip() == "▶ START GAME"
        assert page.locator("#pauseButton").is_enabled()
        page.get_by_role("button", name="START GAME").tap()
        page.locator('button[data-action="hard"]').tap()
        page.wait_for_function(
            "() => Number(document.querySelector('#scoreValue').textContent)>0",
            timeout=6000,
        )
        previous_score = page.locator("#scoreValue").inner_text()
        assert int(previous_score)>0
        assert page.locator('button[data-action="restart"]').count() == 0
        page.locator("#pauseButton").tap()
        page.locator("#newGameButton").wait_for(state="visible", timeout=5000)
        assert page.locator("#pauseButton").inner_text() == "PAUSE"
        assert page.locator("#pauseButton").is_enabled()
        assert page.locator("#playButton").inner_text().strip() == "▶ RESUME"
        # The flash is a separately composited effect, not a child that can
        # disappear when a button's label or enabled state changes.
        assert page.locator("#pauseButton .phosphor-hit-layer").count() == 0
        assert page.locator("#buttonFxLayer .phosphor-hit-layer").count() >= 1

        # P and Escape are one-way pause keys; neither may resume the game.
        page.keyboard.press("p")
        assert page.locator("#pauseButton").is_enabled()
        assert page.locator("#playButton").inner_text().strip() == "▶ RESUME"

        page.locator("#pausedScoresButton").tap()
        assert page.locator("#leaderboard").get_attribute("open") is not None
        assert page.locator("#scoreRows .score-row").count() == 5
        page.screenshot(path=str(EVIDENCE/"tetris-high-scores-amber.png"))
        page.locator("#closeLeaderboard").tap()

        # Starting over still requires confirmation; cancel keeps the score.
        page.locator("#newGameButton").tap()
        assert page.locator("#restartConfirm").get_attribute("open") is not None
        page.locator("#cancelRestart").tap()
        assert page.locator("#scoreValue").inner_text() == previous_score
        assert page.locator("#restartConfirm").get_attribute("open") is None
        assert page.locator("#pauseButton").is_enabled()
        page.locator("#playButton").tap()
        page.wait_for_function(
            "() => document.querySelector('#veil').classList.contains('hidden')",
            timeout=3000,
        )
        assert page.locator("#pauseButton").inner_text() == "PAUSE"
        assert page.locator("#veil").get_attribute("class") == "hidden"
        assert not exceptions, exceptions
        print("PASS: solid directional keys, text-only Drop, always-visible Pause, friendly instructions and protected Resume")
    finally:
        try:
            page.screenshot(path=str(EVIDENCE/"tetris-final.png"))
        except Exception:
            pass
        context.close()
        browser.close()
