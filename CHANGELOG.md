# Changelog

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
