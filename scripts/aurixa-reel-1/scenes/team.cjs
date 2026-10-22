// Reel 1, shot 06.2: client relationships and property partners, the team around one record.
const M = require("../motion.cjs");
const {
  beat,
  EASE,
  span,
  lerp,
  lerp2,
  r3,
  px,
  State,
  fade,
  windowHtml,
  zoomLerp,
  placeWindow,
  throughRect,
  pointerHtml,
  pointer,
  captionHtml,
  caption,
  railHtml,
  F,
  KIT,
} = M;

// ------------------------------------------------------------------ 06.2: the team around one record
function teamScene() {
  const css = F.plate("PL-06A-a").css; // the Client Portal's pages share one size
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
  // F06's ring: each of the five round Residence 014's record card, linked to its centre.
  const CENTRE = [540, 830];
  const RING = [
    [540, 455],
    [870, 610],
    [800, 1175],
    [280, 1175],
    [210, 610],
  ];
  const RECORD = { x: 362, y: 665, width: 356, imageHeight: 170, titleSize: 42 };
  // Each card's lift, then its line and its traveller, one after another.
  const lift = (i) => tRing + 0.025 * i;
  const LIFT = 0.65;

  /** Between two framings, onto the second exactly (F06's window, the page at its top). */
  const toward = (a, b, p) => ({
    rect: a.rect.map((v, i) => lerp(v, b.rect[i], p)),
    zoom: zoomLerp(a.zoom, b.zoom, p),
    focus: lerp2(a.focus, b.focus, p),
    at: lerp2(a.at, b.at, p),
  });
  const framing = (t) => {
    if (t < tRing) return toward(DASH, TEAM_VIEW, span(t, tTeam + 0.05, tTeam + 0.85));
    return toward(TEAM_VIEW, F06, span(t, tRing, tRing + 0.85));
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
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      windowHtml("W", ["PL-06A-a", "PL-06A-b"], 2),
      `<div id="crew" class="fk-layer" style="z-index:6">${links}<div id="REC" style="position:absolute;left:0;top:0;visibility:hidden">${KIT.recordCard({ ...RECORD, x: 0, y: 0 })}</div>${persons}</div>`,
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
    const veil = 0.62 * span(t, tRing, tRing + 0.5, EASE.move);
    // The team's page is laid over the dashboard, which stays whole beneath until it is covered, so the
    // page never dims through the change.
    const g = placeWindow(st, "W", css, framing(t), [team < 1 ? 1 : 0, team], { veil });
    // The pointer, from the team on the dashboard to My Property Team in the menu; it presses and goes.
    const to = g.map(m.navTeam);
    pointer(st, t, {
      from: g.map(m.strip),
      to,
      a: t0 + 0.06,
      b: tPress - 0.08,
      show: t0 + 0.02,
      hide: tPress + 0.42,
      press: tPress,
    });
    // The five lift out of the page and ring the record: each card from its tile, where the tile is the
    // moment it leaves (the camera is pulling back), to F06's place, growing to its own size.
    m.tiles.forEach((tile, i) => {
      const a = lift(i);
      const at = framing(a);
      const from = throughRect({ ...KIT.shotGeometry({ css, ...at }), zoom: at.zoom }, tile);
      const p = span(t, a, a + LIFT, EASE.move);
      const fromCentre = [from[0] + from[2] / 2, from[1] + from[3] / 2];
      const [cx, cy] = lerp2(fromCentre, RING[i], p);
      const s = lerp(from[2] / m.persons[i][2], 1, p);
      const shown = t >= a ? span(t, a, a + 0.16, EASE.linear) : 0;
      st.set(`#PC${i}`, {
        transform: `translate(${px(cx - m.persons[i][2] / 2)}, ${px(cy - m.persons[i][3] / 2)}) scale(${s.toFixed(5)})`,
        "transform-origin": "50% 50%",
        ...fade(shown),
      });
      st.set("#W-1 .ttile", fade(1 - shown), i);
      // Its line, drawn from the card to the record once the card has nearly arrived; then a traveller
      // runs it once, from the card into the record.
      const drawn = span(t, a + 0.45, a + 0.8, EASE.move);
      st.set(`#Lk${i}`, {
        transform: `rotate(${m.angles[i].toFixed(3)}deg) scaleX(${r3(drawn)})`,
        ...fade(drawn > 0 ? 1 : 0),
      });
      // Across the open part of the line only: out from under the person's card, into the record's.
      const run = span(t, a + 0.86, a + 1.26, EASE.move);
      const [u0, u1] = m.gaps[i];
      const [tx, ty] = lerp2(RING[i], CENTRE, lerp(u0, u1, run));
      st.set(`#T${i}`, {
        left: px(tx),
        top: px(ty),
        ...fade(
          Math.min(
            span(t, a + 0.86, a + 0.94, EASE.linear),
            1 - span(t, a + 1.16, a + 1.26, EASE.linear),
          ),
        ),
      });
    });
    // The record card settles into the middle as the cards leave the page.
    const rec = span(t, tRing + 0.22, tRing + 0.78, EASE.settle);
    const [rw, rh] = [m.record[2], m.record[3]];
    st.set("#REC", {
      transform: `translate(${px(RECORD.x + rw / 2)}, ${px(RECORD.y + rh / 2)}) scale(${r3(lerp(0.9, 1, rec))}) translate(${px(-rw / 2)}, ${px(-rh / 2)})`,
      "transform-origin": "0 0",
      ...fade(span(t, tRing + 0.22, tRing + 0.5, EASE.linear)),
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
