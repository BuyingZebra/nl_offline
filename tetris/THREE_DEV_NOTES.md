# FIELD ATLAS · Three.js CRT Lab & Tetris V027 rebuild

## Stable development entry points
- **CRT effects laboratory:** `tetris/three-effects-lab.html` — preserved snapshot of the working standalone Three.js shader test. **Keep for experimenting** with future artifact layers. The earlier `three-crt-test.html` is still present.
- **V027 re-creation in Three.js:** `tetris/three-v027.html` + `tetris/three-v027.js` — experimental full-game recreation. Do not replace the canonical `tetris/index.html` / Pixi build before visual and functional approval.
- **Shared engine and local scores:** `tetris/core.js` and `tetris/scores.js`. Their rules and storage schema are unchanged.

## Approved visual baseline (from iPhone screenshots)
| Effect | Enabled | Values |
|---|---|---|
| Phosphor | yes | monochrome green; derived from source grayscale luminance |
| Bloom | yes | threshold 0.21, strength 0.30 |
| Ghosting | yes | X +2 px, Y 0 px, strength 22% |
| Noise | no | amount 20%, size 2 logical px, rate 15 Hz |
| Edge softness | yes | blur strength 0.64, radius 3.0 logical px |
| Vignette | yes | darkening 0.39, fade spread 0.57 |
| Vertical roll | no | speed 20%/s, offset 0% |
| Scanlines, flicker, horizontal tearing, raster sweep, persistence | removed | Do not reintroduce by default |

Processing order: **grayscale Canvas2D source → vertical roll (optional) → ghosting → luminance-gated noise → phosphor → thresholded GPU bloom → Gaussian edge softness → vignette → final output**.

## Architecture and implementation boundaries
- Draw all of the app (board, previews, controls, score, dialogs) as **one high-density grayscale Canvas2D texture** at device pixel density. Three.js post-processing samples that screen as a coherent framebuffer, like a Blender compositor.
- Maintain full-resolution text and pointer interaction; do not use SVG filters to simulate whole-screen effects.
- A temporary input field is allowed for iOS initials entry, but the composited dialog itself is drawn as grayscale source content.
- Effect settings for the experimental full game are stored under `fieldAtlasThreeV027FX01`, separate from the legacy Pixi settings. Game scores continue using `fieldAtlasTetrisTopFiveV01`.
- The Three.js prototype currently imports libraries from CDN and is therefore **not offline-ready yet**. Vendor/bundle Three.js and addon modules locally, update service-worker caching and validate offline/iOS performance **before promoting to the real PWA**.
- Current Pixi `tetris/index.html` stays unchanged during the experiment. Avoid branching/maintaining duplicate production versions after approval.

## Validation
- JavaScript module syntax was checked.
- A mocked startup/render check initialized the Canvas2D UI, legacy engine, Three.js passes, and first render with no exception.
- Real iPhone screenshot/interaction, renderer performance, colour and font parity against original V027 remain for user approval.

## Migration interpretation and interaction contract
- V027 is the **visual/layout and gameplay behaviour reference**, not a mandate to carry its older renderer or interface code forward. The new application draws a unified grayscale screen to Canvas2D and performs **all CRT post-processing in Three.js**. The shared pure-JavaScript `core.js` game rules and `scores.js` format remain reusable.
- Continue iterating on `three-v027.html` / `three-v027.js` using small, testable changes. **Never replace the effects laboratory** or the current production Tetris without explicit approval.
- The October 18 gesture refinement uses **one pointer recognizer**: menu actions activate on touch-up, vertical swipes scroll even when starting over switches or sliders, horizontal drags change sliders, long-running scrolls ease out with momentum, and repeated game movement buttons continue to act immediately.
- Geometry hit testing and on-screen drawing must use the same logical-pixel coordinates. Test menu input on real iPhones and Android phones; mocked input tests do not substitute for device verification.

## Rendering performance — menu texture isolation
- Three.js now renders the gameplay source and menu as **separate high-resolution grayscale CanvasTextures in one Scene**, along with a transparent dimming scrim. A **single RenderPass and the existing CRT effect pipeline** processes the combined image. This is not an unfiltered DOM overlay.
- While the menu scrolls, only the smaller modal canvas is repainted and uploaded. The large gameplay canvas is cached until gameplay, theme, game options or viewport size actually changes.
- Continue measuring actual phone smoothness: although canvas uploads are reduced, the full-screen GPU effects are still evaluated for every rendered animation frame. Any further GPU optimization must preserve approved optical appearance.

