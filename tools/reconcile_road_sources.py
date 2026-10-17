#!/usr/bin/env python3
"""Conflate NL Forestry Resource Roads with real OSM roads and the federal NRN.

Province-wide QA only: never snaps, moves, joins, deletes, or adds route edges.
Keeps every provincial input feature and its source identifiers in an editable
GeoPackage. Differentiates duplicate OSM roads from roads absent in OSM.

Input OSM data © OpenStreetMap contributors (ODbL). Provincial sources keep
their own licensing and attribution. Review derived-data sharing obligations.
"""
import argparse
import json
import re
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import numpy as np
import osmium
from shapely import STRtree, buffer, intersection, union_all
from shapely.geometry import shape

METRIC_CRS = "EPSG:3347"
IGNORED_HIGHWAYS = {"construction", "proposed", "razed", "abandoned", "planned"}
VALID_GEOMETRY = {"LineString", "MultiLineString"}


def normalized_name(value):
    if value is None:
        return ""
    text = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-z0-9]+", "", text.lower())
    for suffix in ("street", "avenue", "drive", "road", "highway", "lane", "crescent", "place", "boulevard", "st", "ave", "dr", "rd", "hwy", "ln", "crt", "blvd"):
        if text.endswith(suffix) and len(text) > len(suffix) + 3:
            text = text[:-len(suffix)]
            break
    return text


