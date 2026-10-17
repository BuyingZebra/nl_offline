#!/usr/bin/env python3
"""Generate preview from real Overture MBTiles. Offline artifact remains complete.

This GitHub Pages preview stores complete overview through one zoom, and
limited high-detail validation samples to keep repository data manageable.
For full island detail use the downloadable MBTiles, not this sample preview.
"""
import argparse
import base64
import json
import math
import sqlite3
from collections import defaultdict
from pathlib import Path

SAMPLES={
    "Carbonear":(-53.235,47.735,.06,.04),
    "Twillingate":(-54.766,49.663,.06,.04),
    "Baie Verte":(-56.190,49.929,.06,.04),
    "St. John's":(-52.709,47.565,.06,.04),
}
MAX_BASE_BYTES=11_000_000
MAX_TOTAL_BYTES=27_000_000
SAMPLE_BYTES=4_000_000

def tile_xy(lon,lat,z):
    n=2**z
    x=int((lon+180)/360*n)
    y=int((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n)
    return max(0,min(n-1,x)),max(0,min(n-1,y))

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--tiles",type=Path,required=True)
    p.add_argument("--output",type=Path,required=True)
    p.add_argument("--report",type=Path,required=True)
    a=p.parse_args()
    db=sqlite3.connect(f"file:{a.tiles}?mode=ro",uri=True)
    db.execute("PRAGMA query_only=ON")
    totals=db.execute("SELECT zoom_level,COUNT(*),SUM(LENGTH(tile_data)) FROM tiles GROUP BY zoom_level ORDER BY zoom_level").fetchall()
    if not totals:raise ValueError("No Overture vector tiles found")
    maxzoom=max(x[0] for x in totals)
    size=0; base=-1
    for z,n,byte_count in totals:
        if z>11 or (size+byte_count>MAX_BASE_BYTES and base>=7):
            break
        size+=byte_count;base=z
    if base<6:raise ValueError("Not enough budget for island wide overview")
    tiles={}
    def add(z,x,y,data):
        tiles[f"{z}/{x}/{y}"]=base64.b64encode(data).decode("ascii")
    for z,x,y,data in db.execute("SELECT zoom_level,tile_column,tile_row,tile_data FROM tiles WHERE zoom_level <= ?",(base,)):
        add(z,x,2**z-1-y,data)
    per=defaultdict(int); per_count=defaultdict(int)
    for z in range(base+1,min(maxzoom+1,16)):
        for city,(lon,lat,dx,dy) in SAMPLES.items():
            if size>=MAX_TOTAL_BYTES or per[city]>=SAMPLE_BYTES:continue
            xmin,ymin=tile_xy(lon-dx,lat+dy,z)
            xmax,ymax=tile_xy(lon+dx,lat-dy,z)
            for x in range(xmin,xmax+1):
                if size>=MAX_TOTAL_BYTES or per[city]>=SAMPLE_BYTES:break
                for y in range(ymin,ymax+1):
                    if size>=MAX_TOTAL_BYTES or per[city]>=SAMPLE_BYTES:break
                    row=db.execute("SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?",(z,x,2**z-1-y)).fetchone()
                    if not row:continue
                    blob=row[0]
                    if per[city]+len(blob)>SAMPLE_BYTES or size+len(blob)>MAX_TOTAL_BYTES:continue
                    add(z,x,y,blob);per[city]+=len(blob);size+=len(blob);per_count[city]+=1
    metadata=dict(db.execute("SELECT name,value FROM metadata"))
    db.close()
    source_layers=[v.get("id") for v in json.loads(metadata.get("json","{}")).get("vector_layers",[])]
    if "overture_transportation" not in source_layers:
        raise ValueError(f"Expected overture_transportation layer, got: {source_layers}")
    stats={
        "baseZoom":base,"tileCount":len(tiles),
        "tileBytes":size,"detailedSamples":{k:{"center":[v[0],v[1]],"tileCount":per_count[k]} for k,v in SAMPLES.items()},
        "sourceLayerNames":source_layers,
        "scope":"Overture island-covering bbox; visual preview only",
    }
    a.output.parent.mkdir(parents=True,exist_ok=True)
    with a.output.open("w",encoding="utf-8") as stream:
        stream.write("/* © Overture Maps Foundation and © OpenStreetMap contributors, ODbL 1.0 */\n")
        stream.write("window.OVERTURE_PREVIEW_META="+json.dumps(stats,separators=(",",":"))+";\n")
        stream.write("window.OVERTURE_PREVIEW_TILES={\n")
        for i,(key,content) in enumerate(tiles.items()):
            stream.write(json.dumps(key)+":"+json.dumps(content)+("," if i<len(tiles)-1 else "")+"\n")
        stream.write("};\n")
    a.report.write_text(json.dumps(stats,indent=2)+"\n")
    print(json.dumps(stats,indent=2),flush=True)
    if len(tiles)<80:raise RuntimeError("Overture preview appears incomplete")

if __name__=="__main__":main()
