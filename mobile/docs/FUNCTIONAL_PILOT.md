# FIELD ATLAS — Native GPS + offline test pilot

Branch: `feature/native-functional-pilot-2026-10-16`. The approved web preview on `main` is **unchanged**.

## Exactly what works in source

- Native iOS/Android map, using the exact same versioned OpenFreeMap style URL for the live map and the corresponding downloaded native offline pack.
- Foreground GPS permission, live coordinate watcher and location marker. The GPS control requests permission on the first tap, then centres/follows when a real fix arrives.
- User-controlled map panning/zooming, selectable map colours, a limited community search, a map-centre pin.
- A *small* Carbonear offline pack (zoom 10–16), with independent status for each native theme.

## Not yet available

- Province-wide offline viewing; road and address search; offline driving routes, manoeuvres, or turn-by-turn directions.
- A tested native app package for distribution.
- Proven offline rendering after restart. MapLibre pack completion is necessary, but **not sufficient**: style URL and glyph cache use must be validated on both platforms.
- Production hosting for map styles or downloadable province data. The pilot uses immutable GitHub raw style URLs for temporary development only.

## Install on a physical device

Requires Node.js, Expo native development tools, signing for iOS, and a device. Stock Expo Go **does not work** with MapLibre Native.

```sh
git checkout feature/native-functional-pilot-2026-10-16
cd mobile
npm install
npm run typecheck
npm test
# Android, with Android SDK and connected phone:
npx expo run:android
# iOS, on a Mac with Xcode and signing:
npx expo run:ios
```

Cloud development builds (requires signing credentials / Expo account):

```sh
cd mobile
npx eas-cli@latest login
npx eas-cli@latest build --profile development --platform ios
# or: --platform android
npx expo start --dev-client
```

## Acceptance test on each device

1. With network available, open the native pilot. Confirm the map loads with real Carbonear roads and buildings; both palette selections should load the correct native style.
2. Tap the GPS control once. If prompted, allow location while using the app. Confirm a real, plausible map position and an accuracy readout; walk outdoors and verify movement. Turn off mobile data: GPS should continue to report a location fix (may take longer).
3. **With Wi-Fi**, select the green native theme, open MAPS and download the Carbonear test pack. Wait for pack completion. Repeat for the other theme if you plan to switch themes offline.
4. Force-close the app; enable airplane mode (Wi-Fi and cellular off); relaunch. Confirm Carbonear tiles at zoom 10–16, roads, buildings and street labels. If any item is missing, this is a **failed** offline test, even if the pack said complete.
5. Re-enable the network, record failures and screenshots, and repeat on Android. Test returning to GPS and panning the map without unintended camera jumps.

**Important:** This is development software; do not use it for driving or emergencies.

## Province-scale data pipeline (map only)

An optional script `mobile/tools/build-nl-vector-archive.sh` downloads the Newfoundland and Labrador extract from Geofabrik and creates `newfoundland-labrador.pmtiles` with Planetiler. This script requires Docker, significant disk capacity and a network connection. It has not been run or validated in this environment.

The resulting archive is NOT auto-installed by this pilot. Next steps: inspect layer schema, connect `pmtiles://file://` local archives on iOS/Android, package regional downloads, bundle glyphs, and separately build a routable road graph and offline place search index. Official MapLibre Native docs state that PMTiles files do not use the native OfflineManager pack cache.

Source/attribution: © OpenStreetMap contributors (ODbL); data via Geofabrik; vector tiles evaluated via OpenFreeMap, which limits public mobile offline requests to 3,000 tiles or 50 MB per download and at most four concurrent requests. Validate the application's User-Agent before any public use.
