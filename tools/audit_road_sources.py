#!/usr/bin/env python3
"""Province-wide source comparison: provincial Resource Access Roads vs federal NRN.

Preserves original geometry/attributes; candidate additions are not assumed absent
from OpenStreetMap or safe/passable. This is NOT automatic navigation routing.
"""
import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
import geopandas as gpd
from shapely import STRtree
from shapely.ops import unary_union

METRIC = "EPSG:3347"

def line_features(frame):
    return frame[frame.geometry.notna() & ~frame.geometry.is_empty &
                 frame.geom_type.isin(["LineString", "MultiLineString"])].copy()

def classify(federal, provincial, tolerance_m=18.):
    if federal.crs is None or provincial.crs is None:
        raise ValueError("Input layers must have defined coordinate systems")
    base = line_features(federal).to_crs(METRIC)
    extra = line_features(provincial).to_crs(METRIC)
    if base.empty or extra.empty:
        raise ValueError("Both road source layers must contain real line geometry")
    shapes = base.geometry.to_numpy()
    tree = STRtree(shapes)
    states, fractions, lengths, neighbor_counts = [], [], [], []
    for n, geom in enumerate(extra.geometry):
        length = max(float(geom.length), .001)
        nearby = tree.query(geom, predicate="dwithin", distance=tolerance_m)
        if len(nearby):
            buffered = unary_union([shapes[i].buffer(tolerance_m, cap_style=2) for i in nearby])
            covered = max(0., min(1., float(geom.intersection(buffered).length / length)))
        else:
            covered = 0.
        if length < 30:
            label = "review_short_segment"
        elif covered >= .80:
            label = "probable_overlap"
        elif covered <= .20:
            label = "potential_addition"
        else:
            label = "needs_review"
        states.append(label)
        fractions.append(round(covered, 4))
        lengths.append(round(length, 1))
        neighbor_counts.append(len(nearby))
        if (n + 1) % 3000 == 0:
            print(f"Classified {n+1:,}/{len(extra):,} road segments", flush=True)
    extra["match_ratio"] = fractions
    extra["length_m"] = lengths
    extra["n_nrn_near"] = neighbor_counts
    extra["audit_status"] = states
    extra["data_source"] = "NL GeoAtlas Resource Access Roads"
    return extra.to_crs("EPSG:4326"), len(base)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--federal", type=Path, required=True)
    ap.add_argument("--provincial", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--tolerance-m", type=float, default=18.)
    a = ap.parse_args()
    if not 2 <= a.tolerance_m <= 100:
        raise ValueError("Set geographic tolerance between 2 and 100 metres")
    a.output.mkdir(parents=True, exist_ok=True)
    federal = gpd.read_file(a.federal, layer="road_segments")
    provincial = gpd.read_file(a.provincial, layer="resource_access_roads")
    print(f"National: {len(federal):,}, provincial: {len(provincial):,}", flush=True)
    result, base_count = classify(federal, provincial, a.tolerance_m)
    result.to_file(a.output / "nl_provincial_road_audit.gpkg",
                   layer="provincial_resource_roads", driver="GPKG")
    possible = result[result.audit_status == "potential_addition"].copy()
    if not possible.empty:
        possible.to_file(a.output / "possible_additional_roads.geojson", driver="GeoJSON")
    categories = {kind: {"segments": int((result.audit_status == kind).sum()),
                         "km": round(float(result.loc[result.audit_status == kind, "length_m"].sum()) / 1000, 2)}
                  for kind in ["potential_addition", "needs_review", "probable_overlap", "review_short_segment"]}
    report = {"run_utc": datetime.now(timezone.utc).isoformat(),
              "national_road_segments": base_count, "provincial_road_segments": len(result),
              "distance_tolerance_m": a.tolerance_m, "classifications": categories,
              "limitations": "Candidate roads are missing relative to the federal NRN, NOT necessarily OSM. No automatic road-network/routing merge. Verify history, access, and alignment before use."}
    (a.output / "road_comparison_report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2), flush=True)

if __name__ == "__main__":
    main()
