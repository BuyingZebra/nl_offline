# NL Offline

NL Offline is a static, installable vector navigation map for Newfoundland and Labrador that keeps its map, community, named-road and routing data on the device. The v0.22 MVP deliberately focuses on dependable town and road navigation where cellular service is unavailable. Civic-number navigation is paused until the address and road-geometry sources can be professionally conflated and validated.

## What v0.22 does

- Browses a packaged NL vector basemap with land, major water bodies and roads without a connection.
- Uses a higher-contrast coastal night palette so ocean, land, water bodies, road classes and labels remain distinguishable on a phone.
- Uses the same full-detail NRN LineStrings for road display, routing and maneuver guidance.
- Expands routed-road geometry from 112,313 to 319,387 points while keeping every stable graph edge identifier.
- Routes between 927 official community entries: 922 road-mapped and 5 remote/special entries.
- Searches 11,893 offline road/place entries covering 8,323 road names and 459 localities.
- Supports town-to-town, road-to-road, town-to-road, road-to-town and current-location-to-road navigation.
- Considers every connected endpoint associated with a selected road in one graph search instead of choosing an arbitrary house-number point.
- Rejects civic-number routing clearly while still suggesting the corresponding road name when possible.
- Ships no civic numbers or address coordinates; the road/place index is approximately 703 KB.
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
- `roadindex.js`, `roads.js`: compact named-road/locality index, resolver, suggestions and street labels.
- `tools/build-nrn-road-geometry.py`: reproducible full-geometry NRN road compiler that preserves stable graph identifiers.
- `tools/build-canvec-basemap.py`: reproducible compact CanVec land/water vector compiler.
- `tools/build-road-place-index.mjs`: derives the compact road/place index from a separately generated NAR source package while excluding civic numbers and coordinates.
- `sw.js`, `pwa.js`, `manifest.webmanifest`: install/offline lifecycle.
- `build-info.json`: release scope and dataset counts.
- `tests/`: route-direction, connectivity, road/place and package regressions.

## Known MVP limits

- Maneuver prompts are geometry-derived road-level guidance, not spoken directions, lane guidance or a legal-turn model. Road signs and actual conditions take priority.
- Civic-number navigation is intentionally disabled in v0.22. Enter a town or a road with its locality, such as `D'Iberville Street, Carbonear`.
- The road/place index identifies named roads, but underlying NRN geometry can still contain missing, stale, fragmented or misnamed local segments. D'Iberville Street remains a known source-data case under investigation.
- The app does not yet model truck height, weight, axle, hazardous-goods, seasonal-road or turning restrictions. Drivers must independently verify vehicle suitability.
- Ferry schedules, disruptions, live traffic, closures, weather and 511 reports are not included in this core offline release.
- Dashed ferry/remote geometry can explain an official trip but is not considered safe continuous geometry for driving mode.
- Source datasets can contain omissions or stale attributes. Do not treat the app as the sole source for emergency or safety-critical decisions.

Data licensing and provenance are documented in `ATTRIBUTION.txt`.
