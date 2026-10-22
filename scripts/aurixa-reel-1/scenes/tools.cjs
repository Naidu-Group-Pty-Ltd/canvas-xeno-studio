// Reel 1, shot 02.1 (third cut): four tools, one question.
const M = require("../motion.cjs");
const { beat, EASE, span, lerp, r3, px, State, fade, pointerHtml, pointer, captionHtml, caption } = M;
const DK = require("../desk.cjs");
const ask = require("./ask.cjs");

const IDS = ["msg", "inbox", "research", "sheet", "contact", "report"];

/**
 * The camera pulls back from the sent message: it is one window of a desk of them, in depth, each a different
 * tool in its own style under the same daylight. The question lands in a generic inbox as its top row and the
 * pointer goes to Reply, and stops: there is nothing to reply with yet. Then one continuous move through the
 * desk: a swing to the research tool (a map and comparable sales, still placeholders), a whip right to the
 * worksheet (one formula cell selected), a whip down and left to Jordan Ellis's contact card, and the empty
 * report behind them all, its caret blinking; the camera pulls back until the four hang in the frame together,
 * misaligned and overlapping, none finished, and the pointer hops once between them and stops.
 */
function toolsScene() {
  const [tIn, tResearch, tSheet, tContact, tReport, tHop] = [0, 1, 2, 3, 4, 5].map((i) => beat("02.1", i));
  const tOut = M.shotOf("02.1").out;
  // The moves the camera makes fast (the swing and the two whips): drawn four times a frame, for their blur.
  const fast = (t) =>
    [tResearch, tSheet, tContact].some((b) => t > b - 0.05 && t < b + 0.8) ||
    (t > tIn && t < tIn + 1.8) ||
    (t > tReport - 0.05 && t < tHop + 0.05);
  // The question lands in the inbox as the camera arrives on it, and the pointer goes to Reply.
  const LAND = tIn + 1.25;

  const html = () => [`<style>${DK.CSS}</style>`, DK.roomHtml(IDS), pointerHtml(), captionHtml()].join("");

  const state = (time, m) => {
    const st = new State();
    const t = DK.tick(time, fast(time) ? 240 : 120);
    caption(st, t, m);
    const c = DK.cameraAt(t);
    DK.placeRoom(st, c, IDS, { fades: DK.fadesAt(t) });

    // The message window as 01.2 left it: sent, the chip on its card.
    ask.sentState(st, m);

    // The inbox: the question lands as the top row, the rows below making room, and its reading pane opens.
    const land = span(t, LAND, LAND + 0.5, EASE.settle);
    const rowH = m.rows[1][1] - m.rows[0][1];
    m.rows.forEach((_, i) => {
      if (i === 0)
        st.set("#dk-inbox .bp-row", { transform: `translateY(${px((1 - land) * -24)})`, ...fade(span(t, LAND, LAND + 0.25, EASE.linear)) }, 0);
      else st.set("#dk-inbox .bp-row", { transform: `translateY(${px((1 - land) * -rowH)})` }, i);
    });
    st.set("#dk-read", { transform: `translateY(${px((1 - span(t, LAND + 0.15, LAND + 0.6, EASE.settle)) * 16)})`, ...fade(span(t, LAND + 0.15, LAND + 0.5, EASE.settle)) });

    // The worksheet's selected cell and the empty report: their carets blink.
    const blink = (from) => (t < from || Math.floor((t - from) / 0.53) % 2 === 0 ? "1" : "0");
    st.set("#dk-cell-caret", { opacity: blink(tSheet + 0.3) });
    st.set("#dk-report-caret", { opacity: blink(tReport + 0.2) });

    // The pointer: in to Reply as the question lands, where it stops; gone while the camera moves through the
    // desk; back for one hop between the four, ending on the empty report.
    const reply = DK.on(c, "inbox", [m.reply[0] + m.reply[2] * 0.8, m.reply[1] + m.reply[3] * 0.7]);
    if (t < tReport) {
      pointer(st, t, {
        from: [reply[0] + 240, reply[1] + 280],
        to: reply,
        a: LAND + 0.2,
        b: LAND + 0.75,
        show: LAND + 0.1,
        hide: tResearch - 0.05,
      });
    } else {
      // Each tool's own point: a comparable sale, the selected cell, the contact's name, the report's caret.
      const stops = [
        DK.on(c, "research", [760, 300]),
        DK.on(c, "sheet", [m.cell[0] + m.cell[2] * 0.6, m.cell[1] + m.cell[3] * 0.62]),
        DK.on(c, "contact", [300, 230]),
        DK.on(c, "report", [m.caret[0] + 30, m.caret[1] + 40]),
      ];
      const hops = [0, 1, 2].map((k) => [tHop + k * 0.3, tHop + k * 0.3 + 0.22]);
      let leg = 0;
      while (leg < hops.length - 1 && t >= hops[leg + 1][0]) leg++;
      pointer(st, t, {
        from: stops[leg],
        to: stops[leg + 1],
        a: hops[leg][0],
        b: hops[leg][1],
        show: tHop - 0.18,
        bow: 0.16,
        // Gone before the cut: 03.1 holds the four with nobody's hand on them.
        hide: tOut - 0.3,
      });
    }
    return st;
  };
  return {
    id: "tools",
    shots: ["02.1"],
    palette: "before",
    html,
    measure: {
      ...ask.SENT_MEASURE,
      rows: ["#dk-inbox", ".bp-row", true],
      reply: ["#dk-inbox", "#dk-reply"],
      cell: ["#dk-sheet", ".dk-sel"],
      caret: ["#dk-report", "#dk-report-caret"],
    },
    state,
  };
}

module.exports = toolsScene;
