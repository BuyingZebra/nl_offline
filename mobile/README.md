# FIELD ATLAS // Newfoundland Offline · v0.1

A real **React Native smartphone app source project** for Android and iOS, using MapLibre Native. Retro-futurist / Pip-Boy-inspired green vector cartography (plus a dark theme), responsive phone layout, individual mapped building footprints, roads/street labels, GPS, place-view shortcuts, and an optional **small offline Carbonear map download**.

> **Status:** early development prototype, NOT a navigation app yet. It has not been built or tested on a physical phone here. Do not use it to navigate a vehicle or in an emergency.

## Already implemented

- Native MapLibre map with detailed OpenStreetMap / OpenFreeMap vector tiles; zoom-dependent building outlines, roads, waterways, and street names **where present in the source dataset**.
- Original green monochrome / dark visual themes switch without modifying geographic data.
- Adaptive layouts for **phone portrait and landscape**; shared tokens, Flexbox, logical sizing, safe-area awareness and accessible controls. No tablet-specific UI.
- GPS permission request and foreground location updates (Expo Location); local position indicator and recenter button.
- Search over a small **hardcoded list of six community viewpoint presets**. This is *not* street/address geocoding, and points are approximate area centres.
- Place a pin at the map centre and clear it (not a routable destination).
- Offline pack management for a **small Carbonear test bounding box**, zoom 10–16. The pack must be downloaded while online. The UI does not claim offline readiness until the native pack reports completion.

## Not implemented in this release

- Offline named-road search or civic-address database.
- Road routing, navigation, route snapping, turns, route voice instructions, rerouting.
- Province-wide offline tile package and verified building coverage.
- Real-world accuracy audits, road access/turn restrictions, automated device tests, store packaging.

## Build and run

Requires **Node.js >=22.13**, a working Android Studio SDK for Android or a Mac with Xcode for iOS; alternatively an Expo EAS account for cloud native builds. Internet needed to install dependencies and load initial map data.

```bash
cd newfoundland-offline-v0.1
npm install
npx expo install --fix
npx expo-doctor
npx expo run:android  # Android phone connected with USB debugging, or an emulator
# OR on macOS:
npx expo run:ios
```

For cloud builds on a phone without a local native build environment:

```bash
npm install
npx expo install --fix
npx eas-cli@latest login
npx eas-cli@latest build --profile development --platform android
# Or --platform ios (requires signing/account configuration)
npx expo start --dev-client
```

**The stock Expo Go app cannot run MapLibre**; you need an installed development build. Once the development build is installed, Metro serves JavaScript while developing.

If native build issues arise after changing dependencies: `npx expo prebuild --clean`, then rebuild. The generated `ios/` and `android/` folders are not committed; Expo generates them. Platform-specific React Native overrides can be placed in `src/platform/` or as `.ios.tsx`/`.android.tsx` components when needed.

## How to test the offline Carbonear map

1. Start with an internet connection and move the map to **Carbonear** (Home button).
2. Open **MAPS**, then **DOWNLOAD**. Wait until the pack says **DOWNLOAD COMPLETED**.
3. Pan and zoom to confirm building footprints are visible at close zoom.
4. Disconnect Wi-Fi **and** cellular data. Reopen the installed app and explore **within the small downloaded bounds and downloaded zooms**.
5. Test GPS after granting location permission. Physical GPS does not inherently require mobile data, but time to first fix can be slower and phone settings/environment affect performance.
6. If some fonts, symbols or tiles are missing offline, report that as a defect. Different styles may request different glyph ranges and tiles. Do not treat 'pack complete' as proof every custom-style resource works offline.

**Important:** The screenshot/map styling and the pack downloader use different styles referring to the same OpenFreeMap vector dataset. There can be glyph/source URL mismatches; verify the offline render on both platforms. This version keeps the custom visual style inline so it is available offline; it does *not* currently ship a prebuilt full map archive.

## Offline host restrictions / future data pipeline

The prototype references OpenFreeMap public vector tiles:
`https://tiles.openfreemap.org/planet`

and uses the public hosted style for a small offline test pack:
`https://tiles.openfreemap.org/styles/dark`

OpenFreeMap's published mobile offline limits: **up to 3,000 tiles or 50 MB per download, maximum 4 parallel requests, and a unique User-Agent**. Native MapLibre's request user-agent behaviour and exact use under the current service policy must be verified before wider distribution. **Do not increase the download to Newfoundland without permission or a self-hosted tile pipeline.** See https://openfreemap.org/quick_start/.

For eventual province-wide offline operation: use the Geofabrik NL OSM extract (https://download.geofabrik.de/north-america/canada/newfoundland-and-labrador.html), generate regional vector tiles with an independent pipeline (e.g. Planetiler / PMTiles or MBTiles compatible with both native platforms), bundle self-hosted fonts/icons, and build an on-device road database/routing graph. **PMTiles support differs by MapLibre Native platform/version**; do not assume the same file implementation works on iOS and Android without testing. Use provider-independent data wherever possible.

## File structure

```
App.tsx                   app bootstrap
src/screens/MapScreen.tsx full-screen native map + phone UI
src/map/createMapStyle.ts local cartographic layers and themes
src/design/themes/        palettes (Pip-Boy, dark)
src/design/tokens/        spacing & touch targets
src/design/layouts/       responsive phone/window calculations
src/design/components/    search, offline panel, reusable controls
src/core/gps/             GPS permissions and foreground watch
src/core/offline/         small-area offline pack manager and metadata
src/data/                 community viewport shortcuts
src/platform/ios/         reserved for future Apple-specific UI/behavior
src/platform/android/     reserved for future Android-specific UI/behavior
docs/                     product scope and design reference
```

## Development priorities

1. **Verify the map and offline pack on physical iPhone and Android phones.** Log missing geometry and rendering issues.
2. Build legitimate offline vector tiles for the entire Avalon Peninsula, validate building/road coverage.
3. Make street names searchable entirely offline and specify how to select a road segment as a destination.
4. Add routing graph + road snapping + turn restrictions. Audit Carbonear ⇄ Bay Roberts routes with airplane mode on.
5. Add accurate civic addresses later; don't pretend interpolated estimates are surveyed address points.

## Licenses and data attribution

Map features: © OpenStreetMap contributors, ODbL 1.0. See https://www.openstreetmap.org/copyright. MapLibre libraries and OpenFreeMap style resources have their respective upstream licenses. This project is source code for an early prototype and does not redistribute any harvested map tiles. The UI is *inspired* by vintage monochrome field terminals, without using Fallout/Pip-Boy licensed logos, graphics, characters or assets.

## Documentation used

- MapLibre RN v11 docs: https://maplibre.org/maplibre-react-native/
- MapLibre offline manager: https://maplibre.org/maplibre-react-native/docs/modules/offline-manager/
- Expo dev builds: https://docs.expo.dev/develop/development-builds/introduction/
- OpenFreeMap mobile/offline terms: https://openfreemap.org/quick_start/
