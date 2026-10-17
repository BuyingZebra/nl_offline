#!/usr/bin/env python3
"""Export every National Road Network segment to a compact, inspectable web overlay.

The full-quality original GeoPackage is untouched. This derivative is VISUAL-ONLY
and is never used for routing, alignment, or geometry snapping.
"""
import argparse
import gzip
import json
from collections import Counter
from pathlib import Path
import geopandas as gpd
from shapely.geometry import mapping

def rounded_coordinates(value):
    if isinstance(value, (list, tuple)):
        return [rounded_coordinates(x) for x in value]
    return round(float(value), 6)

def field(record, names, default=""):
    for n in names:
        if n in record and record[n] is not None:
            text = str(record[n]).strip()
            if text and text.lower() not in ("none", "nan", "null"):
                return text
    return default

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--reference",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--simplify-m",type=float,default=2.0)
    args=parser.parse_args()
    if not 0 <= args.simplify_m <= 10: raise ValueError("Visual simplification must be 0–10 metres")
    args.output.parent.mkdir(parents=True,exist_ok=True)
    rows=gpd.read_file(args.reference,layer="road_segments")
    if rows.crs is None: raise RuntimeError("Federal road layer missing CRS")
    rows=rows[rows.geometry.notna() & ~rows.geometry.is_empty &
              rows.geom_type.isin(["LineString","MultiLineString"])].copy()
    original=len(rows)
    metric=rows.to_crs("EPSG:3347")
    if args.simplify_m:
        metric.geometry=metric.geometry.simplify(args.simplify_m,preserve_topology=True)
    rows=metric.to_crs("EPSG:4326")
    count=0
    classes=Counter()
    with gzip.open(args.output,"wt",encoding="utf-8",compresslevel=7) as out:
        out.write('{"type":"FeatureCollection","features":[')
        for _,row in rows.iterrows():
            attributes=row.drop(labels=["geometry"]).to_dict()
            identifier=field(attributes,["NID","ROADSEGID","nid","roadsegid","ID"])
            name=field(attributes,["STREETNAME","NAME","ST_NAME","ROADNAME","L_STNAME","R_STNAME","RSTREETNAME","LSTREETNAME","NAME_EN"])
            if not name:
                for col in attributes:
                    if "STREETNAME" in col.upper() or col.upper().endswith("STNAME"):
                        name=field(attributes,[col])
                        if name: break
            roadclass=field(attributes,["ROADCLASS","ROAD_CLASS","CLASS","ROADTYPE"])
            classes[roadclass or "Unknown"]+=1
            props={"source":"Statistics Canada National Road Network","id":identifier,
                   "name":name,"road_class":roadclass}
            feature={"type":"Feature","geometry":{"type":row.geometry.geom_type,
                    "coordinates":rounded_coordinates(mapping(row.geometry)["coordinates"])},
                    "properties":props}
            out.write(("," if count else "")+json.dumps(feature,ensure_ascii=False,separators=(",",":")))
            count+=1
        out.write("]}")
    if count < 30000:
        raise RuntimeError(f"Unexpectedly few federal roads: {count}")
    summary={"source":"Statistics Canada National Road Network","features":count,
             "original_geometries":original,"visual_simplification_m":args.simplify_m,
             "class_counts":dict(classes),"usage":"visual inspection only, not road routing"}
    (args.output.parent/"federal_roads_manifest.json").write_text(json.dumps(summary,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(summary,indent=2),flush=True)
if __name__=="__main__":
    main()
