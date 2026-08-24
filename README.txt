NL Offline v0.12
=================

Purpose
-------
NL Offline is an offline-first Newfoundland & Labrador situational navigation PWA. It is intentionally not a turn-by-turn navigation replacement.

LEVEL 1 — OFFICIAL TRIP DATA
----------------------------
- 927 official place entries.
- 859,329 origin/destination combinations.
- Distance and time come from the Newfoundland & Labrador Road Distance Database (NL-RDDb) data pack used to build this app.
- The app preserves the official total while also carrying the original road and ferry components.
- 115,394 pairs contain a ferry distance and/or ferry time component.

LEVEL 2 — OFFLINE MAP PATH
--------------------------
- Local road graph: approximately 37,870 nodes and 43,043 edges.
- Named road-only trips forbid ferry-edge shortcuts.
- Ferry routes use local ferry geometry only when it agrees reasonably with Level 1. Otherwise the app labels the Level 2 map as SCHEMATIC rather than presenting a misleading route.
- Level 1 remains the authoritative distance/time source.
- v0.12 applies a small set of conservative, validated routing-anchor corrections for Level 2 only.

GPS
---
- Requires HTTPS for browser/PWA geolocation.
- Current Location snaps to the offline road network.
- Live route progress is matched within a plausible window around prior progress to avoid loop/crossing jumps.
- Route progress does not advance from poor-quality or off-route fixes.
- Follow mode works for live GPS and the simulation slider.
- v0.12 adds an adaptive ETA that gradually blends observed road pace with the official baseline.
- Local road-test diagnostics can be explicitly exported as JSON; they are not uploaded automatically.

OFFLINE / PWA
-------------
Before a road test:
1. Open the HTTPS app while online.
2. Tap Recheck road setup / Prepare for road.
3. Confirm ROAD READY.
4. Add/open the app from the Home Screen.
5. Open it once before leaving service.

The service worker only replaces the prior version after the complete new offline package has cached successfully.

GitHub Pages
------------
This repository is deployed from:
- Branch: main
- Folder: /(root)

The old custom Pages workflow is intentionally not required.

Important limitation
--------------------
NL Offline is situational navigation. Road/ferry data can be incomplete, outdated, schematic, or unsuitable for safety-critical navigation. Do not rely on it as the only source for emergency, marine, winter-road, ferry-schedule, or turn-by-turn decisions.
