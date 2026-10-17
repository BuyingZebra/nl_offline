# Newfoundland Pip-Boy map — core specification

Updated 2026-10-17. This is the product requirement, **not** a claim that all features are finished.

## Goal

An artistic, functional, phone-first map of the **island of Newfoundland** (iPhone and Android).
Selecting a settlement must zoom to the actual mapped place label and show roads at a
useful local scale. The map should look more detailed than common web mapping at its
closest supported zoom, while remaining spatially truthful and performant.

## Core behavior

- Open to the island view, then select a town through a searchable list or on-map
  label. Preserve duplicate place names as distinct features: e.g. the separate
  Wild Cove settlements, with disambiguating region hints when the source contains them.
- Prefer OSM geographic place-node label positions matched to Canadian government
  settlement records; retain official coordinate fallback if no matching label exists.
- Fly/zoom to a useful local road view (target zoom about 13), **across the entire island**.
  Four manually sampled towns are only a diagnostic browser-preview limitation.
- The main map shows public roads and actual outdoor/backcountry trails or tracks.
  **Hide sidewalks, footways, urban pedestrian paths and steps** from the core view.
  Preserve those geometries in source GIS data for a possible separate walking mode.
- Do not mistake a parallel sidewalk for a second motor road: the D'Iberville Street
  source has one named residential OSM way and a separately tagged sidewalk way.
- Keep road classes, access restrictions, and real junction topology intact.
  Visual overlays and source comparisons are not driving directions.

## Fidelity and aesthetics

- Prefer complete, actual native-resolution vector source geometry, never fabricated
  bends, jitter, pseudo-detail, or artificially closed coastal segments.
- Use MapLibre anti-aliased line rendering, rounded joins/caps, and appropriate
  widths at each zoom. Encode offline sources through **z16** as practical.
- A coastline must follow real source vertices and be drawn as a natural curved
  outline at local zoom; land fills may only be replaced when valid polygon rings
  are confirmed and inland water remains correct.
- For topographic organic texture, prefer **precomputed hillshade from an
  openly licensed DEM**. Evaluate battery, GPU cost and file size on actual phones;
  do not run expensive real-time procedural terrain/noise by default.
- Landscape texture must never degrade clarity of roads or place labels.
- Island-wide source coverage and source licenses take precedence over oversized
  GitHub Pages demo files. Do not call the four-area website a complete island map.

## Data/build sources

- Overture transportation: original segment + connector GeoParquet and z16 PMTiles
  road tiles. OSM and TomTom provenance kept. Sidewalks preserved but hidden.
- Government Canadian Geographical Names + OSM place-label nodes for town search.
- OpenStreetMap natural coastline native vertices for improved shorelines;
  only completed validated land polygons can replace any base-map fill.
- Planetiler OSM base map for land cover, buildings, lakes and other features.
  The road tiles are only one layer of a complete map.
- Open government NRN and NL forestry roads used for verified corrections only,
  not blindly stacked on top of one physical road.

## Verification criteria

1. D'Iberville: show one road and no sidewalk in the main map; preserve the
   sidewalk in source data if a pedestrian view is later enabled.
2. Search both Wild Cove locations without redirecting one to the other.
3. Choose a non-sample town and actually load useful z13-z16 roads, **without**
   a website fallback pretending a blank map is complete.
4. Validate shoreline positions and smoothness against permitted reference data,
   including small coves and offshore islands, with no invented wiggles.
5. Measure real iPhone and Android FPS/memory/battery on full offline map.
6. Do not claim more geographic *accuracy* than Google without independent field
   or imagery validation; rendered vector precision alone does not prove that.

## Deployment

- Complete mobile offline dataset is an artifact/archive, not the preview's
  embedded JavaScript tiles. Host range-requestable PMTiles shards for browser
  review only when GitHub Pages is confirmed to support them.
- Version every input/output dataset and do not merge or discard geometry
  without provenance and a reversible correction process.
