# NOMAD terminal — preserved independently

The original V083 terminal, boot, reveal and associated tests are preserved at:
- `archive/nomad-tetris-v083-terminal` — original reference
- `dev/nomad-terminal` — independent development

The active main branch intentionally has **no** terminal/boot/reveal sources or dependencies. Tetris retains its original tile artwork in `tetris/tile-face.js`.

When returning to the terminal, implement a standalone preview and integrate it through an explicit optional screen lifecycle. Do not change Tetris gameplay, saved data or approved CRT visuals as a side effect.
