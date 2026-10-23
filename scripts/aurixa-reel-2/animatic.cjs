// Draws Reel 2's animatic (PLAN.md §9, Gate 2): the film as timed stills on the voiceover, with the captions. It is
// Reel 1's (../aurixa-reel-1/animatic.cjs) with one difference: Reel 1 drew its stills as separate pictures
// (frames.cjs), while Reel 2's are frames of the film itself, drawn by its scenes (./render.cjs), so the animatic
// cannot show anything the film will not. The film is cut wherever a beat of the brief falls or a caption starts or
// ends, at whole frames of 30 fps; each run of frames between two cuts holds one still, the scene drawn eight tenths
// of the way through the run (the beat's move made, the caption's words spoken by then). It is encoded frame by
// frame with the voiceover, so picture and sound cannot drift.
// Run: node scripts/aurixa-reel-2/animatic.cjs <outDir> <assetsDir> <voiceover>
// It writes animatic.mp4, its stills, animatic.json (every run) and shots.png (each shot's first still).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const M = require("./motion.cjs");

const { F, BRIEF, FPS, frameOf } = M;
const OUT = path.resolve(process.argv[2] || "reel-2-animatic");
const ASSETS = path.resolve(process.argv[3] || "assets");
const VOICEOVER = process.argv[4] ? path.resolve(process.argv[4]) : null;
const SHOTS = BRIEF.shots;
const LAST = frameOf(SHOTS.at(-1).out);
const clock = (f) => {
  const t = f / FPS;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(3).padStart(6, "0")}`;
};

/** The runs of frames between cuts: every shot's start, every beat, every caption's start and end. */
function runs() {
  const cuts = new Set([0, LAST]);
  for (const shot of SHOTS) {
    cuts.add(frameOf(shot.in));
    for (const b of shot.beats) cuts.add(frameOf(b.at));
  }
  for (const c of BRIEF.captions) {
    cuts.add(frameOf(c.start));
    cuts.add(frameOf(c.end));
  }
  const edges = [...cuts].filter((f) => f >= 0 && f <= LAST).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const [from, to] = [edges[i], edges[i + 1]];
    const shot = SHOTS.filter((s) => frameOf(s.in) <= from).at(-1);
    const cue = BRIEF.captions.find((c) => frameOf(c.start) <= from && from < frameOf(c.end));
    const at = Math.min(to - 1, from + Math.max(0, Math.round((to - from) * 0.8) - 1));
    out.push({ from, to, shot: shot.id, caption: cue ? cue.text : "", at });
  }
  return out;
}

/** One picture of the film: each shot's first still, with its shot, times and title. */
async function shotSheet(firsts, file) {
  const { chromium } = F.playwright();
  const cells = SHOTS.map((shot) => {
    const img = fs.readFileSync(firsts.get(shot.id)).toString("base64");
    return `<figure><img src="data:image/png;base64,${img}"><figcaption><b>${shot.id}</b> ${shot.in.toFixed(3)} to ${shot.out.toFixed(3)} s<br>${shot.title}</figcaption></figure>`;
  }).join("");
  const browser = await chromium.launch(
    fs.existsSync(F.CHROMIUM) ? { executablePath: F.CHROMIUM } : {},
  );
  const page = await browser.newPage({ viewport: { width: 2000, height: 1000 } });
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>
      body { margin:0; padding:20px; background:#12141c; font:15px/1.35 Inter, sans-serif; color:#d6d6de; }
      main { display:grid; grid-template-columns:repeat(7, 1fr); gap:16px; }
      figure { margin:0; } img { width:100%; display:block; border-radius:6px; }
      figcaption { margin-top:6px; } b { color:#e6c06a; }
    </style><main>${cells}</main>`,
  );
  await page.screenshot({ path: file, fullPage: true });
  await browser.close();
}

(async () => {
  const segs = runs();
  const stills = path.join(OUT, "stills");
  fs.mkdirSync(stills, { recursive: true });
  // The stills, drawn by the film's own renderer (a still needs no motion blur).
  const frames = [...new Set(segs.map((s) => s.at))];
  execFileSync(
    "node",
    [path.join(__dirname, "render.cjs"), stills, ASSETS, "none", SHOTS[0].id, SHOTS.at(-1).id],
    {
      stdio: ["ignore", "ignore", "inherit"],
      env: { ...process.env, RENDER_FRAMES: frames.join(","), RENDER_SUBFRAMES: "1" },
    },
  );
  const still = (f) => path.join(stills, `frame-${String(f).padStart(5, "0")}.png`);
  for (const seg of segs) {
    if (!fs.existsSync(still(seg.at))) throw new Error(`No still drawn for frame ${seg.at}`);
    seg.file = path.relative(OUT, still(seg.at));
  }

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
      "-colorspace",
      "bt709",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
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
    SHOTS.map((shot) => [shot.id, path.join(OUT, segs.find((s) => s.shot === shot.id).file)]),
  );
  await shotSheet(firsts, path.join(OUT, "shots.png"));
  fs.writeFileSync(
    path.join(OUT, "animatic.json"),
    `${JSON.stringify(
      {
        fps: FPS,
        frames: LAST,
        seconds: LAST / FPS,
        voiceover: VOICEOVER ? path.basename(VOICEOVER) : null,
        segments: segs.map((s) => ({ ...s, time: `${clock(s.from)} to ${clock(s.to)}` })),
      },
      null,
      1,
    )}\n`,
  );
  console.log(`${segs.length} runs, ${frames.length} stills, ${LAST} frames → ${film}`);
})();
