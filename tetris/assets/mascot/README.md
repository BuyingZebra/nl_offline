# NOMAD field soldier — character reference (working title)

This is the **approved character design** from the 1930s-cartoon Vietnam-era field soldier concept sheet. The character's permanent name has not yet been selected.

## Identity anchors
- Round, upbeat face; oversized oval black eyes; button nose; broad open grin with visible tongue
- Large, sloped Vietnam-era field helmet with characteristic foliage and simplified camouflage
- Distinctive classic rubber-hose silhouette: big white gloves, flexible rounded limbs, oversized dark boots, warm energetic expressions
- Dog tags and field gear in full-body versions
- Black/gray ink art designed to work as grayscale source for NOMAD's phosphor palettes (green or amber)
- Avoid photorealism, bevels, 3D modeling, modern tactical equipment, or redesigning his head proportions

## Source and derivatives
The original full-body expression/action sheet generated in ChatGPT is the **visual source of truth**. `nomad-field-soldier-head.svg` is a cleaned, simplified vector trace of that image's main large head, with real editable SVG path data (no embedded bitmap). It is a reusable derived asset, not a replacement for the original character sheet.

When creating a new pose or reaction, use the original character sheet **and** this asset together as visual references. Keep helmet foliage, face, eyes, grin, gloves, and proportions consistent. Animate expression and pose rather than inventing a different mascot.

## Game board
The head currently appears only as a subtle faded decorative wall sticker under the grid and pieces. The SVG remains independent of gameplay, scoring, collision, buttons, and the CRT compositor. The game loads the asset once and draws it into the existing grayscale canvas so the user's phosphor settings still apply. No external image servers are needed.
