#!/usr/bin/env python3
"""Build a compact, file-openable vector map preview from actual Planetiler MBTiles."""
import argparse
import base64
import csv
import json
import math
import sqlite3
from collections import defaultdict
from pathlib import Path

SAMPLES = {
    "Carbonear": (-53.235, 47.735, 0.050, 0.035),
    "Twillingate": (-54.766, 49.663, 0.050, 0.039),
    "Baie Verte": (-56.190, 49.929, 0.050, 0.035),
    "St. John's": (-52.709, 47.565, 0.050, 0.035),
}
MAX_BASE_BYTES = 12_000_000
MAX_TOTAL_BYTES = 30_000_000
MAX_SAMPLE_BYTES = 4_500_000


def tile_xy(lon, lat, zoom):
    n = 2 ** zoom
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return max(0, min(n-1, x)), max(0, min(n-1, y))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tiles", type=Path, required=True)
    ap.add_argument("--communities", type=Path, required=True)
    ap.add_argument("--towns", type=Path, help="Merged official and OSM map-label town centers")
    ap.add_argument("--output", type=Path, required=True)
    args = ap.parse_args()
    db = sqlite3.connect(f"file:{args.tiles}?mode=ro", uri=True)
    db.execute("PRAGMA query_only=ON")
    meta = dict(db.execute("SELECT name, value FROM metadata"))
    totals = list(db.execute("SELECT zoom_level, COUNT(*), SUM(LENGTH(tile_data)) FROM tiles GROUP BY zoom_level ORDER BY zoom_level"))
    if not totals:
        raise RuntimeError("No vector tiles in archive")
    total_bytes = 0
    base_zoom = -1
    for zoom, count, byte_count in totals:
        if zoom > 11 or (total_bytes + byte_count > MAX_BASE_BYTES and base_zoom >= 7):
            break
        total_bytes += byte_count
        base_zoom = zoom
    if base_zoom < 6:
        raise RuntimeError(f"Could not fit island overview zooms (base={base_zoom})")
    print(f"Province-wide overview through zoom {base_zoom}, {total_bytes / 1e6:.1f} MB")
    tiles = {}
    def add_tile(z, x, y, data):
        tiles[f"{z}/{x}/{y}"] = base64.b64encode(data).decode("ascii")
    for z, x, tms_y, blob in db.execute("SELECT zoom_level,tile_column,tile_row,tile_data FROM tiles WHERE zoom_level <= ?", (base_zoom,)):
        add_tile(z, x, 2 ** z - 1 - tms_y, blob)
    used_sample = defaultdict(int)
    added_sample = defaultdict(int)
    for z in range(base_zoom + 1, min(16, max(row[0] for row in totals) + 1)):
        if total_bytes >= MAX_TOTAL_BYTES:
            break
        for name, (lon, lat, dx, dy) in SAMPLES.items():
            if used_sample[name] >= MAX_SAMPLE_BYTES:
                continue
            xmin, ymin = tile_xy(lon-dx, lat+dy, z)
            xmax, ymax = tile_xy(lon+dx, lat-dy, z)
            for x in range(xmin, xmax+1):
                if total_bytes >= MAX_TOTAL_BYTES or used_sample[name] >= MAX_SAMPLE_BYTES:
                    break
                for y in range(ymin, ymax+1):
                    if total_bytes >= MAX_TOTAL_BYTES or used_sample[name] >= MAX_SAMPLE_BYTES:
                        break
                    row = db.execute("SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?",
                                     (z,x,2**z-1-y)).fetchone()
                    if not row:
                        continue
                    blob = row[0]
                    if used_sample[name] + len(blob) > MAX_SAMPLE_BYTES or total_bytes + len(blob) > MAX_TOTAL_BYTES:
                        continue
                    add_tile(z,x,y,blob)
                    used_sample[name] += len(blob)
                    total_bytes += len(blob)
                    added_sample[name] += 1
    db.close()
    features = []
    with args.communities.open(encoding="utf-8-sig", newline="") as src:
        for row in csv.DictReader(src):
            if row.get("category") != "Populated Place":
                continue
            try:
                lon, lat = float(row["lon"]), float(row["lat"])
            except (KeyError, ValueError):
                continue
            features.append({"type":"Feature", "geometry":{"type":"Point","coordinates":[lon,lat]},
                             "properties":{"name":row["name"],"kind":row.get("feature_type",""),
                                           "source_id":row.get("source_id","")}})
    if args.towns:
        features = json.loads(args.towns.read_text(encoding="utf-8"))["features"]
        if len(features) < 500:
            raise RuntimeError("Merged OSM/official town catalog incomplete")
    metadata = {
        "baseZoom":base_zoom,
        "detailedSamples":{k:{"tileCount":added_sample[k],"center":[v[0],v[1]]} for k,v in SAMPLES.items()},
        "tileCount":len(tiles),
        "tileBytes":total_bytes,
        "inputMBTiles":str(args.tiles.name),
        "sourceLayerNames":[p.get("id") for p in json.loads(meta.get("json","{}")).get("vector_layers",[])],
        "communities":len(features),
        "townCenterSource":"OSM map-label nodes matched to official names" if args.towns else "Natural Resources Canada"
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as out:
        out.write("/* Generated from the project's own NL MBTiles. OSM contributors, ODbL 1.0. */\n")
        out.write("window.NL_PREVIEW_META = " + json.dumps(metadata, separators=(",",":")) + ";\n")
        out.write("window.NL_PREVIEW_PLACES = " + json.dumps({"type":"FeatureCollection","features":features},separators=(",",":")) + ";\n")
        out.write("window.NL_PREVIEW_TILES = {\n")
        for i, (key, data) in enumerate(tiles.items()):
            out.write(f'{json.dumps(key)}:{json.dumps(data)}' + (",\n" if i + 1 < len(tiles) else "\n"))
        out.write("};\n")
    (args.output.parent / "map-preview-metadata.json").write_text(json.dumps(metadata,indent=2)+"\n")
    print(json.dumps(metadata, indent=2))
    if not tiles or not features:
        raise RuntimeError("Missing either map tiles or named settlements")


if __name__ == "__main__":
    main()
