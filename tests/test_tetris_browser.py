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
    engine = os.environ.get("FIELD_ATLAS_BROWSER", "chromium")
    assert engine in ("chromium", "webkit")
    browser_type = getattr(p, engine)
    launch_args = ["--no-sandbox"] if engine == "chromium" else []
    browser = browser_type.launch(headless=True, args=launch_args)
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
        # No geometric warping or curve settings survive.
        for obsolete in ("#crtFilterDefs", "#crtDisplacementMap",
                         "#curvatureControl", "#crtGlass"):
            assert page.locator(obsolete).count() == 0
        assert page.locator("#app").evaluate(
            "el => getComputedStyle(el).filter"
        ) == "none"
        assert page.locator("#console").count() == 0
        assert page.locator("#consoleState").count() == 0
        # Neutral-grayscale app: stage wrapper stays transparent, visible
        # panels darker than the common app and ordinary button surface.
        colours=page.evaluate("""() => {
          const color=id=>getComputedStyle(document.querySelector(id)).backgroundColor;
          const rgb=value=>{
            const c=document.createElement('canvas');c.width=c.height=1;
            const ctx=c.getContext('2d');ctx.fillStyle=value;
            ctx.fillRect(0,0,1,1);
            return Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3);
          };
          return {
            base:getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
            header:rgb(color('header')),
            controls:rgb(color('#controlDeck')),
            hold:rgb(color('#side .side-panel')),
            shell:rgb(color('#boardShell')),
            stage:color('#stage'),
            boardPixel:Array.from(document.querySelector('#board')
              .getContext('2d').getImageData(15,15,1,1).data).slice(0,3),
            normalButton:rgb(color('#pauseButton')),
            brightButton:rgb(color('#pad [data-action="hard"]'))
          };
        }""")
        assert colours["base"].lower() == "#151515", colours
        assert colours["stage"] in ("rgba(0, 0, 0, 0)", "transparent"), colours
        assert colours["header"] == colours["controls"] == colours["hold"] == colours["shell"], colours
        assert colours["normalButton"] == [21, 21, 21], colours
        assert all(colours["header"][i] < colours["normalButton"][i]
                   for i in range(3)), colours
        assert colours["brightButton"][1] > colours["normalButton"][1], colours
        assert colours["boardPixel"][1] < colours["normalButton"][1], colours
        # Confirm there is no background brightening gradient; one hue overlay
        # colours the already-grayscale scene without changing these values.
        assert page.locator("#app").evaluate(
            "el => getComputedStyle(el).backgroundImage"
        ) == "none"
        assert page.locator("#phosphorFilm").evaluate(
            "el => [getComputedStyle(el).mixBlendMode,getComputedStyle(el).opacity]"
        ) == ["color", "1"]
        assert "radial-gradient" in page.locator("#screenShade").evaluate(
            "el => getComputedStyle(el).backgroundImage"
        )

        # The app is flat grayscale. Regular button faces equal the app pixel
        # value, parent cards are darker, Start/Resume joins LEFT/DROP/RIGHT.
        button_surfaces=page.evaluate("""() => {
          const probe=document.createElement('span');
          probe.style.backgroundColor='var(--app-face)';
          document.querySelector('#app').append(probe);
          const appRgb=getComputedStyle(probe).backgroundColor;
          probe.remove();
          const samples=['#themeToggle','#optionsButton',
            '#pad [data-action="cw"]','#extras [data-action="hold"]',
            '#pauseButton','#newGameButton','#pausedScoresButton',
            '#confirmRestart','#saveScore',
            '#resetEffects','#cancelRestart','#closeLeaderboard'];
          const colours=samples.map(selector=>({
            selector,background:getComputedStyle(document.querySelector(selector)).backgroundColor
          }));
          const primary=['#playButton','#pad [data-action="left"]',
            '#pad [data-action="hard"]','#pad [data-action="right"]']
            .map(selector=>({selector,background:getComputedStyle(document.querySelector(selector)).backgroundColor}));
          return {appRgb,colours,primary};
        }""")
        assert all(e["background"]==button_surfaces["appRgb"] for e in button_surfaces["colours"]), button_surfaces
        assert all(e["background"]!=button_surfaces["appRgb"] for e in button_surfaces["primary"]), button_surfaces
        assert len({e["background"] for e in button_surfaces["primary"]})==1, button_surfaces
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
        # The visible Return button uses the same screen colour as the
        # play controls; hidden-dialog computed styles can be cached by WebKit.
        assert page.locator("#closeOptions").evaluate(
            "el => getComputedStyle(el).backgroundColor"
        ) == page.locator("#pauseButton").evaluate(
            "el => getComputedStyle(el).backgroundColor"
        )
        assert page.locator("#options").get_attribute("open") is not None
        assert page.locator("#modalScrim").is_visible()
        # Five independently switchable CRT experiments are opt-in.
        experimental=page.evaluate("""() => {
          const section=document.querySelector('#experimentalFxSection');
          const keys=['Noise','Persistence','Softness','Interference','Glitch'];
          const initiallyOff=keys.every(k=>!document.querySelector('#fx'+k+'Enabled').checked);
          const board=document.querySelector('#board').getContext('2d');
          const before=Array.from(board.getImageData(15,15,1,1).data);
          const enable=k=>{
            const el=document.querySelector('#fx'+k+'Enabled');
            el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));
          };
          keys.forEach(enable);
          const adjust=(id,value)=>{
            const el=document.querySelector('#'+id);
            el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));
          };
          adjust('fxSoftnessAmount',50);
          adjust('fxPersistenceDecay',1200);
          adjust('fxNoiseSpeed',24);
          const after=Array.from(board.getImageData(15,15,1,1).data);
          return {hasSection:!!section,initiallyOff,unmodifiedBoard:
            JSON.stringify(before)===JSON.stringify(after),
            blur:getComputedStyle(document.querySelector('#fxSoftness')).backdropFilter,
            noise:getComputedStyle(document.querySelector('#fxNoise')).display,
            interference:getComputedStyle(document.querySelector('#fxInterference')).display,
            glitch:getComputedStyle(document.querySelector('#fxGlitch')).display,
            saved:JSON.parse(localStorage.getItem('fieldAtlasTetrisExperimentalV01'))};
        }""")
        assert experimental["hasSection"] and experimental["initiallyOff"], experimental
        assert experimental["unmodifiedBoard"], experimental
        assert experimental["blur"] == "blur(0.8px)", experimental
        assert experimental["noise"] == "block", experimental
        assert experimental["interference"] == "block", experimental
        assert experimental["glitch"] == "block", experimental
        assert experimental["saved"]["persistenceDecay"] == 1200, experimental

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
        # Blur still acts only within the pause board overlay.
        assert page.locator("#veil").evaluate(
            "el => getComputedStyle(el).backdropFilter"
        ) == "blur(3px)"
        page.locator("#vignetteControl").evaluate(
            """el => {el.value='75';el.dispatchEvent(new Event('input',{bubbles:true}))}"""
        )
        opacity = page.locator("#screenShade").evaluate(
            "el => Number(getComputedStyle(el).opacity)"
        )
        assert abs(opacity-0.75)<0.01, opacity
        # Traveling refresh sweep is independently adjustable from glow.
        page.locator("#sweepControl").evaluate(
            """el => {el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}))}"""
        )
        assert page.locator("#sweep").evaluate(
            "el => getComputedStyle(el).opacity"
        ) == "0"
        page.locator("#sweepControl").evaluate(
            """el => {el.value='65';el.dispatchEvent(new Event('input',{bubbles:true}))}"""
        )
        assert page.locator("#sweep").evaluate(
            "el => getComputedStyle(el).opacity"
        ) == "0.65"
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
        scan_style = page.locator('#screenScan').evaluate("""el => {
          const s=getComputedStyle(el);
          return {image:s.backgroundImage,opacity:s.opacity,zIndex:s.zIndex};
        }""")
        assert "repeating-linear-gradient" in scan_style["image"], scan_style
        assert "rgba(255, 255, 255, 0.15)" in scan_style["image"], scan_style
        assert ("transparent" in scan_style["image"] or
                "rgba(0, 0, 0, 0)" in scan_style["image"]), scan_style
        assert "rgba(0, 0, 0, 0.59)" in scan_style["image"], scan_style
        assert scan_style["zIndex"] == "43", scan_style
        page.locator("#closeOptions").tap()
        assert page.locator("#options").get_attribute("open") is None
        assert page.locator("#modalScrim").is_hidden()
        # Tapping a button produces an isolated screen-space afterimage.
        assert page.locator('#buttonFxLayer .fx-persistence-ghost').count() >= 1
        page.get_by_role("button", name="Display options").tap()
        page.locator("#resetExperimental").tap()
        assert page.locator("#fxNoiseEnabled").is_checked() is False
        assert page.locator("#fxPersistenceEnabled").is_checked() is False
        assert page.locator("#fxSoftnessEnabled").is_checked() is False
        assert page.locator("#fxInterferenceEnabled").is_checked() is False
        assert page.locator("#fxGlitchEnabled").is_checked() is False
        assert page.locator('#buttonFxLayer .fx-persistence-ghost').count() == 0
        assert page.locator("#fxNoise").evaluate(
            "el => getComputedStyle(el).display"
        ) == "none"
        assert page.evaluate(
            "JSON.parse(localStorage.getItem('fieldAtlasTetrisExperimentalV01')).noiseEnabled"
        ) is False
        page.locator("#closeOptions").tap()

        # The game content is no longer subjected to a distortion filter.
        assert page.locator("#app").evaluate(
            "el => getComputedStyle(el).filter"
        ) == "none"
        page.locator("#themeToggle").tap()
        assert page.locator("html").get_attribute("data-theme") == "amber"
        amber_colours=page.evaluate("""() => {
          const color=id=>getComputedStyle(document.querySelector(id)).backgroundColor;
          const rgb=value=>{
            const c=document.createElement('canvas');c.width=c.height=1;
            const ctx=c.getContext('2d');ctx.fillStyle=value;
            ctx.fillRect(0,0,1,1);
            return Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3);
          };
          return {
            base:getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
            header:rgb(color('header')),
            controls:rgb(color('#controlDeck')),
            hold:rgb(color('#side .side-panel')),
            shell:rgb(color('#boardShell')),
            stage:color('#stage'),
            boardPixel:Array.from(document.querySelector('#board')
              .getContext('2d').getImageData(15,15,1,1).data).slice(0,3),
            normalButton:rgb(color('#pauseButton')),
            brightButton:rgb(color('#pad [data-action="hard"]'))
          };
        }""")
        assert amber_colours["base"].lower() == "#151515", amber_colours
        assert amber_colours["stage"] in ("rgba(0, 0, 0, 0)", "transparent"), amber_colours
        assert amber_colours["header"] == amber_colours["controls"] == amber_colours["hold"] == amber_colours["shell"], amber_colours
        assert amber_colours["normalButton"] == [21, 21, 21], amber_colours
        assert all(amber_colours["header"][i] < amber_colours["normalButton"][i]
                   for i in range(3)), amber_colours
        assert amber_colours["brightButton"][0] > amber_colours["normalButton"][0], amber_colours
        assert amber_colours["boardPixel"][0] < amber_colours["normalButton"][0], amber_colours
        assert amber_colours["header"]==colours["header"]
        assert amber_colours["normalButton"]==colours["normalButton"]
        assert amber_colours["brightButton"]==colours["brightButton"]

        # The app is flat grayscale. Regular button faces equal the app pixel
        # value, parent cards are darker, Start/Resume joins LEFT/DROP/RIGHT.
        button_surfaces=page.evaluate("""() => {
          const probe=document.createElement('span');
          probe.style.backgroundColor='var(--app-face)';
          document.querySelector('#app').append(probe);
          const appRgb=getComputedStyle(probe).backgroundColor;
          probe.remove();
          const samples=['#themeToggle','#optionsButton',
            '#pad [data-action="cw"]','#extras [data-action="hold"]',
            '#pauseButton','#newGameButton','#pausedScoresButton',
            '#confirmRestart','#saveScore',
            '#resetEffects','#cancelRestart','#closeLeaderboard'];
          const colours=samples.map(selector=>({
            selector,background:getComputedStyle(document.querySelector(selector)).backgroundColor
          }));
          const primary=['#playButton','#pad [data-action="left"]',
            '#pad [data-action="hard"]','#pad [data-action="right"]']
            .map(selector=>({selector,background:getComputedStyle(document.querySelector(selector)).backgroundColor}));
          return {appRgb,colours,primary};
        }""")
        assert all(e["background"]==button_surfaces["appRgb"] for e in button_surfaces["colours"]), button_surfaces
        assert all(e["background"]!=button_surfaces["appRgb"] for e in button_surfaces["primary"]), button_surfaces
        assert len({e["background"] for e in button_surfaces["primary"]})==1, button_surfaces
        page.get_by_role("button", name="Display options").tap()
        assert page.locator("#closeOptions").evaluate(
            "el => getComputedStyle(el).backgroundColor"
        ) == page.locator("#pauseButton").evaluate(
            "el => getComputedStyle(el).backgroundColor"
        )
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
        assert page.locator("#newGameButton").inner_text().strip() == "NEW GAME"
        assert page.locator("#pausedScoresButton").inner_text().strip() == "HIGH SCORE"
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
        # Even nested high-score rows must contrast with the dialog parent.
        assert page.locator("#scoreRows .score-row").first.evaluate(
            "el => getComputedStyle(el).backgroundColor"
        ) == page.locator("#extras [data-action='hold']").evaluate(
            "el => getComputedStyle(el).backgroundColor"
        )
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
