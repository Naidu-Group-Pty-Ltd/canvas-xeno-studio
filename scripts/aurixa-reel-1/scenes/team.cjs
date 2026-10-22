// Reel 1, shot 06.2: client relationships and property partners, the team around one record. The window floats
// in depth (./workflowStage.cjs); as the five lift out of it, it falls back and out of focus behind them, and the
// ring they make around 14 Wattle Grove's record turns slowly in depth while it holds.
const M = require("../motion.cjs");
const {
  beat,
  shotOf,
  EASE,
  span,
  lerp,
  lerp2,
  r3,
  px,
  State,
  fade,
  zoomLerp,
  placeWindow,
  pointerHtml,
  pointer,
  captionHtml,
  caption,
  railHtml,
  F,
  KIT,
} = M;
const S = require("./workflowStage.cjs");

// ------------------------------------------------------------------ 06.2: the team around one record
function teamScene() {
  const css = F.plate("PL-06A-a").css; // the Client Portal's pages share one size
  const shot = shotOf("06.2");
  const [t0, tTeam, tRing] = [0, 1, 2].map((i) => beat("06.2", i));
  const tPress = tTeam - 0.2;
  // Close on the dashboard (the menu and the team beside it), the page filling the window, then across to
  // the whole team as the page changes; then F06: the page dimmed behind the ring, a pull back. The window
  // keeps the glass box every screen of the block has (its top at 384, the block's 1000 x 900 where it
  // opens and closes), so only the page moves in it: the team's page is a little wider than the dashboard's
  // close framing shows, so the window gives up the page's last 32 px of height while it is on the team.
  const WINDOW = [40, 384, 1000, 900];
  const FILL = (WINDOW[3] - 2 * M.PAD) / css[1]; // the page's height filling the window
  const DASH = { rect: WINDOW, zoom: FILL, focus: [972 / 2 / FILL, css[1] / 2], at: [540, 834] };
  // The team's page from the title's edge to the end of "5 of 5 roles engaged".
  const CLOSE = 1.4;
  const TEAM_VIEW = {
    rect: [40, 384, 1000, css[1] * CLOSE + 2 * M.PAD],
    zoom: CLOSE,
    focus: [563, css[1] / 2],
    at: [540, 834],
  };
  const F06 = { rect: WINDOW, zoom: 1.04, focus: [480, 300], at: [540, 834] };
  // F06's ring: each of the five round 14 Wattle Grove's record card, linked to its centre.
  const CENTRE = [540, 830];
  const RING = [
    [540, 455],
    [870, 610],
    [800, 1175],
    [280, 1175],
    [210, 610],
  ];
  const RECORD = { x: 362, y: 665, width: 356, imageHeight: 170, titleSize: 42 };
  // The five lift out on "property partners", so the ring stands on the beat and each line draws as
  // "connected" is spoken; the ring then holds, linked, until the cut. Each card's lift, then its line and its
  // traveller, one after another.
  const tLift = tRing - 0.52;
  const lift = (i) => tLift + 0.03 * i;
  const LIFT = 0.55;

  /** Between two framings, onto the second exactly (F06's window, the page at its top). */
  const toward = (a, b, p) => ({
    rect: a.rect.map((v, i) => lerp(v, b.rect[i], p)),
    zoom: zoomLerp(a.zoom, b.zoom, p),
    focus: lerp2(a.focus, b.focus, p),
    at: lerp2(a.at, b.at, p),
  });
  const framing = (t) => {
    if (t < tLift) return toward(DASH, TEAM_VIEW, span(t, tTeam + 0.05, tTeam + 0.85));
    return toward(TEAM_VIEW, F06, span(t, tLift, tLift + 0.9));
  };
  // The window floats, and falls back behind the ring as it forms.
  const behind = (t) => span(t, tLift, tLift + 1.1, EASE.settle);
  const windowPose = (t) => {
    const p = S.drift(t);
    return { ...p, tz: p.tz - 110 * behind(t) };
  };
  // The ring's own slow turn in depth, from flat (where the cards leave the page) to a few degrees.
  const ringPose = (t) => {
    const o = span(t, tLift, shot.out + 0.4, EASE.settle);
    return { ry: 7 * o, rx: 4 * o, tz: 26 * o };
  };

  const html = () => {
    const persons = F.TEAM.map(
      ([initials, tone, role, name, firm], i) =>
        `<div id="PC${i}" style="position:absolute;left:0;top:0;visibility:hidden">${KIT.person({ x: 0, y: 0, initials, tone, role, name, firm }).replace('style="left:0px;top:0px"', 'style="position:relative"')}</div>`,
    ).join("");
    const links = RING.map(
      (p, i) =>
        `<div id="L${i}" style="position:absolute;inset:0">${KIT.link(p, CENTRE, { traveller: 0.5 })
          .replace('class="fk-link"', `class="fk-link" id="Lk${i}"`)
          .replace('class="fk-traveller"', `class="fk-traveller" id="T${i}"`)}</div>`,
    ).join("");
    return [
      S.stageHtml(),
      S.stageWindow("W", ["PL-06A-a", "PL-06A-b"], 2),
      `<div id="crew" class="fk-layer" style="z-index:6;transform-origin:${CENTRE[0]}px ${CENTRE[1]}px">${links}<div id="REC" style="position:absolute;left:0;top:0;visibility:hidden">${KIT.recordCard({ ...RECORD, x: 0, y: 0 })}</div>${persons}</div>`,
      railHtml("rail", "Team"),
      pointerHtml(),
      captionHtml(),
    ].join("");
  };

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    st.set("#rail", fade(1));
    // The dashboard, then the team's page as the click lands; the page dims as its people leave it.
    const team = span(t, tTeam - 0.08, tTeam + 0.04, EASE.linear);
    const veil = 0.62 * span(t, tLift, tLift + 0.5, EASE.move);
    const fr = framing(t);
    const pose = windowPose(t);
    const P = S.stageState(st, fr.rect, pose, { pool: 1 - 0.7 * behind(t) });
    // The team's page is laid over the dashboard, which stays whole beneath until it is covered, so the
    // page never dims through the change.
    const g = placeWindow(st, "W", css, fr, [team < 1 ? 1 : 0, team], { veil, transform: P.css });
    // Behind the ring, the page is not the subject: it falls out of focus.
    st.set("#W", { filter: `blur(${px(2.2 * behind(t))})` });
    // The pointer, from the team on the dashboard to My Property Team in the menu; it presses and goes.
    const on = (pt) => P.map(g.map(pt));
    pointer(st, t, {
      from: on(m.strip),
      to: on(m.navTeam),
      a: t0 + 0.06,
      b: tPress - 0.08,
      show: t0 + 0.02,
      hide: tPress + 0.42,
      press: tPress,
    });
    st.set("#crew", { transform: S.pose([CENTRE[0] - 1, CENTRE[1] - 1, 2, 2], ringPose(t)).css });
    // The five lift out of the page and ring the record: each card from its tile, where the tile is the
    // moment it leaves (the camera is pulling back, the window falling back), to F06's place, growing to its
    // own size.
    m.tiles.forEach((tile, i) => {
      const a = lift(i);
      const at = framing(a);
      const ga = KIT.shotGeometry({ css, ...at });
      const Pa = S.pose(at.rect, windowPose(a));
      const [x, y, w, h] = tile;
      const through = (pt) => Pa.map(ga.map(pt));
      const fromCentre = through([x + w / 2, y + h / 2]);
      const fromWidth = Math.hypot(
        ...[0, 1].map((k) => through([x + w, y + h / 2])[k] - through([x, y + h / 2])[k]),
      );
      const p = span(t, a, a + LIFT, EASE.move);
      const [cx, cy] = lerp2(fromCentre, RING[i], p);
      const s = lerp(fromWidth / m.persons[i][2], 1, p);
      const shown = t >= a ? span(t, a, a + 0.16, EASE.linear) : 0;
      st.set(`#PC${i}`, {
        transform: `translate(${px(cx - m.persons[i][2] / 2)}, ${px(cy - m.persons[i][3] / 2)}) scale(${s.toFixed(5)})`,
        "transform-origin": "50% 50%",
        ...fade(shown),
      });
      st.set("#W-1 .ttile", fade(1 - shown), i);
      // Its line, drawn from the card to the record as the card arrives; then a traveller runs it once, from
      // the card into the record.
      const drawn = span(t, a + 0.38, a + 0.72, EASE.move);
      st.set(`#Lk${i}`, {
        transform: `rotate(${m.angles[i].toFixed(3)}deg) scaleX(${r3(drawn)})`,
        ...fade(drawn > 0 ? 1 : 0),
      });
      // Across the open part of the line only: out from under the person's card, into the record's.
      const run = span(t, a + 0.74, a + 1.14, EASE.move);
      const [u0, u1] = m.gaps[i];
      const [tx, ty] = lerp2(RING[i], CENTRE, lerp(u0, u1, run));
      st.set(`#T${i}`, {
        left: px(tx),
        top: px(ty),
        ...fade(
          Math.min(
            span(t, a + 0.74, a + 0.82, EASE.linear),
            1 - span(t, a + 1.04, a + 1.14, EASE.linear),
          ),
        ),
      });
    });
    // The record card settles into the middle as the cards leave the page.
    const rec = span(t, tLift + 0.22, tLift + 0.78, EASE.settle);
    const [rw, rh] = [m.record[2], m.record[3]];
    st.set("#REC", {
      transform: `translate(${px(RECORD.x + rw / 2)}, ${px(RECORD.y + rh / 2)}) scale(${r3(lerp(0.9, 1, rec))}) translate(${px(-rw / 2)}, ${px(-rh / 2)})`,
      "transform-origin": "0 0",
      ...fade(span(t, tLift + 0.22, tLift + 0.5, EASE.linear)),
    });
    return st;
  };

  return {
    id: "team",
    shots: ["06.2"],
    palette: "aurixa",
    html,
    measure: {
      navs: ["#W-0", "nav a", true],
      strip: ["#W-0", ".team"],
      tiles: ["#W-1", ".ttile", true],
      persons: ["#crew", ".fk-person", true],
      record: ["#crew", ".fk-record"],
    },
    derive(m) {
      const [nx, ny, nw, nh] = m.navs[4]; // My Property Team
      const [sx, sy, sw, sh] = m.strip;
      return {
        ...m,
        // The pointer's tip on the item's label, and where it comes from: the team on the dashboard.
        navTeam: [nx + nw * 0.42, ny + nh * 0.6],
        strip: [sx + sw * 0.32, sy + sh * 0.62],
        angles: RING.map(([x, y]) => (Math.atan2(CENTRE[1] - y, CENTRE[0] - x) * 180) / Math.PI),
        // Where each line leaves its person's card and meets the record's, as fractions of its length.
        gaps: RING.map(([x, y], i) => {
          const [dx, dy] = [CENTRE[0] - x, CENTRE[1] - y];
          const length = Math.hypot(dx, dy);
          const [w, h] = [m.persons[i][2], m.persons[i][3]];
          const out = Math.min(w / 2 / Math.abs(dx || 1e-9), h / 2 / Math.abs(dy || 1e-9));
          const [rx, ry, rw, rh] = [RECORD.x, RECORD.y, m.record[2], m.record[3]];
          const into = Math.max(
            Math.min((rx - x) / dx, (rx + rw - x) / dx),
            Math.min((ry - y) / dy, (ry + rh - y) / dy),
          );
          const u0 = out + 10 / length;
          return [u0, Math.max(into - 10 / length, u0 + 0.05)];
        }),
      };
    },
    state,
  };
}

module.exports = teamScene;
