// Draws Reel 1's animatic (system edition, BRIEF.md, review gate 2): the 29 shots as timed stills on the
// voiceover, with the captions. Each shot shows its style frame or its animatic still (frames.cjs) from the
// beat it starts on, and each caption shows from its start to its end (spec.json), set as the reel sets it.
// The times are the brief's (brief.json, from the voiceover's measured words), each rounded to a whole frame
// at 30 fps, and the film is encoded frame by frame, so picture and sound cannot drift. A still is drawn once
// for each caption it carries.
// Run: node scripts/aurixa-reel-1/animatic.cjs <outDir> <assetsDir> <voiceover.wav>
// It writes animatic.mp4, its stills, animatic.json (every segment) and shots.png (each shot's first still).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { FRAMES, STILLS, CAPTIONS, drawAll } = require("./frames.cjs");

const OUT = path.resolve(process.argv[2] || "reel-1-animatic");
const VOICEOVER = process.argv[4] ? path.resolve(process.argv[4]) : null;
const FPS = 30;
const BRIEF = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../../docs/brands/aurixa-reel-1/system-edition/brief.json"),
    "utf8",
  ),
);
const SHOTS = BRIEF.shots;
const END = BRIEF.voiceover.seconds;
const frameOf = (t) => Math.round(t * FPS);
const clock = (f) => {
  const t = f / FPS;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(3).padStart(6, "0")}`;
};

/** Every still the film shows, from the beat of its shot it starts on. */
function pictures() {
  const all = [...Object.entries(FRAMES), ...Object.entries(STILLS)].map(([id, still]) => {
    const shot = SHOTS.find((s) => s.id === still.shot);
    if (!shot) throw new Error(`${id}: the brief has no shot ${still.shot}`);
    const beat = shot.beats[still.beat ?? 0];
    if (!beat) throw new Error(`${id}: shot ${shot.id} has no beat ${still.beat}`);
    return { id, still, shot: shot.id, from: frameOf(beat.at) };
  });
  for (const shot of SHOTS) {
    const own = all.filter((p) => p.shot === shot.id).sort((a, b) => a.from - b.from);
    if (!own.length) throw new Error(`Shot ${shot.id} has no still`);
    if (own[0].from !== frameOf(shot.in))
      throw new Error(`Shot ${shot.id} starts at ${shot.in}, its first still later`);
    if (new Set(own.map((p) => p.from)).size !== own.length)
      throw new Error(`Shot ${shot.id} has two stills on one beat`);
  }
  return all.sort((a, b) => a.from - b.from);
}

/** The film cut where a still or a caption starts or ends, each run of frames with one still and one caption. */
function segments(all) {
  const last = frameOf(END);
  const cuts = new Set([0, last]);
  for (const p of all) cuts.add(p.from);
  for (const c of CAPTIONS) {
    cuts.add(frameOf(c.start));
    cuts.add(frameOf(c.end));
  }
  const edges = [...cuts].filter((f) => f >= 0 && f <= last).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const [from, to] = [edges[i], edges[i + 1]];
    const picture = all.filter((p) => p.from <= from).at(-1);
    const cue =
      picture.still.caption === false
        ? null
        : CAPTIONS.find((c) => frameOf(c.start) <= from && from < frameOf(c.end));
    const caption = cue ? cue.text : "";
    const prev = out.at(-1);
    if (prev && prev.picture === picture.id && prev.caption === caption) prev.to = to;
    else out.push({ from, to, shot: picture.shot, picture: picture.id, caption });
  }
  return out;
}

/** One picture of the film: each shot's first still, with its shot, times and title. */
async function shotSheet(all, stillFiles, file) {
  let pw;
  try {
    pw = require("playwright");
  } catch {
    pw = require("/opt/node-tools/node_modules/playwright");
  }
  const cells = SHOTS.map((shot) => {
    const first = all.find((p) => p.shot === shot.id);
    const img = fs.readFileSync(stillFiles.get(first.id)).toString("base64");
    return `<figure><img src="data:image/png;base64,${img}"><figcaption><b>${shot.id}</b> ${shot.in.toFixed(3)} to ${shot.out.toFixed(3)} s<br>${shot.title}</figcaption></figure>`;
  }).join("");
  const browser = await pw.chromium.launch(
    fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
      ? { executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" }
      : {},
  );
  const page = await browser.newPage({ viewport: { width: 2000, height: 1000 } });
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>
      body { margin:0; padding:20px; background:#12141c; font:15px/1.35 Inter, sans-serif; color:#d6d6de; }
      main { display:grid; grid-template-columns:repeat(8, 1fr); gap:16px; }
      figure { margin:0; } img { width:100%; display:block; border-radius:6px; }
      figcaption { margin-top:6px; } b { color:#e6c06a; }
    </style><main>${cells}</main>`,
  );
  await page.screenshot({ path: file, fullPage: true });
  await browser.close();
}

(async () => {
  const all = pictures();
  const segs = segments(all);
  const stillsDir = path.join(OUT, "stills");
  fs.mkdirSync(stillsDir, { recursive: true });

  // Each still once for each caption it carries.
  const files = new Map();
  const jobs = [];
  for (const seg of segs) {
    const key = `${seg.picture}\u0000${seg.caption}`;
    if (!files.has(key)) {
      const n = [...files.keys()].filter((k) => k.startsWith(`${seg.picture}\u0000`)).length;
      const file = path.join(stillsDir, `${seg.picture}-${n}.png`);
      files.set(key, file);
      jobs.push({ still: all.find((p) => p.id === seg.picture).still, caption: seg.caption, file });
    }
    seg.file = path.relative(OUT, files.get(key));
  }
  await drawAll(jobs);

  // Frame by frame: a link to its still for every frame of the film, encoded at 30 fps with the voiceover.
  const seq = path.join(OUT, "sequence");
  fs.rmSync(seq, { recursive: true, force: true });
  fs.mkdirSync(seq);
  for (const seg of segs)
    for (let f = seg.from; f < seg.to; f++)
      fs.symlinkSync(path.join(OUT, seg.file), path.join(seq, `${String(f).padStart(5, "0")}.png`));
  const film = path.join(OUT, "animatic.mp4");
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-framerate",
      String(FPS),
      "-i",
      path.join(seq, "%05d.png"),
      ...(VOICEOVER ? ["-i", VOICEOVER] : []),
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(FPS),
      ...(VOICEOVER ? ["-c:a", "aac", "-b:a", "192k"] : []),
      "-movflags",
      "+faststart",
      film,
    ],
    { stdio: "inherit" },
  );
  fs.rmSync(seq, { recursive: true, force: true });

  const firsts = new Map(
    all.map((p) => [p.id, files.get([...files.keys()].find((k) => k.startsWith(`${p.id}\u0000`)))]),
  );
  await shotSheet(all, firsts, path.join(OUT, "shots.png"));
  fs.writeFileSync(
    path.join(OUT, "animatic.json"),
    `${JSON.stringify(
      {
        fps: FPS,
        frames: frameOf(END),
        voiceover: BRIEF.voiceover.asset_id,
        segments: segs.map((s) => ({ ...s, at: `${clock(s.from)} to ${clock(s.to)}` })),
      },
      null,
      1,
    )}\n`,
  );
  console.log(
    `${segs.length} segments, ${jobs.length} stills, ${frameOf(END)} frames (${END} s) → ${film}`,
  );
})();
