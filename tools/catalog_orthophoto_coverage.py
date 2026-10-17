#!/usr/bin/env python3
"""Download all NL orthophoto COVERAGE polygons, not copyright-restricted photographs.

Source: Government of Newfoundland and Labrador official orthorectified index,
licensed under the NL Open Government Licence. Each polygon shows an imagery
tile's approximate coverage and acquisition date/resolution, NOT raw imagery.
"""
import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

SERVICE="https://services8.arcgis.com/aCyQID5qQcyrJMm2/arcgis/rest/services/Orthorectified_Index/FeatureServer"
ZONES={"3":3, "2":4, "1":5}

def query(s,layer,params):
    r=s.get(f"{SERVICE}/{layer}/query",params={"f":"json",**params},timeout=(15,75))
    r.raise_for_status()
    payload=r.json()
    if payload.get("error"): raise RuntimeError(str(payload["error"]))
    return payload

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--output",type=Path,required=True)
    args=ap.parse_args()
    args.output.parent.mkdir(parents=True,exist_ok=True)
    s=requests.Session()
    s.headers["User-Agent"]="NL-Map-Data-Research/1.0 (+https://github.com/BuyingZebra/nl_offline)"
    s.mount("https://",HTTPAdapter(max_retries=Retry(total=3,backoff_factor=1,status_forcelist=[429,500,502,503,504])))
    features=[]
    reports={}
    for zone,layer in ZONES.items():
        total=query(s,layer,{"where":"1=1","returnCountOnly":"true"}).get("count")
        ids=query(s,layer,{"where":"1=1","returnIdsOnly":"true"}).get("objectIds") or []
        if not ids: raise RuntimeError(f"No orthophoto index features in zone {zone}")
        count=0
        ids=sorted(map(int,ids))
        for i in range(0,len(ids),250):
            block=query(s,layer,{"objectIds":",".join(map(str,ids[i:i+250])),
                                 "returnGeometry":"true","outSR":4326,"outFields":"*"})
            for f in block.get("features",[]):
                raw=f.get("geometry") or {}
                rings=raw.get("rings") or []
                if not rings: continue
                polygons=[]
                for ring in rings:
                    if not ring or len(ring)<4: continue
                    if not all(-70<float(pt[0])<-50 and 45<float(pt[1])<61 for pt in ring):
                        continue
                    polygons.append(ring)
                if not polygons: continue
                # Index consists of independent rectangular footprints; retain
                # each ArcGIS ring independently when supplied multiple rings.
                geometry={"type":"Polygon","coordinates":[polygons[0]]} if len(polygons)==1 else {
                    "type":"MultiPolygon","coordinates":[[r] for r in polygons]}
                a=f.get("attributes") or {}
                year=a.get("Recent_Year")
                if year is None:
                    year=a.get("YEAR",a.get("Year"))
                properties={
                    "source":"NL Government GIS and Mapping Division",
                    "zone":int(zone),
                    "object_id":a.get("OBJECTID"),
                    "tile":str(a.get("Tile") or a.get("NAME") or ""),
                    "year":str(year or ""),
                    "resolution_m":a.get("Recent_Resolution") or a.get("Resolution"),
                    "coverage":str(a.get("Coverage") or ""),
                    "errors":str(a.get("Errors") or ""),
                    "index_layer_url":f"{SERVICE}/{layer}",
                }
                features.append({"type":"Feature","geometry":geometry,"properties":properties})
                count+=1
        reports[zone]={"expected":total,"indexed":count}
        print(f"Zone {zone}: {count:,}/{total} tiles indexed",flush=True)
        if total and count < total*.95:
            raise RuntimeError(f"Unexpected missing imagery footprints in zone {zone}: {count} of {total}")
    if len(features)<1400: raise RuntimeError(f"Unexpectedly few orthophoto tiles: {len(features)}")
    with args.output.open("w",encoding="utf-8") as out:
        json.dump({"type":"FeatureCollection","features":features},out,ensure_ascii=False,separators=(",",":"))
    report={"generated_utc":datetime.now(timezone.utc).isoformat(),
            "source":SERVICE,"image_tiles_indexed":len(features),"zones":reports,
            "meaning":"INDEX ONLY: these are footprints of available orthophoto tiles, not the aerial photographs themselves.",
            "data_license":"Open Government Licence - Newfoundland and Labrador (see service description)",
            "do_not_assume":"Tile coverage doesn't imply images are freely downloadable, recent, or suitable for feature extraction."}
    (args.output.parent/"orthophoto_coverage_manifest.json").write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps(report,indent=2),flush=True)
if __name__=="__main__":main()