## V002: V027 layout contract
- **V027 original CSS is authoritative** for geometry and spacing. Version 002 introduces one `UI_SPACE` token object and a `layout()` function; render and pointer hitboxes use the same computed rectangles.
- Portrait outer content width: `min(viewport width, 520px)`; side gutters 11px. Header and measured controls deck occupy fixed/minimum space, separated from a **flexible middle stage** by 9px gaps (6px on shorter screens).
- Reference portrait (393 x 852 logical px, safe top 59, bottom 34): header `x=11,y=59,w=371,h=80`; board `x≈31,y=148,w≈229,h=457`; controls `y=614,h=174`; footer `y=800`. Values follow responsive formulas, not coordinates hardcoded to this one device.
- Board holds **10×20** grid and always retains 1:2 aspect ratio. Board width is constrained by both stage width minus sidebar (93px + 10px gap) and half the available stage height, max 305px.
- Sidebar: HOLD (88px), NEXT (162px), BEST/PIECES (92px) on normal-height phones. Panels are constrained to the stage and shrink where necessary to avoid overlap; miniature pieces use original V027 120x90/120x75 canvas scaling for accurate visual sizes.
- Controls deck: 9px internal inset; 45px score row; 7px gaps; 53px primary buttons in five evenly divided tracks with 6px gutters; 44px secondary buttons; 8px gap between extras. Portrait deck uses safe-area-aware bottom anchoring.
- Header: 46px icons at 7px gap, 13px right inset. Text supports V027 letter spacing (heading 0.13em, buttons 0.08em, captions 0.12em).
- Tested mocked layout and game interaction in 393x852, 375x667, 320x568, 430x932 and 852x393. **Real iPhone comparison still required** before claiming exact visual parity.
- CRT compositor shader code, approved effect values, and preserved laboratory are unchanged.

## V003: Permanent test URL and six-pixel spacing

**Save this one URL for every subsequent test build:**
https://buyingzebra.github.io/nl_offline/tetris/three-v027.html

- GitHub Pages is enabled. This is the **branch-following Pages URL** for the existing experimental Three.js build, not a commit-pinned `raw.githack.com` URL.
- GitHub Pages may take a short time to publish new commits. The page now loads `three-v027.js` using a **timestamped dynamic module URL on each new page load** to avoid returning an old locally cached JS module. Close the page and reopen the *same URL*, or reload it. Don't create fresh bookmark links with a new commit hash every iteration.
- The `THREE_BUILD_VERSION` constant is the single version identifier displayed in the bottom-right footer. Increment it sequentially with each shipped test build: 001 → 002 → 003, etc.
- New uniform layout spacing token: `UI_GAP = 6` CSS/logical pixels. Derived values include header-to-stage, stage-to-controls, board-to-sidebar, HOLD-to-NEXT, game control gaps, buttons-to-panel horizontal insets, and START/RESUME insets. Avoid introducing unrelated margin literals.
- **START / RESUME / PLAY AGAIN** get their height directly from `layout().buttonH`, the same value used by LEFT / DROP / RIGHT / ROTATE. This naturally follows compact-height responsive rules (53 / 45 / 42 CSS pixels).
- Bottom HOLD and PAUSE controls now fill their panel interior in two equal columns, with 6px between and 6px from both walls. Modal button scroll and CRT effects stay unchanged.
- Parent-to-viewport gutters (11px) remain separate from the inter-container spacing rule. As in V027, the stats panel remains anchored to the bottom of the sidebar, leaving flexible empty space beneath NEXT, but all *adjacent* panels maintain at least a 6px gap.
- Keep the approved compositor shaders/values, the effects laboratory and the canonical Pixi app unchanged unless specifically requested.

