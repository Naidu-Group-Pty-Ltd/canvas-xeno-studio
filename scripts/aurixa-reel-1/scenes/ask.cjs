// Reel 1, shot 01.2: the client asks.
const M = require("../motion.cjs");
const {
  beat,
  EASE,
  span,
  r3,
  px,
  State,
  fade,
  between,
  placeWindow,
  pointerHtml,
  pointer,
  captionHtml,
  caption,
  F,
} = M;

/** G-WINDOW holding plates given as { html, css } (edited as this shot needs), as motion.windowHtml lays them. */
const windowOf = (id, plates, z) =>
  `<div class="fk-win" id="${id}" style="z-index:${z}"><div class="fk-page" id="${id}-page">${plates
    .map(
      (p, n) =>
        `<div class="fk-scale" id="${id}-${n}" style="width:${p.css[0]}px;height:${p.css[1]}px">${p.html}</div>`,
    )
    .join("")}<div class="fk-veil" id="${id}-veil"></div></div></div>`;

// ------------------------------------------------------------------ 01.2: the question, sent
/**
 * A plain messaging window, Jordan Ellis to Alex Morgan with the listing attached: the question types itself
 * in at a reading pace while the camera eases in to the message and its Send button; the pointer presses
 * Send (the window's own pressed state), the window reads Sent, and the attached listing takes its chip,
 * Expressions of interest close Friday. It ends on A01 (frames.cjs), the animatic's still of this shot.
 */
function askScene() {
  const [tIn, tType, tPress, tChip] = [0, 1, 2, 3].map((i) => beat("01.2", i));
  const QUESTION = "Can we review whether this suits my plans?";
  const composing = F.plate("PL-01B-a");
  // A01's state: Sent, and on the attached listing the chip that says time is short.
  const sent = F.plate(
    "PL-01B-b",
    (html) =>
      `${html}<span class="ls-chip" id="eoi" style="position:absolute;left:163px;top:404px;z-index:2;box-shadow:0 8px 20px rgba(17,24,39,.2);visibility:hidden">Expressions of interest close Friday</span>`,
  );
  const css = composing.css;
  // A01's framing at the end; it starts further out, on the whole composer.
  const END = { rect: [40, 520, 1000, 560], zoom: 0.9, focus: [675, 420], at: [540, 830] };
  const START = { rect: [40, 520, 1000, 560], zoom: 0.66, focus: [905, 520], at: [540, 830] };
  // The question types at a reading pace: each character on a fixed, slightly uneven beat (a word's end
  // takes a little longer), done before the pointer reaches Send.
  const TYPED = tPress - 0.48;
  const steps = [...QUESTION].map((ch, i) => 1 + (ch === " " ? 0.9 : 0) + 0.35 * Math.sin(i * 2.3));
  const total = steps.reduce((a, b) => a + b, 0);
  const at = [];
  steps.reduce((acc, s) => {
    at.push(tType + ((TYPED - tType) * acc) / total);
    return acc + s;
  }, 0);
  const typed = (t) => at.filter((a) => t >= a).length;
  // The press lands inside Send (plate px); then, its ring spent, the hand eases off to A01's resting place,
  // just past the button's edge, beside Sent.
  const PRESS_AT = [668, 394];
  const REST = [694, 386];

  const html = () =>
    [
      // The plate's own pointer gives way to the moving one; the composer keeps its height while empty, and
      // its caret is the text's own (drawn after it, shown by --caret).
      `<style>#W .cursor { display:none !important; }
        #W-0 .note { min-height:calc(1.35em + 34px); }
        #W-0 .note::after { content:""; display:inline-block; width:2px; height:1.15em; margin-left:2px; vertical-align:-0.2em;
          background:#0f172a; opacity:var(--caret, 0); }</style>`,
      windowOf("W", [composing, sent], 5),
      pointerHtml(),
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // The camera eases in from the composer to the message and Send, and holds on Sent.
    const p = span(t, tIn + 0.05, tPress - 0.15, EASE.move);
    const framing = between(css, START, END, p);
    // Sent: the window's own state, a moment after the press.
    const isSent = span(t, tPress + 0.1, tPress + 0.22, EASE.linear);
    const g = placeWindow(st, "W", css, framing, [1, isSent]);
    // The question, typing; its caret solid while it types and blinking after, until the press.
    const n = typed(t);
    st.set("#W-0 .note", {
      $text: QUESTION.slice(0, n),
      "--caret":
        t < tType - 0.25 || t >= tPress
          ? "0"
          : t < TYPED + 0.05
            ? "1"
            : Math.floor((t - TYPED) / 0.53) % 2 === 0
              ? "0"
              : "1",
    });
    // Send's pressed state: it sinks a little and darkens, for the press.
    const down = t >= tPress && t < tPress + 0.14 ? 1 : 0;
    st.set("#W-0 .gbtn", {
      transform: `scale(${down ? 0.96 : 1})`,
      background: down ? "#2459c2" : "#2f6fde",
      "box-shadow": down ? "inset 0 3px 8px rgba(0,0,0,.28)" : "none",
    });
    // The pointer comes in from the lower right as the typing ends, and presses Send.
    const tip = g.map(PRESS_AT);
    const off = tPress + 0.36;
    if (t < off)
      pointer(st, t, {
        from: [tip[0] + 250, tip[1] + 230],
        to: tip,
        a: TYPED - 0.32,
        b: tPress - 0.06,
        show: TYPED - 0.42,
        press: tPress,
      });
    else pointer(st, t, { from: tip, to: g.map(REST), a: off, b: off + 0.45, show: -1, bow: 0 });
    // The chip on the attached listing: Expressions of interest close Friday.
    const chip = span(t, tChip, tChip + 0.34, EASE.settle);
    st.set("#eoi", {
      transform: `translateY(${px((1 - chip) * 10)}) scale(${r3(0.9 + 0.1 * chip)})`,
      "transform-origin": "0 100%",
      ...fade(chip),
    });
    return st;
  };
  return {
    id: "ask",
    shots: ["01.2"],
    palette: "before",
    html,
    measure: { send: ["#W-0", ".gbtn"], note: ["#W-0", ".note"] },
    state,
  };
}

module.exports = askScene;
