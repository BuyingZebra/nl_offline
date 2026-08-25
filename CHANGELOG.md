# Changelog

## 0.22.0 — 2026-08-25

- Narrowed the public MVP to town and named-road navigation while the provincial civic-address/road conflation pipeline is rebuilt.
- Added town-to-town, road-to-road, town-to-road, road-to-town and current-location-to-road routes.
- Replaced exact civic-address runtime files with a compact 11,893-entry road/place index covering 8,323 road names and 459 localities.
- Removed all civic numbers and address coordinates from the shipped package, reducing the release by approximately 4 MB.
- Added multi-source road routing that evaluates all connected endpoints of both selected roads in one graph search.
- Added clear civic-number rejection and road-name fallback suggestions.
- Replaced address regressions with road/place resolution, D'Iberville road-to-road and mixed-endpoint routing tests.
- Versioned the complete offline cache as v0.22 so installed PWAs update atomically.

## 0.21.0 — 2026-08-25

- Increased land/ocean luminance and hue separation with a deep-blue ocean and lighter spruce-toned land.
- Brightened local, collector and highway road classes while preserving a clear hierarchy.
- Improved street, route-shield and community label contrast.
- Slightly lifted panels, borders, muted text and controls for better phone readability without abandoning the night-map design.
- Retained the complete v0.20 shared geometry, address index and offline routing behaviour unchanged.

## 0.20.0 — 2026-08-25

- Rebuilt all 43,002 routed road shapes from the official Statistics Canada NRN NL 7.0 GeoPackage while preserving stable graph and address edge identifiers.
- Increased routed-road geometry detail from 112,313 to 319,387 coordinate points.
- Made road display, routing, address snapping and maneuver guidance use the same shared geometry.
- Added a compact fully offline CanVec vector basemap with 567 land features and 1,200 major water features.
- Added zoom-dependent road visibility, road casings, clearer functional-class styling and a cased route line.
- Re-snapped all 181,766 exact civic records against the upgraded geometry; 181,752 attach directly to routed roads and only 14 retain fallback points.
- Added reproducible NRN road and CanVec basemap compilers with geometry-quality metadata.

## 0.19.0 — 2026-08-25

Exact offline civic-address data release.

### Address coverage

- Added the June 2026 Newfoundland and Labrador subset of the Statistics Canada National Address Register.
- Compiled 181,766 exact civic addresses across 8,323 streets and 459 localities into a 3.86 MB browser index.
- Deduplicated apartment/unit rows sharing a civic entrance without storing occupant or business identities.
- Snapped 181,752 address points to the offline road graph; only 14 records require a nearest-node fallback.
- Kept NRN civic ranges as a secondary fallback instead of presenting all addresses as interpolated estimates.

### Search and routing

- Added exact civic-number and suffix lookup with punctuation and common street-type normalization.
- Added partial, street-only and locality-aware offline suggestions.
- Allows an unambiguous street destination when no civic number is supplied.
- Added National Address Register street labels to previously unnamed routed edges.

### Validation and provenance

- Added D'Iberville Street, Carbonear regressions for full-address, partial-search, street-only and route attachment.
- Added exact dataset counts and service-worker integrity checks.
- Added the Statistics Canada Open Licence acknowledgement and a reproducible address-index compiler.

## 0.18.0 — 2026-08-25

Offline navigation-intelligence release.

### Civic-address routing

- Evaluates both graph exits from an address-bearing road segment instead of committing to the nearest endpoint.
- Preserves the exact partial-road geometry between the interpolated civic point and the chosen graph exit.
- Routes directly along the shared street segment when both civic addresses lie on the same segment.
- Accounts for each partial segment using its road speed rather than a fixed access-speed assumption.

### Guidance and GPS

- Added a fully local road-level maneuver engine based on packaged NRN geometry and metadata.
- Added an upcoming-maneuver card, distance countdown and expandable route-details list.
- Added heading-aware map matching to distinguish nearby roads travelling in opposite directions.
- Added a north-up heading arrow and compact cardinal-heading display for live GPS and simulation.
- Kept the guidance claims deliberately bounded: no lane, spoken, legal-turn or vehicle-restriction model is implied.

### Installed-app reliability

- Added service-worker update detection and an explicit ready-to-update banner.
- Automatically reloads after a safe controller change, while deferring interruption during active driving.
- Versioned the complete v0.18 offline cache and added `guidance.js` to the verified package.

### Validation

- Added regressions for dual-end civic access, direct same-segment addresses, maneuver ordering and heading-aware route matching.
- Expanded the deterministic suite to 12 tests, including 100 representative routes and all official non-zero route pairs.

## 0.17.0 — 2026-08-24

Core offline reliability release.

### Routing

- Corrected edge geometry to follow the actual graph traversal direction rather than the source polyline's storage direction.
- Added traversal-continuity checks and exact graph-node joins, removing reversed/disconnected route drawing.
- Restored reliable direct routing in both directions between Shalloway Cove, St. Brendan's and St. Brendan's.
- Classified data `virtual` edges and remote ferry lines as schematic; routes containing them cannot enter driving mode.
- Kept short GPS/address/community-to-road access connectors distinct from schematic links.
- Made a failed or schematic live reroute preserve the last valid route.
- Corrected estimated access/ferry time accounting.

### Search and map interaction

- Added punctuation-tolerant town matching, typo suggestions and live town/address suggestions.
- Improved incomplete civic-address suggestions, including input without a comma.
- Added local street labels at detailed zoom while retaining major route labels.
- Added keyboard pan/zoom and NL-bounded panning.
- Kept pinch/drag gestures in free-map mode instead of snapping back to route overview.
- Removed the short-screen landscape minimum height that clipped the driving view.
- Reduced non-driving clutter and moved simulation/diagnostics into a collapsed panel.

### Offline release safety

- Added bounded-concurrency service-worker caching.
- Changed manual preparation to fill only missing files instead of re-downloading a complete package.
- Preserved a successful readiness result if a retry reports an incidental error after the cache becomes complete.
- Exposed persistent-storage status without treating browser-managed storage as a failed map package.
- Added release metadata, documentation, deterministic tests and a GitHub Actions validation workflow.
