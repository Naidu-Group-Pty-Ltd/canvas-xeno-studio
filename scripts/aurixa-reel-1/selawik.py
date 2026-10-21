"""Builds Selawik TrueType fonts from Microsoft's UFO sources, for the portal plates.

The portals set no font of their own: they use the system stack, so on Windows (where the supplied
screenshots were taken) their text is Segoe UI. Selawik is Microsoft's open-source (SIL OFL 1.1)
stand-in for Segoe UI, drawn to its metrics; its repository ships only sources, so this compiles
them with the standard library alone. It writes Regular (400), Semibold (600, interpolated between
the Regular and Bold masters) and Bold (700), unhinted and without kerning (the sources have none).

  git clone --depth 1 https://github.com/microsoft/Selawik
  python3 scripts/aurixa-reel-1/selawik.py "Selawik/Source files/UFO" <out dir>
"""
import plistlib, struct, sys, time
import xml.etree.ElementTree as ET
from pathlib import Path

# Segoe UI's vertical metrics (2048 units to the em), so a line box is the size Windows draws it.
ASCENT, DESCENT = 2210, 514
SEMIBOLD_T = 0.6


def read_glyphs(ufo):
    contents = plistlib.load(open(ufo / "glyphs" / "contents.plist", "rb"))
    glyphs = {}
    for name, file in contents.items():
        root = ET.parse(ufo / "glyphs" / file).getroot()
        advance = root.find("advance")
        glyphs[name] = {
            "width": float(advance.get("width", 0)) if advance is not None else 0.0,
            "unicodes": [int(u.get("hex"), 16) for u in root.findall("unicode")],
            "contours": [[(float(p.get("x")), float(p.get("y")), p.get("type")) for p in c.findall("point")]
                         for c in root.findall("outline/contour")],
            "components": [(c.get("base"), [float(c.get(k, d)) for k, d in
                            (("xScale", 1), ("xyScale", 0), ("yxScale", 0), ("yScale", 1), ("xOffset", 0), ("yOffset", 0))])
                           for c in root.findall("outline/component")],
        }
    return glyphs


def flatten(glyphs, name, matrix=(1, 0, 0, 1, 0, 0), depth=0):
    """A glyph's contours with every component drawn in, transformed."""
    a, b, c, d, e, f = matrix
    g = glyphs[name]
    out = [[(a * x + c * y + e, b * x + d * y + f, t) for x, y, t in contour] for contour in g["contours"]]
    for base, (xx, xy, yx, yy, dx, dy) in g["components"]:
        if base in glyphs and depth < 8:
            m = (a * xx + c * xy, b * xx + d * xy, a * yx + c * yy, b * yx + d * yy, a * dx + c * dy + e, b * dx + d * dy + f)
            out += flatten(glyphs, base, m, depth + 1)
    return out


def interpolate(a, b, t):
    """Point-compatible masters blended; None when their structures differ."""
    if len(a["contours"]) != len(b["contours"]) or [c[0] for c in a["components"]] != [c[0] for c in b["components"]]:
        return None
    contours = []
    for ca, cb in zip(a["contours"], b["contours"]):
        if len(ca) != len(cb) or any(pa[2] != pb[2] for pa, pb in zip(ca, cb)):
            return None
        contours.append([(pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2]) for pa, pb in zip(ca, cb)])
    components = [(na, [va + (vb - va) * t for va, vb in zip(ma, mb)]) for (na, ma), (_, mb) in zip(a["components"], b["components"])]
    return {"width": a["width"] + (b["width"] - a["width"]) * t, "unicodes": a["unicodes"], "contours": contours, "components": components}


def to_quadratic(contour):
    """A closed UFO contour (cubic or quadratic segments) as TrueType points: (x, y, on_curve)."""
    if not contour:
        return []
    if contour[0][2] == "move":  # an open contour: close it
        contour = contour[:]
        contour[0] = (contour[0][0], contour[0][1], "line")
    on = [i for i, p in enumerate(contour) if p[2]]
    if not on:
        return []
    start = on[-1]
    pts = contour[start + 1:] + contour[:start + 1]  # ends on an on-curve point; the segments follow it
    prev = (contour[start][0], contour[start][1])
    out, pending = [], []
    for x, y, kind in pts:
        if not kind:
            pending.append((x, y))
            continue
        end = (x, y)
        if kind == "curve" and len(pending) == 2:
            p0, p1, p2, p3 = prev, pending[0], pending[1], end
            n = 4
            for i in range(n):
                t0, t1 = i / n, (i + 1) / n
                q0, q1, q2, q3 = split(p0, p1, p2, p3, t0, t1)
                ctrl = ((3 * (q1[0] + q2[0]) - q0[0] - q3[0]) / 4, (3 * (q1[1] + q2[1]) - q0[1] - q3[1]) / 4)
                out.append((ctrl[0], ctrl[1], False))
                out.append((q3[0], q3[1], True))
        elif kind in ("qcurve", "curve"):
            for px, py in pending:
                out.append((px, py, False))
            out.append((end[0], end[1], True))
        else:
            out.append((end[0], end[1], True))
        pending = []
        prev = end
    pts = [(round(x), round(y), o) for x, y, o in out]
    clean = []
    for p in pts:
        if not clean or p != clean[-1]:
            clean.append(p)
    if len(clean) > 1 and clean[0] == clean[-1]:
        clean.pop()
    return clean[::-1]  # TrueType winds outer contours clockwise


