#!/usr/bin/env python3
"""Replace packaged road shapes with full Statistics Canada NRN geometry.

The existing graph topology, edge identifiers, community anchors, ferries and
distance matrices remain stable.  That is important because the address index
and regression corpus refer to those stable edge identifiers.  Only the road
LineStrings are upgraded from the authoritative GeoPackage.

Usage:
  python3 tools/build-nrn-road-geometry.py NRN_NL_7_0_GPKG_en.gpkg data.js
"""

from __future__ import annotations

import collections
import json
import math
import pathlib
import sqlite3
import struct
import subprocess
import sys


EARTH_KM = 6371.0088


def distance_km(a, b):
    lon1, lat1 = map(math.radians, a)
    lon2, lat2 = map(math.radians, b)
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_KM * math.asin(min(1, math.sqrt(h)))


def polyline_km(points):
    return sum(distance_km(points[i - 1], points[i]) for i in range(1, len(points)))


def gpkg_linestring(blob):
    if blob[:2] != b"GP":
        raise ValueError("Invalid GeoPackage geometry header")
    flags = blob[3]
    envelope_code = (flags >> 1) & 7
    envelope_doubles = {0: 0, 1: 4, 2: 6, 3: 6, 4: 8}.get(envelope_code)
    if envelope_doubles is None:
        raise ValueError(f"Unsupported GeoPackage envelope {envelope_code}")
    raw = memoryview(blob)[8 + envelope_doubles * 8 :]
    endian = "<" if raw[0] else ">"
    geometry_type = struct.unpack_from(endian + "I", raw, 1)[0]
    base_type = geometry_type & 0xFF
    dimension_code = geometry_type // 1000
    dimensions = 2 + (dimension_code in (1, 3)) + (dimension_code in (2, 3))
    if base_type != 2:
        raise ValueError(f"Expected LineString, received WKB type {geometry_type}")
    count = struct.unpack_from(endian + "I", raw, 5)[0]
    offset, points = 9, []
    for _ in range(count):
        values = struct.unpack_from(endian + "d" * dimensions, raw, offset)
        offset += dimensions * 8
        points.append((values[0], values[1]))
    return points


def load_runtime_data(path):
    script = "global.window={};require(process.argv[1]);process.stdout.write(JSON.stringify(window.NL_DATA))"
    return json.loads(subprocess.check_output(["node", "-e", script, str(path.resolve())]))


def endpoint_key(a, b, digits=5):
    qa = (round(a[0], digits), round(a[1], digits))
    qb = (round(b[0], digits), round(b[1], digits))
    return tuple(sorted((qa, qb)))


def bucket(point):
    return (round(point[0], 3), round(point[1], 3))


def nearby_buckets(point):
    x, y = bucket(point)
    for dx in (-0.001, 0, 0.001):
        for dy in (-0.001, 0, 0.001):
            yield (round(x + dx, 3), round(y + dy, 3))


