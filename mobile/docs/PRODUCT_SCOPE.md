# Scope agreement · first release

**Target:** smartphones only, Apple iOS + Android. Tablet support is architecturally possible but out of scope.

**Visual direction:** Pip-Boy-inspired monochrome green and optional neutral/dark map. Accuracy is above visual novelty. Detailed real-world roads and building polygons are expected when underlying OSM data supports them.

**Build order:** high-quality map viewer → verify offline map packs → offline road-name index/search → reliable routing → turn-by-turn → optional civic addresses.

**Non-negotiables:** clearly indicate connectivity/offline coverage; preserve orientation/map state; do not replace missing roads with fabricated ones; do not invent address precision; do not imply emergency-grade routing before testing.

**Sizing:** safe areas, logical pixels, minimum 48-point control target, Flexbox, responsive rearrangement for landscape. Avoid using percentages for everything. Portrait is the primary experience. Map works below overlays; overlays don't reset routing/map state when rotated.

**Architecture:** platform differences localized to specific native components; map and styles in one shared implementation; themes independent of vector geometry; future routing/data packages independent of UI.