def split(p0, p1, p2, p3, t0, t1):
    """The cubic between t0 and t1, as its own four control points."""
    def at(t):
        mt = 1 - t
        return (mt ** 3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t ** 3 * p3[0],
                mt ** 3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t ** 3 * p3[1])
    def d(t):
        mt = 1 - t
        return (3 * mt * mt * (p1[0] - p0[0]) + 6 * mt * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]),
                3 * mt * mt * (p1[1] - p0[1]) + 6 * mt * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]))
    a, b = at(t0), at(t1)
    da, db = d(t0), d(t1)
    h = (t1 - t0) / 3
    return a, (a[0] + da[0] * h, a[1] + da[1] * h), (b[0] - db[0] * h, b[1] - db[1] * h), b


def encode_glyph(contours):
    contours = [c for c in contours if len(c) >= 2]
    if not contours:
        return b"", (0, 0, 0, 0), 0, 0
    pts = [p for c in contours for p in c]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    bbox = (min(xs), min(ys), max(xs), max(ys))
    ends, n = [], 0
    for c in contours:
        n += len(c)
        ends.append(n - 1)
    data = struct.pack(">hhhhh", len(contours), *bbox) + struct.pack(f">{len(ends)}H", *ends) + struct.pack(">H", 0)
    data += bytes(1 if p[2] else 0 for p in pts)
    px = py = 0
    xd, yd = b"", b""
    for x, y, _ in pts:
        xd += struct.pack(">h", x - px)
        yd += struct.pack(">h", y - py)
        px, py = x, y
    data += xd + yd
    return data + b"\0" * (-len(data) % 4), bbox, len(pts), len(contours)


def checksum(data):
    data += b"\0" * (-len(data) % 4)
    return sum(struct.unpack(f">{len(data) // 4}L", data)) & 0xFFFFFFFF


