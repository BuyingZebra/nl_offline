#!/usr/bin/env python3
"""FIELD ATLAS v0.32: extract un-generalized OSM ways for a regional map test.

All geometry comes from the Geofabrik Newfoundland and Labrador OSM PBF;
coordinates are copied from OSM nodes, and clipped only at the test bbox.
The native province coastline uses the separately published OSM PMTiles file.
This is NOT an island-wide road/building pack.
"""
import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import osmium
from shapely.geometry import LineString, Polygon, box, mapping

# Carbonear, Harbour Grace, Spaniard's Bay, neighbouring coast and roads.
BBOX = (-53.49, 47.56, -53.04, 47.91)
ROADS = {
    "motorway", "trunk", "primary", "secondary", "tertiary",
    "unclassified", "residential", "living_street", "service",
    "track", "road", "motorway_link", "trunk_link", "primary_link",
    "secondary_link", "tertiary_link"
}
WATERWAYS = {"stream", "river", "canal", "drain", "ditch", "brook"}
PRECISION = 7


def bounded(coords, poly):
    # Skip geometries whose bounding box does not touch the study region.
    west, south, east, north = BBOX
    return not (
        max(lon for lon, _ in coords) < west or
        min(lon for lon, _ in coords) > east or
        max(lat for _, lat in coords) < south or
        min(lat for _, lat in coords) > north
    )


def clipped_features(geometry):
    cut = geometry.intersection(box(*BBOX))
    if cut.is_empty:
        return []
    if cut.geom_type in ("LineString", "Polygon"):
        components = (cut,)
    elif cut.geom_type in ("MultiLineString", "MultiPolygon", "GeometryCollection"):
        components = cut.geoms
    else:
        components = ()
    return [
        geom for geom in components
        if geom.geom_type in ("LineString", "Polygon")
        and not geom.is_empty and geom.is_valid
    ]


class Detail(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.features = {key: [] for key in ("roads", "buildings", "water", "streams")}
        self.counts = Counter()

    def way(self, way):
        highway = way.tags.get("highway", "")
        building = way.tags.get("building", "")
        waterway = way.tags.get("waterway", "")
        natural = way.tags.get("natural", "")
        landuse = way.tags.get("landuse", "")
        is_road = highway in ROADS and way.tags.get("area") != "yes"
        is_building = bool(building and building != "no")
        is_water = (
            natural == "water" or landuse == "reservoir" or
            waterway == "riverbank"
        )
        is_stream = waterway in WATERWAYS
        if not (is_road or is_building or is_water or is_stream):
            return

        coords = []
        for node in way.nodes:
            if not node.location.valid():
                return
            coord = (
                round(node.location.lon, PRECISION),
                round(node.location.lat, PRECISION),
            )
            if not coords or coord != coords[-1]:
                coords.append(coord)
        if len(coords) < 2 or not bounded(coords, BBOX):
            return

        target = None
        geometry = None
        if is_road:
            target = "roads"
            geometry = LineString(coords)
        elif is_building and len(coords) >= 4 and coords[0] == coords[-1]:
            target = "buildings"
            geometry = Polygon(coords)
        elif is_water and len(coords) >= 4 and coords[0] == coords[-1]:
            target = "water"
            geometry = Polygon(coords)
        elif is_stream:
            target = "streams"
            geometry = LineString(coords)
        if geometry is None or not geometry.is_valid:
            return

        properties = {"osm_id": int(way.id)}
        if target == "roads":
            properties.update({
                "highway": highway,
                "name": way.tags.get("name", ""),
                "service": way.tags.get("service", ""),
                "surface": way.tags.get("surface", ""),
            })
        elif target == "buildings":
            properties["building"] = building
        elif target == "water":
            properties["name"] = way.tags.get("name", "")
        else:
            properties["name"] = way.tags.get("name", "")
            properties["waterway"] = waterway

        for item in clipped_features(geometry):
            if target in ("roads", "streams") and item.geom_type != "LineString":
                continue
            if target in ("buildings", "water") and item.geom_type != "Polygon":
                continue
            # Unlike tile generalization this doesn't simplify shape vertices.
            self.features[target].append({
                "type": "Feature",
                "geometry": mapping(item),
                "properties": properties,
            })
            self.counts[target] += 1


def main():
    cli = argparse.ArgumentParser()
    cli.add_argument("--pbf", type=Path, required=True)
    cli.add_argument("--out", type=Path, required=True)
    args = cli.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    detail = Detail()
    detail.apply_file(str(args.pbf), locations=True)
    for layer, feats in detail.features.items():
        if not feats and layer in ("roads", "buildings"):
            raise RuntimeError(f"OSM test area has no {layer}")
        output = args.out / f"carbonear_{layer}.geojson"
        output.write_text(
            json.dumps({"type": "FeatureCollection", "features": feats},
                       ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        print(f"{layer}: {len(feats):,} features, {output.stat().st_size:,} bytes", flush=True)
        if output.stat().st_size > 40000000:
            raise RuntimeError(f"{layer} GeoJSON unexpectedly huge")
    report = {
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "source": "OpenStreetMap / Geofabrik Newfoundland and Labrador PBF",
        "bbox_wsen": BBOX,
        "precision": PRECISION,
        "counts": dict(detail.counts),
        "notes": "Only closed OSM ways are water/building polygons; relation multipolygons may be absent. Road/stream geometry has no line simplification. Region-only proof of concept.",
        "license": "© OpenStreetMap contributors (ODbL 1.0)",
    }
    (args.out / "carbonear_report.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
