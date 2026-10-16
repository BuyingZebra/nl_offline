#!/usr/bin/env bash
# Generate a Newfoundland and Labrador vector-tile archive from an OSM extract.
# Requires Docker, curl, free disk (~several GB), and a network connection.
# The result is MAP DATA ONLY (not routing or address search).
set -euo pipefail

DATA_DIR="${1:-$(pwd)/data}"
mkdir -p "$DATA_DIR"
DATA_DIR="$(cd "$DATA_DIR" && pwd)"
PBF="$DATA_DIR/newfoundland-and-labrador-latest.osm.pbf"
OUTPUT="$DATA_DIR/newfoundland-labrador.pmtiles"

if [ ! -s "$PBF" ]; then
  echo "Downloading official Geofabrik Newfoundland and Labrador OSM extract..."
  curl --fail --location --retry 3 \
    --output "$PBF.part" \
    https://download.geofabrik.de/north-america/canada/newfoundland-and-labrador-latest.osm.pbf
  mv "$PBF.part" "$PBF"
fi
command -v docker >/dev/null || { echo "Docker is required."; exit 1; }
echo "Building $OUTPUT with Planetiler; may download additional public basemap assets."
docker run --rm -e JAVA_TOOL_OPTIONS="-Xmx4g" \
  -v "$DATA_DIR:/data" \
  ghcr.io/onthegomap/planetiler:latest \
  --osm-path=/data/newfoundland-and-labrador-latest.osm.pbf \
  --download \
  --output=/data/newfoundland-labrador.pmtiles \
  --force

test -s "$OUTPUT" || { echo "No map archive was generated."; exit 1; }
echo "Generated: $OUTPUT"
echo "NEXT: validate feature-layer names and integrate local PMTiles file handling."
echo "This does NOT yet make the native app province-wide offline."
