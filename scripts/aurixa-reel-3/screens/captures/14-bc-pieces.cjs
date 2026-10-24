// The Borrowing Capacity card after the press, in its parts (05.2), so the film can set them down one at a time as the
// product sets them out: the card's own ground with its title (every part of its content hidden, so the parts keep
// their places), and each part pictured where it stands on that ground: the label, the band, the two quick metrics,
// the stress test (with its bar filled and empty), the "last calculated" line and View Full Calculator. The figure is
// 13-bc-countup's. Pictured on the card itself, a part carries the card's own ground behind it, so laid back on the
// ground it is the card again, pixel for pixel.
const MARK = `(() => {
  const fig = [...document.querySelectorAll("div")].find((d) => d.children.length === 0 && d.textContent.trim() === "$1,049,786");
  if (!fig) throw new Error("no figure");
  const block = fig.parentElement;
  const content = block.parentElement;
  const [_, bandRow, grid, stress, calc, full] = content.children;
  const mark = (el, name) => el.setAttribute("data-reel-piece", name);
  mark(fig, "figure");
  mark(block.querySelector("p"), "label");
  // The band row, not the badge alone: the badge is centred at a fraction of a pixel, the row stands on whole ones.
  mark(bandRow, "band");
  mark(grid.children[0], "surplus");
  mark(grid.children[1], "dti");
  mark(stress, "stress");
  mark(calc, "calc");
  mark(full, "full");
  content.setAttribute("data-reel-content", "1");
})()`;
const piece = (name) => ({ selector: `[data-reel-piece="${name}"]` });
const NAMES = ["figure", "label", "band", "surplus", "dti", "stress", "calc", "full"];
module.exports = [
  {
    key: "bc-pieces",
    screen: "bc-card",
    width: 760,
    scale: 3,
    clock: "2026-10-24T09:13:00+11:00",
    steps: [
      { click: "Calculate Capacity" },
      { settle: true },
      { evaluate: MARK, quiet: 60 },
      ...NAMES.filter((n) => n !== "figure").map((n) => ({
        shot: `bc-pc-${n}`,
        of: `[data-reel-piece="${n}"]`,
      })),
      {
        // The stress test's bar empty: the product's Progress indicator at nought.
        evaluate: `(() => { const bar = document.querySelector('[data-reel-piece="stress"] [role="progressbar"] > div'); bar.style.transform = "translateX(-100%)"; })()`,
        quiet: 60,
      },
      { shot: "bc-pc-stress-empty", of: '[data-reel-piece="stress"]' },
      {
        evaluate: `(() => { for (const el of document.querySelector("[data-reel-content]").children) el.style.visibility = "hidden"; })()`,
        quiet: 60,
      },
      {
        shot: "bc-card-ground",
        regions: Object.fromEntries(NAMES.map((n) => [n, piece(n)])),
      },
    ],
  },
];
