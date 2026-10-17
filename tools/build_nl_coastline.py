#!/usr/bin/env python3
"""Extract real Newfoundland OSM coastline vertices, without adding fake noise.

Generate native-resolution coastline lines for an offline vector layer.
Attempt to reconstruct complete land polygons ONLY from closed coastline
networks; never close a gap artificially or interpolate invented headlands.

An island bounding box is applied AFTER reading actual OSM coastline ways.
Nearby smaller islands are retained; unrelated mainland fragments may occur
and should be clipped against a vetted island footprint at integration.
"""
import argparse
import json
from datetime import datetime,timezone
from pathlib import Path

import osmium
from shapely.geometry import LineString, box, mapping
from shapely.ops import polygonize, unary_union
from shapely.validation import explain_validity
from pyproj import Transformer

BBOX=(-59.95,46.2,-52.35,51.85)
AREA_MIN_KM2=90000
AREA_MAX_KM2=145000

class CoastlineWays(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.records=[]
    def way(self,w):
        if w.tags.get("natural")!="coastline" or len(w.nodes)<2:return
        coords=[]
        for n in w.nodes:
            if not n.location.valid():return
            c=(round(n.lon,8),round(n.lat,8))
            if not coords or c!=coords[-1]:coords.append(c)
        if len(coords)<2:return
        line=LineString(coords)
        if line.is_empty or not line.intersects(box(*BBOX)):return
        self.records.append((int(w.id),line))

def export(source,lines,output,land_output,report_path):
    output.parent.mkdir(parents=True,exist_ok=True)
    land_output.parent.mkdir(parents=True,exist_ok=True)
    with output.open("w",encoding="utf-8") as fh:
        for osm_id,line in lines:
            feature={"type":"Feature","properties":{"osm_way_id":osm_id,"kind":"coastline"},
                     "geometry":mapping(line)}
            fh.write(json.dumps(feature,separators=(",",":"))+"\n")
    land_polygons=[]
    polygonization_note="not attempted"
    if lines:
        print("Checking full natural coastline boundaries for closed land polygons",flush=True)
        try:
            # Never use .buffer(), artificially closed lines or make_valid()
            # to manufacture a coastline segment absent from the source.
            boundaries=unary_union([line for _,line in lines])
            candidates=list(polygonize(boundaries))
            # Mainland and side polygons excluded by realistic NL-island area.
            land_polygons=[p for p in candidates if not p.is_empty and p.is_valid and p.area>1e-7]
            geodesic=Transformer.from_crs("EPSG:4326","EPSG:3347",always_xy=True).transform
            from shapely.ops import transform
            km2=sum(transform(geodesic,p).area for p in land_polygons)/1e6
            if not AREA_MIN_KM2<=km2<=AREA_MAX_KM2:
                land_polygons=[]
                polygonization_note=f"Geometry not published: reconstructed area {km2:.1f} km² fails Newfoundland island sanity check; source boundaries may have open ends"
            else:
                polygonization_note=f"Validated {len(land_polygons)} complete polygons; total {km2:.1f} km²"
        except Exception as exc:
            polygonization_note=f"Polygonization incomplete: {type(exc).__name__}: {exc}"
            land_polygons=[]
    with land_output.open("w",encoding="utf-8") as fh:
        for idx,poly in enumerate(land_polygons):
            fh.write(json.dumps({"type":"Feature","geometry":mapping(poly),
                "properties":{"kind":"land","source":"OpenStreetMap coastline","id":idx}},
                separators=(",",":"))+"\n")
    report={
        "generated_utc":datetime.now(timezone.utc).isoformat(),
        "source":"Natural coastline OSM ways; Geofabrik NL province extract",
        "way_count":len(lines),
        "total_coast_vertices":sum(len(l.coords) for _,l in lines),
        "bbox":BBOX,
        "land_polygons":len(land_polygons),
        "land_validation":polygonization_note,
        "data_use":"Real geographic vertices, no artificial jitter. Coastal detail limited by mapped source vertices and tile encoding precision.",
        "license":"© OpenStreetMap contributors (ODbL)"
    }
    report_path.parent.mkdir(parents=True,exist_ok=True)
    report_path.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,indent=2),flush=True)
    if len(lines)<50:raise RuntimeError("Only a small number of coastline paths found")

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--osm-pbf",required=True,type=Path)
    p.add_argument("--lines",required=True,type=Path)
    p.add_argument("--land",required=True,type=Path)
    p.add_argument("--report",required=True,type=Path)
    a=p.parse_args()
    handler=CoastlineWays()
    handler.apply_file(str(a.osm_pbf),locations=True)
    export(a.osm_pbf,handler.records,a.lines,a.land,a.report)

if __name__=="__main__":main()
