"""A run's frames settled by agreement with an independent draw of the same frames.

  python3 -I verify_run.py diff <run dir> <old reference.mkv> <old first frame>
      the frames where the run and the old draw disagree (writes <run dir>/disagree.json)
  python3 -I verify_run.py settle <run dir> <old reference.mkv> <old first frame> <extra dir> [...]
      for each disagreeing frame, every draw votes: the run's, the old one's and each extra draw's (render.cjs
      RENDER_FRAMES PNGs). Draws within TOLERANCE code values of each other on every pixel are one answer (the
      rounding noise of a moving gradient is 1), or differ by more than 12 on no more than EDGE_PX pixels. The answer two or more draws give
      wins; where it is not the run's, the run's frame is replaced. A frame no two draws agree on is unresolved.
      A corrected run's reference is rewritten (the first kept as reference.unverified.mkv) and the outcome
      recorded in its film.json as `verified`.

  python3 -I verify_run.py pick <run dir> [share]
      for a run with no earlier draw: the frames to draw again (writes <run dir>/disagree.json, the frames put to
      the vote): every frame whose drawings the check had to capture again, its neighbours, and a seeded random
      share (default 0.05) of the rest, so the vote also covers frames the check passed first time
  python3 -I verify_run.py settle <run dir> - 0 <extra dir> [...]
      as above with no old draw ("-"): the run and the extra draws vote

  python3 -I verify_run.py compare <run dir> <png dir>
      each frame-NNNNN.png in <png dir> (render.cjs RENDER_FRAMES, drawn on another machine) against the run's
      reference, by the same rule: whether that machine draws what this one drew (exits 1 if any frame differs)

  python3 -I verify_run.py splice <run dir> <first>-<last> <why> <draw dir> <draw dir> [...]
      a change to a scene that reaches only frames first to last of a run drawn before it (a cover over words the
      brand keeps out of frame): those frames drawn again two or more times, each draw its own render (RENDER_FRAMES
      PNGs). For each frame the draws vote by the rule above, and the answer two or more of them give replaces the
      run's frame; a frame they give no answer on stops the splice before anything is written. The reference is
      rewritten (the one before kept as reference.before-splice-<n>.mkv), checked to differ from it nowhere but in
      those frames, and the splice recorded in film.json under `spliced`, with the commit it was drawn at.

The renderer is deterministic: two independent draws that agree on a frame have drawn it right, because a
capture race lands on different drawings each run and two races never make the same wrong frame.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

W, H = 1080, 1920
FRAME = W * H * 3
TOLERANCE = 2
# Where a page is scaled every drawing, Chromium paints it at a scale that depends on what it painted before, so
# two sound draws can differ at letter and image edges: measured at up to 708 pixels off by more than 12 code
# values (consent and share, where a fresh page matched the run exactly). A caption word a step behind measured
# 1,113 and more; a hole, 175,000 and more. So up to EDGE_PX such pixels is one answer.
EDGE_PX = 900


def same(a, b):
    d = np.abs(a.astype(np.int16) - b.astype(np.int16)).max(axis=2)
    return int(d.max()) <= TOLERANCE or int((d > 12).sum()) <= EDGE_PX


def read(path, first, lo, hi):
    """Frames lo..hi-1 of a reference whose first frame is `first`, as one array (n, H, W, 3)."""
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{(lo - first) / 30:.6f}", "-i", str(path), "-frames:v", str(hi - lo),
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    n = len(raw) // FRAME
    return np.frombuffer(raw[: n * FRAME], np.uint8).reshape(n, H, W, 3)


def run_range(run):
    log = json.loads((run / "film.json").read_text())
    return log, log["from"], log["to"]


def disagree(run, old, old_first):
    log, lo, hi = run_range(run)
    out = []
    for a in range(lo, hi, 60):
        b = min(hi, a + 60)
        x, y = read(run / "reference.mkv", lo, a, b), read(old, old_first, a, b)
        if len(x) != b - a or len(y) != b - a:
            raise SystemExit(f"frames {a}-{b}: the run holds {len(x)}, the old draw {len(y)}")
        for k in range(b - a):
            if not same(x[k], y[k]):
                out.append(a + k)
    return out


if sys.argv[1] == "pick":
    import random
    run = Path(sys.argv[2])
    share = float(sys.argv[3]) if len(sys.argv) > 3 else 0.05
    log, lo, hi = run_range(run)
    retried = sorted(int(f) for f in log.get("settle", {}).get("retried", {}))
    near = {g for f in retried for g in (f - 1, f, f + 1) if lo <= g < hi}
    rest = [f for f in range(lo, hi) if f not in near]
    sample = set(random.Random(f"reel-3 {lo}-{hi}").sample(rest, round(share * len(rest))))
    picked = sorted(near | sample)
    (run / "disagree.json").write_text(json.dumps(picked) + "\n")
    print(f"{len(picked)} frames to draw again ({len(near)} at or beside the {len(retried)} the check re-captured, "
          f"{len(sample)} sampled): {','.join(map(str, picked))}")
    sys.exit(0)

if sys.argv[1] == "compare":
    run, pngs = Path(sys.argv[2]), Path(sys.argv[3])
    log, lo, hi = run_range(run)
    files = sorted(pngs.glob("frame-*.png"))
    if not files:
        raise SystemExit(f"{pngs} holds no frame-NNNNN.png")
    agree = 0
    for p in files:
        f = int(p.stem.split("-")[1])
        if not lo <= f < hi:
            raise SystemExit(f"{p.name}: frame {f} is not in the run ({lo} to {hi - 1})")
        a = read(run / "reference.mkv", lo, f, f + 1)[0]
        b = np.asarray(Image.open(p).convert("RGB"))
        d = np.abs(a.astype(np.int16) - b.astype(np.int16)).max(axis=2)
        ok = same(a, b)
        agree += ok
        print(f"frame {f}: {'agrees' if ok else 'DIFFERS'} (largest difference {int(d.max())}; "
              f"{int((d > TOLERANCE).sum())} pixels over {TOLERANCE}, {int((d > 12).sum())} over 12)")
    print(f"{agree} of {len(files)} frames from {pngs} agree with {run / 'reference.mkv'}")
    sys.exit(0 if agree == len(files) else 1)


def encode(ref, source, lo, hi, frames):
    """Writes `ref`: the frames of `source` (a reference whose first frame is lo) with `frames` ({f: image}) in place."""
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                            "-r", "30", "-i", "-", "-vf", "format=gbrp", "-c:v", "ffv1", "-level", "3", "-g", "1",
                            "-r", "30", str(ref)], stdin=subprocess.PIPE)
    for a in range(lo, hi, 60):
        b = min(hi, a + 60)
        block = read(source, lo, a, b).copy()
        for f, img in frames.items():
            if a <= f < b:
                block[f - a] = img
        enc.stdin.write(block.tobytes())
    enc.stdin.close()
    if enc.wait() != 0:
        raise SystemExit("ffmpeg failed to write the reference")
    changed = []
    for a in range(lo, hi, 60):
        b = min(hi, a + 60)
        x, y = read(ref, lo, a, b), read(source, lo, a, b)
        if len(x) != b - a:
            raise SystemExit(f"the new reference holds {len(x)} of frames {a} to {b - 1}")
        changed += [a + k for k in range(b - a) if not np.array_equal(x[k], y[k])]
    return changed


if sys.argv[1] == "splice":
    run, (first, last), why = Path(sys.argv[2]), map(int, sys.argv[3].split("-")), sys.argv[4]
    dirs = [Path(p) for p in sys.argv[5:]]
    log, lo, hi = run_range(run)
    if len(dirs) < 2:
        raise SystemExit("a splice needs two draws or more of its frames")
    if not lo <= first <= last < hi:
        raise SystemExit(f"frames {first} to {last} are not all in the run ({lo} to {hi - 1})")
    new = {}
    for f in range(first, last + 1):
        groups = []
        for d in dirs:
            p = d / f"frame-{f:05d}.png"
            if not p.exists():
                raise SystemExit(f"{p} is missing; nothing written")
            img = np.asarray(Image.open(p).convert("RGB"))
            for g in groups:
                if same(g[0], img):
                    g.append(img)
                    break
            else:
                groups.append([img])
        groups.sort(key=len, reverse=True)
        if len(groups[0]) < 2 or (len(groups) > 1 and len(groups[1]) == len(groups[0])):
            raise SystemExit(f"frame {f}: no two draws agree; nothing written")
        new[f] = groups[0][0]
    n = 1
    while (run / f"reference.before-splice-{n}.mkv").exists():
        n += 1
    before = run / f"reference.before-splice-{n}.mkv"
    (run / "reference.mkv").rename(before)
    changed = encode(run / "reference.mkv", before, lo, hi, new)
    if any(not first <= f <= last for f in changed):
        raise SystemExit(f"the new reference differs from the one before outside {first} to {last}: {changed}")
    commit = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True,
                            cwd=Path(__file__).parent).stdout.strip()
    log.setdefault("spliced", []).append({"frames": [first, last], "why": why, "commit": commit,
                                          "draws": [str(d) for d in dirs], "changed": len(changed),
                                          "kept": before.name})
    (run / "film.json").write_text(json.dumps(log, indent=1) + "\n")
    print(f"frames {first} to {last} spliced in, each the answer two or more of {len(dirs)} draws gave ({len(changed)} "
          f"differ from the run's); the run before kept as {before.name}")
    sys.exit(0)

cmd, run, old, old_first = sys.argv[1], Path(sys.argv[2]), sys.argv[3], int(sys.argv[4])
old = None if old == "-" else Path(old)
if cmd == "diff":
    frames = disagree(run, old, old_first)
    (run / "disagree.json").write_text(json.dumps(frames) + "\n")
    print(f"{len(frames)} frames disagree: {','.join(map(str, frames))}")
    sys.exit(0)

extras = [Path(p) for p in sys.argv[5:]]
log, lo, hi = run_range(run)
frames = json.loads((run / "disagree.json").read_text())
kept_ref = run / "reference.unverified.mkv"
mine_ref = kept_ref if kept_ref.exists() else run / "reference.mkv"
keep, replace, unresolved, votes = [], {}, [], {}
for f in frames:
    draws = [("run", read(mine_ref, lo, f, f + 1)[0])]
    if old is not None:
        draws.append(("old", read(old, old_first, f, f + 1)[0]))
    draws += [(str(d / f"frame-{f:05d}.png"), np.asarray(Image.open(d / f"frame-{f:05d}.png").convert("RGB")))
              for d in extras if (d / f"frame-{f:05d}.png").exists()]
    groups = []
    for name, img in draws:
        for g in groups:
            if same(g[0][1], img):
                g.append((name, img))
                break
        else:
            groups.append([(name, img)])
    groups.sort(key=len, reverse=True)
    votes[f] = [[name for name, _ in g] for g in groups]
    if len(groups[0]) < 2 or (len(groups) > 1 and len(groups[1]) == len(groups[0])):
        unresolved.append(f)
    elif any(name == "run" for name, _ in groups[0]):
        keep.append(f)
    else:
        replace[f] = groups[0][0][1]
print(f"{len(frames)} disagreeing frames: the run stands on {len(keep)}, is replaced on {len(replace)} "
      f"{sorted(replace)}, unresolved {len(unresolved)}: {unresolved}")
if replace:
    ref = run / "reference.mkv"
    if not kept_ref.exists():
        ref.rename(kept_ref)
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                            "-r", "30", "-i", "-", "-vf", "format=gbrp", "-c:v", "ffv1", "-level", "3", "-g", "1",
                            "-r", "30", str(ref)], stdin=subprocess.PIPE)
    for a in range(lo, hi, 60):
        b = min(hi, a + 60)
        block = read(kept_ref, lo, a, b).copy()
        for f, img in replace.items():
            if a <= f < b:
                block[f - a] = img
        enc.stdin.write(block.tobytes())
    enc.stdin.close()
    if enc.wait() != 0:
        raise SystemExit("ffmpeg failed to write the corrected reference")
    changed = []
    for a in range(lo, hi, 60):
        b = min(hi, a + 60)
        x, y = read(ref, lo, a, b), read(kept_ref, lo, a, b)
        changed += [a + k for k in range(b - a) if not np.array_equal(x[k], y[k])]
    if sorted(changed) != sorted(replace):
        raise SystemExit(f"the corrected reference differs from the first on {changed}, not just {sorted(replace)}")
log["verified"] = {"against": str(old) if old else "draws again of the picked frames", "tolerance": TOLERANCE, "edge_px": EDGE_PX, "disagreed": frames, "run_stands": keep,
                   "replaced_by_agreement": sorted(replace), "unresolved": unresolved,
                   "votes": {str(f): v for f, v in votes.items()}}
(run / "film.json").write_text(json.dumps(log, indent=1) + "\n")
print("recorded in film.json")
