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