class OSMHighways(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.factory = osmium.geom.GeoJSONFactory()
        self.records = []

    def way(self, way):
        highway = way.tags.get("highway")
        if not highway or highway in IGNORED_HIGHWAYS or len(way.nodes) < 2:
            return
        try:
            geometry = shape(json.loads(self.factory.create_linestring(way)))
        except (ValueError, RuntimeError, TypeError, KeyError):
            return  # broken/missing OSM node geometry; cannot safely match
        if geometry.is_empty or geometry.geom_type not in VALID_GEOMETRY:
            return
        self.records.append({
            "geometry": geometry,
            "osm_id": int(way.id),
            "name": way.tags.get("name", ""),
            "highway": highway,
            "oneway": way.tags.get("oneway", ""),
            "layer": way.tags.get("layer", ""),
            "bridge": way.tags.get("bridge", ""),
            "tunnel": way.tags.get("tunnel", ""),
            "access": way.tags.get("access", ""),
        })


def only_lines(frame):
    if frame.crs is None:
        raise ValueError("Missing coordinate system in road source")
    return frame[frame.geometry.notna() & ~frame.geometry.is_empty &
                 frame.geom_type.isin(VALID_GEOMETRY)].copy()


class IndexedRoads:
    def __init__(self, frame, name_col=None):
        metric = only_lines(frame).to_crs(METRIC_CRS)
        self.geometry = np.asarray(metric.geometry.values, dtype=object)
        self.tree = STRtree(self.geometry)
        if name_col and name_col in metric:
            self.names = [normalized_name(v) for v in metric[name_col]]
        else:
            self.names = [""] * len(metric)

    def overlap(self, road, tolerance):
        """Fraction of road length covered by corridors around reference roads.

        Crossing paths normally yield a very small fraction. Nearby parallel
        centre-lines can still be ambiguous and are *never* physically merged.
        """
        if road.is_empty or road.length <= 0:
            return 0., set(), 0
        neighbors = self.tree.query(road, predicate="dwithin", distance=tolerance)
        if not len(neighbors):
            return 0., set(), 0
        # Square caps prevent claiming additional road beyond reference endpoints.
        geometry = union_all([buffer(self.geometry[int(i)], tolerance,
                                     cap_style="flat", join_style="mitre")
                              for i in neighbors])
        overlap_len = intersection(road, geometry).length
        fraction = float(max(0., min(1., overlap_len / road.length)))
        names = {self.names[int(i)] for i in neighbors if self.names[int(i)]}
        return fraction, names, len(neighbors)


def assign_status(osm_ratio, nrn_ratio, length_m, own_name="", osm_names=frozenset()):
    """OSM duplicates hidden by default; all other cases are exposed for QA."""
    if osm_ratio >= .82:
        # Only flag a name conflict where *none* of the nearby named roads match.
        if own_name and osm_names and own_name not in osm_names:
            return "name_conflict"
        return "duplicate_osm"
    if nrn_ratio >= .82:
        return "nrn_only"
    if length_m < 25:
        return "short_review"
    if osm_ratio <= .20 and nrn_ratio <= .20:
        return "candidate_addition"
    return "alignment_review"


def reconcile(osm_frame, nrn_frame, provincial_frame, tolerance_m):
    osm_index = IndexedRoads(osm_frame, "name")
    nrn_index = IndexedRoads(nrn_frame)
    provincial = only_lines(provincial_frame).to_crs(METRIC_CRS)
    columns = {
        "osm_cover": [], "nrn_cover": [], "audit_status": [],
        "length_m": [], "near_osm": [], "near_nrn": [],
    }
    for n, road in enumerate(provincial.itertuples(index=False), 1):
        g = road.geometry
        a, names, osm_near = osm_index.overlap(g, tolerance_m)
        b, _, nrn_near = nrn_index.overlap(g, tolerance_m)
        length = round(float(g.length), 1)
        status = assign_status(a, b, length, normalized_name(getattr(road, "ROAD_NAME", "")), names)
        columns["osm_cover"].append(round(a, 4))
        columns["nrn_cover"].append(round(b, 4))
        columns["audit_status"].append(status)
        columns["length_m"].append(length)
        columns["near_osm"].append(osm_near)
        columns["near_nrn"].append(nrn_near)
        if n % 2000 == 0:
            print(f"Compared {n:,}/{len(provincial):,} provincial features", flush=True)
    for key, values in columns.items():
        provincial[key] = values
    return provincial.to_crs("EPSG:4326"), len(osm_index.geometry), len(nrn_index.geometry)



def audit_osm_self_overlaps(osm_frame, tolerance_m=7.):
    """Find same-named OSM centreline overlaps without altering road topology.

    Endpoint-sharing segmented streets are normal: the test requires substantial
    overlap across BOTH lines. Divided one-way and grade-separated roads are
    reported separately or skipped instead of being silently collapsed.
    """
    metric = only_lines(osm_frame).to_crs(METRIC_CRS).reset_index(drop=True)
    geoms = np.asarray(metric.geometry.values, dtype=object)
    indexed = STRtree(geoms)
    names = [normalized_name(name) for name in metric["name"]]
    records = []
    for i, g in enumerate(geoms):
        if not names[i] or g.length < 35:
            continue
        for j in indexed.query(g, predicate="dwithin", distance=tolerance_m):
            j = int(j)
            if j <= i or names[i] != names[j] or geoms[j].length < 35:
                continue
            # Flyovers, bridges, tunnels and explicit different layers are not
            # equivalent road intersections and must never be conflated.
            if any(str(metric.iloc[i][k] or "") != str(metric.iloc[j][k] or "")
                   for k in ("bridge", "tunnel", "layer")):
                continue
            other = geoms[j]
            try:
                a = min(1., float(intersection(g, buffer(other, tolerance_m, cap_style="flat")).length / g.length))
                b = min(1., float(intersection(other, buffer(g, tolerance_m, cap_style="flat")).length / other.length))
            except (ValueError, RuntimeError):
                continue
            if min(a, b) < .78:
                continue
            oneway_a = str(metric.iloc[i].get("oneway") or "").lower()
            oneway_b = str(metric.iloc[j].get("oneway") or "").lower()
            kind = "parallel_oneway_review" if oneway_a in ("yes", "1", "true", "-1") or oneway_b in ("yes", "1", "true", "-1") else "possible_duplicate_osm"
            records.append({
                "osm_id_a": int(metric.iloc[i]["osm_id"]),
                "osm_id_b": int(metric.iloc[j]["osm_id"]),
                "road_name": str(metric.iloc[i]["name"] or ""),
                "assessment": kind,
                "overlap_a": round(a, 3),
                "overlap_b": round(b, 3),
                "geometry": g,
            })
        if (i + 1) % 25000 == 0:
            print(f"Checked {i+1:,}/{len(geoms):,} OpenStreetMap road ways for internal overlaps", flush=True)
    if not records:
        return gpd.GeoDataFrame(columns=["osm_id_a", "osm_id_b", "road_name", "assessment",
                                          "overlap_a", "overlap_b", "geometry"],
                                geometry="geometry", crs=METRIC_CRS).to_crs("EPSG:4326")
    return gpd.GeoDataFrame(records, geometry="geometry", crs=METRIC_CRS).to_crs("EPSG:4326")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--osm-pbf", type=Path, required=True)
    parser.add_argument("--nrn", type=Path, required=True)
    parser.add_argument("--provincial", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--tolerance-m", type=float, default=12.)
    args = parser.parse_args()
    if not 2 <= args.tolerance_m <= 30:
        raise ValueError("Match tolerance must be 2–30 metres")
    args.output.mkdir(parents=True, exist_ok=True)
    if not args.osm_pbf.is_file():
        raise FileNotFoundError(args.osm_pbf)
    print("Reading all mapped OSM highways for Newfoundland and Labrador", flush=True)
    handler = OSMHighways()
    handler.apply_file(str(args.osm_pbf), locations=True)
    osm = gpd.GeoDataFrame(handler.records, geometry="geometry", crs="EPSG:4326")
    if len(osm) < 15000:
        raise RuntimeError(f"Suspiciously few OSM highways: {len(osm)}")
    nrn = gpd.read_file(args.nrn, layer="road_segments")
    provincial = gpd.read_file(args.provincial, layer="resource_access_roads")
    print(f"Loaded {len(osm):,} OSM ways, {len(nrn):,} federal roads, {len(provincial):,} provincial road features")
    osm_suspects = audit_osm_self_overlaps(osm)
    if len(osm_suspects):
        osm_suspects.to_file(args.output / "osm_overlap_review.gpkg",
                            layer="osm_source_conflicts", driver="GPKG")
    osm_counts = dict(Counter(osm_suspects["assessment"]))
    (args.output / "osm_self_overlap_report.json").write_text(
        json.dumps({"suspected_pairs": len(osm_suspects), "classifications": osm_counts,
            "important": "Same-named lines are review candidates, not confirmed duplicates; no geometry was deleted or connected."},
            indent=2) + "\n"
    )
    merged, osm_count, nrn_count = reconcile(osm, nrn, provincial, args.tolerance_m)
    merged.to_file(args.output / "nl_road_conflation.gpkg",
                   layer="provincial_source_audit", driver="GPKG")
    counts = {}
    for key, group in merged.groupby("audit_status"):
        counts[key] = {
            "features": int(len(group)),
            "km": round(float(group["length_m"].sum()) / 1000, 2)
        }
    report = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "osm_way_count": osm_count, "nrn_segment_count": nrn_count,
        "osm_self_overlap_review_pairs": int(len(osm_suspects)),
        "provincial_road_features": len(merged),
        "tolerance_m": args.tolerance_m,
        "statuses": counts,
        "method": "Near-line buffer overlap in EPSG:3347, with OSM name conflict checks",
        "sources": [
            {"dataset": "OpenStreetMap Geofabrik Newfoundland and Labrador extract",
             "attribution": "© OpenStreetMap contributors", "licence": "ODbL"},
            {"dataset": "Statistics Canada National Road Network"},
            {"dataset": "NL Forestry Resource Roads - Newfoundland (direct FFA FeatureServer)"}
        ],
        "limits": "No auto-merge, snapping, rerouting or road deletion. Candidate additions require imagery/field review. Parallel carriageways, bridges, ramps and name conflicts require special care.",
    }
    (args.output / "conflation_report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()
