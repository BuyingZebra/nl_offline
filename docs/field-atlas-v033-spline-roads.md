# FIELD ATLAS v0.33 — Carbonear spline roads

This is a controlled **road geometry rendering** experiment. The original OSM file at `data/osm-detail/carbonear_roads.geojson` is unchanged.

**Map type: OSM SPLINE ROADS** loads `carbonear_roads_spline.geojson`. **Map type: OSM NATIVE DETAIL** loads the untouched original. Compare at zoom levels 17–19.

- 3,065 road features from the Carbonear-area regional export, including neighbouring communities
- 24,291 original geometry vertices preserved exactly; 82,537 vertices in the sampled curve dataset
- Cubic Bézier segments (degree-3, unit-weight NURBS special case) pass through all OSM coordinates
- Tangent directions use adjacent road segments. Control handles blend toward their chord until sampled deviation is at most ~1.8 metres.
- Short / straight road intervals remain unchanged, as do the OSM IDs, original nodes and road endpoints
- Road intersections remain anchored at OSM nodes; curvature does **not** guarantee better real-world accuracy or continuous tangent orientation across separately mapped OSM ways
- Geographic basemap, water grid, building geometry, labels, green/amber themes and existing interactions are otherwise unchanged
- Performance tradeoff: larger local GeoJSON, currently delivered online, not the eventual island-wide tile format.

Future: bake segmented curves into vector tiles at the desired LOD and add maximum-deviation controls that respect intersection topology.
