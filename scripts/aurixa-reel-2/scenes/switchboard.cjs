// Reel 2, shots 01.1 and 01.2: one property, six professionals, and the client in the middle (G-SWITCHBOARD).
// Today's paper desktop, composed from the first frame. 14 Wattle Grove's card sits in the middle, ringed by six
// professionals' chips, unlit. On "six" they light in turn. On "client" the property lifts away and Jordan Ellis
// (initials on a chip: no face anywhere) drops into the middle, and every line now runs through the client; on
// "messenger" envelopes start shuttling along them, from one professional to the client and on to another. On
// "Sound familiar?" everything stops where it is and the client's chip pulses.
const M = require("../motion.cjs");

const { beat, shotOf, span, lerp, r3, px, State, fade, captionHtml, caption, EASE } = M;

// The professionals, as the client decided them (the plan, decision 6), each with its own icon (lucide's paths).
const I = {
  briefcase:
    '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  landmark:
    '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
  scale:
    '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
  calculator:
    '<rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01"/>',
  hardhat:
    '<path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><path d="M14 6a6 6 0 0 1 6 6v3"/>',
  building:
    '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
};
const svg = (name, color, w = 1.9) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${I[name]}</svg>`;

/**
 * The middle of the switchboard, and the six around it: a hexagon standing on a point, so the camera's push on
 * 01.2 never takes a chip past the frame's edge (the side chips' outer edges end 38 px in from it), lighting in
 * reading order, as the plan names them.
 */
const C = [540, 820];
const ROLES = [
  { label: "Buyer's agent", icon: "briefcase", tint: "#2563EB", dx: 0, dy: -390 },
  { label: "Finance broker", icon: "landmark", tint: "#059669", dx: -330, dy: -195 },
  { label: "Solicitor / conveyancer", icon: "scale", tint: "#7C3AED", dx: 330, dy: -195 },
  { label: "Accountant", icon: "calculator", tint: "#D97706", dx: -330, dy: 195 },
  { label: "Builder", icon: "hardhat", tint: "#0E7490", dx: 330, dy: 195 },
  { label: "Developer", icon: "building", tint: "#BE185D", dx: 0, dy: 390 },
].map((r) => ({ ...r, x: C[0] + r.dx, y: C[1] + r.dy }));
const CHIP = [270, 104];
/** The property's card, as it is drawn at scale 1 (500 x 484): in the ring at first, at the top once lifted. */
const CARD = [500, 484];
// Each envelope's run: from a professional to the client, then on to another.
const RUNS = [
  [0, 5],
  [1, 4],
  [2, 3],
  [3, 0],
  [4, 1],
  [5, 2],
  [0, 4],
  [3, 2],
];

const css = `
.sw-ground { position:absolute; inset:0; background:radial-gradient(90% 60% at 50% 42%, #FFFFFF 0%, #F3F4F6 62%, #E9EBEF 100%); }
.sw-card { position:absolute; left:0; top:0; width:500px; border-radius:22px; background:#fff; overflow:hidden;
  border:1.5px solid #D1D5DB; box-shadow:0 2px 6px rgba(15,23,42,.06), 0 26px 60px rgba(15,23,42,.16); transform-origin:50% 50%; }
.sw-card .ph { height:300px; background:#2a3b52 center 40%/cover no-repeat; }
.sw-card .bd { padding:22px 26px 24px; display:flex; flex-direction:column; gap:6px; font-family:Selawik, "Segoe UI", sans-serif; }
.sw-card .t { font-size:34px; font-weight:700; color:#111827; letter-spacing:-.01em; }
.sw-card .s { font-size:23px; color:#6B7280; }
.sw-card .chips { display:flex; gap:10px; margin-top:8px; }
.sw-card .chips span { font-size:19px; font-weight:600; color:#374151; background:#F3F4F6; border:1px solid #E5E7EB; border-radius:999px; padding:6px 14px; }
.sw-role { position:absolute; left:0; top:0; width:${CHIP[0]}px; height:${CHIP[1]}px; border-radius:18px; background:#fff; border:1.5px solid #D1D5DB;
  display:flex; align-items:center; gap:14px; padding:0 18px; box-shadow:0 2px 6px rgba(15,23,42,.05), 0 14px 30px rgba(15,23,42,.10);
  font-family:Selawik, "Segoe UI", sans-serif; font-size:25px; font-weight:600; color:#374151; line-height:1.12; }
.sw-role .ic { width:58px; height:58px; flex:none; border-radius:50%; display:grid; place-items:center; background:#F3F4F6; position:relative; }
.sw-role .ic svg { width:30px; height:30px; position:absolute; left:14px; top:14px; }
.sw-role .ic .on { opacity:0; }
.sw-client { position:absolute; left:0; top:0; width:320px; height:124px; border-radius:24px; background:#fff; border:2px solid #9CA3AF;
  display:flex; align-items:center; gap:18px; padding:0 22px; box-shadow:0 4px 10px rgba(15,23,42,.08), 0 26px 50px rgba(15,23,42,.18);
  font-family:Selawik, "Segoe UI", sans-serif; transform-origin:50% 50%; }
.sw-client .av { width:76px; height:76px; flex:none; border-radius:50%; display:grid; place-items:center; background:#1F2937; color:#fff; font-size:30px; font-weight:700; }
.sw-client .n { font-size:30px; font-weight:700; color:#111827; }
.sw-client .r { font-size:20px; color:#6B7280; margin-top:2px; }
.sw-lines { position:absolute; left:0; top:0; width:1080px; height:1920px; overflow:visible; }
.sw-env { position:absolute; left:0; top:0; width:58px; height:46px; border-radius:8px; background:#fff; border:1.5px solid #CBD5E1;
  box-shadow:0 6px 14px rgba(15,23,42,.18); display:grid; place-items:center; }
.sw-env svg { width:34px; height:34px; }
.sw-ring { position:absolute; left:0; top:0; border-radius:28px; border:3px solid #9CA3AF; }
.sw-stage { position:absolute; left:0; top:0; width:1080px; height:1920px; transform-origin:${C[0]}px ${C[1]}px; }
`;

/** A point along the quadratic path from a to b (bowed by `bow` of the distance, to the right of travel). */
function along(a, b, u, bow = 0.12) {
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const c = [mid[0] - dy * bow, mid[1] + dx * bow];
  return [
    (1 - u) ** 2 * a[0] + 2 * (1 - u) * u * c[0] + u * u * b[0],
    (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * c[1] + u * u * b[1],
  ];
}

function switchboardScene() {
  const s1 = shotOf("01.1");
  const s2 = shotOf("01.2");
  const [, tSix, tClient, tMessenger] = [0, 1, 2, 3].map((i) => beat("01.1", i));
  const tFreeze = s2.in;
  const tPulse = beat("01.2", 1);
  const lightAt = ROLES.map((_, i) => tSix + i * 0.18);

  const html = () =>
    [
      `<style>${css}</style>`,
      `<div class="fk-layer" style="z-index:0"><div class="sw-ground"></div></div>`,
      `<div class="sw-stage" id="stage" style="z-index:2">`,
      `<svg class="sw-lines" viewBox="0 0 1080 1920">${ROLES.map((r, i) => `<path id="ln${i}" d="M${r3(r.x)} ${r3(r.y)} Q ${r3((r.x + C[0]) / 2 + (C[1] - r.y) * 0.08)} ${r3((r.y + C[1]) / 2 + (r.x - C[0]) * 0.08)} ${C[0]} ${C[1]}" fill="none" stroke="#9CA3AF" stroke-width="3" stroke-dasharray="10 10" style="opacity:0"/>`).join("")}</svg>`,
      `<div class="sw-card" id="card"><div class="ph" style="background-image:url('https://reel-assets.local/P.png')"></div><div class="bd"><div class="t">14 Wattle Grove</div><div class="s">Banksia Rise NSW 2155</div><div class="chips"><span>New build</span><span>4 bed · 2 bath · 2 car</span></div></div></div>`,
      // The envelopes go under every chip: one reaching a professional is taken in by it.
      RUNS.map(
        (_, i) =>
          `<div class="sw-env" id="ev${i}" style="visibility:hidden">${svg("mail", "#475569", 1.8)}</div>`,
      ).join(""),
      ROLES.map(
        (r, i) =>
          `<div class="sw-role" id="ro${i}"><div class="ic">${svg(r.icon, "#9CA3AF")}<span class="on" id="ri${i}">${svg(r.icon, r.tint, 2.1)}</span></div><div>${r.label}</div></div>`,
      ).join(""),
      `<div class="sw-ring" id="ring" style="visibility:hidden"></div>`,
      `<div class="sw-client" id="client" style="visibility:hidden"><div class="av">JE</div><div><div class="n">Jordan Ellis</div><div class="r">Client</div></div></div>`,
      `</div>`,
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // The whole board drifts in 3% across 01.1, then pushes towards the client on 01.2.
    const k =
      1 + 0.03 * span(t, s1.in, s1.out, EASE.linear) + 0.05 * span(t, s2.in, s2.out, EASE.move);
    st.set("#stage", { transform: `scale(${r3(k)})` });
    // The property: in the middle, then lifted to the top as the client arrives.
    const lift = span(t, tClient - 0.1, tClient + 0.55, EASE.move);
    const cy = lerp(C[1], 215, lift);
    const ck = lerp(0.66, 0.55, lift);
    st.set("#card", {
      transform: `translate(${px(C[0] - CARD[0] / 2)}, ${px(cy - CARD[1] / 2)}) scale(${r3(ck)})`,
    });
    // The six, lighting in turn on "six".
    ROLES.forEach((r, i) => {
      const on = span(t, lightAt[i], lightAt[i] + 0.22, EASE.settle);
      st.set(`#ro${i}`, {
        transform: `translate(${px(r.x - CHIP[0] / 2)}, ${px(r.y - CHIP[1] / 2)}) scale(${r3(lerp(0.96, 1, on))})`,
        opacity: r3(lerp(0.5, 1, on)),
        "border-color": on > 0.5 ? r.tint : "#D1D5DB",
      });
      st.set(`#ri${i}`, { opacity: r3(on) });
      st.set(`#ln${i}`, {
        opacity: r3(0.85 * span(t, lightAt[i] + 0.05, lightAt[i] + 0.4, EASE.linear)),
      });
    });
    // The client drops into the middle.
    const drop = span(t, tClient, tClient + 0.5, EASE.settle);
    const dy = lerp(-160, 0, drop);
    st.set("#client", {
      transform: `translate(${px(C[0] - 160)}, ${px(C[1] - 62 + dy)}) scale(${r3(lerp(1.25, 1, drop))})`,
      ...fade(span(t, tClient, tClient + 0.18, EASE.linear)),
    });
    // The pulse on "Sound familiar?".
    const p = span(t, tPulse - 0.05, tPulse + 0.75, EASE.settle);
    const g = 20 + 60 * p;
    st.set("#ring", {
      transform: `translate(${px(C[0] - 160 - g)}, ${px(C[1] - 62 - g)})`,
      width: px(320 + 2 * g),
      height: px(124 + 2 * g),
      ...fade(t >= tPulse - 0.05 ? 0.9 * (1 - p) : 0),
    });
    st.set("#client", { "border-color": t >= tPulse - 0.05 && p < 0.9 ? "#111827" : "#9CA3AF" });
    // The envelopes: each runs to the client and on, from "messenger"; frozen where they are from 01.2.
    const tt = Math.min(t, tFreeze);
    RUNS.forEach(([a, b], i) => {
      const start = tMessenger - 0.05 + i * 0.16;
      const u = (tt - start) / 1.1;
      if (u < 0 || t < start) {
        st.set(`#ev${i}`, { transform: "none", ...fade(0) });
        return;
      }
      const loop = u % 1;
      const leg = loop < 0.5 ? 0 : 1;
      const v = EASE.move(leg === 0 ? loop / 0.5 : (loop - 0.5) / 0.5);
      const from = leg === 0 ? [ROLES[a].x, ROLES[a].y] : C;
      const to = leg === 0 ? C : [ROLES[b].x, ROLES[b].y];
      const [x, y] = along(from, to, v);
      st.set(`#ev${i}`, {
        transform: `translate(${px(x - 29)}, ${px(y - 23)}) rotate(${r3((leg ? 1 : -1) * 8 * Math.sin(Math.PI * v))}deg)`,
        ...fade(span(tt, start, start + 0.12, EASE.linear)),
      });
    });
    return st;
  };

  return { id: "switchboard", shots: ["01.1", "01.2"], palette: "before", html, state };
}

module.exports = switchboardScene;
