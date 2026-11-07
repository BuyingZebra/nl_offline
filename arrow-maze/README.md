# Arrow Maze — Endless PWA

Mobile-first arrow-escape puzzle with head-first, winding-path animation and solvable procedurally generated levels.

**Play:** https://buyingzebra.github.io/nl_offline/arrow-maze/

## Controls
- Tap an arrow's line to attempt its head-first escape.
- If the straight lane ahead of its head is blocked, you lose one drop (three per attempt).
- HINT highlights a valid move. RETRY restores the same seed. NEW MAZE creates a fresh puzzle.
- Clear all arrows to advance to the next level.

## Installation
- **iPhone:** Open the live URL in Safari, then Share → Add to Home Screen → Open as Web App.
- **Android:** Open in Chrome, then menu → Install app.
- Once installed and opened online, the service worker caches this game's files for offline play.

## Source and structure
- `index.html`: self-contained playable game (HTML, CSS, canvas rendering, generator, controls, animation).
- `manifest.webmanifest`: installation metadata.
- `sw.js`: game-scoped offline cache.
- `icons/`: install icons.

This folder is independent of the repository's other NOMAD/FIELD ATLAS/Tetris projects.

## Update: Progressive levels and touch controls

- Level 1 begins with **3 straight arrows** on a smaller board. Levels add one arrow per level, up to 49 arrows at Level 47.
- Larger grids, winding routes, and more blocking relationships arrive gradually. See `difficulty(level)` in `generator.js`.
- Touch input uses the **nearest actual arrow segment**, with a finger-friendly 21 CSS-pixel hit radius (11 px for mouse) and press feedback.
- The generator uses reverse construction, maintaining a solvable removal order.
- Game code is separated into `generator.js`, `app.js`, and `style.css` for safer updates.
- Existing saves from the former generator keep the level setting but reset removed arrows, since old piece IDs describe different layouts.
- Settings includes **Start from Level 1**. Tap the level heading to jump to another level.
- Service-worker cache upgrades are scoped to Arrow Maze and cannot delete caches for other apps.


## V4 — Solvability and collision repair (2026-11-07)

- Fixed Level 11 seed `11-1HSNS6X`: an arrowhead pointed into its own tail; the old generator wrongly allowed this, and other arrows then depended on it.
- Both gameplay and generation now check collisions with the arrow's **own body**.
- Independent `solveBoard` verifies a complete legal removal sequence before any generated board is shown.
- Safety guard offers free **Repair Puzzle** if no legal arrow remains.
- Preserves level, seed and appearance settings on v3→v4 upgrade, but restarts the current puzzle with three lives, since old piece IDs are incompatible.
- V4 scripts are versioned and the offline service-worker cache is updated without touching other projects.
- Verified 1,650 random boards; completed the screenshot seed through 13 real mobile-size taps; progressed to Level 12.
