// We Are Here's words at any instant, from the time alone (type.py's page). window.setT(t) shows t and resolves once
// it is drawn. Each word rises into place as it is heard (As One's motion: up a fifth of its height, out of a blur,
// in a quarter of a second); each line goes as the next is about to be heard; the cyan phrase's hairline draws under
// it as its last word is spoken. The shade behind the words comes and goes with them. The five tiers' names ride on
// their rings (type/labels.json, from comp.py): each comes in on its word, its letters settling, and all five go as
// "Powerful on their own" begins.
"use strict";
(() => {
  const D = window.DATA;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lin = (t, a, b) => clamp((t - a) / (b - a));
  const smooth = (x) => x * x * (3 - 2 * x);
  const ss = (t, a, b) => smooth(lin(t, a, b));
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  const LINES = Object.fromEntries(D.cues.lines.map((l) => [l.key, l]));
  const wt = (key, i) => LINES[key].words[i].start;
  const DROP = D.cues.drop;
  const T = {
    at: wt("s3", 0), names: [0, 1, 2, 3, 4].map((i) => wt("s4", i)), powerful: wt("s5", 0), when: wt("s7", 0),
    grid: wt("s7", 8), so: wt("s8", 0), ask: wt("s9", 0), aurixa: wt("s10", 0),
  };
  // When each block goes (it fades over 0.28 s from then); b5 is cut by the drop. b7a and b7b are gone before b7c's
  // first word, which is set between them.
  const GO = {
    b1: wt("s2", 0) - 0.3, b2a: wt("s2", 6) - 0.12, b2b: wt("s2", 12) - 0.12, b2c: T.at - 0.15,
    b3: T.names[0] - 0.25, b5: D.dropFrame, b6: T.when - 0.25,
    b7a: T.grid - 0.34, b7b: T.grid - 0.34, b7c: T.so - 0.3,
    b8: T.ask - 0.2, b9: T.aurixa - 0.1, b11: 99,
  };

  const el = (id) => document.getElementById(id);
  function words(t) {
    let shade = 0;
    for (const [id, b] of Object.entries(D.blocks)) {
      const div = el(id);
      const first = b.words[0].start;
      const end = GO[id];
      const out = id === "b5" ? (t >= end ? 1 : 0) : lin(t, end, end + 0.28);
      const vis = t >= first - 0.12 && out < 1;
      div.style.visibility = vis ? "visible" : "hidden";
      if (!vis) continue;
      div.style.opacity = String(1 - out);
      b.words.forEach((w, i) => {
        const s = el(`${id}-w${i}`);
        const f = easeOut(lin(t, w.start - 0.06, w.start + 0.24));
        s.style.opacity = String(f);
        s.style.transform = `translateY(${(1 - f) * 0.22}em)`;
        s.style.filter = f < 1 ? `blur(${(1 - f) * 6}px)` : "none";
      });
      const ul = el(`${id}-ul`);
      if (ul) {
        const last = b.words[b.words.length - 1];
        ul.style.transform = `scaleX(${easeInOut(lin(t, last.start, last.end + 0.35))})`;
      }
      // The shade: full under the lines, lighter under the end card's (the dawn shows through).
      shade = Math.max(shade, (id === "b11" ? 0.55 : 1) * (1 - out) * ss(t, first - 0.25, first + 0.15));
    }
    el("shade").style.opacity = String(shade);
  }

  function tiers(t) {
    const Lb = D.labels;
    const f = t * Lb.fps;
    const n0 = Math.floor(f);
    const u = f - n0;
    const a = Lb.frames[String(n0)];
    const b = Lb.frames[String(n0 + 1)] || a;
    for (let i = 0; i < Lb.names.length; i++) {
      const div = el(`tier${i}`);
      if (!a) {
        div.style.opacity = "0";
        continue;
      }
      const p = a[i], q = b[i];
      const x = p[0] + (q[0] - p[0]) * u, y = p[1] + (q[1] - p[1]) * u, k = p[2] + (q[2] - p[2]) * u;
      div.style.opacity = String(k);
      div.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
      // the letters settle as the name comes in
      const said = T.names[i];
      const s = easeOut(lin(t, said - 0.06, said + 0.45));
      el(`tier${i}-name`).style.letterSpacing = `${0.3 + 0.16 * (1 - s)}em`;
    }
  }

  window.setT = async (t) => {
    await document.fonts.ready;
    words(t);
    tiers(t);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return true;
  };
})();