## V005: Shared header and secondary-control height
- In V004, HOLD, PAUSE and the board-overlay action buttons were reduced to 75% of their previous widths and centered in their parent panels.
- V005 uses `layout().headerButtonH` as the single source of truth for phosphor, settings, HOLD and PAUSE button heights (46px regular portrait, 42px short portrait, 37px landscape). Keep the 75% widths and center alignment from V004.
- START/RESUME and the other board-overlay buttons retain their prior heights; START/RESUME still equal the top gameplay controls. The CRT effects, settings and shader pipeline are unchanged.
- Verified mock startup and touch workflows across five portrait and landscape viewport configurations; device testing remains necessary.

## V006: Unified button typography and centered title
- `TETRIS SYSTEM` now uses the exact vertical midpoint of its existing header; the previous 6px downward text offset is removed. Horizontal positioning and header dimensions are untouched.
- All Canvas2D `key()` buttons use the former DROP font size of **14px**. Buttons with the existing bright fill (`light: true`), including DROP, movement controls and primary confirmation actions, draw labels at **17.5px** (125%). Icon glyphs in buttons follow the same rule.
- Per-call font overrides were removed to prevent inconsistent button labels across settings, game overlays and dialogs. Existing width, height, spacing, centering, hit regions, CRT passes and FX defaults are unchanged.
- Version indicator increments from `005` to `006`; the permanent `three-v027.html` link and timestamped module reload remain intact. Static checks passed; actual phone visual verification remains pending.

## V007: Consistent button and character-icon typography
- **All default and solid buttons use a 14px font**, including characters used as icons (`◀`, `▶`, `↻`, `◐`, `☷`); fill/background luminance never changes font size.
- Only the three main game-entry action labels **START GAME / RESUME / PLAY AGAIN** use **16px**, including the corresponding `▶` icon in the same button.
- Keep existing font weight, letter spacing, sizes/positions of button rectangles, hitboxes, overlay arrangement, spacing, and compositor unchanged. No new URL: the existing `three-v027.html` entry point loads this updated `three-v027.js` and displays build `007`.

## V008: Home Screen automatic build updates
- **Same permanent URL:** `tetris/three-v027.html`. An iOS Home Screen web app may resume its existing page without a fresh navigation, so the HTML's timestamped import alone cannot pick up new code on resume.
- On startup, `pageshow`, focus, and returning to the foreground, probe the current source `three-v027.js` via an uncached, timestamped network request. Compare its `THREE_BUILD_VERSION` against the running build and reload automatically when a newer build exists.
- Check at most once per 15 seconds and also while the idle app remains foregrounded (every 60 seconds). Offline/network failure leaves the current build running.
- Only auto-reload in the **ready/new-game** state with no modal open. Never discard an in-progress game, paused game, or high-score dialog.
- The existing bookmark, button typography, geometry, settings, shaders, score storage and production Pixi build are unchanged. A web app still running a pre-V008 script needs **one full reload or force-close-and-relaunch** before it can start self-checking on future resumes.

## V009: No button tracking; primary game-entry height matches HOLD / PAUSE
- Every `key()` button label (including character glyphs) now uses natural monospace spacing: no extra 0.08em letter spacing. Heading, HUD, and other non-button tracking are unchanged.
- The **START GAME / RESUME / PLAY AGAIN** solid board-overlay key now uses `layout().extraH`, exactly matching the bottom-row **HOLD / PAUSE** height (46px normal portrait, 42px short portrait, 37px landscape). The top-row movement controls still use `layout().buttonH` (53 / 45 / 42px, according to viewport rules). Other overlay buttons keep their heights, 75%-width scaling, spacing and centered positioning.
- Both button font sizes remain 14px normally, 16px for START GAME / RESUME / PLAY AGAIN including their play icon. Shader/compositor, gameplay, storage, and permanent URL are unchanged. The footer reports Version 009.

## V010: Character-icon typography increased by 2px
- Button **text** stays 14px normally, 16px on START GAME / RESUME / PLAY AGAIN.
- Standalone character icons `◀`, `▶`, `↻`, `◐`, `☷` draw at **16px** instead of 14px, whether solid or default.
- The `▶` icon alongside START GAME / RESUME / PLAY AGAIN is **18px** instead of 16px, independently sized from the unchanged 16px caption.
- No letter spacing on buttons, and no changes to button rectangles, centering, input regions, layout, rendering passes, Home Screen update logic, or permanent URL. Footer shows Version 010.

