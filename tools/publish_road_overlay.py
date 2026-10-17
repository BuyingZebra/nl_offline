#!/usr/bin/env python3
"""Make a compact province-wide browser overlay from audited resource roads."""
import argparse
import gzip
import json
from collections import Counter
from pathlib import Path
import geopandas as gpd
from shapely.geometry import mapping


def round_coords(value):
    if isinstance(value, (list, tuple)):
        return [round_coords(part) for part in value]
    return round(float(value), 5)


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--input",type=Path,required=True)
    p.add_argument("--output",type=Path,required=True)
    p.add_argument("--layer",default="provincial_resource_roads")
    args=p.parse_args()
    args.output.parent.mkdir(parents=True,exist_ok=True)
    roads=gpd.read_file(args.input,layer=args.layer)
    if roads.crs is None:
        raise RuntimeError("Road audit GIS file lacks a coordinate system")
    roads=roads.to_crs("EPSG:3347")
    roads.geometry=roads.geometry.simplify(25,preserve_topology=False)
    roads=roads.to_crs("EPSG:4326")
    counts=Counter()
    size=0
    with gzip.open(args.output,"wt",encoding="utf-8",compresslevel=7) as fh:
        fh.write('{"type":"FeatureCollection","features":[')
        for row in roads.itertuples():
            geom=row.geometry
            if geom is None or geom.is_empty or geom.geom_type not in ("LineString","MultiLineString"):
                continue
            p={
                "name":str(getattr(row,"ROAD_NAME","") or ""),
                "access":str(getattr(row,"ROAD_ACCESS","") or ""),
                "surface":str(getattr(row,"ROAD_SURFACE","") or ""),
                "class":str(getattr(row,"ROAD_CLASS","") or ""),
                "audit_status":str(getattr(row,"audit_status","unknown")),
                "match_ratio":round(float(getattr(row,"match_ratio",0)),3),
                "length_m":round(float(getattr(row,"length_m",0)),0),
                "osm_cover":round(float(getattr(row,"osm_cover",0)),3),
                "nrn_cover":round(float(getattr(row,"nrn_cover",0)),3),
                "source_id":str(getattr(row,"OBJECTID","") or ""),
            }
            counts[p["audit_status"]]+=1
            feature={"type":"Feature","properties":p,
                     "geometry":{"type":geom.geom_type,"coordinates":round_coords(mapping(geom)["coordinates"])}}
            if size:
                fh.write(",")
            fh.write(json.dumps(feature,separators=(",",":"),ensure_ascii=False))
            size+=1
        fh.write("]}")
    summary={"features":size,"by_status":dict(counts),
             "path":str(args.output.name),
             "purpose":"Visual-only source comparison, not a validated road network",
             "geometry_simplification_m":25}
    (args.output.parent/"provincial_road_overlay_manifest.json").write_text(json.dumps(summary,indent=2)+"\n")
    if size<100:
        raise RuntimeError("Too few road features were exported")
    print(json.dumps(summary,indent=2))

if __name__=="__main__":
    main()
