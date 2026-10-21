"""SQL that loads Reel 1 into the studio's Storyboards from spec.json: one storyboard, a scene per
edit block, a shot per source shot with its spec (frames, clip, plates, timing) on the shot.
Nothing is generated. Run the output in one transaction; delete the storyboard to undo.

python3 scripts/aurixa-reel-1/storyboard_sql.py docs/brands/aurixa-reel-1/spec.json <user id> > load.sql
python3 scripts/aurixa-reel-1/storyboard_sql.py docs/brands/aurixa-reel-1/spec.json --update <storyboard id> > update.sql

--update rewrites each shot's description, prompt and spec in a storyboard already loaded, from the spec as it is now.
With --live <file>, a JSON of the live rows' md5s ({shot: {"d": description, "p": prompt, "s": spec::text}}), it writes
only the fields that differ.
"""
import hashlib, json, sys

spec = json.load(open(sys.argv[1]))
update = sys.argv[2] == "--update"
user = None if update else sys.argv[2]
board_id = sys.argv[3] if update else None
live = json.load(open(sys.argv[sys.argv.index("--live") + 1])) if "--live" in sys.argv else None


def jsonb_text(value):
    """A value as Postgres prints a jsonb: object keys by length then bytes, ", " and ": " between items."""
    if isinstance(value, dict):
        items = sorted(value.items(), key=lambda kv: (len(kv[0].encode()), kv[0].encode()))
        return "{" + ", ".join(f"{json.dumps(k, ensure_ascii=False)}: {jsonb_text(v)}" for k, v in items) + "}"
    if isinstance(value, list):
        return "[" + ", ".join(jsonb_text(v) for v in value) + "]"
    return json.dumps(value, ensure_ascii=False)


md5 = lambda text: hashlib.md5(text.encode()).hexdigest()
st = {s["stage"]: s for s in spec["stages"]}
frames = {f["key"]: f for f in st[4]["items"]}
clips = {c["key"]: c for c in st[5]["items"]}
plates = {p["key"]: p for p in st[3]["items"]}


def q(text):
    """A dollar-quoted literal that can't be closed by its contents."""
    tag = "rl"
    while f"${tag}$" in text:
        tag += "x"
    return f"${tag}${text}${tag}$"


def ts(t):
    m, s = divmod(t, 60)
    return f"{int(m):02d}:{s:06.3f}"


lines = ["BEGIN;", "WITH board AS (", "  INSERT INTO public.storyboards (title, objective, creative_direction, target_duration_seconds, primary_aspect_ratio, status, created_by)"]
direction = {
    "spec": "docs/brands/aurixa-reel-1/spec.json",
    "voiceover_asset_id": spec["voiceover"]["asset_id"],
    "stills": "GPT Image 2.5 Sunburst (Marketing Studio 2.5 Sunburst), 2K, high",
    "clips": "first and last frame to video, silent, 1080p: Seedance 2.5 or Kling 3.0 Pro after the 01A/04B test",
    "brand_kit": "not passed to generations; the pack's own direction is in every prompt",
}
lines.append(
    f"  VALUES ({q(spec['title'])}, {q('Show how Aurixa Systems connects the work around one property opportunity while keeping professional judgement visible, then invite viewers to start a 14-day free trial.')}, "
    f"{q(json.dumps(direction))}::jsonb, 106, '9:16', 'draft', '{user}') RETURNING id"
)
lines.append(")")
scene_ctes = []
for n, block in enumerate(spec["timing"]["blocks"], 1):
    env = sorted({s["set"] for s in spec["shots"] if s["block"] == block["block"] and s.get("set")})
    scene_ctes.append(
        f", scene{n} AS (INSERT INTO public.scenes (storyboard_id, scene_number, name, purpose, environment, continuity_requirements) "
        f"SELECT id, {n}, {q(f'Block {block['block']} · ' + block['title'])}, {q(block['purpose'] + f' ({ts(block['in'])} to {ts(block['out'])}, {block['seconds']:.2f} s)')}, "
        f"{q(', '.join(env) or 'Closing card')}, {q('See each shot: its first frame is built from the approved frame before it.')} FROM board RETURNING id)"
    )
lines += scene_ctes
block_no = {b["block"]: n for n, b in enumerate(spec["timing"]["blocks"], 1)}
shot_rows = []
for i, shot in enumerate(spec["shots"], 1):
    clip = clips.get(shot["source"])
    e = shot["edit"]
    if clip:
        about = (f"{ts(e['in'])} to {ts(e['out'])} ({e['seconds']:.2f} s in the edit). Clip {clip['key']}: {clip['seconds']} s from "
                 f"{clip['first_frame']}" + (f" to {clip['last_frame']}" if clip["last_frame"] else "") + f". {shot['handoff']}")
        prompt = clip["prompt"]
        # The frames by key and inputs; their prompts are in spec.json, which the storyboard names.
        # The clip's prompt is the shot's prompt; the handoff is in its description.
        record = {**{k: v for k, v in shot.items() if k != "handoff"},
                  "clip": {k: v for k, v in clip.items() if k != "prompt"},
                  "frames": [{"key": k, "inputs": frames[k]["inputs"], **({"screen": frames[k]["screen"]} if frames[k].get("screen") else {})}
                             for k in (clip["first_frame"], clip["last_frame"]) if k in frames]}
    else:
        about = f"{ts(e['in'])} to {ts(e['out'])} ({e['seconds']:.2f} s in the edit). {shot['handoff']}"
        prompt = f"Cut from the {shot['source'].split()[-2]} clip at the narration boundary."
        record = {k: v for k, v in shot.items() if k != "handoff"}
    if update:
        was = (live or {}).get(shot["shot"], {})
        sets = [f"{col} = {value}" for col, value, digest, key in (
            ("description", q(about), md5(about), "d"), ("prompt", q(prompt), md5(prompt), "p"),
            ("spec", f"{q(json.dumps(record, ensure_ascii=False))}::jsonb", md5(jsonb_text(record)), "s"),
        ) if live is None or was.get(key) != digest]
        if sets:
            shot_rows.append(
                f"UPDATE public.shots s SET {', '.join(sets)}, updated_at = now() "
                f"FROM public.scenes sc WHERE s.scene_id = sc.id AND sc.storyboard_id = '{board_id}' AND s.spec->>'shot' = '{shot['shot']}';"
            )
        continue
    cast = ", ".join(c.title() for c in shot["cast"]) or "no cast"
    name = f"{shot['shot']} · {cast}" + (f" · {shot['set']}" if shot.get("set") else "")
    shot_rows.append(
        f"SELECT id, {ord(shot['shot'][2]) - 64}, {q(name)}, {q(about)}, {q(prompt)}, {q(json.dumps(record, ensure_ascii=False))}::jsonb, "
        f"{e['seconds']}, 'image-to-video' FROM scene{block_no[shot['block']]}"
    )
if update:
    print("\n".join(["BEGIN;", *shot_rows, "COMMIT;"]))
    sys.exit()
lines.append("INSERT INTO public.shots (scene_id, shot_number, name, description, prompt, spec, duration_seconds, operation_type)")
lines.append("\nUNION ALL\n".join(shot_rows) + ";")
lines.append("COMMIT;")
print("\n".join(lines))
