#!/usr/bin/env python3
"""Australia's places from GeoNames (all-the-cities 3.1.0's cities.pbf, CC BY 4.0), read with our own protobuf
reader: the package's code is never run. Writes data/au-places.json: name, population, feature code, lon, lat.

  python3 -I places.py <cities.pbf> <out.json>              # Australia's places
  python3 -I places.py <cities.pbf> <out.json> --region     # every place from 100 E to 180 E and 0 to 50 S, with its
                                                            # country: Australia, New Zealand and their neighbours

Each record is a length-prefixed message. Fields: 1 id (sint), 2 name, 3 country, 4 alt name, 5 muni, 6 muni sub,
7 feature code, 8 admin code (strings), 9 population (varint), 10 lon and 11 lat (sint, each a delta on the
previous record's, in 1e-5 degrees)."""
import json
import sys
from pathlib import Path

src, out = Path(sys.argv[1]), Path(sys.argv[2])
region = "--region" in sys.argv[3:]
buf = src.read_bytes()


def varint(b, i):
    shift = result = 0
    while True:
        byte = b[i]
        i += 1
        result |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return result, i
        shift += 7


def zigzag(n):
    return (n >> 1) ^ -(n & 1)


i, last_lon, last_lat, places = 0, 0, 0, []
while i < len(buf):
    length, i = varint(buf, i)
    end = i + length
    rec = {}
    while i < end:
        key, i = varint(buf, i)
        tag, wire = key >> 3, key & 7
        if wire == 0:
            v, i = varint(buf, i)
            if tag == 1:
                rec["id"] = zigzag(v)
            elif tag == 9:
                rec["p"] = v
            elif tag == 10:
                last_lon += zigzag(v)
                rec["lon"] = last_lon / 1e5
            elif tag == 11:
                last_lat += zigzag(v)
                rec["lat"] = last_lat / 1e5
        elif wire == 2:
            n, i = varint(buf, i)
            s = buf[i:i + n].decode("utf-8", "replace")
            i += n
            if tag == 2:
                rec["n"] = s
            elif tag == 3:
                rec["c"] = s
            elif tag == 7:
                rec["f"] = s
        else:
            raise ValueError(f"wire type {wire} at {i}")
    places.append(rec)
au = [{"n": p.get("n"), "p": p.get("p", 0), "f": p.get("f"), "lon": p["lon"], "lat": p["lat"]}
      for p in places if p.get("c") == "AU"]
if region:
    near = [{"n": p.get("n"), "p": p.get("p", 0), "f": p.get("f"), "c": p.get("c"), "lon": p["lon"], "lat": p["lat"]}
            for p in places if 100 <= p["lon"] <= 180 and -50 <= p["lat"] <= 0]
    out.write_text(json.dumps(near))
    print(len(near), "places from 100 E to 180 E and 0 to 50 S")
    sys.exit(0)
out.write_text(json.dumps(au))
basin = [p for p in au if 150.4 < p["lon"] < 151.4 and -34.2 < p["lat"] < -33.4]
print(len(places), "places;", len(au), "in Australia;", len(basin), "in the Sydney basin")
print(sorted([(p["p"], p["n"]) for p in au], reverse=True)[:8])
