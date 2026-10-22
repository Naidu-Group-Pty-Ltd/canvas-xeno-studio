// Reel 1, shot 07.1: the professional changes the agent's draft in her own words, then approves it. The window
// floats in depth (./workflowStage.cjs).
const M = require("../motion.cjs");
const {
  beat,
  EASE,
  span,
  lerp,
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
  railHtml,
  F,
  KIT,
} = M;
const S = require("./workflowStage.cjs");

/** `find` replaced by `put` in `html`, where it is there exactly once. */
const once = (html, find, put, what) => {
  const n = html.split(find).length - 1;
  if (n !== 1)
    throw new Error(`${what}: "${find.slice(0, 48)}" is on the page ${n} times, not once`);
  return html.replace(find, () => put);
};
/** The element whose opening tag starts at `at` in `html`, through its own closing tag. */
function element(html, at) {
  const tag = at >= 0 ? /^<([a-z]+)[\s>]/.exec(html.slice(at, at + 16))?.[1] : null;
  if (!tag) throw new Error(`No element at ${at}`);
  const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
  re.lastIndex = at;
  let depth = 0;
  for (let m; (m = re.exec(html));) {
    depth += m[0][1] === "/" ? -1 : 1;
    if (depth === 0) return html.slice(at, m.index + m[0].length);
  }
  throw new Error(`An unclosed <${tag}> at ${at}`);
}

