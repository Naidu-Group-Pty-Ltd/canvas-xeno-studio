// We Are Here's words at any instant, from the time alone (type.py's page). window.setT(t) shows t and resolves once
// it is drawn. Each word rises into place as it is heard (As One's motion: up a fifth of its height, out of a blur,
// in a quarter of a second); each line goes as the next is about to be heard; the cyan phrase's hairline draws under
// it as its last word is spoken. The shade behind the words comes and goes with them. The five tiers' boxes come in
// on their words, each showing in motion what it does, joined by lines of light to their rings (type/labels.json,
// from comp.py) and to the boxes beside them, pulses running the lines; on "Powerful on their own" the lines let go
// and the boxes drift apart and are gone.
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

  // ---- the five tiers' boxes, the lines of light between them and their rings, and the pulses that run them
  const B = D.boxes;
  const easeBack = (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
  const frac = (x) => x - Math.floor(x);
  const at = (frames, n0, u, i) => {
    const a = frames[String(n0)];
    const b = frames[String(n0 + 1)] || a;
    if (!a) return null;
    return a[i].map((v, k) => (typeof v === "number" ? v + (b[i][k] - v) * u : v));
  };
  const boxAt = (i, t) => at(B.frames, Math.floor(t * D.fps), t * D.fps - Math.floor(t * D.fps), i);
  const anchorAt = (i, t) => at(D.labels.frames, Math.floor(t * D.fps), t * D.fps - Math.floor(t * D.fps), i);
  // where a line leaves a box toward (tx, ty): the nearest point of its rect, kept off its rounded corners
  const edgeOf = (st, tx, ty) => {
    const hw = (B.w / 2) * st[2] - 18, hh = (B.h / 2) * st[2] - 18;
    return [Math.min(st[0] + hw, Math.max(st[0] - hw, tx)), Math.min(st[1] + hh, Math.max(st[1] - hh, ty))];
  };
  const setLine = (id, x0, y0, x1, y1, p, o) => {
    const e = el(id);
    if (p <= 0 || o <= 0.002) {
      e.setAttribute("opacity", "0");
      return;
    }
    e.setAttribute("d", `M${x0.toFixed(1)} ${y0.toFixed(1)}L${(x0 + (x1 - x0) * p).toFixed(1)} ${(y0 + (y1 - y0) * p).toFixed(1)}`);
    e.setAttribute("opacity", o.toFixed(3));
  };
  const lenOf = {};
  const pathLen = (id) => (lenOf[id] ??= el(id).getTotalLength());
  const grow = (id, yb, g) => el(id).setAttribute("transform", `translate(0 ${yb}) scale(1 ${Math.max(g, 0.001)}) translate(0 ${-yb})`);
  const pop = (id, x, y, ox, oy, s) =>
    el(id).setAttribute("transform", `translate(${x} ${y}) translate(${ox} ${oy}) scale(${Math.max(s, 0.001)}) translate(${-ox} ${-oy})`);

  function visuals(i, u, t) {
    if (i === 0) {
      // research: the sweep goes round, and what it finds lights as it passes and fades behind it
      const sweep = u * 250 - 50;
      el("b0-sweep").setAttribute("transform", `rotate(${sweep.toFixed(2)})`);
      D.blips.forEach(([r, a], k) => {
        const behind = sweep - a;
        const lit = behind < 0 ? 0 : Math.exp(-((((behind % 360) + 360) % 360) / 80));
        const g = el(`b0-blip${k}`);
        const rad = (a * Math.PI) / 180;
        g.setAttribute("transform", `translate(${(r * Math.cos(rad)).toFixed(1)} ${(r * Math.sin(rad)).toFixed(1)})`);
        g.setAttribute("opacity", (0.25 * (behind >= 0) + 0.75 * lit).toFixed(3));
        el(`b0-blipr${k}`).setAttribute("r", (3.5 + 11 * (1 - lit)).toFixed(2));
        el(`b0-blipr${k}`).setAttribute("opacity", (0.8 * lit).toFixed(3));
      });
    } else if (i === 1) {
      // clients: the constellation joins up, one by one, and turns slowly about the one at its heart
      el("b1-rot").setAttribute("transform", `rotate(${(u * 7).toFixed(2)})`);
      D.nodes.forEach(([x, y], k) => {
        const t0 = 0.06 + 0.075 * k;
        const L = pathLen(`b1-l${k}`);
        const l = el(`b1-l${k}`);
        l.setAttribute("stroke-dasharray", L.toFixed(1));
        l.setAttribute("stroke-dashoffset", (L * (1 - easeOut(lin(u, t0, t0 + 0.28)))).toFixed(1));
        const n = easeBack(lin(u, t0 + 0.2, t0 + 0.42));
        pop(`b1-n${k}`, x, y, 0, 0, n);
        el(`b1-n${k}`).setAttribute("opacity", lin(u, t0 + 0.2, t0 + 0.3).toFixed(3));
        el(`b1-s${k}`).setAttribute("opacity", (0.9 * lin(u, 0.65 + 0.04 * k, 0.85 + 0.04 * k)).toFixed(3));
        const f = frac(u * 0.9 + k * 0.17);
        const q = el(`b1-p${k}`);
        q.setAttribute("cx", (x * f).toFixed(1));
        q.setAttribute("cy", (y * f).toFixed(1));
        q.setAttribute("opacity", (lin(u, t0 + 0.4, t0 + 0.5) * Math.sin(Math.PI * f)).toFixed(3));
      });
      el("b1-c").setAttribute("transform", `scale(${(1 + 0.05 * Math.sin(u * 5)).toFixed(3)})`);
    } else if (i === 2) {
      // reports: the pages gather, the front one fills with its lines and its chart, and it is done
      const e2 = easeOut(lin(u, 0.04, 0.3)), e1 = easeOut(lin(u, 0.1, 0.36)), e0 = easeOut(lin(u, 0.16, 0.42));
      el("b2-p2").setAttribute("opacity", (0.7 * e2).toFixed(3));
      el("b2-p2").setAttribute("transform", `translate(${-16} ${(6 + 16 * (1 - e2)).toFixed(1)}) rotate(-9 44 58)`);
      el("b2-p1").setAttribute("opacity", (0.85 * e1).toFixed(3));
      el("b2-p1").setAttribute("transform", `translate(${-7} ${(3 + 16 * (1 - e1)).toFixed(1)}) rotate(-4 44 58)`);
      el("b2-front").setAttribute("opacity", e0.toFixed(3));
      el("b2-front").setAttribute("transform", `translate(0 ${(16 * (1 - e0)).toFixed(1)})`);
      for (let k = 0; k < 4; k++) {
        const g = easeOut(lin(u, 0.36 + 0.07 * k, 0.58 + 0.07 * k));
        el(`b2-t${k}`).setAttribute("transform", `translate(11 0) scale(${Math.max(g, 0.001)} 1) translate(-11 0)`);
      }
      for (let k = 0; k < 5; k++) grow(`b2-c${k}`, 106, easeOut(lin(u, 0.5 + 0.06 * k, 0.75 + 0.06 * k)));
      el("b2-ring").setAttribute("stroke-dashoffset", (169.6 * (1 - easeOut(lin(u, 0.42, 0.92)))).toFixed(1));
      el("b2-check").setAttribute("stroke-dashoffset", (34 * (1 - easeOut(lin(u, 0.86, 1.08)))).toFixed(1));
    } else if (i === 3) {
      // finance: the bars rise, and the line of growth draws over them, its head alight
      for (let k = 0; k < 8; k++) grow(`b3-bar${k}`, 136, easeOut(lin(u, 0.04 + 0.05 * k, 0.32 + 0.05 * k)));
      const L = pathLen("b3-line");
      const g = easeInOut(lin(u, 0.08, 0.82));
      const line = el("b3-line");
      line.setAttribute("stroke-dasharray", L.toFixed(1));
      line.setAttribute("stroke-dashoffset", (L * (1 - g)).toFixed(1));
      const pt = line.getPointAtLength(L * g);
      el("b3-head").setAttribute("transform", `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
      el("b3-head").setAttribute("opacity", (g > 0 ? 1 : 0).toString());
      el("b3-area").setAttribute("opacity", (0.95 * g).toFixed(3));
      el("b3-gauge").setAttribute("stroke-dashoffset", (106.8 * (1 - 0.78 * easeOut(lin(u, 0.3, 0.9)))).toFixed(1));
    } else {
      // communication: a message in, the reply being written, the reply out, and the next in
      const bub = [[6, 6, 150, 36, false, 0.02], [100, 56, 156, 36, true, 0.44], [6, 106, 124, 34, false, 0.68]];
      bub.forEach(([x, y, w, h, mine, t0], k) => {
        pop(`b4-m${k}`, x, y, mine ? w : 0, h, easeBack(lin(u, t0, t0 + 0.24)));
        el(`b4-m${k}`).setAttribute("opacity", lin(u, t0, t0 + 0.1).toFixed(3));
      });
      el("b4-typing").setAttribute("opacity", (lin(u, 0.18, 0.26) * (1 - lin(u, 0.4, 0.46))).toFixed(3));
      for (let k = 0; k < 3; k++)
        el(`b4-d${k}`).setAttribute("cy", (12 - 4 * Math.max(0, Math.sin(u * 14 - k * 0.9))).toFixed(2));
    }
  }

  function boxes(t) {
    const S = B.start;
    // the lines let go a little before the boxes drift apart, each on its own
    const hold = 1 - ss(t, B.out - 0.32, B.out - 0.06);
    const st = [0, 1, 2, 3, 4].map((i) => boxAt(i, t));
    for (let i = 0; i < 5; i++) {
      const div = el(`box${i}`);
      const s = st[i];
      if (!s || s[3] <= 0.002) {
        div.style.opacity = "0";
        div.style.visibility = "hidden";
        continue;
      }
      div.style.visibility = "visible";
      div.style.opacity = s[3].toFixed(3);
      div.style.transform = `translate(${(s[0] - B.w / 2).toFixed(2)}px, ${(s[1] - B.h / 2).toFixed(2)}px) scale(${s[2].toFixed(4)})`;
      const enter = lin(t, S[i] - 0.06, S[i] + 0.3);
      div.style.filter = enter < 1 ? `blur(${((1 - enter) * 7).toFixed(2)}px)` : "none";
      const u = t - S[i];
      el(`box${i}-rule`).style.transform = `scaleX(${easeOut(lin(u, 0.04, 0.42)).toFixed(3)})`;
      el(`box${i}-live`).style.opacity = (0.55 + 0.45 * Math.sin(t * 6.3 + i * 1.3)).toFixed(3);
      visuals(i, u, t);
    }
    // the lines: each box to its own ring, and to the boxes beside it as both are there
    const lines = [];
    for (let i = 0; i < 5; i++) {
      const s = st[i];
      const an = anchorAt(i, t);
      if (!s || !an) {
        setLine(`c${i}`, 0, 0, 0, 0, 0, 0);
        el(`a${i}`).setAttribute("opacity", "0");
        continue;
      }
      const [x0, y0] = edgeOf(s, an[0], an[1]);
      const p = easeOut(lin(t, S[i] + 0.06, S[i] + 0.42));
      const o = s[3] * hold;
      setLine(`c${i}`, x0, y0, an[0], an[1], p, 0.95 * o);
      el(`a${i}`).setAttribute("cx", an[0].toFixed(1));
      el(`a${i}`).setAttribute("cy", an[1].toFixed(1));
      el(`a${i}`).setAttribute("opacity", (o * lin(p, 0.8, 1)).toFixed(3));
      if (p >= 1) lines.push([x0, y0, an[0], an[1], o, i]);
    }
    B.edges.forEach(([a, b], k) => {
      const sa = st[a], sb = st[b];
      if (!sa || !sb) {
        setLine(`e${k}`, 0, 0, 0, 0, 0, 0);
        return;
      }
      const te = Math.max(S[a], S[b]) + 0.12;
      const p = easeOut(lin(t, te, te + 0.45));
      const [x0, y0] = edgeOf(sa, sb[0], sb[1]);
      const [x1, y1] = edgeOf(sb, sa[0], sa[1]);
      const o = Math.min(sa[3], sb[3]) * hold;
      setLine(`e${k}`, x0, y0, x1, y1, p, 0.8 * o);
      if (p >= 1) lines.push([x0, y0, x1, y1, o, 5 + k]);
    });
    // the pulses: running every line that is there; once communication has joined, the whole network is busy
    const busy = lin(t, S[4] + 0.1, S[4] + 0.4);
    let j = 0;
    for (const [x0, y0, x1, y1, o, seed] of lines) {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = 1 + Math.round(2 * busy);
      for (let m = 0; m < n && j < 40; m++, j++) {
        const dir = (seed + m) % 2 ? 1 : -1;
        const f = frac((t * 520) / Math.max(len, 1) * dir + m / n + seed * 0.37);
        const q = el(`q${j}`);
        q.setAttribute("cx", (x0 + (x1 - x0) * f).toFixed(1));
        q.setAttribute("cy", (y0 + (y1 - y0) * f).toFixed(1));
        q.setAttribute("opacity", (o * (0.55 + 0.45 * busy) * Math.sin(Math.PI * f) ** 0.6).toFixed(3));
      }
    }
    for (; j < 40; j++) el(`q${j}`).setAttribute("opacity", "0");
  }

  window.setT = async (t) => {
    await document.fonts.ready;
    words(t);
    boxes(t);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return true;
  };
})();