## V011: Uniform character icons and wider game-board buttons
- All button icon characters (`◀`, `▶`, `↻`, `◐`, `☷`), including the separate play arrow in START GAME / RESUME / PLAY AGAIN, use exactly **18px**. Standard button labels stay 14px; the three main-action labels stay 16px. No additional letter spacing.
- All action buttons on the **game board itself** (START GAME / RESUME / PLAY AGAIN, plus paused NEW GAME and HIGH SCORE) are **85% of the full playfield width** (7.5% margin on either side), centered. They use the separate `UI_SPACE.overlayButtonWidthScale=.85` token.
- HOLD and PAUSE controls **outside the game board** continue to use the existing 75%-width rule. All button heights, hit testing, spacing, gameplay, shaders, score handling, Home Screen update logic, and the permanent URL remain unchanged. Footer shows Version 011.

## V012: Trial of reference phosphor tints
- Apply the candidate CRT-inspired hue settings to the **existing full-screen GPU tint pass** only: green `#33FF33` (RGB multipliers `[0.2, 1, 0.2]`) and amber `#FFB000` (`[1, 176/255, 0]`). These are *approximate digital colour targets*, not measured or standardised CRT phosphor chromaticities; visual appearance also depends on the shader's luminance multiplication, bloom, colour-space handling and phone screen.
- Keep all grayscale UI source luminance values, layout, gameplay, saved theme selection, existing shader order and optical effects unchanged. The footer reports Version 012, with the same bookmarked Home Screen URL.

## V013: Pip-Boy amber trial (`#B98532`)
- Set only the amber hue vector of the existing full-screen phosphor pass to `new THREE.Vector3(185/255,133/255,50/255)`, matching the chosen darker aged-gold colour study candidate. This is an RGB tint multiplier on source luminance; actual post-compositor colour may differ from the flat swatch.
- Green retains the V012 `#33FF33` vector. All grayscale UI source values, brightness hierarchy, shaders/CRT effects, interaction and layouts, fonts, saved preferences, and the Home Screen update check remain unchanged.
- Increment `THREE_BUILD_VERSION` to `013` without changing the permanent URL `tetris/three-v027.html`.

## V014: Amber phosphor visually matched to approved Pip-Boy study
- **Amber only:** change the current GPU tint vector from `[185/255, 133/255, 50/255]` to `[185/255, 79/255, 9/255]`. Green remains **exactly** `[.2, 1, .2]`.
- Pixel sampling of the user's Version 013 screenshot found the bright filled-button output near **RGB (215, 186, 119)**, whereas the approved bottom-right image study was near **RGB (214, 147, 52)**. The new coefficients preserve red intensity while reducing green and blue roughly by the amount expected under sRGB transfer curves. This is a **visual trial**, not a claim that the app's final emitted light exactly equals the mockup.
- No changes to grayscale source values, interface luminance constants, layout, gameplay, stored preferences, bloom/CRT effects, compositor pass order, or Home Screen refresh. The footer shows **Version 014** at the unchanged `tetris/three-v027.html` URL.

## V015: Reverse grayscale field and container luminance
- The UI drawing palette swaps **background** and **panel** values only: `C.bg` changes from `#151515` to near-black `#080808`; `C.panel` changes from `#080808` to `#151515`. The Three.js scene background also switches from `0x151515` to `0x080808`.
- Preserve `C.button='#151515'`, all other grayscale entries, text, border, grid and solid key brightness. This first trial isolates the relationship between the darker screen field and brighter content panels.
- Both approved phosphor tints (green `[.2, 1, .2]`, amber `[185/255, 79/255, 9/255]`), post-processing effects, layout, controls, offline update checker, and permanent URL remain unchanged. Footer shows Version 015.

## V016: Default buttons match near-black, panels lifted 3 percentage points
- Set the **normal, non-solid button face** to the exact same grayscale value as the background: `#080808`. Both `C.bg` and `C.button` use the same `SCREEN_BLACK` constant to prevent them drifting apart. Default button pressed feedback remains as before.
- Increase the **lighter panel/container grayscale** from `#151515` (21/255) to `#1D1D1D` (29/255), approximately **+3 percentage points of the full grayscale scale**, not a 3% relative increase. Buttons are not brightened with the panels.
- Do not change the approved solid button fill, text, border, board layout, green or amber shader tints, FX, or the existing permanent Home Screen link. Footer displays **Version 016**.

