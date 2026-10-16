#!/usr/bin/env python3
"""Build a searchable offline NL geographic index from federal reference archives.

Requires pyshp. Optional NAR ZIP is streamed without unpacking the national CSV.
"""
import argparse
import csv
import io
import json
import sqlite3
import zipfile
from collections import Counter
from pathlib import Path

import shapefile


def rows_from_names(names_zip):
    with zipfile.ZipFile(names_zip) as z:
        parts = [z.open(f'cgn_nl_shp_eng.{ext}') for ext in ('shp', 'shx', 'dbf')]
        try:
            reader = shapefile.Reader(shp=parts[0], shx=parts[1], dbf=parts[2], encoding='utf-8')
            for shape_record in reader.iterShapeRecords():
                p = shape_record.record.as_dict()
                if not shape_record.shape.points:
                    continue
                lon, lat = shape_record.shape.points[0]
                name = (p.get('GEONAME') or '').strip()
                if not name:
                    continue
                yield {
                    'source_id': p.get('CGNDB_ID') or '',
                    'name': name,
                    'category': p.get('CATEGORY') or '',
                    'feature_type': p.get('CONCISE') or '',
                    'generic': p.get('GENERIC') or '',
                    'location_hint': p.get('LOCATION') or '',
                    'lat': lat,
                    'lon': lon,
                }
        finally:
            for f in parts:
                f.close()


def addresses_from_zip(path):
    """Consume the June 2026 StatCan NAR ZIP row by row; no giant unpack."""
    found = False
    with zipfile.ZipFile(path) as z:
        members = [m for m in z.infolist() if m.filename.lower().endswith(('.csv', '.txt')) and not m.is_dir()]
        for member in members:
            with z.open(member) as stream:
                raw = io.TextIOWrapper(stream, encoding='utf-8-sig', errors='replace', newline='')
                reader = csv.DictReader(raw)
                if not reader.fieldnames:
                    continue
                columns = {c.strip().upper().lstrip('\ufeff'): c for c in reader.fieldnames}
                if not ('PROV_CODE' in columns and 'CIVIC_NO' in columns):
                    continue
                found = True
                def get(r, field):
                    return (r.get(columns.get(field, ''), '') or '').strip()
                for record in reader:
                    if get(record, 'PROV_CODE') not in ('10', '10.0', 'NL', 'Newfoundland and Labrador'):
                        continue
                    lat = get(record, 'BG_LATITUDE') or get(record, 'BF_REPPOINT_LATITUDE')
                    lon = get(record, 'BG_LONGITUDE') or get(record, 'BF_REPPOINT_LONGITUDE')
                    try:
                        latitude, longitude = float(lat), float(lon)
                    except (TypeError, ValueError):
                        continue
                    road = ' '.join(filter(None, [get(record, 'OFFICIAL_STREET_NAME'),
                                                   get(record, 'OFFICIAL_STREET_TYPE'),
                                                   get(record, 'OFFICIAL_STREET_DIR')]))
                    number = get(record, 'CIVIC_NO') + get(record, 'CIVIC_NO_SUFFIX')
                    community = get(record, 'MAIL_MUN_NAME') or get(record, 'CSD_ENG_NAME')
                    label = ', '.join(x for x in (' '.join(filter(None, [number, road])), community) if x)
                    yield (get(record, 'ADDR_GUID'), label, number, road, community,
                           get(record, 'MAIL_POSTAL_CODE'), latitude, longitude)
    if not found:
        raise ValueError('NAR archive contains no supported CSV with PROV_CODE and CIVIC_NO; inspect the ZIP layout.')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--names-zip', required=True, type=Path)
    ap.add_argument('--output', required=True, type=Path)
    ap.add_argument('--addresses-zip', type=Path)
    args = ap.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(args.output / 'nl_search.sqlite')
    db.execute('PRAGMA journal_mode=DELETE')
    db.executescript('''
        CREATE TABLE places (id INTEGER PRIMARY KEY, source_id TEXT, name TEXT NOT NULL,
            category TEXT, feature_type TEXT, generic TEXT, location_hint TEXT,
            lat REAL NOT NULL, lon REAL NOT NULL);
        CREATE INDEX places_name_idx ON places(name COLLATE NOCASE);
        CREATE VIRTUAL TABLE places_fts USING fts5(name, location_hint, content='places', content_rowid='id', tokenize='unicode61 remove_diacritics 2');
        CREATE TABLE addresses (id INTEGER PRIMARY KEY, source_id TEXT, label TEXT, civic_number TEXT,
            road TEXT, community TEXT, postal TEXT, lat REAL NOT NULL, lon REAL NOT NULL);
        CREATE VIRTUAL TABLE addresses_fts USING fts5(label, road, community, content='addresses', content_rowid='id');
    ''')
    categories = Counter()
    fields = ['source_id','name','category','feature_type','generic','location_hint','lat','lon']
    with (args.output / 'nl_geographic_names.csv').open('w', newline='', encoding='utf-8') as nf, \
         (args.output / 'nl_communities.csv').open('w', newline='', encoding='utf-8') as cf:
        allwriter, communitywriter = csv.DictWriter(nf, fieldnames=fields), csv.DictWriter(cf, fieldnames=fields)
        allwriter.writeheader()
        communitywriter.writeheader()
        for p in rows_from_names(args.names_zip):
            categories[p['category']] += 1
            allwriter.writerow(p)
            if p['category'] in ('Populated Place', 'Administrative Area'):
                communitywriter.writerow(p)
            db.execute('INSERT INTO places(source_id,name,category,feature_type,generic,location_hint,lat,lon) VALUES(?,?,?,?,?,?,?,?)', tuple(p[f] for f in fields))
    db.execute("INSERT INTO places_fts(places_fts) VALUES('rebuild')")
    db.commit()
    addr_count = 0
    if args.addresses_zip:
        for a in addresses_from_zip(args.addresses_zip):
            db.execute('INSERT INTO addresses(source_id,label,civic_number,road,community,postal,lat,lon) VALUES(?,?,?,?,?,?,?,?)', a)
            addr_count += 1
            if addr_count % 10000 == 0:
                db.commit()
        db.execute("INSERT INTO addresses_fts(addresses_fts) VALUES('rebuild')")
        db.commit()
    names_count = sum(categories.values())
    communities_count = sum(categories.get(k, 0) for k in ('Populated Place', 'Administrative Area'))
    wild_coves = [dict(name=r[0], category=r[1], lat=r[2], lon=r[3]) for r in db.execute(
        "SELECT name,category,lat,lon FROM places WHERE name='Wild Cove' COLLATE NOCASE AND category IN ('Populated Place','Administrative Area') ORDER BY lon")]
    summary = {'names': names_count, 'communities_and_admin': communities_count,
               'addresses': addr_count, 'categories': dict(categories), 'wild_cove_candidates': wild_coves,
               'source_names': 'Natural Resources Canada Canadian Geographical Names',
               'source_addresses': 'Statistics Canada National Address Register' if args.addresses_zip else None}
    (args.output / 'coverage_report.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
    db.close()
    if names_count < 10000:
        raise RuntimeError(f'Unexpectedly low geographic-name count: {names_count}')
    print(f'{names_count:,} named places/features, {communities_count:,} community/admin records, {addr_count:,} address points')
    print('Wild Cove candidates:', wild_coves)

if __name__ == '__main__':
    main()
