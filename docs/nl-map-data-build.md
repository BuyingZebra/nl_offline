# Newfoundland and Labrador offline data builder

This is an independent, manually runnable **GitHub Actions** pipeline. It does **not** change the app or publish a live map.

## Run it

1. Open [Actions → Build Newfoundland and Labrador map data](https://github.com/BuyingZebra/nl_offline/actions/workflows/build-nl-map.yml).
2. Choose **Run workflow** on the **main** branch.
3. Leave **include_addresses** off for the first test (the Canada-wide address archive is very large).
4. When both jobs finish, open the workflow run and download the two **Artifacts** ZIPs at the bottom.

These output artifacts are retained for **7 days**. Raw source archives are never committed into this repository.

## Expected outputs

**nl-reference-data** (official Canadian government GIS layers):
- `nl_reference.gpkg`: road segments, junctions, ferries, geographic-name points in EPSG:4326.
- `nl_search.sqlite`: full-text searchable place catalog, plus address search when enabled.
- `nl_geographic_names.csv`: all official named features.
- `nl_communities.csv`: populated places and administrative-area records (may include non-settlement administrative names).
- `coverage_report.json`: counts by category and Wild Cove checks.

**nl-offline-vector-map** (OpenStreetMap derived):
- `nl_osm.mbtiles`: offline vector map tiles including whatever roads, buildings, landuse, labels and other features exist in the OSM extract. MapLibre needs a matching style and local MBTiles access to display these tiles on a device.

## Public data sources used

- Geofabrik NL OSM PBF: https://download.geofabrik.de/north-america/canada/newfoundland-and-labrador.html
- National Road Network NL: https://geo.statcan.gc.ca/nrn_rrn/nl/nrn_rrn_nl_GPKG.zip
- Canadian Geographical Names NL: https://ftp.maps.canada.ca/pub/nrcan_rncan/vector/geobase_cgn_toponyme/prov_shp_eng/cgn_nl_shp_eng.zip
- Optional National Address Register (June 2026): https://www150.statcan.gc.ca/n1/pub/46-26-0002/2022001/202606.zip

OSM/Geofabrik content is under the ODbL; the federal datasets have their respective open-government terms. Preserve source credits.

## Status and limitations

- The Python geographic-name builder was locally tested against the actual NL name ZIP: 33,150 named features.
- The automated **GitHub runner downloads, GIS conversions and Planetiler generation are not yet independently verified**. Inspect the run logs if a job fails.
- Address processing is optional and the June 2026 Canada-wide ZIP layout has not been validated. It is *not* included in the standard build.
- Official community names are not automatically matched to a named peninsula or region. Duplicate names intentionally retain separate coordinates and source IDs.
- The government road database and OSM tiles are **separate layers**, not a conflated/upgraded navigation graph. GIS conversion is not turn-by-turn routing.
- Planetiler produces standard offline MBTiles; the current mobile app has **not yet been wired to these generated artifacts**.
- Output size depends on the current data and hosted-runner capacity; do not use these data for emergency or safety-critical navigation without real-device coverage and routing validation.

Future step: reconcile OSM roads with federal road names and link address points to searchable road/settlement records before implementing offline routing.