## V017: Board-only pause blur; rebuilt grayscale bevel details
- **PAUSED only:** replace the nearly opaque 88% black board overlay with an authentic offscreen **Gaussian blur, radius 5.5 CSS px blended at 65%**, and a **subtle 8% black dim**. Capture only the board pixels after gameplay draw, clip the effect to the board's rounded interior, then draw PAUSED/RESUME/NEW GAME/HIGH SCORE labels and buttons at full sharpness. An older Canvas2D-filter fallback downsamples then resamples the board. This is an image blur, not a tinted translucent veil or a fullscreen compositor change.
- The 88% dark overlay is retained for READY/GAME OVER, untouched, because the requested change specifically concerns the paused board.
- **Recreated tile surface:** one new independent grayscale `tileFace()` function constructs bevel rims, upper-left glints, an inset lower-luminance panel, and bottom shadows for all settled/falling board squares and HOLD/NEXT preview squares. Original V027 is only the visual inspiration; no Pixi graphics or renderer logic was copied.
- Preserve approved green/amber GPU colour vectors, all other UI luminance tokens, layout, game input/hitboxes, button typography, effects and permanent URL. Footer shows Version 017.

- **iOS Safari compatibility follow-up:** since Canvas2D `ctx.filter` is disabled by default in iOS Safari, provide a real, separable **three-pass box-convolution blur** on a reusable downsampled board snapshot. This approximates Gaussian blur using the same 65%-blend and 8%-dim constants. Filter-enabled browsers can use the native blur directly. No blur is applied to the menu controls, and no UI/phosphor changes are made.

## V018: Photoshop-style pause blur percentage, 12% board dimming, ghost retention
- Replace the previous two-parameter 65%-mixture/5.5px blur with **one persistent user-facing `PAUSE BLUR` slider** under Gameplay in Display Settings, ranging **0–100%**, default **65%**. At 0%, do not run the blur; at 100%, use a very large Gaussian-like radius so the board is strongly defocused. At intermediate percentages, the code derives its radius from the board width and a nonlinear response curve (`boardWidth * .9 * (percent/100)^4`). A blurred sample fully replaces the sharp pixels, rather than blending with the unblurred board; this avoids permanent sharp detail at 65%. All rendering remains grayscale before the approved phosphor GPU pass.
- Preserve a portable three-pass separable box/Gaussian approximation on iOS Safari when native 2D `filter:blur` is unavailable. `PAUSE BLUR` is saved under the existing `FX` settings object, and resetting Display Settings restores 65%.
- Paused board dimming is **12%**, limited to the playfield, with PAUSED, RESUME, NEW GAME and HIGH SCORE text/buttons still sharp and unaffected.
- When ghost-piece display is enabled, the projected ghost is rendered in both playing and paused states. Settled pieces, active piece, projected ghost, underlying grid, and whole board content are captured together and blurred; none are omitted behind the pause menu.
- The same existing `tileFace()` detailed grayscale bevel/highlight renderer is used by the board and the HOLD/NEXT preview squares. No edits are necessary to duplicate it because they already share the routine.
- Keep approved green/amber vectors, grayscale brightness hierarchy, button geometry, gameplay, main shader pipeline, and Home Screen URL unchanged. Footer shows Version 018.

## V019: Shared GPU Gaussian kernel for all board popups
- **One technical blur method:** the in-board popup blur now runs through its own Three.js GPU ShaderPass, using exactly the same normalized **7×7 Gaussian kernel** (`weight = exp(-dot(offset,offset)/(2*1.25²))`) and sampled spacing (`radius/3`) as the existing Edge Softness shader. The separate Canvas2D blur and CPU three-pass box approximation were removed.
- **Sharp popup layering:** grayscale board gameplay and popup labels/buttons are drawn into separate CanvasTextures. The compositor blurs all pixels within the board interior, then dims them by **20%**, and finally composites sharp board-popup text/buttons before the existing CRT/phosphor/bloom passes. Blur sampling is restricted to the board bounds, not the side panels or HOLD/NEXT.
- **All game-board popup states:** READY/START GAME, PAUSED/RESUME and GAME OVER/PLAY AGAIN all receive the same effect; the old opaque 88% veil is removed entirely.
- **Control:** rename PAUSE BLUR to **BOARD POPUP BLUR** and default to **35%** (0–100%). Blur percentage derives the Gaussian sample radius from board width (with the existing nonlinear mapping) while the Gaussian kernel remains identical to Edge Softness. Using a new key (`boardBlur`) prevents an older saved 65% pause setting overriding the intended 35% default, while preserving other existing FX settings.
- Preserve ghost-piece projection while paused when enabled, all beveled tiles including HOLD and NEXT, exact approved amber and green tint vectors, grayscale UI luminance and button dimensions. When a separate whole-screen settings/scores/confirmation dialog is open, the board-popup pass is suspended so the separate modal stays sharp. Permanent URL unchanged, footer version **019**.

