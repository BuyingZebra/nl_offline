#!/usr/bin/env python3
"""Merge NL OSM map-label nodes with NRCan official place-name fallback.
OSM node coordinates match geographical anchors used by OpenMapTiles place
symbols. The symbol renderer can offset/hide glyphs at individual zooms.
Run: python tools/merge-osm-map-places.py path/to/nl.osm.pbf
"""
import json, math, pathlib, re, sys, unicodedata
from collections import defaultdict
import osmium

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "data" / "nl-places.json"
CLASSES = {"city", "town", "village", "hamlet", "suburb", "neighbourhood"}

def key(s):
    s = unicodedata.normalize("NFKD", s or "").casefold()
    return re.sub("[^a-z0-9]", "", "".join(c for c in s if not unicodedata.combining(c)))

def km(a,b):
    x,y,u,v=map(math.radians,[a["lat"],a["lng"],b["lat"],b["lng"]])
    z=math.sin((u-x)/2)**2+math.cos(x)*math.cos(u)*math.sin((v-y)/2)**2
    return 12742.0176*math.asin(min(1,math.sqrt(z)))

def region(lat,lng):
    """Approximate geographic-area labels, not precise administrative borders."""
    if lat>=52.0: return "Labrador"
    if 49.40<=lat<=50.18 and -55.28<=lng<=-54.15:
        return "Twillingate / Notre Dame Bay"
    if 49.65<=lat<=50.54 and -57.12<=lng<=-55.28:
        return "Baie Verte Peninsula"
    if 49.85<=lat<=52 and lng<=-56.8: return "Great Northern Peninsula"
    if lat<=48.18 and lng>=-54.50: return "Avalon Peninsula"
    if lat<=48.20 and -56.90<=lng<-54.50: return "Burin / South Coast"
    if 48.18<lat<=49.65 and lng>=-54.65: return "Bonavista / Trinity area"
    if lat<=49.90 and lng<=-57.32: return "Western Newfoundland"
    if 48.10<=lat<=50.20 and -57.40<=lng<-54.65: return "Central Newfoundland"
    return "Newfoundland"

class Collector(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.places=[]
        self.kinds=defaultdict(int)
    def node(self,n):
        p=n.tags.get("place")
        if p not in CLASSES or not n.location.valid(): return
        name=n.tags.get("name:en") or n.tags.get("name")
        if not name or not name.strip(): return
        lat,lng=float(n.location.lat),float(n.location.lon)
        if not (45<=lat<=61 and -70<=lng<=-50): return
        self.kinds[p]+=1
        self.places.append({"id":"osm:n:"+str(n.id),"name":name.strip(),
            "region":region(lat,lng),"kind":p,"lat":round(lat,7),
            "lng":round(lng,7),"historic":False,
            "source":"osm","mapAnchor":True})

def build(path):
    original=json.loads(OUTPUT.read_text(encoding="utf8"))
    old=original["places"]
    if not 1400<=len(old)<=3000: raise ValueError("Invalid official base")
    collector=Collector()
    collector.apply_file(str(path),locations=False)
    if len(collector.places)<400: raise ValueError("Too few place nodes")
    grouped=defaultdict(list)
    for p in old:grouped[key(p["name"])].append(p)
    matched=set()
    result=[]
    for osm in collector.places:
        options=[p for p in grouped[key(osm["name"])] if p["id"] not in matched]
        if options:
            nearest=min(options,key=lambda p:km(p,osm))
            if km(nearest,osm)<=25:
                matched.add(nearest["id"])
                osm["officialId"]=nearest["id"]
                osm["historic"]=nearest.get("historic",False)
        result.append(osm)
    for p in old:
        if p["id"] in matched: continue
        fallback=dict(p)
        fallback.update(source="cgn",mapAnchor=False,
                        region=region(p["lat"],p["lng"]))
        result.append(fallback)
    result.sort(key=lambda p:(key(p["name"]),not p["mapAnchor"],p["region"],p["id"]))
    if len({p["id"] for p in result})!=len(result):
        raise ValueError("Duplicate ID")
    wild=[p for p in result if key(p["name"])=="wildcove"]
    print("OSM LABELS",len(collector.places),"CLASSES",dict(collector.kinds))
    print("OFFICIAL MATCHES",len(matched),"TOTAL",len(result))
    print("WILD COVE",json.dumps(wild,ensure_ascii=False))
    for area in ["Baie Verte Peninsula","Twillingate / Notre Dame Bay"]:
        if not any(p["mapAnchor"] and key(p["name"])=="wildcove" and
                   p["region"]==area for p in wild):
            raise ValueError("Missing map-labelled Wild Cove / "+area)
    updated={"source":"OpenStreetMap place nodes, NRCan CGNDB fallback",
        "sourceUrl":"https://download.geofabrik.de/north-america/canada/newfoundland-and-labrador.html",
        "licence":"ODbL 1.0 (OpenStreetMap); Open Government Licence - Canada (CGNDB)",
        "scope":"Newfoundland and Labrador map-label communities and official fallback",
        "places":result}
    OUTPUT.write_text(json.dumps(updated,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf8")
    print("OUTPUT BYTES",OUTPUT.stat().st_size)

if __name__=="__main__":
    if len(sys.argv)!=2: raise SystemExit("Usage: merge-osm-map-places.py nl.osm.pbf")
    build(pathlib.Path(sys.argv[1]))