def build(glyphs, upm, family, style, weight, x_height, cap_height):
    names = [".notdef"] + sorted(n for n, g in glyphs.items() if g["unicodes"] and n != ".notdef")
    glyf, loca, metrics = b"", [], []
    max_pts = max_contours = 0
    gx0 = gy0 = 32767
    gx1 = gy1 = -32768
    for name in names:
        if name in glyphs:
            contours = [to_quadratic(c) for c in flatten(glyphs, name)]
            width = round(glyphs[name]["width"])
        else:  # a plain box for .notdef
            contours = [[(100, 0, True), (100, 1434, True), (900, 1434, True), (900, 0, True)][::-1]]
            width = 1000
        data, bbox, npts, nc = encode_glyph(contours)
        loca.append(len(glyf))
        glyf += data
        metrics.append((width, bbox[0] if data else 0, bbox if data else None))
        max_pts, max_contours = max(max_pts, npts), max(max_contours, nc)
        if data:
            gx0, gy0, gx1, gy1 = min(gx0, bbox[0]), min(gy0, bbox[1]), max(gx1, bbox[2]), max(gy1, bbox[3])
    loca.append(len(glyf))
    n = len(names)
    widths = [m[0] for m in metrics]
    inked = [m for m in metrics if m[2]]
    hmtx = b"".join(struct.pack(">Hh", w, lsb) for w, lsb, _ in metrics)
    tables = {
        "head": struct.pack(">LLLLHHqqhhhhHHh", 0x00010000, 0x00010000, 0, 0x5F0F3CF5, 0x000B, upm,
                            int(time.time()) + 2082844800, int(time.time()) + 2082844800, gx0, gy0, gx1, gy1,
                            1 if weight >= 700 else 0, 8, 2) + struct.pack(">hh", 1, 0),
        "hhea": struct.pack(">LhhhHhhhhhhhhhhhH", 0x00010000, ASCENT, -DESCENT, 0, max(widths),
                            min(m[1] for m in inked), min(w - (b[2]) for w, _, b in inked),
                            max(lsb + (b[2] - b[0]) for w, lsb, b in inked), 1, 0, 0, 0, 0, 0, 0, 0, n),
        "maxp": struct.pack(">LHHHHHHHHHHHHHH", 0x00010000, n, max_pts, max_contours, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0),
        "hmtx": hmtx,
        "loca": struct.pack(f">{len(loca)}L", *loca),
        "glyf": glyf,
        "post": struct.pack(">LLhhLLLLL", 0x00030000, 0, -150, 100, 0, 0, 0, 0, 0),
    }
    # cmap: format 4, one segment per character
    cmap = sorted({u: i for i, name in enumerate(names) if name in glyphs for u in glyphs[name]["unicodes"] if u <= 0xFFFF}.items())
    seg = len(cmap) + 1
    ends = [u for u, _ in cmap] + [0xFFFF]
    deltas = [(g - u) % 65536 for u, g in cmap] + [1]
    sr = 2 ** (seg.bit_length() - 1) * 2
    sub = struct.pack(">HHHHHHH", 4, 0, 0, seg * 2, sr, sr.bit_length() - 2, seg * 2 - sr)
    sub += struct.pack(f">{seg}H", *ends) + b"\0\0" + struct.pack(f">{seg}H", *ends)
    sub += struct.pack(f">{seg}H", *deltas) + struct.pack(f">{seg}H", *([0] * seg))
    sub = sub[:2] + struct.pack(">H", len(sub)) + sub[4:]
    tables["cmap"] = struct.pack(">HHHHLHHL", 0, 2, 0, 3, 20, 3, 1, 20) + sub
    first = min(u for u, _ in cmap)
    last = max(u for u, _ in cmap)
    tables["OS/2"] = struct.pack(">HhHHHhhhhhhhhhhh", 4, round(sum(widths) / len(widths)), weight, 5, 0,
                                 1331, 1229, 0, 154, 1331, 1229, 0, 731, 102, 512, 0) \
        + bytes(10) + struct.pack(">LLLL", 0x3, 0, 0, 0) + b"NONE" \
        + struct.pack(">HHHhhhHHLLhhHHH", (0x20 if weight >= 700 else 0x40) | 0x80, first, last, ASCENT, -DESCENT, 0,
                      ASCENT, DESCENT, 1, 0, x_height, cap_height, 0, 32, 0)
    full = f"{family} {style}".replace(" Regular", "")
    strings = {0: "Copyright 2015, Microsoft Corporation, with Reserved Font Name Selawik. SIL Open Font License 1.1.",
               1: family, 2: style, 3: f"{family.replace(' ', '')}-{style}", 4: full, 5: "Version 1.0", 6: f"{family.replace(' ', '')}-{style}"}
    records, store = b"", b""
    for nid, text in strings.items():
        raw = text.encode("utf-16-be")
        records += struct.pack(">HHHHHH", 3, 1, 0x409, nid, len(raw), len(store))
        store += raw
    tables["name"] = struct.pack(">HHH", 0, len(strings), 6 + 12 * len(strings)) + records + store
    # the file: directory, tables padded to four bytes, then the head checksum adjustment
    tags = sorted(tables)
    sr = 2 ** (len(tags).bit_length() - 1) * 16
    header = struct.pack(">LHHHH", 0x00010000, len(tags), sr, (sr // 16).bit_length() - 1, len(tags) * 16 - sr)
    offset = 12 + 16 * len(tags)
    directory, body = b"", b""
    for tag in tags:
        data = tables[tag]
        directory += struct.pack(">4sLLL", tag.encode(), checksum(data), offset + len(body), len(data))
        body += data + b"\0" * (-len(data) % 4)
    font = bytearray(header + directory + body)
    head_at = offset + sum(len(tables[t]) + (-len(tables[t]) % 4) for t in tags[:tags.index("head")])
    struct.pack_into(">L", font, head_at + 8, (0xB1B0AFBA - checksum(bytes(font))) & 0xFFFFFFFF)
    return bytes(font), n


if __name__ == "__main__":
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    regular, bold = read_glyphs(src / "Selawik-Regular.ufo"), read_glyphs(src / "Selawik-Bold.ufo")
    info = plistlib.load(open(src / "Selawik-Regular.ufo" / "fontinfo.plist", "rb"))
    semibold, fallback = {}, []
    for name, g in regular.items():
        blend = interpolate(g, bold[name], SEMIBOLD_T) if name in bold else None
        if blend is None:
            fallback.append(name)
        semibold[name] = blend or bold.get(name, g)
    for weight, style, glyphs in ((400, "Regular", regular), (600, "Semibold", semibold), (700, "Bold", bold)):
        data, n = build(glyphs, info["unitsPerEm"], "Selawik", style, weight, info["xHeight"], info["capHeight"])
        (out / f"Selawik-{weight}.ttf").write_bytes(data)
        print(f"Selawik-{weight}.ttf: {n} glyphs, {len(data)} bytes")
    print(f"semibold: {len(regular) - len(fallback)} glyphs blended, {len(fallback)} taken from Bold")
