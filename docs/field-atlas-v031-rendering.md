# FIELD ATLAS v0.31 — OSM rendering experiment

**Working branch:** `feature/field-atlas-v0-31-map-rendering`  
**Frozen snapshot:** `archive/field-atlas-v0-30-2026-10-17`

## What changed

The existing phone-first browser preview is intact. Its display menu now cycles through:

1. **CURRENT VECTOR** — the approved v0.30 vector map appearance.
2. **OSM STANDARD** — the real openstreetmap.org Standard PNG tiles, unmodified.
3. **OSM PHOSPHOR** — those same OSM Standard PNGs, recoloured to green/amber by an experimental pixel transfer function.

The third mode is a proof of concept, **not** a final shader, and is CPU-heavy because each visible 256px tile is decoded, transformed and encoded. It may be too slow on an iPhone. It is deliberately reversible.

The existing water grid remains a 64px repeating MapLibre `fill-pattern` over the **OSM-derived `water` polygon layer**. Raster map mode hides the old vector basemap roads, parks and labels to avoid doubling them; the geographic water grid, saved pins and route preview remain.

The two online feeds are OSM Standard PNG tiles (for exact cartography) and OpenFreeMap OSM-derived vector water polygons (for clipping). This still uses OSM geographic features, but the data snapshots may not match. A production offline build should generate both from **the same regional OSM snapshot**.

The CRT sweep, vignette, scanlines, glow, search, pin interaction, gesture controls and saved preferences remain.

## How to compare

Open the branch's `index.html` in a served browser (HTTPS recommended). Choose **MENU → MAP RENDERER** to cycle modes. Compare **Carbonear**, **Powell Drive / London Road**, and coastline / small inlets in both green and amber themes. Toggle **WATER GRID** while zooming and tilting. Switching modes uses `map.setStyle(...)`, which should retain the camera.

The new display modes have **not yet been verified in a real iPhone browser**. If the processed tiles fail to load, check the browser console for canvas, CORS, image decode or MapLibre protocol errors and switch back to CURRENT VECTOR.

## Acceptance criteria before replacing the current map

- Actual OSM Standard map geometry and labels match openstreetmap.org at the same zoom and view.
- The water grid remains only on mapped water, including coastal inlets and lakes, and does not appear on land.
- Green and amber retain legible small street names, roads, building outlines and dark land-water contrast.
- Normal phone pan/zoom/tilt remains smooth; measure memory, tile conversion time and frame rate on actual iPhone and Android phones.
- Attribution is visible and all online tile requests follow OSMF's service policy.
- Every renderer change is reversible without clearing GPS position, saved pins or place-search data.

## Constraints and future offline architecture

OSMF's `tile.openstreetmap.org` does **not permit tile scraping, prefetching, or offline tile archives**. The v0.31 protocol fetches only the actual visible viewport as the map requests tiles, relying on normal browser HTTP caching. Do not implement an offline download option using this server.

For full-island offline data, download the openly available Newfoundland and Labrador OSM **PBF extract**, cut it to the island, and independently build:

- OSM Carto/Mapnik raster tiles where exact cartographic appearance is important; OR
- OSM-derived high-detail vector tiles with an authored phosphor style where storage, flexible filtering and high zoom are critical; OR
- an optimized regional/zoom hybrid using the **same OSM input**, after testing size and appearance.

Treat rendered-source equivalence and geographic accuracy separately: a more detailed-looking map is not independently verified as more accurate. Raster OSM Standard at the island's highest zoom is likely too large to package entirely; test a regional sample first.

This branch does **not** change the separate React Native mobile prototype. Prove the browser map rendering approach and measure performance before selecting a native shader or archive format.

## Upstream references

- [OSMF public tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
- [OpenStreetMap Carto Standard stylesheet](https://github.com/openstreetmap-carto/openstreetmap-carto)
- [MapLibre custom URL protocol](https://maplibre.org/maplibre-gl-js/docs/API/functions/addProtocol/)
- [MapLibre raster preprocessing discussion](https://github.com/maplibre/maplibre-gl-js/discussions/4480)
- [Geofabrik provincial source extract](https://download.geofabrik.de/north-america/canada/newfoundland-and-labrador.html)

**Status:** first reversible code prototype is committed; CI guards are present; live device validation remains open.