## V020: 47% blur, 29% dim, repaired state-specific popup, row-clear flashing
- **Board popup look:** default Gaussian board blur now **47%** (rather than 35%) and the board's dimming multiplier is **29%** (rather than 20%). Both use the existing 7×7 Gaussian shader; popup labels/buttons remain sharp and the two approved phosphor vectors are untouched. An upgrade key `fieldAtlasBoardPopupV020` applies 47% once to existing saved preferences, then future manual changes are respected.
- **Pause overlay repair:** previously the sharp board popup was authored inside `stage()`. It is now independently rebuilt in `paintBoardPopup(r)`, called at the end of each `paintBaseGame()` render. Its dedicated transparent texture is cleared first, and the latest `game.status` is recorded before the Gaussian pass uses it. The popup pass is enabled only when the painted status matches the actual game status; the overlay controls register on top of standard game controls. READY shows `TETRIS / START GAME`, PAUSED shows `PAUSED / RESUME / NEW GAME / HIGH SCORE`, GAME OVER shows `GAME OVER / PLAY AGAIN`.
- **New row deletion effect:** a rendering-only observer on the current `game.lockPiece()` captures the exact board with its just-locked piece before the shared `Core.Game` deletes complete rows. Completed rows alternate every **72 ms** between normal detailed filled cubes and faint empty cube outlines, for approximately **430 ms**. Then the already-updated board is shown. Gravity and movement/drop/hold inputs are held briefly during the animation; pause still works and freezes animation progress. A fresh game cancels any leftover flash. The shared `core.js`, scores, and gameplay logic are not modified.
- **Source-level tests:** JavaScript source parses after removing ES module imports; an isolated test against the genuine shared `core.js` verified that locking an O tetromino into a prepared row produces a full snapshot while Core still credits and removes exactly one row. Another test verified the game engine pause/resume transitions and exact READY/PAUSED/GAME OVER popup labels, including the three PAUSED buttons.
- Grayscale panels/button tones, tile highlights for board and HOLD/NEXT, full-screen CRT FX, and the permanent `tetris/three-v027.html` URL are unchanged. Footer now reports **Version 020**. Phone/browser GPU rendering still requires visual confirmation.

## V021: Fix frozen board popup and pixelated blur; replace dimming with fade
- **Root cause of incorrect START GAME overlay during PAUSE:** `ShaderPass` copies/clones the supplied uniforms, including the custom CanvasTexture. The popup's `needsUpdate` was applied to the original texture, not the clone sampled by the GPU; this left its original START GAME pixels on screen. **Explicitly bind `boardPopupPass.uniforms.uPopup.value=boardPopupTexture` to the actual live canvas texture** after constructing the ShaderPass and when syncing effects, so PAUSED/RESUME/NEW GAME/HIGH SCORE and GAME OVER updates reach the GPU.
- **Root cause of blocky/duplicated blurred cubes:** sampling the 7×7 edge-softness kernel with a large offset (`radius/3`) skips widely separated board pixels at 47% blur. Replace the popup treatment with **two dense, normalized separable GPU Gaussian passes**, horizontal then vertical, each sampling 25 taps at regular pixel-scale intervals. The method remains mathematically Gaussian (like Edge Softness) but eliminates the sparsely spaced duplicate-square artifacts at the approved 47% setting. User-facing blur control remains one `BOARD POPUP BLUR` slider and defaults to 47%.
- **29% fade instead of 29% black dimming:** after Gaussian defocusing, mix only the board interior by 29% toward its native near-black source surface `#101010` (linearized via `THREE.Color(0x101010)`). This leaves the board background intact while making the grid and pieces recede behind crisp popup UI. Avoids darkening the whole rectangle. Popups still composite before the global green/amber phosphor and bloom passes, which remain untouched.
- Code parse verified and a deliberately cloning mock `ShaderPass` test confirmed the final popup pass's texture uniform points to the original live CanvasTexture, not a stale copy. Both Gaussian passes and the popup-only compositing logic were checked. Actual iPhone GPU output still requires visual confirmation.
- No changes to game status rules, pause/ready/game-over popup labels and hitboxes, line-clearing flash, original grayscale values, detailed board/HOLD/NEXT tiles, game mechanics, button sizing, or permanent Home Screen URL. Footer shows **Version 021**.

