// Reel 1, shots 04.1 to 04.3 (one scene): the brand arrives, the system around it, then Reports.
const fs = require("fs");
const path = require("path");
const M = require("../motion.cjs");
const L = require("../logo.cjs");
const {
  BRIEF,
  FPS,
  frameOf,
  shotOf,
  beat,
  EASE,
  PRESS,
  span,
  lerp,
  lerp2,
  zoomLerp,
  r3,
  px,
  State,
  fade,
  windowHtml,
  PAD,
  whole,
  between,
  placeWindow,
  throughRect,
  POINTER_TIP,
  pointerHtml,
  pointer,
  corners,
  focusHtml,
  captionHtml,
  caption,
  railHtml,
  RENDER_CSS,
  F,
  KIT,
  CAP,
} = M;

// ------------------------------------------------------------------ 04.1 to 04.3: the brand, the system, Reports
/**
 * One stage for three shots, because one window carries through them: the Command Centre the emblem
 * becomes (04.1) shrinks to the system map's hub (04.2), and the camera pushes back into it, on Reports
 * (04.3). Today's last frame, dimmed, is the first thing on it: the turn from today's tools to Aurixa.
 */
function brandScene() {
  const hub = F.SYSTEM_MAP.hub;
  const css = F.plate(hub.key).css; // the Command Centre's plates share one size
  const Zb = 972 / css[0]; // 04.1's window, whole, as A04b frames it
  const Zh = hub.width / css[0]; // the hub
  const built = [540, 543 + 575 / 2];
  const A04C = { rect: [40, 462, 1000, 737], zoom: 0.82, focus: [887, 432], at: [540, 830] };

  const [t0, tEmblem, tWordmark, tLift] = [0, 1, 2, 3].map((i) => beat("04.1", i));
  const [tShrink, tPortals] = [0, 1].map((i) => beat("04.2", i));
  // 04.3's last beat (35.833) is the hold: nothing moves after the corners close.
  const [tPush, tTravel, tPress] = [0, 1, 2].map((i) => beat("04.3", i));

  // The supplied logo where the hero stands it (logo.cjs HERO: the art at 0.8, the lockup centred in the
  // action zone): its clean plate (the art without its lettering), the art's own lettering and the shadow it
  // stands in (logo-letters.png) cut into its letters where the wordmark's own gaps fall (13 of them), and the
  // emblem (emblem.png, an exact crop of the art) that lifts away into the Command Centre.
  const H = L.HERO;
  const EM = {
    left: H.emblem[0],
    top: H.emblem[1],
    w: H.emblem[2],
    h: H.emblem[3],
    file: [679, 628],
  };
  const [WX, WY] = L.ART.wordmark; // the wordmark's place in the art
  const HALO = 40; // the lettering's shadow beyond its glyphs, in art px
  const letters = [];
  const cut = (runs, y0, y1) =>
    runs.forEach(([a, b], i) => {
      const l = i === 0 ? -HALO : (runs[i - 1][1] + a) / 2;
      const r = i === runs.length - 1 ? L.ART.wordmark[2] + HALO : (b + runs[i + 1][0]) / 2;
      letters.push({ l: WX + l, r: WX + r, y0: WY + y0, y1: WY + y1 });
    });
  // AURIXA, then SYSTEMS: each letter's columns in wordmark.png (measured from its alpha).
  cut(
    [
      [1, 141],
      [174, 295],
      [346, 470],
      [514, 537],
      [581, 712],
      [742, 881],
    ],
    -HALO,
    114,
  );
  cut(
    [
      [137, 186],
      [224, 280],
      [318, 367],
      [407, 457],
      [498, 544],
      [588, 647],
      [690, 739],
    ],
    114,
    187 + HALO,
  );
  // The reveal's footage (logo_motion.py's chosen take, its frames at 30 fps as logo-A-0001.jpg on) plays
  // from the shot's first frame to just before the lift, where it ends on the hero exactly; the clean plate
  // takes over from its last frames. Until it is made, the clean plate rises in out of the horizon instead.
  const FILM = L.takeFrames("A");
  const REVEAL = [t0 + 0.03, tLift - 0.3];
  const footageAt = (t) =>
    FILM[
      Math.min(FILM.length - 1, Math.round(span(t, ...REVEAL, EASE.linear) * (FILM.length - 1)))
    ];
  const GLINT = H.art[1] + 1140 * H.k; // the art's own gold horizon, under the wordmark

  const html = () => {
    // 03.1's last state (./waits.cjs), dimmed, as the turn from today's tools to Aurixa; F03 before it exists.
    const waits = fs.existsSync(path.join(__dirname, "waits.cjs")) ? require("./waits.cjs") : null;
    const lead = (waits && waits.finalLayers ? waits.finalLayers() : F.FRAMES.F03.draw()).join("");
    const lettering = F.asset("logo-letters.png");
    const [ax, ay, aw, ah] = H.art;
    const letterDivs = letters
      .map(
        ({ l, r, y0, y1 }, i) =>
          `<div id="wm-${i}" style="position:absolute;left:${px(ax + l * H.k)};top:${px(ay + y0 * H.k)};width:${px((r - l) * H.k)};height:${px((y1 - y0) * H.k)};background:url('${lettering}') ${px(-l * H.k)} ${px(-y0 * H.k)}/${px(aw)} ${px(ah)} no-repeat;visibility:hidden"></div>`,
      )
      .join("");
    // The light that crosses the wordmark once it has landed: a band, kept to the letters' own shapes.
    const [wx, wy, ww, wh] = H.wordmark;
    const sweep = `<div id="wm-sweep" style="position:absolute;left:${px(wx)};top:${px(wy)};width:${px(ww)};height:${px(wh)};z-index:7;mix-blend-mode:screen;visibility:hidden;
      -webkit-mask-image:url('${F.WORDMARK}');-webkit-mask-size:100% 100%;mask-image:url('${F.WORDMARK}');mask-size:100% 100%;
      background:linear-gradient(105deg, rgba(255,240,205,0) 0%, rgba(255,240,205,.85) 50%, rgba(255,240,205,0) 100%) no-repeat;background-size:40% 100%"></div>`;
    const portals = F.SYSTEM_MAP.portals.map((_, i) => F.mapPortal(i, { traveller: 0 }));
    const lines = portals
      .map(
        (p, i) =>
          `<div id="L${i}" style="position:absolute;inset:0;z-index:1">${p.line.replace('class="fk-link"', `class="fk-link" id="Lk${i}"`).replace('class="fk-traveller"', `class="fk-traveller" id="T${i}"`)}</div>`,
      )
      .join("");
    const wins = portals
      .map(
        (p, i) =>
          `<div id="P${i}" style="position:absolute;inset:0;z-index:3;visibility:hidden">${p.window}</div>`,
      )
      .join("");
    const chips = portals
      .map(
        (p, i) =>
          `<div id="C${i}" style="position:absolute;inset:0;z-index:4;visibility:hidden">${p.chip}</div>`,
      )
      .join("");
    // The hub's label where systemMap puts it, 72 px above the hub's page.
    const hubChip = F.mapChip(hub.label, hub.at[0], hub.at[1] - (css[1] * Zh) / 2 - 72, 6).replace(
      'class="fk-chip"',
      'class="fk-chip" id="CH"',
    );
    return [
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      `<div id="lead" class="fk-layer before" style="z-index:1">${lead}<div class="fk-veil" id="lead-veil" style="opacity:.78;z-index:100"></div></div>`,
      `<div id="map" class="fk-layer" style="z-index:3;transform-origin:${hub.at[0]}px ${hub.at[1]}px">${lines}${wins}${chips}${hubChip}</div>`,
      windowHtml("W", [hub.key, "PL-04B-a", "PL-04B-b"], 5),
      FILM.length
        ? `<div class="fk-layer" id="hero-film" style="z-index:2;visibility:hidden"><img id="hero-film-img" src="${FILM[0]}" alt="" style="position:absolute;left:0;top:0;width:1080px;height:1920px"></div>`
        : "",
      L.heroArtHtml(F.asset("logo-clean.png"), "hero-art", 2),
      `<div class="fk-horizon" id="hair" style="left:110px;right:110px;top:${px(GLINT)};transform-origin:50% 50%;visibility:hidden"></div>`,
      `<div id="wordmark" class="fk-layer" style="z-index:6">${letterDivs}</div>`,
      sweep,
      `<div id="emblem" style="position:absolute;left:${px(EM.left)};top:${px(EM.top)};width:${px(EM.w)};height:${px(EM.h)};z-index:8;transform-origin:0 0;background:url('${F.EMBLEM}') center/contain no-repeat;visibility:hidden"></div>`,
      focusHtml(),
      pointerHtml(),
      captionHtml(),
    ].join("");
  };

  // Where the Command Centre's window is at t, and the map's camera around it.
  const ccFraming = (t, m) => {
    // 04.1: the window settles in with one slow push.
    const settle = span(t, tLift + 0.05, tLift + 1.7, EASE.settle);
    const built41 = whole(css, Zb * lerp(0.93, 1, settle), built);
    if (t < tShrink) return { framing: built41, map: { s: 1, d: [0, 0] } };
    // 04.2: it shrinks to the centre and becomes the hub; the camera pulls slowly back from the map.
    const pull = lerp(1.035, 1, span(t, tShrink + 0.3, tPush, EASE.move));
    const hubFraming = (s) => whole(css, Zh * s, hub.at);
    if (t < tPush) {
      const p = span(t, tShrink, tShrink + 0.9, EASE.move);
      const from = whole(css, Zb, built);
      const to = hubFraming(pull);
      return {
        framing: whole(css, zoomLerp(from.zoom, to.zoom, p), lerp2(built, hub.at, p)),
        map: { s: pull, d: [0, 0] },
      };
    }
    // 04.3: the camera pushes back into the hub, onto Reports; the map goes past it.
    const p = span(t, tPush, tPush + 0.82, EASE.move);
    const framing = between(css, hubFraming(1), A04C, p);
    const c = [framing.rect[0] + framing.rect[2] / 2, framing.rect[1] + framing.rect[3] / 2];
    return {
      framing,
      map: { s: framing.zoom / Zh, d: [c[0] - hub.at[0], c[1] - hub.at[1]] },
      push: p,
    };
  };

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // The dimmed frame becomes the brand's deep navy.
    st.set("#lead", fade(1 - span(t, t0, t0 + 0.4, EASE.move)));
    st.set("#ground", fade(span(t, t0 + 0.05, t0 + 0.75, EASE.move)));
    const { framing, map, push = 0 } = ccFraming(t, m);
    // Everything of the hero gives way quickly at the lift, so it is gone before the window comes in.
    const away = span(t, tLift, tLift + 0.32, EASE.settle);
    if (FILM.length) {
      // The model's reveal, from the night to the logo; its last frames hand over to the clean plate (the
      // same picture, exactly), which holds until the lift.
      st.set("#hero-film", fade(1 - away));
      st.set("#hero-film-img", { $src: footageAt(t) });
      st.set("#hero-art", fade(span(t, REVEAL[1] - 0.3, REVEAL[1], EASE.linear) * (1 - away)));
      st.set("#hair", fade(0));
    } else {
      // Until the footage is made: the art's own gold horizon draws out from the centre, and the clean plate
      // rises out of it into place.
      const drawn = span(t, t0 + 0.08, tEmblem + 0.1, EASE.move);
      st.set("#hair", {
        transform: `scaleX(${r3(drawn)})`,
        ...fade(Math.min(drawn * 6, 1) * (1 - span(t, tEmblem + 0.4, tEmblem + 0.9, EASE.move))),
      });
      const rise = span(t, tEmblem, tEmblem + 1.1, EASE.settle);
      st.set("#hero-art", {
        transform: `translateY(${px((1 - rise) * 26)}) scale(${r3(lerp(1.035, 1, rise))})`,
        "transform-origin": `540px ${px(GLINT)}`,
        ...fade(span(t, tEmblem, tEmblem + 0.8, EASE.settle) * (1 - away)),
      });
    }
    // The emblem itself (the exact file, standing on its own place in the picture) from just before the lift,
    // then it flies to the Command Centre's own sidebar mark.
    const lift = span(t, tLift, tLift + 0.78, EASE.move);
    const g = KIT.shotGeometry({ css, ...framing });
    const [ex, ey, ew] = m.emb; // the sidebar mark's box in the plate
    const drawnW = ew; // the mark draws the emblem contained in its square: full width
    const target = g.map([ex, ey + (ew - (ew * EM.file[1]) / EM.file[0]) / 2]);
    const scale = zoomLerp(1, (drawnW * framing.zoom) / EM.w, lift);
    const pos = lerp2([EM.left, EM.top], target, lift);
    const landed = lift >= 1;
    st.set("#emblem", {
      transform: `translate(${px(pos[0] - EM.left)}, ${px(pos[1] - EM.top)}) scale(${scale.toFixed(6)})`,
      ...fade(landed ? 0 : span(t, tLift - 0.12, tLift, EASE.linear)),
    });
    // The wordmark, the art's own letters and their shadow, rising into focus one by one as AURIXA, then
    // SYSTEMS; then the light crosses it once.
    letters.forEach((_, i) => {
      const a = i < 6 ? tWordmark + i * 0.06 : tWordmark + 0.2 + (i - 6) * 0.045;
      const p = span(t, a, a + 0.5, EASE.settle);
      const blur = (1 - p) * 8;
      st.set(`#wm-${i}`, {
        transform: `translateY(${px((1 - p) * 16 + away * 8)})`,
        filter: blur > 0.05 ? `blur(${r3(blur)}px)` : "none",
        ...fade(Math.min(span(t, a, a + 0.3, EASE.settle), 1 - away)),
      });
    });
    const swept = span(t, tWordmark + 0.75, tWordmark + 1.55, EASE.move);
    st.set("#wm-sweep", {
      "background-position": `${r3(-70 + swept * 240)}% 0`,
      ...fade(swept > 0 && swept < 1 ? 1 - away : 0),
    });
    // The Command Centre's window: it settles in as the emblem lands; its sidebar's groups set in,
    // then the top bar with its Demo workspace badge, then the Overview page.
    const winIn = span(t, tLift + 0.1, tLift + 0.5, EASE.move);
    // Reports comes in while the push is at its fastest, so the change of page doesn't linger as a double image.
    const reports = span(t, tPush + 0.12, tPush + 0.36, EASE.linear);
    const selected = span(t, tPress + 0.03, tPress + 0.18, EASE.linear);
    const wg = placeWindow(st, "W", css, framing, [1, reports, selected], {
      opacity: winIn,
      transform: `translateY(${px((1 - winIn) * 10)})`,
    });
    const set = (sel, a, d, dy = 0, dx = 0, i = null) => {
      const p = span(t, a, a + d, EASE.settle);
      st.set(
        `#W-0 ${sel}`,
        { transform: `translate(${px((1 - p) * dx)}, ${px((1 - p) * dy)})`, ...fade(p) },
        i,
      );
    };
    st.set("#W-0 .cside .tenant .emb", fade(landed ? 1 : 0));
    set(".cside .tenant .t", tLift + 0.62, 0.36, 0, -6);
    set(".cside .tenant .s", tLift + 0.7, 0.36, 0, -6);
    set(".cside .filter", tLift + 0.52, 0.34, 0, -8);
    m.groups.forEach((_, i) => set(".cside .grp", tLift + 0.6 + i * 0.07, 0.36, 0, -10, i));
    set(".ctop", tLift + 0.95, 0.36, -8);
    set(".ctop .cdemo", tLift + 1.12, 0.32, 0, 6);
    set(".stage .col", tLift + 1.22, 0.45, 14);
    // 04.2: five portals arrive around the hub, a line drawn to each, each labelled; the hub labelled.
    const mapFade = 1 - (push ? span(t, tPush, tPush + 0.42, EASE.move) : 0);
    st.set("#map", {
      transform: `translate(${px(map.d[0])}, ${px(map.d[1])}) scale(${map.s.toFixed(6)})`,
      ...fade(t >= tShrink ? mapFade : 0),
    });
    st.set(
      "#CH",
      fade(span(t, tPortals - 0.3, tPortals + 0.05, EASE.move) * (1 - span(t, tPush, tPush + 0.2))),
    );
    F.SYSTEM_MAP.portals.forEach(({ at }, i) => {
      const a = tPortals + i * 0.11;
      const p = span(t, a, a + 0.55, EASE.settle);
      const from = lerp2(hub.at, at, 0.62);
      st.set(`#P${i}`, {
        transform: `translate(${px((from[0] - at[0]) * (1 - p))}, ${px((from[1] - at[1]) * (1 - p))}) scale(${r3(lerp(0.84, 1, p))})`,
        "transform-origin": `${at[0]}px ${at[1]}px`,
        ...fade(span(t, a, a + 0.28, EASE.linear)),
      });
      const drawnTo = span(t, a - 0.06, a + 0.4, EASE.move);
      const len = Math.hypot(at[0] - hub.at[0], at[1] - hub.at[1]);
      const angle = (Math.atan2(at[1] - hub.at[1], at[0] - hub.at[0]) * 180) / Math.PI;
      st.set(`#Lk${i}`, {
        transform: `rotate(${angle.toFixed(3)}deg) scaleX(${r3(drawnTo)})`,
        ...fade(drawnTo > 0 ? 1 : 0),
      });
      // The traveller runs the line once, from the hub to the portal, and is gone into it.
      const run = span(t, a + 0.3, a + 1.25, EASE.move);
      const pos = lerp2(hub.at, at, lerp(0.18, 0.9, run));
      st.set(`#T${i}`, {
        left: px(pos[0]),
        top: px(pos[1]),
        ...fade(
          Math.min(
            span(t, a + 0.3, a + 0.42, EASE.linear),
            1 - span(t, a + 1.05, a + 1.25, EASE.linear),
          ),
        ),
      });
      st.set(`#C${i}`, {
        transform: `translateY(${px((1 - span(t, a + 0.34, a + 0.7, EASE.settle)) * 8)})`,
        ...fade(span(t, a + 0.34, a + 0.7, EASE.settle)),
      });
    });
    // 04.3: the pointer travels to New Build and presses; focus corners close in on the three build types.
    const types = throughRect(wg, m.types);
    const newBuild = wg.map(m.newBuild);
    const from = wg.map(m.property);
    pointer(st, t, {
      from,
      to: newBuild,
      a: tTravel,
      b: tPress - 0.08,
      show: tTravel - 0.16,
      press: tPress,
    });
    if (t >= tPress) corners(st, t, types, tPress + 0.06, tPress + 0.52);
    else st.set("#focus", { left: "0px", top: "0px", width: "0px", height: "0px", ...fade(0) });
    return st;
  };

  return {
    id: "brand",
    shots: ["04.1", "04.2", "04.3"],
    palette: "aurixa",
    html,
    measure: {
      emb: ["#W-0", ".cside .tenant .emb"],
      groups: ["#W-0", ".cside .grp", true],
      types: ["#W-1", ".types"],
      newBuildCard: ["#W-1", ".type", true],
      propertyCard: ["#W-1", ".cctx"],
    },
    derive(m) {
      const nb = m.newBuildCard[1];
      return {
        ...m,
        // The pointer's tip on New Build's label, right of its centre; it starts on Residence 014's card.
        newBuild: [nb[0] + nb[2] * 0.66, nb[1] + nb[3] * 0.58],
        property: [
          m.propertyCard[0] + m.propertyCard[2] * 0.5,
          m.propertyCard[1] + m.propertyCard[3] * 0.62,
        ],
      };
    },
    state,
  };
}

module.exports = brandScene;
