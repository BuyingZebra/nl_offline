#!/usr/bin/env python3
"""Build the FIELD ATLAS NL populated-place index from NRCan's official CGNDB.

Download regenerated weekly by Natural Resources Canada. Output is small JSON
with searchable names, real geographic coordinates, and stable government IDs.
Not a street-address search or road-routing database.
"""
import csv
import io
import json
import pathlib
import re
import unicodedata
import urllib.request
import zipfile
from collections import Counter

URL = ("https://ftp.maps.canada.ca/pub/nrcan_rncan/vector/"
       "geobase_cgn_toponyme/prov_csv_eng/cgn_nl_csv_eng.zip")
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "data" / "nl-places.json"
KINDS = {
    "CITY": "City", "TOWN": "Town", "VILG": "Village",
    "HAM": "Hamlet", "UNP": "Community", "IR": "Indigenous community",
    "MUN1": "Municipality", "MUN2": "Municipality",
}
REFERENCE = ["Carbonear", "Bay Roberts", "St. John's", "Harbour Grace",
             "Spaniard's Bay", "Heart's Content", "Corner Brook",
             "Happy Valley-Goose Bay", "Labrador City", "Natuashish", "Rigolet"]


def build(raw: bytes):
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        candidates = [x for x in archive.namelist() if x.endswith(".csv")]
        if len(candidates) != 1:
            raise ValueError("Unexpected CGNDB archive contents: " + str(candidates))
        content = archive.read(candidates[0]).decode("utf-8-sig")
    rows = csv.DictReader(io.StringIO(content))
    required = {"CGNDB ID", "Geographical Name", "Generic Category", "Generic Term",
                "Concise Code", "Latitude", "Longitude", "Location"}
    if not required.issubset(set(rows.fieldnames or [])):
        raise ValueError("Unexpected CGNDB CSV schema")
    places = []
    seen = set()
    for record in rows:
        # Natuashish is an active Innu community, but the federal file
        # classifies its official community point ACJUH as SITE, not
        # "Populated Place". Include this documented exception.
        if record["Generic Category"] != "Populated Place" and record["CGNDB ID"] != "ACJUH":
            continue
        name = record["Geographical Name"].strip()
        key = record["CGNDB ID"].strip()
        if not name or not key or key in seen:
            continue
        try:
            lat, lng = float(record["Latitude"]), float(record["Longitude"])
        except (ValueError, TypeError):
            continue
        if not 45 <= lat <= 61 or not -70 <= lng <= -50:
            continue
        term = record["Generic Term"].strip()
        code = record["Concise Code"].strip()
        kind = KINDS.get(code, "Community")
        is_seasonal = "Vacated" in term or "Seasonal" in term
        # Label relevant neighbourhoods/localities honestly, rather than
        # implying that each entry is an incorporated municipality.
        if key == "ACJUH":
            kind = "Indigenous community"
        if code == "UNP":
            if term in {"Neighbourhood", "Neighborhood"}:
                kind = "Neighbourhood"
            elif term == "Locality":
                kind = "Locality"
            elif term == "Settlement":
                kind = "Settlement"
            elif is_seasonal:
                kind = "Former / seasonal settlement"
        places.append({
            "id": key,
            "name": name,
            "region": record["Location"].strip(),
            "kind": kind,
            "lat": round(lat, 7),
            "lng": round(lng, 7),
            "historic": is_seasonal,
        })
        seen.add(key)
    if not 1300 <= len(places) <= 2500:
        raise ValueError(f"Unexpected populated-place count: {len(places)}")
    def normalized(text):
        ascii_text = unicodedata.normalize("NFKD", text).casefold()
        return re.sub(r"[^a-z0-9]", "", "".join(
            c for c in ascii_text if not unicodedata.combining(c)))
    names = {normalized(p["name"]) for p in places}
    # Federal spelling sometimes has different punctuation in names.
    missing = [name for name in REFERENCE if normalized(name) not in names]
    if missing:
        raise ValueError("Missing reference communities: " + ", ".join(missing))
    places.sort(key=lambda p: (p["name"].casefold(), p["region"].casefold(), p["id"]))
    duplicates = Counter(p["name"].casefold() for p in places)
    result = {
        "source": "Natural Resources Canada / Canadian Geographical Names Database",
        "sourceUrl": URL,
        "licence": "Open Government Licence - Canada",
        "scope": "Newfoundland and Labrador official populated places",
        "places": places,
    }
    print("POPULATED PLACE COUNT:", len(places))
    print("SEASONAL / VACATED:", sum(p["historic"] for p in places))
    print("DUPLICATE NAME GROUPS:", sum(v > 1 for v in duplicates.values()))
    print("SAMPLE:", json.dumps(places[:4], ensure_ascii=False))
    return result


def main():
    request = urllib.request.Request(
        URL, headers={"User-Agent": "FIELD-ATLAS/0.29 (community index research)"})
    with urllib.request.urlopen(request, timeout=90) as response:
        raw = response.read()
    if len(raw) < 100000:
        raise RuntimeError("Official names archive unexpectedly small")
    data = build(raw)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n",
                      encoding="utf-8")
    print("WROTE:", OUTPUT, "BYTES:", OUTPUT.stat().st_size)


if __name__ == "__main__":
    main()
