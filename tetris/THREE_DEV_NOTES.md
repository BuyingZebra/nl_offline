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
