# Tetris update and cache-coherence policy — v265

## Goals

- On every **online cold launch**, probe the network's published Tetris build marker *before* importing game modules. Query `three-v027.html?update-check=<timestamp>` with `cache:'no-store'`; the scoped service worker explicitly passes it to the network.
- When a new build is published, register/update `sw.js` with `updateViaCache:'none'`, wait for the new worker to **fully install**, and activate it through an explicit `NOMAD_ACTIVATE_UPDATE` message before reloading the page. Do not load new modules under an old active worker.
- The new worker installs only after `cache.addAll` completes, the cached shell build marker matches the worker version, and every pinned import is verified. On an installation failure, the new cache is deleted and the existing offline build remains playable.
- One worker controls one complete, immutable cache. Query-string version suffixes are normalized by the worker and **not** used to mix new and old releases.
- **Offline** devices fall back to the last complete cached build. No mechanism can promise the latest server release while offline or during partial deployment.
- The boot check has bounded network and installation waits (4.5 seconds to fetch the published marker, up to 10 seconds for a staged update and 8 seconds to observe control transfer). On failure, keep the old build intact.
- The launch gate runs before game modules on v265+; a device currently using v264's older cached shell may require closing/reopening once to adopt the v265 update mechanism. Another active client/tab may also delay activation.

## Continued validation

Run `node tools/build-tetris-release.mjs --check` before publishing. It checks exact worker asset manifest, pinned imports and unsupported Three.js references in the physical LCD module (the failure that broke v264).

The source repo separates `/tetris/` service-worker scope from `/lcd-lab/` and from the other NOMAD application. No global cache clearance, forced deletion of local game storage or unrelated app data.

Avoid promises of immediate in-session replacement while someone is playing. The platform's background update checker stages releases only when the game is ready and menu overlays are closed. On an online return to the ready screen, the platform can also activate the fully staged worker and reload; a cold launch performs the same check before loading the game. A live round or open menu is never interrupted.

## Practical user check

Verify the version displayed in Tetris matches the current HTML build marker and `CACHE_VERSION` in the published worker. Close all Tetris tabs / home-screen instances and reopen if the device is still controlled by a prior worker; on Safari, a backgrounded installed PWA may retain its old web view instead of performing a cold launch.

If the server/CDN returns stale HTML despite a cache-busting query, the launch gate cannot detect that issue without an independent release endpoint. Preserve the last working game rather than mixing module revisions.
