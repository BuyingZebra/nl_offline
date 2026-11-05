# NOMAD Terminal — archived before gameplay separation

Version 083 of the complete Tetris project, including the terminal startup, is preserved at:
- Branch: `archive/nomad-tetris-v083-terminal`
- Independent development branch: `dev/nomad-terminal`

## Version 084 main game

The main Tetris entry `three-v027.html` opens directly to the existing game ready/play screen. It no longer loads `terminal-screen.js` or `boot-sequence.js`; the terminal overlay and reveal hand-off are not part of the game startup.

The V083 terminal implementation is untouched in both archival/development branches. Its original source files also remain in the main repository but are no longer loaded by gameplay.

The precise pre-existing tetromino tile face renderer is reused by gameplay through `tile-face.js`. Do not change its geometry or luminance during architecture refactoring.

## Re-integration rules

1. Develop the terminal separately on `dev/nomad-terminal`; do not modify the archived V083 reference.
2. Give it a standalone preview/test harness before integrating it.
3. Connect it to the game through a clearly defined start/ready/handoff interface, not direct ownership of gameplay.
4. Preserve the currently approved board, settings, CRT parameters, controls, and saved scores when integrating.
5. Validate on Safari and installed iOS Home Screen mode before shipping.
