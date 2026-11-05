# NOMAD Terminal — independent development workspace

This branch starts from the frozen Version 083 build, including the original terminal startup exactly as it appeared before it was detached from Tetris in Version 084.

The permanent reference is `archive/nomad-tetris-v083-terminal`. Do not use that archive for active changes.

## Goal

Build and verify the terminal as an independent subsystem, with its own preview, lifecycle state, timings, and tests. It should produce grayscale content suitable for the game's existing CRT compositor, but must not directly own game state, touch controls, scoring, or navigation.

## Future integration

Only reintegrate the terminal after it can initialize, draw, advance, and shut down independently. The game should remain functional when the terminal module is absent. Return to the game branch with a narrow explicit interface and compare the result against the V083 reference.

The main game has its own independent tile-face renderer after Version 084; the archived terminal implementation may retain its original tile drawing until a separately approved unification.
