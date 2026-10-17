#!/usr/bin/env python3
"""Download and validate NL provincial Resource Access Roads from their public ArcGIS layer.

All features are streamed in object-ID batches, preserving original attributes.
This does not assert a road is safe, public, open or routable.
"""
import argparse
import json
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

SOURCES = {
    "ffa-island": "https://services8.arcgis.com/aCyQID5qQcyrJMm2/ArcGIS/rest/services/FFA_ResourceRoads_NF/FeatureServer/2",
    "ffa-labrador": "https://services8.arcgis.com/aCyQID5qQcyrJMm2/ArcGIS/rest/services/FFA_ResourceRoads_LB/FeatureServer/0",
    "geoatlas-legacy": "https://dnrmaps.gov.nl.ca/arcgis/rest/services/GeoAtlas/Map_Layers/MapServer/14",
}


def get(session, url, params, attempts=4):
    for i in range(attempts):
        try:
            r=session.get(url, params=params, timeout=(20,100))
            r.raise_for_status()
            data=r.json()
            if "error" in data:
                raise RuntimeError(str(data["error"]))
            return data
        except (requests.RequestException, ValueError, RuntimeError):
            if i==attempts-1:
                raise
            time.sleep(2**i)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source", choices=tuple(SOURCES), default="ffa-island")
    parser.add_argument("--batch", type=int, default=200)
    args=parser.parse_args()
    if not 1<=args.batch<=500:
        raise ValueError("Batch size must be 1–500")
    args.output.mkdir(parents=True,exist_ok=True)
    s=requests.Session()
    s.headers["User-Agent"]="NL-Map-Data-Research/1.0 (+https://github.com/BuyingZebra/nl_offline)"
    s.mount("https://",HTTPAdapter(max_retries=Retry(total=2,backoff_factor=1,status_forcelist=[429,500,502,503,504])))

    layer = SOURCES[args.source]
    meta=get(s,layer,{"f":"json"})
    if meta.get("geometryType")!="esriGeometryPolyline":
        raise RuntimeError("Unexpected non-line road layer")
    count=get(s,layer+"/query",{"f":"json","where":"1=1","returnCountOnly":"true"}).get("count")
    identifiers=get(s,layer+"/query",{"f":"json","where":"1=1","returnIdsOnly":"true"})
    ids=sorted(identifiers.get("objectIds") or [])
    if not ids:
        raise RuntimeError("No road object IDs returned")
    counts=Counter()
    seen=set()
    outpath=args.output/"nl_resource_access_roads.geojson"
    features=0
    with outpath.open("w",encoding="utf-8") as fh:
        fh.write('{"type":"FeatureCollection","features":[\n')
        for start in range(0,len(ids),args.batch):
            batch=ids[start:start+args.batch]
            data=get(s,layer+"/query",{
                "f":"geojson","objectIds":",".join(map(str,batch)),
                "outFields":"*","outSR":4326,"returnGeometry":"true"
            })
            for feature in data.get("features",[]):
                geometry=feature.get("geometry") or {}
                if geometry.get("type") not in ("LineString","MultiLineString"):
                    continue
                p=feature.get("properties") or {}
                feature_id=p.get(meta.get("objectIdField","OBJECTID"),feature.get("id"))
                if feature_id is not None:
                    if feature_id in seen:
                        continue
                    seen.add(feature_id)
                coords=geometry.get("coordinates")
                if not coords:
                    continue
                counts[str(p.get("ROAD_ACCESS") or "Unknown")]+=1
                fh.write((",\n" if features else "")+json.dumps(feature,separators=(",",":"),ensure_ascii=False))
                features+=1
            if (start//args.batch)%10==0:
                print(f"Processed {min(start+args.batch,len(ids)):,}/{len(ids):,} road records",flush=True)
        fh.write('\n]}\n')
    if features<100:
        raise RuntimeError(f"Insufficient road geometry: {features}")
    report={
        "source":layer,
        "source_key":args.source,
        "download_utc":datetime.now(timezone.utc).isoformat(),
        "layer_name":meta.get("name"),
        "expected_count":count,
        "queried_ids":len(ids),
        "features_written":features,
        "access_classes":dict(counts),
        "attributes_preserved":sorted(f["name"] for f in meta.get("fields",[])),
        "coordinate_system":"EPSG:4326",
        "important_warning":"These forestry resource-road attributes are not a guarantee that roads are currently open or safe. Preserve the access codes and verify availability before any routing.",
        "attribution":"Newfoundland and Labrador Department of Fisheries, Forestry and Agriculture / FFA GeoHub" if args.source.startswith("ffa-") else "Newfoundland and Labrador GeoAtlas (historical copy)"
    }
    (args.output/"provincial_roads_report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,indent=2))
    if count is not None and features < int(count)*.95:
        raise RuntimeError(f"Incomplete export: got {features} of {count}; preserve and inspect archive before reuse.")


if __name__=="__main__":
    main()