def quantize(points, start, end):
    output = []
    for point in points:
        q = [round(point[0], 6), round(point[1], 6)]
        if not output or q != output[-1]:
            output.append(q)
    if len(output) < 2:
        output = [[round(start[0], 6), round(start[1], 6)], [round(end[0], 6), round(end[1], 6)]]
    output[0] = [round(start[0], 7), round(start[1], 7)]
    output[-1] = [round(end[0], 7), round(end[1], 7)]
    return output


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    source_path, output_path = map(pathlib.Path, sys.argv[1:])
    data = load_runtime_data(output_path)
    build_info_path = output_path.parent / "build-info.json"
    build_info = json.loads(build_info_path.read_text()) if build_info_path.exists() else {}
    baseline_geometry_points = build_info.get("data", {}).get(
        "previousRoadGeometryPoints", data.get("geometryQuality", {}).get("oldGeometryPoints")
    )
    connection = sqlite3.connect(source_path)
    rows = connection.execute(
        "SELECT primaryindex, geom, ROADCLASS, RTNUMBER1 FROM NRN_NL_7_0_ROADSEG"
    )

    source = []
    exact = collections.defaultdict(list)
    starts = collections.defaultdict(list)
    for source_id, geometry, road_class, route_number in rows:
        points = gpkg_linestring(geometry)
        record = {
            "id": source_id,
            "points": points,
            "length": polyline_km(points),
            "roadClass": road_class or "",
            "routeNumber": route_number or "",
        }
        index = len(source)
        source.append(record)
        exact[endpoint_key(points[0], points[-1])].append(index)
        starts[bucket(points[0])].append(index)
        starts[bucket(points[-1])].append(index)

    quality = collections.Counter()
    old_points = new_points = 0
    endpoint_errors = []
    used_source_ids = set()
    road_edges = 0

    for edge in data["edges"]:
        edge_type = edge[4] if len(edge) > 4 else "road"
        if edge_type != "road":
            continue
        road_edges += 1
        start, end = data["nodes"][edge[0]], data["nodes"][edge[1]]
        old_points += len(edge[3])
        candidates = list(exact.get(endpoint_key(start, end), ()))
        match_kind = "exact"
        if not candidates:
            match_kind = "near"
            possible = set()
            for cell in nearby_buckets(start):
                possible.update(starts.get(cell, ()))
            for index in possible:
                points = source[index]["points"]
                direct = max(distance_km(start, points[0]), distance_km(end, points[-1]))
                reverse = max(distance_km(start, points[-1]), distance_km(end, points[0]))
                if min(direct, reverse) <= 0.12:
                    candidates.append(index)
        if not candidates:
            quality["retainedFallback"] += 1
            new_points += len(edge[3])
            continue

        def score(index):
            record = source[index]
            points = record["points"]
            endpoint = min(
                distance_km(start, points[0]) + distance_km(end, points[-1]),
                distance_km(start, points[-1]) + distance_km(end, points[0]),
            )
            length_delta = abs(record["length"] - edge[2]) / max(0.05, edge[2])
            reuse = 0.15 if record["id"] in used_source_ids else 0
            return endpoint * 10 + min(length_delta, 4) + reuse

        selected = min(candidates, key=score)
        record = source[selected]
        points = record["points"]
        direct_error = distance_km(start, points[0]) + distance_km(end, points[-1])
        reverse_error = distance_km(start, points[-1]) + distance_km(end, points[0])
        if reverse_error < direct_error:
            points = list(reversed(points))
            endpoint_error = reverse_error
        else:
            endpoint_error = direct_error
        edge[3] = quantize(points, start, end)
        new_points += len(edge[3])
        endpoint_errors.append(endpoint_error)
        used_source_ids.add(record["id"])
        quality[match_kind] += 1
        if len(candidates) > 1:
            quality["resolvedAmbiguous"] += 1

    endpoint_errors.sort()
    data["version"] = "0.8"
    data["source"] = "NL-RDDb + Statistics Canada NRN NL 7.0 full road geometry"
    data["geometryQuality"] = {
        "source": "Statistics Canada National Road Network, NL 7.0",
        "roadEdges": road_edges,
        "matchedExact": quality["exact"],
        "matchedNear": quality["near"],
        "retainedFallback": quality["retainedFallback"],
        "resolvedAmbiguous": quality["resolvedAmbiguous"],
        "uniqueSourceFeatures": len(used_source_ids),
        "duplicateSourceAssignments": road_edges - len(used_source_ids),
        "oldGeometryPoints": baseline_geometry_points or old_points,
        "newGeometryPoints": new_points,
        "medianEndpointErrorM": round(endpoint_errors[len(endpoint_errors) // 2] * 1000, 2),
        "p95EndpointErrorM": round(endpoint_errors[int(len(endpoint_errors) * 0.95)] * 1000, 2),
        "maxEndpointErrorM": round(endpoint_errors[-1] * 1000, 2),
    }
    payload = "window.NL_DATA=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    output_path.write_text(payload, encoding="utf-8")
    print(json.dumps(data["geometryQuality"], indent=2))


if __name__ == "__main__":
    main()
