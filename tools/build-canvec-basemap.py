#!/usr/bin/env python3
"""Build the compact offline NL land/water vector layer from CanVec shapes.

Usage:
  python3 tools/build-canvec-basemap.py \
    geo_political_region_2.shp geo_political_region_2.dbf \
    waterbody_2.shp basemap.js
"""

from __future__ import annotations

import json
import math
import pathlib
import struct
import sys


NL_BOUNDS = (-67.2, 46.55, -52.55, 56.65)


def read_dbf(path):
    with open(path, "rb") as handle:
        header = handle.read(32)
        count = struct.unpack("<I", header[4:8])[0]
        header_length, record_length = struct.unpack("<HH", header[8:12])
        fields = []
        while True:
            descriptor = handle.read(32)
            if descriptor[0] == 13:
                break
            fields.append(
                (
                    descriptor[:11].split(b"\0")[0].decode("ascii"),
                    chr(descriptor[11]),
                    descriptor[16],
                )
            )
        handle.seek(header_length)
        for _ in range(count):
            record = handle.read(record_length)
            if not record or record[0] == 42:
                yield None
                continue
            offset, values = 1, {}
            for name, _, length in fields:
                values[name] = record[offset : offset + length].decode("latin1").strip()
                offset += length
            yield values


def read_shapes(path):
    with open(path, "rb") as handle:
        handle.seek(100)
        while True:
            record_header = handle.read(8)
            if not record_header:
                return
            _, word_length = struct.unpack(">2I", record_header)
            content = handle.read(word_length * 2)
            shape_type = struct.unpack_from("<I", content, 0)[0]
            if shape_type == 0:
                yield None
                continue
            if shape_type not in (3, 5):
                raise ValueError(f"Unsupported shapefile shape type {shape_type}")
            bbox = struct.unpack_from("<4d", content, 4)
            part_count, point_count = struct.unpack_from("<2I", content, 36)
            part_offset = 44
            starts = list(struct.unpack_from("<" + "I" * part_count, content, part_offset))
            point_offset = part_offset + part_count * 4
            points = [
                struct.unpack_from("<2d", content, point_offset + index * 16)
                for index in range(point_count)
            ]
            starts.append(point_count)
            yield {
                "bbox": bbox,
                "parts": [points[starts[i] : starts[i + 1]] for i in range(part_count)],
            }


def intersects(a, b=NL_BOUNDS):
    return not (a[2] < b[0] or a[0] > b[2] or a[3] < b[1] or a[1] > b[3])


def perpendicular_distance(point, start, end, cos_lat):
    px, py = point[0] * cos_lat, point[1]
    ax, ay = start[0] * cos_lat, start[1]
    bx, by = end[0] * cos_lat, end[1]
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def simplify_open(points, tolerance):
    if len(points) <= 2:
        return points
    cos_lat = max(0.3, math.cos(math.radians(sum(p[1] for p in points) / len(points))))
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        furthest, distance = -1, 0
        for index in range(start + 1, end):
            candidate = perpendicular_distance(points[index], points[start], points[end], cos_lat)
            if candidate > distance:
                furthest, distance = index, candidate
        if distance > tolerance:
            keep[furthest] = True
            stack.append((start, furthest))
            stack.append((furthest, end))
    return [point for index, point in enumerate(points) if keep[index]]


def simplify_ring(points, tolerance):
    if len(points) < 4:
        return []
    raw = list(points[:-1] if points[0] == points[-1] else points)
    if len(raw) < 3:
        return []
    # Rotate away from the arbitrary shapefile seam before Douglas-Peucker.
    pivot = min(range(len(raw)), key=lambda i: (raw[i][0], raw[i][1]))
    rotated = raw[pivot:] + raw[:pivot] + [raw[pivot]]
    simplified = simplify_open(rotated, tolerance)
    if len(simplified) < 4:
        return []
    return [[round(p[0], 5), round(p[1], 5)] for p in simplified]


def compact_feature(shape, tolerance):
    rings = [simplify_ring(part, tolerance) for part in shape["parts"]]
    rings = [ring for ring in rings if len(ring) >= 4]
    if not rings:
        return None
    bbox = [round(value, 5) for value in shape["bbox"]]
    return [bbox, rings]


def main():
    if len(sys.argv) != 5:
        raise SystemExit(__doc__)
    land_path, land_dbf_path, water_path, output_path = map(pathlib.Path, sys.argv[1:])

    land = []
    land_source_points = land_output_points = 0
    for shape, attributes in zip(read_shapes(land_path), read_dbf(land_dbf_path)):
        if not shape or not attributes or attributes.get("juri_en") != "Newfoundland and Labrador":
            continue
        if not intersects(shape["bbox"]):
            continue
        span_x = shape["bbox"][2] - shape["bbox"][0]
        span_y = shape["bbox"][3] - shape["bbox"][1]
        if max(span_x, span_y) < 0.0025:
            continue
        land_source_points += sum(len(part) for part in shape["parts"])
        feature = compact_feature(shape, 0.00065)
        if feature:
            land.append(feature)
            land_output_points += sum(len(ring) for ring in feature[1])

    water_candidates = []
    water_source_points = 0
    for shape in read_shapes(water_path):
        if not shape or not intersects(shape["bbox"]):
            continue
        minx, miny, maxx, maxy = shape["bbox"]
        width = (maxx - minx) * max(0.3, math.cos(math.radians((miny + maxy) / 2)))
        height = maxy - miny
        importance = width * height
        if importance < 0.000012 or max(width, height) > 8:
            continue
        water_source_points += sum(len(part) for part in shape["parts"])
        water_candidates.append((importance, shape))
    water_candidates.sort(key=lambda item: item[0], reverse=True)

    water = []
    water_output_points = 0
    for importance, shape in water_candidates[:1200]:
        feature = compact_feature(shape, 0.0014)
        if feature:
            feature.append(round(importance, 7))
            water.append(feature)
            water_output_points += sum(len(ring) for ring in feature[1])

    result = {
        "version": "1.0",
        "source": "Natural Resources Canada CanVec 1M administrative and 250K hydrographic vectors",
        "bounds": list(NL_BOUNDS),
        "land": land,
        "water": water,
        "quality": {
            "landFeatures": len(land),
            "waterFeatures": len(water),
            "landSourcePoints": land_source_points,
            "landVectorPoints": land_output_points,
            "waterSourcePoints": water_source_points,
            "waterVectorPoints": water_output_points,
        },
    }
    payload = "window.NL_BASEMAP=" + json.dumps(result, ensure_ascii=False, separators=(",", ":")) + ";\n"
    output_path.write_text(payload, encoding="utf-8")
    print(json.dumps(result["quality"], indent=2))
    print(f"Wrote {output_path} ({len(payload):,} bytes)")


if __name__ == "__main__":
    main()
