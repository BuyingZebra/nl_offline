#!/usr/bin/env python3
"""Discover EVERY provincial scanned air-photo index and public ArcGIS layer.

This deliberately produces a catalog, not false georeferenced road geometries:
the linked JPGs are historical flight-line/topographic index sheets.
"""
import argparse
import csv
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

AIR_INDEX = "https://www.gov.nl.ca/fal/lands/maps/airphotos/"
PORTAL = "https://gnl.maps.arcgis.com"
APP_IDS = {
    "community_map_index": "4133f402aeec4efe85c4e8bfdd5b1490",
    "topographic_maps": "8cf943d7900d4ff0a906d74544a32974",
    "air_photo_index": "42e04b3fedd94ca8ac4de8e5b04599cb",
    "orthorectified_imagery": "370d91dfddf749b7964aae16e113a2c8",
}
IMG_EXT = re.compile(r"\.(?:jpe?g|png|tiff?)$", re.I)
MAP_SERVICE = re.compile(r'https?://[^\s"<>\\]+?/(?:MapServer|FeatureServer|ImageServer)(?:/\d+)?', re.I)
ID32 = re.compile(r"^[0-9a-f]{32}$", re.I)

COLUMNS = ("sheet", "year", "photo_type", "scale_denominator", "region", "filename", "url", "source_page")


def session():
    s = requests.Session()
    s.headers.update({"User-Agent": "NL-Map-Data-Research/1.0 (+https://github.com/BuyingZebra/nl_offline)"})
    retry = Retry(total=3, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504])
    s.mount("https://", HTTPAdapter(max_retries=retry))
    return s


def get_json(s, url):
    res = s.get(url, timeout=(15, 40), params={"f": "json"})
    res.raise_for_status()
    result = res.json()
    if "error" in result:
        raise ValueError(f"{url}: {result['error']}")
    return result


def catalog_airphotos(html):
    soup = BeautifulSoup(html, "html.parser")
    result = []
    seen = set()
    for a in soup.select('a[href]'):
        filename = a.get_text(" ", strip=True)
        href = a.get("href", "")
        if not IMG_EXT.search(urlparse(href).path):
            continue
        url = urljoin(AIR_INDEX, href)
        if url in seen:
            continue
        seen.add(url)
        tr = a.find_parent("tr")
        cells = tr.find_all("td") if tr else []
        region = cells[1].get_text(" ", strip=True) if len(cells) >= 2 else ""
        name = urlparse(url).path.rsplit("/", 1)[-1]
        base = re.sub(r"\.(?:jpe?g|png|tiff?)$", "", filename or name, flags=re.I)
        match = re.search(r"([0-9]{2}[A-Z][0-9]{2}|[0-9]{2}[A-Z](?:00|–|-))[_-](19\d{2}|20\d{2})[_-](BW|CO|IR)[_-]([0-9]{3,6})", base, re.I)
        if not match:
            # Some filenames use a separate dash or omit the 00 sheet suffix.
            sheet_match = re.search(r"([0-9]{2}[A-Z][0-9]{2})", base, re.I)
            year_match = re.search(r"(19\d{2}|20\d{2})", base)
            scale_match = re.search(r"(?:_|-)(\d{4,6})(?:_|-)", base)
            sheet = sheet_match.group(1).upper() if sheet_match else ""
            year = int(year_match.group(1)) if year_match else ""
            photo_type = next((t for t in ("BW", "CO", "IR") if f"_{t}_" in base.upper()), "")
            scale = int(scale_match.group(1)) if scale_match else ""
        else:
            sheet, year, photo_type, scale = match.groups()
            sheet, year, photo_type, scale = sheet.upper(), int(year), photo_type.upper(), int(scale)
        result.append({
            "sheet": sheet, "year": year, "photo_type": photo_type,
            "scale_denominator": scale, "region": region, "filename": name, "url": url,
            "source_page": AIR_INDEX,
        })
    return sorted(result, key=lambda r: (r["sheet"], -int(r["year"] or 0), r["filename"]))


def walk(obj):
    if isinstance(obj, dict):
        yield obj
        for value in obj.values():
            yield from walk(value)
    elif isinstance(obj, list):
        for child in obj:
            yield from walk(child)


