# FIELD ATLAS · Newfoundland Offline

An early-stage, smartphone-first navigation project for Newfoundland and Labrador. Inspired by retro-futuristic field terminals, with accurate road geometry, street names, building footprints, and eventually offline road-to-road navigation as the goals.

## Try the browser preview

- [Interactive FIELD ATLAS preview](https://buyingzebra.github.io/nl_offline/) (requires GitHub Pages to be enabled for **main / (root)**)
- Source: [index.html](./index.html)

The preview can display real OpenStreetMap-derived vector maps using MapLibre when online map services are available. It falls back to an **illustrative** interactive map when those services are unavailable. Town search is a small demonstration list. Selecting a destination **does not calculate a driving route**.

## Native iPhone / Android source

See [mobile/README.md](./mobile/README.md) for setup and device-build instructions.

The native project uses Expo, React Native, TypeScript, and MapLibre. It contains a prototype for GPS, two cartographic themes, place shortcuts, and a test-area offline pack workflow. **The native project is unverified on real devices.** It cannot be used for driving navigation yet.

## What is not ready

- Accurate province-wide offline road search and address geocoding
- Offline road-to-road routing or turn-by-turn driving directions
- Validated, complete map packages for Newfoundland
- Proven offline map resource completeness on iOS and Android

**Never rely on this prototype for driving, emergencies, or travel without another navigation method.**

## Why this repository was reset

A previous navigation codebase was archived before the FIELD ATLAS restart in [archive/pre-field-atlas-2026-10-16](https://github.com/BuyingZebra/nl_offline/tree/archive/pre-field-atlas-2026-10-16). The default branch now intentionally contains a clean source layout rather than mixing the earlier application with the new prototype.

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). No official Fallout or Pip-Boy assets are used.