// ------------------------------------------------------------------ 07.1: her change, then her go-ahead
function approveScene() {
  const [t0, tType, tPress] = [0, 1, 2].map((i) => beat("07.1", i));
  // Close on the draft's next step and the composer under it; the camera holds there while she types and as
  // the draft takes her change, then rises once to F07 (her message, the agent's trace and the revised draft)
  // and holds for the approval.
  const ZOOM = 2.07;
  const F07 = { rect: [40, 384, 1000, 900], zoom: ZOOM, focus: [1272, 495], at: [540, 834] };
  const TYPING = { ...F07, focus: [1272, 652] };
  // Her change, typed into the agent's composer: a letter at a time, at a pace the words can be read as they
  // come, each word taking the marker (G-HIGHLIGHT, a K px gold rule 1 px under the line, as the stills draw it)
  // once it is typed.
  const TYPED = "Make the next step: review the remaining questions together";
  const WORDS = TYPED.split(" ");
  const STARTS = WORDS.map((_, i) => WORDS.slice(0, i).join(" ").length + (i ? 1 : 0));
  const PER_CHAR = 1 / 45;
  const typedBy = (t) =>
    t < tType ? 0 : Math.min(TYPED.length, Math.floor((t - tType) / PER_CHAR) + 1);
  const tTyped = tType + (TYPED.length - 1) * PER_CHAR;
  const tCaret = t0 + 0.13; // the composer takes the caret; its placeholder stays until the first letter
  const tSend = tTyped + 0.08; // and she sends it
  const RULE_H = KIT.K / ZOOM;
  const rule = `background:linear-gradient(var(--reel-hairline),var(--reel-hairline)) 0 100%/0% ${r3(RULE_H)}px no-repeat;padding-bottom:${r3((1 + KIT.K) / ZOOM)}px`;
  const PLACEHOLDER = "Plan tomorrow's briefing...";

  // Typing: the composer as a field she types into, its text held to its two lines from the top so a line
  // that wraps never moves the one above it.
  const typing = F.plate("PL-07A-a", (html) =>
    once(
      once(
        html,
        "Next step: discuss the next step.",
        'Next step: <span id="old">discuss the next step.</span>',
        "PL-07A-a's draft",
      ),
      `<span style="color:#f4f4f5">${TYPED}<span class="qcaret"></span></span>`,
      `<span id="tx" style="color:#f4f4f5;height:2lh"><span id="ph" style="color:#77777f;display:none"><span class="qcaret" id="c0" style="margin-left:0;margin-right:-2px"></span>${PLACEHOLDER}</span>${WORDS.map(
        (w, i) =>
          `<br id="br${i}" style="display:none"><span id="wd${i}"><span id="wm${i}" style="${rule}">${w}</span>${i < WORDS.length - 1 ? `<span id="ws${i}"> </span>` : ""}</span>`,
      ).join("")}<span class="qcaret" id="c1"></span></span>`,
      "PL-07A-a's composer",
    ),
  );
  // Sent: her message and the agent's revised draft, which the thread sets exactly where the draft stood (it is
  // the thread's last card either way), so in the close framing the draft's next step changes in place. The
  // revised draft waits for her go-ahead (the heading, the action's colour, the gold border and Approve /
  // Cancel are the pending card's own) and turns Approved when she presses Approve; its changed line takes the
  // marker.
  const sent = F.plate("PL-07A-b", (html) => {
    if (!html.includes(PLACEHOLDER))
      throw new Error("PL-07A-b: its composer no longer holds the placeholder");
    const given = '<div class="qappr given">';
    const [head, tail, ...more] = html.split(given);
    if (tail === undefined || more.length) throw new Error("PL-07A-b: no single approved card");
    const pendingHead = element(head, head.lastIndexOf('<div class="qapprh">'));
    const pendingKeys = element(head, head.lastIndexOf('<div class="qapprk">'));
    const givenHead = element(tail, tail.indexOf('<div class="qapprh">'));
    const givenFoot = element(tail, tail.indexOf('<div class="qapprf">'));
    const changed = "review the remaining questions together.";
    let card = once(
      tail,
      givenHead,
      `<div style="position:relative">${pendingHead.replace('class="qapprh"', 'class="qapprh" id="h2p"')}${givenHead.replace('class="qapprh"', 'class="qapprh" id="h2a" style="position:absolute;left:0;right:0;top:0"')}</div>`,
      "PL-07A-b's heading",
    );
    card = once(
      card,
      givenFoot,
      `<div id="f2" style="position:relative;overflow:hidden">${pendingKeys.replace('class="qapprk"', 'class="qapprk" id="f2k"')}${givenFoot.replace('class="qapprf"', 'class="qapprf" id="f2a" style="position:absolute;left:0;right:0;top:0"')}</div>`,
      "PL-07A-b's footer",
    );
    card = once(
      card,
      `Next step: ${changed}`,
      `Next step: <span id="mk2" style="${rule}">${changed}</span>`,
      "PL-07A-b's changed line",
    );
    return `${head}<div class="qappr given" id="ap2">${card}`;
  });
  const css = typing.css;

  const html = () =>
    [
      S.stageHtml(),
      S.stageWindow("W", [typing, sent], 5),
      railHtml("rail", "Team"),
      pointerHtml(),
      captionHtml(),
    ].join("");

  /** A colour between two [r, g, b, a], as rgba(). */
  const mix = (a, b, p) =>
    `rgba(${a
      .map((v, i) => {
        const x = lerp(v, b[i], p);
        return i < 3 ? Math.round(x) : r3(x);
      })
      .join(",")})`;
  const GOLD = [229, 185, 58];

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    st.set("#rail", fade(1));
    // The composer until she sends; then the thread with her message and the agent's revised draft in it.
    // Her text leaves the composer at once; the draft's next step goes, and the revised one takes its place.
    // Then the camera drifts up to F07, nearly there by the press, and settles as the card turns Approved.
    const sent = span(t, tSend, tSend + 0.24, EASE.linear);
    const rise = span(t, tSend + 0.1, tSend + 1.0, EASE.move);
    const fr = between(css, TYPING, F07, rise);
    const P = S.stageState(st, fr.rect, S.drift(t));
    // The thread is laid over the composer's state, which stays whole beneath until it is covered, so the
    // page never dims through the change.
    const g = placeWindow(st, "W", css, fr, [sent < 1 ? 1 : 0, sent], { transform: P.css });
    st.set("#tx", fade(1 - span(t, tSend, tSend + 0.06, EASE.linear)));
    st.set("#old", fade(1 - span(t, tSend + 0.04, tSend + 0.12, EASE.linear)));

    // ---- Typing (layer 0)
    const n = typedBy(t);
    st.set("#ph", { display: n === 0 ? "inline" : "none" });
    st.set("#c0", fade(t >= tCaret && n === 0 ? 1 : 0));
    st.set("#c1", fade(n > 0 ? 1 : 0));
    WORDS.forEach((w, i) => {
      const letters = Math.max(0, Math.min(w.length, n - STARTS[i]));
      st.set(`#br${i}`, { display: i === m.wrapAt && letters > 0 ? "inline" : "none" });
      st.set(`#wd${i}`, { display: letters > 0 ? "inline" : "none" });
      st.set(`#wm${i}`, { $text: w.slice(0, letters) });
      if (i < WORDS.length - 1)
        st.set(`#ws${i}`, { display: n > STARTS[i] + w.length ? "inline" : "none" });
      // The marker under the word, drawn left to right once its last letter is typed.
      const done = tType + (STARTS[i] + w.length - 1) * PER_CHAR;
      const drawn = span(t, done, done + 0.3, EASE.settle);
      st.set(`#wm${i}`, { "background-size": `${r3(drawn * 100)}% ${r3(RULE_H)}px` });
    });

    // ---- Sent (layer 1): the draft's changed line, which takes the marker once it is there.
    const changed = span(t, tSend + 0.26, tSend + 0.68, EASE.settle);
    st.set("#mk2", {
      "background-size": `${r3(changed * 100)}% ${r3(RULE_H)}px`,
      ...fade(span(t, tSend + 0.14, tSend + 0.26, EASE.linear)),
    });
    // Approve pressed: the card's heading, colour and footer become the approved card's, and the footer closes
    // up to the approved line.
    const given = span(t, tPress + 0.04, tPress + 0.22, EASE.linear);
    st.set("#ap2", {
      "border-color": mix([...GOLD, 0.45], [81, 70, 41, 0.75], given),
      "box-shadow": `0 0 0 3px ${mix([...GOLD, 0.08], [...GOLD, 0], given)}`,
    });
    st.set("#ap2 .qacti", {
      background: mix([...GOLD, 0.12], [31, 31, 31, 1], given),
      color: mix([...GOLD, 1], [140, 140, 140, 1], given),
    });
    // The pending words go, then the approved ones come, so the two are never read on top of each other.
    const out = 1 - span(t, tPress + 0.04, tPress + 0.13, EASE.linear);
    const into = span(t, tPress + 0.11, tPress + 0.24, EASE.linear);
    st.set("#h2p", fade(out));
    st.set("#h2a", fade(into));
    st.set("#f2k", fade(out));
    st.set("#f2a", fade(into));
    st.set("#f2", {
      height: px(lerp(m.keys, m.approved, span(t, tPress + 0.04, tPress + 0.42, EASE.move))),
    });

    // The pointer comes in over the revised draft as the camera rises, presses Approve and is gone; its points
    // are the page's, carried through the window's turn.
    const on = (pt) => P.map(g.map(pt));
    pointer(st, t, {
      from: on(m.from),
      to: on(m.approve),
      a: tSend + 0.18,
      b: tPress - 0.07,
      show: tSend + 0.16,
      hide: tPress + 0.36,
      press: tPress,
    });
    return st;
  };

  return {
    id: "approve",
    shots: ["07.1"],
    palette: "aurixa",
    html,
    measure: {
      words: ["#W-0", '#tx > [id^="wd"]', true],
      before: ["#W-0", ".qagb > *", true],
      after: ["#W-1", ".qagb > *", true],
      button: ["#W-1", "#f2k .qbtn"],
      keys: ["#W-1", "#f2k"],
      approved: ["#W-1", "#f2a"],
    },
    derive(m) {
      // The word the composer wraps at, where the whole change sits (each word's box, typed in full).
      const top = m.words[0][1];
      const wrapAt = m.words.findIndex(([, y]) => y > top + 4);
      // The revised draft, waiting, stands exactly where the draft did: the two give way to one another in place.
      const draft = m.before[m.before.length - 1];
      const revised = m.after[m.after.length - 1];
      if (draft.some((v, i) => Math.abs(v - revised[i]) > 0.5))
        throw new Error(
          `PL-07A: the revised draft is not where the draft was (${draft} vs ${revised})`,
        );
      const [x, y, w, h] = m.button;
      const approve = [x + w * 0.55, y + h * 0.62];
      return {
        ...m,
        wrapAt,
        keys: m.keys[3],
        approved: m.approved[3],
        // The pointer's tip on Approve's label, and where it comes from: over the draft's preview.
        approve,
        from: [approve[0] + 190, approve[1] - 95],
      };
    },
    state,
  };
}

module.exports = approveScene;
