# Newfoundland and Labrador community index (v0.30)

FIELD ATLAS search prioritizes **the same OpenStreetMap place-node
coordinates** used by the map's labelled settlements. Where no labelled
point is available, it retains the **official Canadian Geographical Names
Database (CGNDB)** reference point. Search result subtitles show only a
recognizable broad geographic region, not technical classifications.

## Files and provenance

- `nl-official-places.json`: 1,458 canonical records from the Canadian
  Geographical Names Database. Regenerate via `tools/build-nl-places.py`.
- `nl-places.json`: merged search index, currently **1,607 entries**:
  **578 OSM map-label node points** and 1,029 unmatched CGNDB fallback
  records. Rebuild via `tools/merge-osm-map-places.py` with a fresh
  Geofabrik NL OSM PBF.
- Geographic labels such as "Baie Verte Peninsula" and
  "Twillingate / Notre Dame Bay" are approximate geographic-area
  classifications using broad coordinate extents, **not officially surveyed
  peninsula or regional boundaries**. Refine them with validated region
  polygons where possible.
- Map anchors use OSM `place` tags: city, town, village, hamlet, suburb,
  neighbourhood. The reference place geometry corresponds to the map's
  place source. A label's drawn glyphs can still shift or disappear when
  MapLibre avoids collisions or changes zoom.
- CGNDB-only records may be municipality reference coordinates and do
  **not** guarantee a street-centre or visible map label. Such fallbacks
  are retained for coverage rather than silently omitted.
- The OSM and CGNDB sources are kept separate so repeated builds cannot
  corrupt the provenance of the merged directory. Stable IDs distinguish
  identically named communities.

The five official Wild Cove results remain distinguishable, including
the two **map-labelled** Wild Coves on the Baie Verte Peninsula and
near Twillingate in Notre Dame Bay. No category labels are shown in the UI.

## Data attribution and licences

OSM place data: © OpenStreetMap contributors,
[ODbL 1.0](https://www.openstreetmap.org/copyright),
via [Geofabrik](https://download.geofabrik.de/north-america/canada/newfoundland-and-labrador.html).
CGNDB: © Natural Resources Canada,
[Open Government Licence - Canada](https://open.canada.ca/en/open-government-licence-canada).

The mixed index uses ODbL-derived place data. Maintain data attribution
and assess ODbL requirements before redistributing derivative databases.

## What this does not provide

This is community *map-view* search. It is not civic-address lookup,
road-snapped destination selection, driving routes, or turn-by-turn
navigation. Neither the official gazetteer nor OSM nodes alone guarantees
an exhaustive list of every inhabited hamlet, local name, or Indigenous
community. Continue coverage audits over time.
