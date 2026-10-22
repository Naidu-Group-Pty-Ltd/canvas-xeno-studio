// Reel 1, shot 12.4: back to the system map; one pulse leaves the hub for each portal in turn, every link
// brightening once as its pulse runs it, while the camera pulls slightly back.
const M = require("../motion.cjs");
const { beat, EASE, span, lerp, lerp2, r3, px, State, fade, captionHtml, caption, F, KIT } = M;

// ------------------------------------------------------------------ 12.4: a more connected business
function connectedScene() {
  const tIn = beat("12.4", 0);
  const hub = F.SYSTEM_MAP.hub;
  const hubPlate = F.plate(hub.key);
  const hubZoom = hub.width / hubPlate.css[0];
  // Clockwise from the Client portal: Finance, the Builders Network, the Solicitor, the Accountant.
  const ORDER = [0, 1, 4, 3, 2];
  const RUN = 0.55; // a pulse's run along its line
  const startOf = (i) => tIn + 0.08 + ORDER.indexOf(i) * 0.14;
  // Where a pulse leaves and arrives on its line (A12d's travellers rest at 0.9, at the portal).
  const FROM = 0.12;
  const TO = 0.9;

  const html = () => {
    const portals = F.SYSTEM_MAP.portals.map((_, i) => F.mapPortal(i, { traveller: 0 }));
    const map = [
      ...portals.map((p, i) =>
        p.line
          .replace('class="fk-link"', `class="fk-link" id="Lk${i}"`)
          .replace('class="fk-traveller"', `class="fk-traveller" id="T${i}"`),
      ),
      ...portals.map((p) => p.window),
      KIT.camera({
        plate: hubPlate,
        zoom: hubZoom,
        focus: [hubPlate.css[0] / 2, hubPlate.css[1] / 2],
        at: hub.at,
        style: "z-index:5",
      }),
      ...portals.map((p) => p.chip),
      F.mapChip(hub.label, hub.at[0], hub.at[1] - (hubPlate.css[1] * hubZoom) / 2 - 72, 6),
    ].join("");
    return [
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      `<div id="map" class="fk-layer" style="z-index:2;transform-origin:${hub.at[0]}px ${hub.at[1]}px">${map}</div>`,
      captionHtml(),
    ].join("");
  };

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // The slight pull back, to A12d's 0.94 about the hub.
    const back = span(t, tIn, tIn + 1.3, EASE.move);
    st.set("#map", { transform: `scale(${r3(lerp(1, 0.94, back))})`, ...fade(1) });
    F.SYSTEM_MAP.portals.forEach(({ at }, i) => {
      const a = startOf(i);
      const run = span(t, a, a + RUN, EASE.move);
      const pos = lerp2(hub.at, at, lerp(FROM, TO, run));
      st.set(`#T${i}`, {
        left: px(pos[0]),
        top: px(pos[1]),
        ...fade(span(t, a, a + 0.1, EASE.linear)),
      });
      // The link brightens as its pulse runs it, once, and settles back.
      const lit = t < a ? 0 : Math.sin(Math.PI * Math.min(1, (t - a) / (RUN + 0.15)));
      st.set(`#Lk${i}`, {
        filter:
          lit > 0.001
            ? `brightness(${r3(1 + 1.1 * lit)}) drop-shadow(0 0 ${px(7 * lit)} rgba(215,179,95,${r3(0.85 * lit)}))`
            : "none",
      });
    });
    return st;
  };

  return { id: "connected", shots: ["12.4"], palette: "aurixa", html, measure: {}, state };
}

module.exports = connectedScene;
