#!/usr/bin/env python3
"""Inspect named road ways in an NL Geofabrik PBF; no changes to source data.

Targeted investigation of D'Iberville Street; the same method is usable for
other places. Produces editable OSM way IDs and geometry, not an image trace.
"""
import argparse
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import osmium
from shapely.geometry import LineString, mapping
from shapely.ops import transform
from pyproj import Transformer


def normalize(name):
    ascii_name=unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]", "", ascii_name.casefold())


class MatchedRoads(osmium.SimpleHandler):
    def __init__(self, wanted):
        super().__init__()
        self.wanted=normalize(wanted)
        self.ways=[]
    def way(self, way):
        if normalize(way.tags.get("name","")) != self.wanted:
            return
        coords=[]
        for node in way.nodes:
            if not node.location.valid():
                return
            coords.append([round(node.lon,8),round(node.lat,8)])
        if len(coords)<2:
            return
        self.ways.append({
            "id": int(way.id),
            "name": way.tags.get("name",""),
            "tags": dict(way.tags),
            "version": int(way.version),
            "timestamp": str(way.timestamp),
            "node_ids": [int(node.ref) for node in way.nodes],
            "coordinates": coords
        })



class NearbyHighways(osmium.SimpleHandler):
    def __init__(self, bbox):
        super().__init__()
        self.bbox=bbox
        self.records=[]
    def way(self,way):
        highway=way.tags.get("highway")
        if not highway or len(way.nodes)<2:
            return
        nodes=[]
        for node in way.nodes:
            if not node.location.valid(): return
            nodes.append([node.lon,node.lat])
        west,south,east,north=self.bbox
        if not any(west<=lon<=east and south<=lat<=north for lon,lat in nodes):
            return
        self.records.append({
            "way_id":int(way.id),
            "tags":dict(way.tags),
            "coordinates":[[round(lon,8),round(lat,8)] for lon,lat in nodes]
        })

def examine_nearby_highways(pbf, matched, project, output):
    coords=[pos for item in matched for pos in item["coordinates"]]
    west=min(pt[0] for pt in coords)-.002
    east=max(pt[0] for pt in coords)+.002
    south=min(pt[1] for pt in coords)-.0015
    north=max(pt[1] for pt in coords)+.0015
    nearby=NearbyHighways((west,south,east,north))
    nearby.apply_file(str(pbf),locations=True)
    base_lines=[transform(project,LineString(w["coordinates"])) for w in matched]
    rows=[]
    features=[]
    for item in nearby.records:
        line=LineString(item["coordinates"])
        metric=transform(project,line)
        if metric.length <= 2:continue
        near=min(metric.distance(base) for base in base_lines)
        if near>35: continue
        ratios=[
            metric.intersection(base.buffer(12,cap_style=2)).length/metric.length
            for base in base_lines
        ]
        percent=max(ratios)
        result={
            "way_id":item["way_id"],
            "tags":item["tags"],
            "length_m":round(metric.length,1),
            "closest_m":round(near,1),
            "parallel_coverage_fraction":round(percent,3)
        }
        rows.append(result)
        features.append({
            "type":"Feature",
            "geometry":mapping(line),
            "properties":{
                "way_id":item["way_id"],
                "highway":item["tags"].get("highway",""),
                "name":item["tags"].get("name",""),
                "service":item["tags"].get("service",""),
                "closest_m":round(near,1),
                "parallel_coverage_fraction":round(percent,3)
            }
        })
    rows.sort(key=lambda x:(-x["parallel_coverage_fraction"], x["closest_m"]))
    (output/"diberville_nearby_road_ways.json").write_text(
        json.dumps({"bounds":[west,south,east,north],
                    "results":rows,
                    "interpretation":"Compare actual tags and paths; close or parallel roads are not necessarily duplicates."},indent=2)+"\n")
    (output/"diberville_nearby_road_geometries.geojson").write_text(
        json.dumps({"type":"FeatureCollection","features":features})+"\n")
    print(json.dumps({"nearby_count":len(rows),
                      "highest_overlap":rows[:25]},indent=2),flush=True)


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--osm-pbf", type=Path, required=True)
    ap.add_argument("--name", default="D'Iberville Street")
    ap.add_argument("--output",type=Path,required=True)
    args=ap.parse_args()
    args.output.parent.mkdir(parents=True,exist_ok=True)
    matcher=MatchedRoads(args.name)
    matcher.apply_file(str(args.osm_pbf), locations=True)
    if not matcher.ways:
        raise RuntimeError("No exact street name found in extract; inspect alternative spellings")
    project=Transformer.from_crs("EPSG:4326","EPSG:32622",always_xy=True).transform
    features=[]
    for way in matcher.ways:
        line=LineString(way["coordinates"])
        metric=transform(project,line)
        feature={
            "type":"Feature",
            "geometry":mapping(line),
            "properties":{
                "osm_way_id":way["id"],
                "name":way["name"],
                "highway":way["tags"].get("highway",""),
                "lanes":way["tags"].get("lanes",""),
                "oneway":way["tags"].get("oneway",""),
                "access":way["tags"].get("access",""),
                "surface":way["tags"].get("surface",""),
                "service":way["tags"].get("service",""),
                "length_m":round(metric.length,1),
                "version":way["version"],
                "last_edited":way["timestamp"]
            }
        }
        way["length_m"]=round(metric.length,1)
        features.append(feature)
    from shapely.geometry import shape
    comparisons=[]
    for i,a in enumerate(matcher.ways):
        for b in matcher.ways[i+1:]:
            line_a=transform(project,LineString(a["coordinates"]))
            line_b=transform(project,LineString(b["coordinates"]))
            comparisons.append({
                "way_a":a["id"],"way_b":b["id"],
                "minimum_separation_m":round(line_a.distance(line_b),2),
                "shared_node_ids":len(set(a["node_ids"]) & set(b["node_ids"])),
                "rough_overlap_frac_a":round(line_a.intersection(line_b.buffer(9)).length/max(.01,line_a.length),3),
                "rough_overlap_frac_b":round(line_b.intersection(line_a.buffer(9)).length/max(.01,line_b.length),3)
            })
    audit={
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "source":"Geofabrik Newfoundland and Labrador OSM PBF",
        "queried_name":args.name,
        "ways":matcher.ways,
        "pairwise":comparisons,
        "note":"This is raw OSM geometry and attributes. Distinct OSM ways can be consecutive sections of one street, not necessarily duplicate streets. No way is automatically invalidated."
    }
    (args.output/"diberville_osm_way_report.json").write_text(json.dumps(audit,indent=2)+"\n")
    (args.output/"diberville_osm_way_geometries.geojson").write_text(json.dumps({"type":"FeatureCollection","features":features})+"\n")
    examine_nearby_highways(args.osm_pbf, matcher.ways, project, args.output)
    print(f"Matched {len(matcher.ways)} ways named {args.name}")
    print(json.dumps({"ids":[w["id"] for w in matcher.ways],
                      "highway_types":{str(w["id"]):w["tags"].get("highway","") for w in matcher.ways},
                      "pairs":comparisons},indent=2))


if __name__=="__main__":
    main()
