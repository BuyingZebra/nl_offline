#!/usr/bin/env python3
"""Build one island-wide town picker from official names + OSM place label nodes.

Center selected settlements on actual OSM map place-label positions when one
is identifiable near the same official settlement. Keep all homonymous towns.
Never substitute an unrelated same-name Wild Cove from another peninsula.
"""
import argparse
import csv
import json
import math
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

import osmium

PLACES={"city","town","village","hamlet","locality","isolated_dwelling"}
ISLAND=(-59.9,46.3,-52.3,51.8)

def normalized(s):
    return re.sub(r"[^a-z0-9]","",
        unicodedata.normalize("NFKD",str(s or "").lower()).encode("ascii","ignore").decode())

def separation_km(a,b):
    dx=(a[0]-b[0])*111.0*math.cos(math.radians((a[1]+b[1])/2))
    dy=(a[1]-b[1])*111.0
    return math.hypot(dx,dy)

class OsmPlaces(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.nodes=defaultdict(list)
    def node(self,node):
        kind=node.tags.get("place")
        name=node.tags.get("name")
        if kind not in PLACES or not name or not node.location.valid():
            return
        pos=[round(node.lon,7),round(node.lat,7)]
        if not(ISLAND[0]<=pos[0]<=ISLAND[2] and ISLAND[1]<=pos[1]<=ISLAND[3]):
            return
        self.nodes[normalized(name)].append({
            "type":"Feature","geometry":{"type":"Point","coordinates":pos},
            "properties":{"name":name,"kind":kind,"source_id":f"osm-node-{node.id}",
                          "label_source":"OSM place node","region_hint":node.tags.get("is_in","")}
        })

def build(communities,osm):
    osm_places=OsmPlaces()
    osm_places.apply_file(str(osm),locations=False)
    features=[]
    matched=set()
    with communities.open(encoding="utf-8-sig",newline="") as file:
        for row in csv.DictReader(file):
            if row.get("category")!="Populated Place":continue
            try:
                point=[float(row["lon"]),float(row["lat"])]
            except (ValueError,KeyError):
                continue
            if not(ISLAND[0]<=point[0]<=ISLAND[2] and ISLAND[1]<=point[1]<=ISLAND[3]):
                continue
            name=row.get("name","").strip()
            candidates=osm_places.nodes.get(normalized(name),[])
            best=min(candidates,key=lambda c:separation_km(point,c["geometry"]["coordinates"]),default=None)
            if best and separation_km(point,best["geometry"]["coordinates"])<=12:
                label=best["geometry"]["coordinates"]
                label_source="OSM place node (map label)"
                matched.add(best["properties"]["source_id"])
            else:
                label=point
                label_source="Natural Resources Canada settlement position"
            features.append({
                "type":"Feature","geometry":{"type":"Point","coordinates":label},
                "properties":{"name":name,"kind":row.get("feature_type",""),
                              "source_id":row.get("source_id",""),
                              "label_source":label_source,
                              "region_hint":row.get("location_hint",""),
                              "official_coordinate":point}
            })
    # Unmatched OSM place-label nodes represent places that are on the rendered
    # map but absent from our selected federal populated-place category.
    for nodes in osm_places.nodes.values():
        for node in nodes:
            if node["properties"]["source_id"] not in matched:
                features.append(node)
    return {"type":"FeatureCollection","features":features}

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--communities",type=Path,required=True)
    p.add_argument("--osm-pbf",type=Path,required=True)
    p.add_argument("--output",type=Path,required=True)
    a=p.parse_args()
    result=build(a.communities,a.osm_pbf)
    a.output.parent.mkdir(parents=True,exist_ok=True)
    a.output.write_text(json.dumps(result,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
    print(f"Town picker: {len(result['features'])} named settlement coordinates")
    if len(result["features"])<500:raise RuntimeError("Town catalog suspiciously incomplete")

if __name__=="__main__":main()
