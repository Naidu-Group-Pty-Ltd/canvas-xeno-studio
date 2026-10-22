// Reel 1, shot 01.2 (third cut): the client asks.
const M = require("../motion.cjs");
const { beat, EASE, span, lerp, r3, px, State, fade, pointerHtml, pointer, captionHtml, caption, KIT, F } = M;
const DK = require("../desk.cjs");
const { globeHtml } = require("../globe.cjs");
const orbit = require("./orbit.cjs");

// Every window of the desk stands in the room from here; the phone waits for 03.1.
const IDS = ["msg", "inbox", "research", "sheet", "contact", "report"];
const QUESTION = "Can we review whether this suits my plans?";
// Where the outgoing message stands in the window's body: in the composer, then at the top of the thread.
const OUT_COMPOSE = 214;
const OUT_THREAD = 40;

/**
 * 01.1's card leaves the map: as the satellite view falls away to a paper-white desk, a plain messaging window
 * swings in from the right in depth, and the card flies into it as the message's attachment (the same card, at
 * two thirds). From Jordan Ellis to Alex Morgan, the question types itself in at a reading pace while the
 * camera arcs from three-quarter to front-on and eases in to Send; the pointer presses it, the window's own
 * pressed state, and the message lifts into its thread, Sent. Then, on the attached card, a chip: Expressions of
 * interest close Friday.
 */
