# NL Offline

NL Offline is a static, installable vector map for Newfoundland and Labrador that keeps its map, community, exact civic-address and routing data on the device. The v0.20 MVP is intentionally focused on dependable town-to-town, street and civic-address routing where cellular service is unavailable.

## What v0.20 does

- Browses a packaged NL vector basemap with land, major water bodies and roads without a connection.
- Uses the same full-detail NRN LineStrings for road display, address snapping, routing and maneuver guidance.
- Expands routed-road geometry from 112,313 to 319,387 points while keeping every stable graph edge identifier.
- Routes between 927 official community entries: 922 road-mapped and 5 remote/special entries.
- Resolves 181,766 exact NL civic addresses covering 8,323 named streets and 459 localities from the Statistics Canada National Address Register (June 2026).
- Accepts a full civic address or an unambiguous street-only destination, with punctuation-tolerant partial suggestions.
- Retains 28,077 NRN road-side ranges as a fallback when an exact address point is unavailable.
- Connects an address through the best end of its road segment, retains the partial street geometry and routes directly between two addresses on the same segment.
- Uses official NL-RDDb town-to-town distance/time totals and a local NRN fastest-reasonable path model.
- Supports touch drag, two-finger pinch, wheel/double-click zoom, keyboard pan/zoom and a persistent free-map view.
- Shows major route shields, local street names at detailed zoom, heading-aware GPS progress, local rerouting and an adaptive ETA.
- Generates an entirely offline road-level maneuver list and an upcoming-maneuver card from the packaged route geometry.
- Separates continuous road geometry from dashed ferry/schematic links. Driving mode is disabled when continuous verified geometry is unavailable.
- Verifies the entire versioned offline package before reporting it ready.
- Detects an installed-app update, defers reload while driving and presents a clear update action when interruption would be unsafe.

No server, API key, npm install or build step is required to run the app.

## Deploy on GitHub Pages

1. Put the contents of this folder in the repository root.
2. Push the files to the `main` branch.
3. In GitHub, open **Settings → Pages**.
4. Choose **Deploy from a branch**, select `main` and `/ (root)`, then save.
5. Open the resulting HTTPS address on the phone.

GitHub Pages supplies the secure context required by phone geolocation and service workers. The optional `_headers` file is for hosts that support custom response headers; GitHub Pages ignores it.

## Prepare a phone for no-service use

1. Open the deployed HTTPS page while online and keep it open until the offline package reports ready.
2. Press **Prepare offline map** (or **Verify offline map**) once.
3. Add the app to the Home Screen from the browser menu/share sheet.
4. Grant Location permission when prompted.
5. Before depending on it, switch the phone to airplane mode, reopen the installed app, search a route and start navigation.

Each release uses a new cache version. Open the app online after an update and allow the update prompt/reload to complete, then verify the new package before travelling. When updating from v0.17 or earlier, close and reopen the installed app once if the new version does not appear immediately.

## Test locally

The runtime is static, but the repository includes deterministic package and routing checks:

```sh
npm test
```

To exercise the UI locally, serve the repository root rather than opening `index.html` as a file:

```sh
python -m http.server 8080
```

Service-worker and phone-GPS behaviour require HTTPS (localhost is treated as secure by modern browsers for development).

## Project layout

- `index.html`, `core.js`, `map.js`, `route-*.js`, `guidance.js`, `gps.js`: application, route guidance and navigation UI.
- `data.js`, `ferry.js`: compact community matrices and shared high-detail road/ferry network.
- `basemap.js`: generated CanVec land and major-water vector layer.
- `roadmeta*.js`, `routing.js`: NRN road classes, route names and local route-cost model.
- `addresspoints.js`: generated compact NL National Address Register index.
- `addressmeta*.js`, `addresses.js`: fallback civic ranges, exact resolver, suggestions and street labels.
- `tools/build-nrn-road-geometry.py`: reproducible full-geometry NRN road compiler that preserves stable graph identifiers.
- `tools/build-canvec-basemap.py`: reproducible compact CanVec land/water vector compiler.
- `tools/build-nar-address-index.mjs`: reproducible compiler for the federal NL address/location CSV files and road snaps.
- `sw.js`, `pwa.js`, `manifest.webmanifest`: install/offline lifecycle.
- `build-info.json`: release scope and dataset counts.
- `tests/`: route-direction, connectivity, address and package regressions.

## Known MVP limits

- Maneuver prompts are geometry-derived road-level guidance, not spoken directions, lane guidance or a legal-turn model. Road signs and actual conditions take priority.
- National Address Register locations are authoritative georeferenced civic points, but the app snaps them to the closest compatible packaged road for navigation; verify the actual driveway/entrance and signs.
- The app does not yet model truck height, weight, axle, hazardous-goods, seasonal-road or turning restrictions. Drivers must independently verify vehicle suitability.
- Ferry schedules, disruptions, live traffic, closures, weather and 511 reports are not included in this core offline release.
- Dashed ferry/remote geometry can explain an official trip but is not considered safe continuous geometry for driving mode.
- Source datasets can contain omissions or stale attributes. Do not treat the app as the sole source for emergency or safety-critical decisions.

Data licensing and provenance are documented in `ATTRIBUTION.txt`.
