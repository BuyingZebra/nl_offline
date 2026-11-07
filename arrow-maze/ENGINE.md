# Arrow Maze engine — V6

A seed-based puzzle engine for 1,000+ levels, without predefined layouts. This document describes the invariants, not the art style.

## How a board is created

1. `difficulty(level)` chooses **board dimensions, target arrow count, maximum length, maximum turns, and placement constraints**. It currently starts with three straight arrows and reaches 49 arrows at Level 47. Later levels remain variable and distinct; difficulty calibration beyond that is deliberately deferred.
2. A deterministic PRNG initializes from `(level, seed, attempt)`. Fractional Brownian noise (`fbm`) influences shape placement and local clustering; it **does not determine correctness**.
3. `growFromExit()` selects a tip and outgoing direction, verifies its straight ray to the border, and grows a self-avoiding body backwards. Every new cell avoids the entire ray, previously placed arrows, and cells of its own path. The first backwards step fixes the arrow's forward-facing head.
4. `build()` adds arrows in *reverse solution order*: every new arrow can escape through the pieces already placed. It may block older arrows, creating dependencies. The new arrow could always be removed first, leaving an earlier solvable board.
5. If placement gets crowded, the builder uses progressively simpler arrow shapes. **It never silently returns an undersized level**. Failed candidate boards are discarded and rebuilt using another deterministic attempt seed.
6. Before display, `solveBoard()` independently checks geometry, overlap, and a full legal removal sequence. If a board cannot meet its required count and constraints, `generate()` raises an explicit error rather than publishing a broken puzzle.

## Invariants and safety

- Each arrow is a single connected, non-self-crossing path on the grid.
- The arrowhead points exactly along its final segment.
- Its escape ray does not intersect its own body or another arrow when the arrow is considered movable.
- Two distinct arrows never occupy the same cell.
- All displayed boards have a verified full solution.
- Removing any currently legal arrow cannot introduce a new obstruction; all legal move orders remain solvable.
- `(level, seed)` always reproduces the identical board with the same engine version.

## Future difficulty, measured separately

`analyzeBoard(pieces)` reports:

| Metric | Meaning |
| --- | --- |
| `initialChoices` | How many arrows are available immediately |
| `blockingRelations` | Total arrow-to-arrow escape-lane blockages |
| `longestDependencyChain` | Longest sequence of arrows that must be removed before another can move |
| `totalTurns` | Number of bends among all arrows |
| `averageCells` | Mean arrow path length |

Future levels can target ranges of these metrics, occasionally requiring longer chains or fewer opening moves, **without sacrificing solvability**. These measures do not yet drive generation. Density alone is not an adequate difficulty score.

## Regression testing

Run from the `arrow-maze` directory with Node.js:

```bash
node test_engine.js
```

The test suite checks all Levels 1–1,000 with two different seeds, hundreds of additional samples, reproducibility, exact arrow counts, complete solutions, random legal move orders, and intentionally corrupted geometry.

For manual PWA testing, use your phone to check the rendered Level 1 and Level 1000, hints, animated escape, New Maze/Retry, and saved progress after relaunch.

## Save compatibility

V6 creates `arrow_maze_pwa_state_v6`. When upgrading from V5, it preserves your level, seed and preferences, but restarts the current puzzle with three drops because piece IDs are not compatible with the new generator. The V5 save is left intact. The service worker caches only this PWA's files; updates use versioned assets and network-first page navigation with an offline fallback.