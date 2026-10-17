#!/usr/bin/env python3
"""Partition a complete Newfoundland road dataset into region-sized tile archives.

Every feature belongs to exactly one archive. Input geometry/IDs are unmodified.
Partition by a feature's mid-longitude; geometries crossing region boundaries
remain whole, retaining their original topology.
"""
import argparse
import json
from bisect import bisect_right
from pathlib import Path

def center_lon(feature):
    pts=feature["geometry"]["coordinates"]
    if not pts:
        raise ValueError("Missing LineString geometry")
    return (min(p[0] for p in pts)+max(p[0] for p in pts))/2

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--input",type=Path,required=True)
    p.add_argument("--output-dir",type=Path,required=True)
    p.add_argument("--parts",type=int,default=4)
    a=p.parse_args()
    if a.parts<2 or a.parts>12: raise ValueError("Pick 2 to 12 balanced parts")
    a.output_dir.mkdir(parents=True,exist_ok=True)
    weights=[]
    with a.input.open(encoding="utf-8") as src:
        for line in src:
            if line.strip():
                f=json.loads(line)
                weights.append((center_lon(f),len(line.encode("utf-8"))))
    if not weights:raise RuntimeError("No Overture lines to split")
    weights.sort(key=lambda q:q[0])
    target=sum(w for _,w in weights)/a.parts
    limits=[]
    subtotal=0
    for lon,size in weights:
        subtotal+=size
        if len(limits)<a.parts-1 and subtotal>=target*(len(limits)+1):
            limits.append(lon)
    if len(limits)!=a.parts-1 or sorted(set(limits))!=limits:
        raise RuntimeError("Could not build unique geographic split boundaries")
    files=[(a.output_dir/f"roads_part_{i}.geojsonseq").open("w",encoding="utf-8") for i in range(a.parts)]
    items=[{"part":i,"filename":f"nl_overture_part_{i}.pmtiles","features":0,"source_bytes":0}
           for i in range(a.parts)]
    try:
        with a.input.open(encoding="utf-8") as src:
            for line in src:
                if not line.strip():continue
                f=json.loads(line)
                part=bisect_right(limits,center_lon(f))
                files[part].write(line)
                items[part]["features"]+=1
                items[part]["source_bytes"]+=len(line.encode("utf-8"))
    finally:
        for file in files:file.close()
    if sum(p["features"] for p in items)!=len(weights):
        raise RuntimeError("Features were lost while sharding")
    if min(x["features"] for x in items)<100:
        raise RuntimeError("Unexpectedly empty geographic archive")
    manifest={
        "source":"Overture Maps transportation (OSM + TomTom)",
        "source_license":"ODbL 1.0; © OpenStreetMap contributors",
        "tileset_layer":"overture_transportation",
        "format":"PMTiles v3; each complete feature is assigned to exactly one geographic shard",
        "longitude_partition_bounds":limits,
        "part_count":a.parts,"feature_count":len(weights),
        "parts":items,
        "note":"Shard boundaries are for file sizing, not geometry clipping. A road crossing a boundary keeps all its vertices. Each PMTiles is queried independently through HTTP Range.",
    }
    (a.output_dir/"shard_manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    print(json.dumps(manifest,indent=2),flush=True)

if __name__=="__main__":main()