## V022: Boost board-popup background fade to 70%
- Increase `BOARD_POPUP_FADE` from `.29` to `.70` and match the popup shader's initial `uFade` uniform to `.70`. The blurred game board now retains only 30% of its original signal relative to the board's `#101010` grayscale surface, so luminous pieces recede behind popup labels and buttons.
- Keep the existing **47% Gaussian blur** and both horizontal/vertical GPU passes; retain the live-popup texture fix, precise green and amber phosphors, underlying grayscale style, all board-menu states, tile detailing, and line-clear effect. Only the fade intensity and displayed version number change.
- Footer reports **Version 022** at the existing permanent URL.

## V023: Finalize board-popup fade and simplify PAUSED label
- Increase `BOARD_POPUP_FADE` from `.70` to **`.76`**, including the shader's initial `uFade` uniform. Keep the same **47%** two-pass GPU Gaussian blur and near-black fade target.
- Remove only the small explanatory line beneath **PAUSED**. The `PAUSED` heading and its **RESUME, NEW GAME, HIGH SCORE** buttons stay unchanged; the Start Game and Game Over captions remain.
- No pulse animation is added yet; keep the title static for visual consistency and readability.
- Preserve approved green/amber phosphors, grayscale UI values, layout and controls, completed-row flash, detailed board/HOLD/NEXT tiles, and the permanent URL. Footer shows **Version 023**.

## V024: Increase popup fade and anchor overlay buttons
- Change `BOARD_POPUP_FADE` and the Gaussian compositing shader's initial `uFade` value to **87%** (previously 76%); retain **47%** blur, fade toward `#101010`, and the approved green/amber tint vectors.
- Remove the Game Over **SCORE / LINES** subtitle; PAUSED already has no subtitle. Retain the Start Game tagline, which is now positioned with compact spacing rather than large fixed offsets.
- The **top edge** of START GAME, RESUME, and PLAY AGAIN is on the play board's vertical halfway line. On very short boards only, shift the RESUME stack upward sufficiently to keep NEW GAME and HIGH SCORE inside the board. Secondary buttons maintain the existing 6px vertical gap and 85%-board-width scale.
- The visible gap between popup headings and their immediately following element is **twice the parent container gap**: `2*UI_SPACE.unit = 12 CSS px`. On the READY screen this applies both between TETRIS/tagline and tagline/START GAME; for PAUSED/GAME OVER the title sits directly 12px above the primary action.
- Preserve existing game, input regions, Tetris tile details, row-clear flash, graphics pipeline, phosphor values, and permanent URL. Footer shows Version 024.
- Static JS parser check and popup layout tests for normal portrait, compact, and very short board dimensions passed. iPhone visual check remains necessary.

## V025: iPhone edge-to-edge background behind status bar
- The comparison image was corrected by the user; this update is grounded in the live HTML and iOS standalone display requirements, **not** an inferred before/after visual difference.
- Add the Apple Home Screen `apple-mobile-web-app-status-bar-style=black-translucent` meta element, retaining `viewport-fit=cover` and `apple-mobile-web-app-capable=yes`. This permits the page background and CRT render field to extend behind the iPhone status bar in standalone mode while status information stays visible.
- Align CSS `:root`, `html,body`, error backing and browser `theme-color` from the obsolete `#151515` to the app's approved near-black grayscale `#080808`. The `#display` remains fixed at `inset:0` with `height:100dvh` and JS safe-area measurement stays unchanged, so buttons, containers and content should retain their relative placement below the top safe inset.
- **No layout, label sizing, phosphor, Gaussian blur/fade, row-clear FX, gameplay or UI changes.** The previously discussed Start Game tagline increase to 12px is deferred until separately approved after this edge-to-edge test. Version number only in JS becomes **025**; the permanent link remains `tetris/three-v027.html`.
- Verify in an iPhone Home Screen launch: web app status-bar appearance may be retained across launches by iOS, so meta changes might not be reflected on an icon installed before the change. Do not delete an existing installed app without first considering locally saved game data.