function askScene() {
  const [tIn, tType, tPress, tChip] = [0, 1, 2, 3].map((i) => beat("01.2", i));
  const msg = DK.OBJECTS.msg;
  // The window swings in from the right: from here to where it stands.
  const SWING = { p: [msg.pose.p[0] + 1700, msg.pose.p[1] - 120, msg.pose.p[2] + 600], ry: -48 };
  const swing = (t) => {
    const p = span(t, tIn, tIn + 0.72, EASE.settle);
    return { p: msg.pose.p.map((v, i) => lerp(SWING.p[i], v, p)), ry: lerp(SWING.ry, msg.pose.ry, p) };
  };
  // The card's flight from the map into the window, and the globe's fade under it.
  const FLY = [tIn, tIn + 0.62];
  // The question types at a reading pace: each character on a slightly uneven beat (a word's end a little longer).
  const TYPED = tPress - 0.5;
  const steps = [...QUESTION].map((ch, i) => 1 + (ch === " " ? 0.9 : 0) + 0.35 * Math.sin(i * 2.3));
  const total = steps.reduce((a, b) => a + b, 0);
  const at = [];
  steps.reduce((acc, s) => {
    at.push(tType + ((TYPED - tType) * acc) / total);
    return acc + s;
  }, 0);
  const typed = (t) => at.filter((a) => t >= a).length;
  // The message lifts into the thread after the press.
  const LIFT = [tPress + 0.14, tPress + 0.6];

  const card = `<div id="ask-card" style="position:absolute;left:0;top:0;width:${orbit.CARD_W}px;transform-origin:0 0;z-index:45;
    filter:drop-shadow(0 22px 34px rgba(2,8,20,.45))">${KIT.listing({ width: orbit.CARD_W, chips: ["New listing · just now"] })}<div class="fk-tail down" id="ask-tail" style="left:${orbit.CARD_W / 2 - 14}px;bottom:-13px"></div></div>`;
  const html = () =>
    [
      `<style>${DK.CSS}</style>`,
      DK.roomHtml(IDS),
      // 01.1's last frame, under everything as the shot opens, falling away.
      `<div id="ask-globe" style="position:absolute;inset:0;z-index:40">${globeHtml({
        goldLand: orbit.GOLD_LAND,
        assets: F.ASSETS,
        initial: JSON.parse(orbit.globeState(orbit.END)),
      })}</div>`,
      card,
      pointerHtml(),
      captionHtml(),
    ].join("");

  const state = (time, m) => {
    const st = new State();
    const t = DK.tick(time, time < FLY[1] + 0.1 ? 240 : 120);
    caption(st, t, m);
    const c = DK.cameraAt(t);
    const pose = swing(t);
    DK.placeRoom(st, c, IDS, { poses: { msg: pose }, fades: DK.fadesAt(t) });
    st.set("#ask-globe", fade(1 - span(t, tIn + 0.04, tIn + 0.5, EASE.linear)));

    // The outgoing message: in the composer, then lifted to the top of the thread, a bubble round it.
    const lift = span(t, LIFT[0], LIFT[1], EASE.settle);
    const top = lerp(OUT_COMPOSE, OUT_THREAD, lift);
    st.set("#dk-out", { top: px(top) });
    st.set("#dk-bubble", { opacity: r3(lift) });
    st.set("#dk-status", { top: px(OUT_THREAD + m.att[3] + 34), ...fade(span(t, LIFT[1] - 0.15, LIFT[1] + 0.1, EASE.linear)) });
    const n = typed(t);
    st.set("#dk-text", { $text: QUESTION.slice(0, n) });
    const blinkOn = t < TYPED + 0.05 ? 1 : Math.floor((t - TYPED) / 0.53) % 2 === 0 ? 0 : 1;
    st.set("#dk-caret", { opacity: t < tType - 0.2 || t >= tPress ? "0" : String(blinkOn) });
    // Send's pressed state: it sinks a little and darkens, for the press.
    const down = t >= tPress && t < tPress + 0.14;
    st.set("#dk-send", { transform: `scale(${down ? 0.95 : 1})`, background: down ? "#111827" : "var(--reel-before-ink)" });
    // The chip on the attached card: Expressions of interest close Friday.
    const chip = span(t, tChip, tChip + 0.36, EASE.settle);
    st.set("#dk-eoi", { transform: `translateY(${px((1 - chip) * 12)}) scale(${r3(0.9 + 0.1 * chip)})`, "transform-origin": "0 0", ...fade(chip) });

    // The card in flight: its corners from where 01.1 left it on the frame to its place in the window, wherever
    // the window is in its swing; then the window's own card takes over (they are the same card, so the hand-over
    // is exact).
    const h = m.card[3];
    const [x0, y0] = orbit.cardRect(orbit.END, h);
    const from = [
      [x0, y0],
      [x0 + orbit.CARD_W, y0],
      [x0 + orbit.CARD_W, y0 + h],
      [x0, y0 + h],
    ];
    const [ax, ay] = [m.att[0], m.att[1] - m.out[1] + OUT_COMPOSE + m.body[1]];
    const k = 0.66;
    const to = [
      [ax, ay],
      [ax + orbit.CARD_W * k, ay],
      [ax + orbit.CARD_W * k, ay + h * k],
      [ax, ay + h * k],
    ].map((xy) => DK.on(c, "msg", xy, pose));
    const fly = span(t, FLY[0], FLY[1], EASE.move);
    const flying = t < FLY[1];
    st.set("#ask-card", {
      transform: DK.quadMatrix(orbit.CARD_W, h, from.map((p, i) => [lerp(p[0], to[i][0], fly), lerp(p[1], to[i][1], fly)])),
      ...fade(flying ? 1 : 0),
    });
    st.set("#ask-tail", { opacity: r3(1 - span(t, FLY[0], FLY[0] + 0.25, EASE.linear)) });
    st.set("#dk-att", { opacity: flying ? "0" : "1" });

    // The pointer comes in from the lower right as the typing ends, and presses Send; then rests beside it.
    const [sx, sy, sw, sh] = m.send;
    const press = DK.on(c, "msg", [sx + sw * 0.62, sy + sh * 0.62], pose);
    const rest = DK.on(c, "msg", [sx + sw * 0.9, sy + sh * 1.1], pose);
    if (t < tPress + 0.3)
      pointer(st, t, { from: [press[0] + 260, press[1] + 250], to: press, a: TYPED - 0.42, b: tPress - 0.06, show: TYPED - 0.5, press: tPress });
    else pointer(st, t, { from: press, to: rest, a: tPress + 0.3, b: tPress + 0.75, show: -1, bow: 0 });
    return st;
  };
  return {
    id: "ask",
    shots: ["01.2"],
    palette: "before",
    html,
    measure: {
      card: ["#ask-card", ".ls-card"],
      att: ["#dk-msg", "#dk-att"],
      out: ["#dk-msg", "#dk-out"],
      body: ["#dk-msg", "#dk-msg-body"],
      send: ["#dk-msg", "#dk-send"],
    },
    state,
  };
}

/** The message window as this shot leaves it (sent, the chip on its card), for the shots after it. */
const SENT_MEASURE = { att: ["#dk-msg", "#dk-att"] };
function sentState(st, m) {
  st.set("#dk-out", { top: px(OUT_THREAD) });
  st.set("#dk-bubble", { opacity: "1" });
  st.set("#dk-status", { top: px(OUT_THREAD + m.att[3] + 34), ...fade(1) });
  st.set("#dk-text", { $text: QUESTION });
  st.set("#dk-caret", { opacity: "0" });
  st.set("#dk-eoi", { transform: "none", ...fade(1) });
}

module.exports = askScene;
module.exports.sentState = sentState;
module.exports.SENT_MEASURE = SENT_MEASURE;
module.exports.QUESTION = QUESTION;
