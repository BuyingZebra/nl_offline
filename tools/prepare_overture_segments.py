#!/usr/bin/env python3
"""Prepare Overture Newfoundland transportation for an independent vector map.

Input: official Overture segment GeoParquet (all original rows preserved in
the source artifact). Output: GeoJSONSeq for Tippecanoe with Overture IDs,
names, classifications, pedestrian tags and original data-source provenance.

Visual features are not routing edges. Full connector references remain in the
original GeoParquet; explicit intersection and access topology must be built
from segments + connectors before navigation. No merging or de-duplication.
"""
import argparse
import json
import re
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import pyarrow.parquet as pq
from shapely import from_wkb
from shapely.geometry import mapping, box

DIBERVILLE = box(-53.239, 47.722, -53.229, 47.729)
PEDESTRIAN_CLASSES = {"footway","path","pedestrian","cycleway","steps","bridleway"}
TRACK_CLASSES = {"track"}

def normalized(value):
    return re.sub(r"[^a-z0-9]","",unicodedata.normalize(
        "NFKD",str(value or "")).encode("ascii","ignore").decode().lower())

def label_and_origins(record):
    names=record.get("names") or {}
    name=names.get("primary") if isinstance(names,dict) else ""
    data_sources=record.get("sources") or []
    names=[]
    for item in data_sources:
        if not isinstance(item,dict):continue
        name_of_source=item.get("dataset") or item.get("provider")
        if name_of_source and str(name_of_source) not in names:
            names.append(str(name_of_source))
    return name or "",names

def classify(subtype,road_class):
    if subtype!="road":return None
    if road_class in PEDESTRIAN_CLASSES:return "pedestrian"
    if road_class in TRACK_CLASSES:return "track"
    return "motor_candidate"

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--segments",type=Path,required=True)
    ap.add_argument("--output",type=Path,required=True)
    ap.add_argument("--report",type=Path,required=True)
    ap.add_argument("--carbonear",type=Path,required=True)
    args=ap.parse_args()
    for path in (args.output,args.report,args.carbonear):
        path.parent.mkdir(parents=True,exist_ok=True)
    table=pq.ParquetFile(args.segments)
    wanted=["id","geometry","subtype","class","subclass","names","sources"]
    cols=[x for x in wanted if x in table.schema_arrow.names]
    if not {"id","geometry","subtype","class"}.issubset(cols):
        raise ValueError("Overture changed the transportation segment schema")
    stats=Counter()
    origins=Counter()
    nearby=[]
    d_named=[]
    with args.output.open("w",encoding="utf-8") as out:
        for batch in table.iter_batches(batch_size=6000,columns=cols):
            for record in batch.to_pylist():
                road_class=str(record.get("class") or "unknown")
                kind=classify(record.get("subtype"),road_class)
                if kind is None:continue
                try:
                    geom=from_wkb(record["geometry"])
                except Exception:
                    continue
                if geom is None or geom.is_empty or geom.geom_type!="LineString":
                    continue
                label,sources=label_and_origins(record)
                properties={
                    "id":str(record.get("id") or ""),
                    "name":str(label),
                    "class":road_class,
                    "subclass":str(record.get("subclass") or ""),
                    "kind":kind,
                    "origin":",".join(sources) or "unreported",
                }
                feature={"type":"Feature","properties":properties,"geometry":mapping(geom)}
                out.write(json.dumps(feature,separators=(",",":"),ensure_ascii=False)+"\n")
                stats[kind]+=1
                origins[properties["origin"]]+=1
                if geom.intersects(DIBERVILLE):
                    nearby.append(feature)
                    if "diberville" in normalized(label):
                        d_named.append(properties)
    total=sum(stats.values())
    if total<20000:
        raise RuntimeError(f"Only {total} Overture island transportation features found; download may be incomplete")
    report={
        "generated_utc":datetime.now(timezone.utc).isoformat(),
        "source":"Overture Maps transportation/segment",
        "source_file":args.segments.name,
        "bounding_box_note":"This is a Newfoundland island-covering bbox; there may be bordering mainland/coastal features.",
        "feature_count":total,
        "kinds":dict(stats),
        "source_combinations":dict(origins.most_common()),
        "diberville_named_features":d_named,
        "diberville_nearby_segment_count":len(nearby),
        "important":"Unlike the geometry preview, the original Overture segments and connectors are needed for a navigable topology. Footways are NOT motor roads. No geometries are automatically merged or discarded.",
        "license":"Overture transportation ODbL 1.0, includes OpenStreetMap contributors",
    }
    args.report.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    args.carbonear.write_text(json.dumps({"type":"FeatureCollection","features":nearby},
        ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
    print(json.dumps(report,indent=2,ensure_ascii=False),flush=True)

if __name__=="__main__":main()