def discover_arcgis(s):
    apps = []
    layers = []
    warnings = []
    seen_layers = set()
    for label, app_id in APP_IDS.items():
        item_base = f"{PORTAL}/sharing/rest/content/items/{app_id}"
        try:
            meta = get_json(s, item_base)
            data = get_json(s, item_base + "/data")
            apps.append({"kind": label, "id": app_id, "title": meta.get("title"),
                         "type": meta.get("type"), "url": meta.get("url"), "access": meta.get("access")})
        except Exception as exc:
            warnings.append(f"{label}: {type(exc).__name__}: {exc}")
            continue
        ids = []
        for part in walk(data):
            for key in ("itemId", "webmap", "webMapId"):
                candidate = part.get(key)
                if isinstance(candidate, str) and ID32.match(candidate) and candidate not in ids:
                    ids.append(candidate)
        documents = [(app_id, data)]
        for child_id in ids[:25]:
            if child_id == app_id:
                continue
            try:
                child_meta = get_json(s, f"{PORTAL}/sharing/rest/content/items/{child_id}")
                if child_meta.get("type") not in ("Web Map", "Web Scene"):
                    continue
                child_data = get_json(s, f"{PORTAL}/sharing/rest/content/items/{child_id}/data")
                documents.append((child_id, child_data))
            except Exception as exc:
                warnings.append(f"{label}/webmap/{child_id}: {type(exc).__name__}: {exc}")
        for parent_id, doc in documents:
            for part in walk(doc):
                url = part.get("url")
                if not isinstance(url, str) or not MAP_SERVICE.search(url):
                    continue
                matched_url = MAP_SERVICE.search(url).group(0).rstrip("/")
                key = (label, matched_url)
                if key in seen_layers:
                    continue
                seen_layers.add(key)
                service_meta = {}
                try:
                    service_meta = get_json(s, matched_url)
                except Exception as exc:
                    warnings.append(f"{label}/{matched_url}: {type(exc).__name__}: {exc}")
                caps = service_meta.get("capabilities", "")
                layers.append({
                    "app": label, "webmap_id": parent_id,
                    "name": part.get("title") or part.get("name") or service_meta.get("name") or "",
                    "service_url": matched_url, "service_type": "ImageServer" if "ImageServer" in matched_url
                          else "FeatureServer" if "FeatureServer" in matched_url else "MapServer",
                    "capabilities": caps,
                    "supports_query": "query" in str(caps).lower(),
                    "supports_extract": "extract" in str(caps).lower(),
                    "spatial_reference": json.dumps(service_meta.get("spatialReference") or
                                                 service_meta.get("extent", {}).get("spatialReference") or {}),
                    "rights": service_meta.get("copyrightText") or meta.get("licenseInfo") or "",
                })
    return apps, layers, warnings


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--only-airphotos", action="store_true")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    s = session()
    response = s.get(AIR_INDEX, timeout=(15, 60))
    response.raise_for_status()
    photos = catalog_airphotos(response.text)
    if len(photos) < 100:
        raise ValueError(f"Only found {len(photos)} linked image scans; aborting incomplete catalog")
    with (args.output / "provincial_image_index.csv").open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(photos)
    apps, layers, warnings = ([], [], []) if args.only_airphotos else discover_arcgis(s)
    if not args.only_airphotos:
        fieldnames = ("app", "webmap_id", "name", "service_url", "service_type",
                      "capabilities", "supports_query", "supports_extract", "spatial_reference", "rights")
        with (args.output / "provincial_arcgis_layers.csv").open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(layers)
    report = {
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "source": AIR_INDEX,
        "linked_index_images": len(photos),
        "years": dict(sorted(Counter(str(x["year"]) for x in photos).items())),
        "sheet_count": len({x["sheet"] for x in photos if x["sheet"]}),
        "color_codes": dict(Counter(x["photo_type"] for x in photos)),
        "arcgis_applications": apps,
        "arcgis_layer_count": len(layers),
        "arcgis_warnings": warnings,
        "limitations": [
            "Historical scanned air-photo INDEX images often depict photo positions over topographic maps; they are not original orthorectified photographs.",
            "Map-index JPEG images lack georeferencing metadata. Do NOT convert pixel road shapes directly to navigable coordinates.",
            "An ArcGIS service's existence does not guarantee downloadable source data, public extraction rights, or current coverage.",
            "Mapped roads may be obsolete. Reconcile to newer roads and imagery before importing into navigation.",
        ]
    }
    (args.output / "provincial_map_inventory.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Indexed {len(photos)} provincial map images; found {len(layers)} ArcGIS layers.")
    print(f"ArcGIS warnings: {len(warnings)}")


if __name__ == "__main__":
    main()