## V026: Exact Photoshop-reference 3×6 tileable scanline overlay
- Recreated the pixel-level Photoshop pattern in a **real 3×6 CanvasTexture**: white 255 highlight in column 0 of rows 0–1, medium-gray RGB 89 over all other cells in rows 0–2, and black RGB 0 across rows 3–5. This is a literal nearest-neighbour tiled texture, not generated lines or an analytic scanline-gradient shader.
- Apply as an independent **late GPU compositor overlay**, between the current Edge Vignette and OutputPass, which covers the whole screen across the header, gameplay, modal/popup UI, controls and safe-area canvas extent. Source is grayscale; use **Multiply** luminance with adjustable overlay opacity rather than painting gray pixels over the approved green/amber phosphor colour.
- New persistent Display Settings heading **CRT PATTERN OVERLAY** with **SCANLINE OVERLAY** on/off, **PATTERN SCALE** 0.5×–3× (default 1×), and **OVERLAY OPACITY** 0–100% (default 20%). Scale represents the CSS-pixel size of each original texture pixel and is converted using devicePixelRatio for consistent iPhone spacing; opacity zero or toggle off reproduces the prior scanline-free renderer. The controls are independent, with no change to any existing CRT effects.
- ShaderPass texture uniforms are re-bound to the live 3×6 CanvasTexture after cloning, as required by the prior frozen board popup fix.
- The exact existing layout, 87% board-popup fade, 47% Gaussian blur, original detailed game and HOLD/NEXT tiles, line-clear blink, approved phosphor hues and UI grayscale tokens are unchanged. The previously discussed 12px Start Game subtitle enlargement is still on hold. Footer now shows **Version 026** at the same permanent URL.
- Implementation verified with one-copy string substitutions and JavaScript parsing checks; actual visual appearance on iPhone still requires review, especially tiling scale/opacity.

## V027: Five selectable scanline/CRT mask patterns
- Keep the precise previously approved **Original** 3×6 Photoshop-reference grayscale tile intact and the default when loading existing settings. Add four alternate *grayscale interpretations* as tiny literal nearest-neighbor tiled CanvasTextures: **Horizontal Scanlines** (1×4), **Aperture Grille** (3×1), **Slot Mask** (4×6), and **Dot Shadow Mask** (4×4). These are illustrative monochrome masks, not copied RGB phosphor textures.
- In **Display Settings → CRT PATTERN OVERLAY**, add a compact **PATTERN PRESET** picker with left/right arrows, a centered current-pattern label (tapping the label also advances), and full modal-region hit testing. Presets cycle both directions with wrap-around and persist using `scanlinePreset` in the existing FX preferences object; `RESTORE APPROVED VALUES` resets to Original.
- Reuse the same pixel-perfect texture-repeat/nearest filter/shader Multiply overlay. The shader now accepts `uPatternSize`, taken from the selected literal texture's dimensions, so **PATTERN SCALE** (.5×–3×), **OVERLAY OPACITY** (0–100%), and the on/off switch work unchanged for every pattern. Rebind the selected CanvasTexture in ShaderPass every FX update, preserving the earlier live-texture fix.
- Preserve complete UI and layout, existing 87% board popup fade, 47% Gaussian blur, line-clear animation, the approved green/amber vectors, and the same bookmarkable `tetris/three-v027.html` URL. Footer now shows **Version 027**.
- Verified JavaScript parsing, source invariants, literal dimensions and Original pixels, and a focused JavaScript test that cycled all five presets with forward/backward wrap-around on mock CanvasTextures. Visual appearance and smoothness on the iPhone still require device review.
