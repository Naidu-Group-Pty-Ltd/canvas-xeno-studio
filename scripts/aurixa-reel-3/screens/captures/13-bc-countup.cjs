// Maximum Borrowing Power counting up (05.2), drawn by the product itself: the card after the press, its figure set
// to each step of the count in turn and pictured where it stands, so every number the film shows on the way to
// $1,049,786 is the product's own type on the card's own ground. The steps are even in value
// (COUNT_STEPS + 1 of them, the last the engine's figure); the scene picks one per frame on the brand's settle curve.
const VALUE = 1049786;
const COUNT_STEPS = 120;
const steps = [];
for (let i = 0; i <= COUNT_STEPS; i++) {
  const v = i === COUNT_STEPS ? VALUE : Math.round((VALUE * i) / COUNT_STEPS);
  // The product's formatCurrency: en-AU, no cents.
  const text = `$${v.toLocaleString("en-AU")}`;
  steps.push(
    {
      evaluate: `(() => { const el = document.querySelector("[data-reel-count]"); el.textContent = ${JSON.stringify(text)}; })()`,
      quiet: 40,
    },
    { shot: `bc-count-${String(i).padStart(3, "0")}`, of: "[data-reel-count]" },
  );
}
module.exports = [
  {
    key: "bc-countup",
    screen: "bc-card",
    width: 760,
    scale: 3,
    clock: "2026-10-24T09:13:00+11:00",
    steps: [
      { click: "Calculate Capacity" },
      { settle: true },
      {
        // The figure's own element: the card's text-3xl line holding the engine's capacity.
        evaluate: `(() => { const el = [...document.querySelectorAll("div")].find((d) => d.children.length === 0 && d.textContent.trim() === "$1,049,786"); if (!el) throw new Error("no figure"); el.setAttribute("data-reel-count", "1"); })()`,
      },
      ...steps,
      {
        // The figure's own glyphs on nothing (every ground made transparent), for the light that crosses them.
        evaluate: `(() => { const st = document.createElement("style"); st.textContent = "*, *::before, *::after { background: transparent !important; background-image: none !important; box-shadow: none !important; backdrop-filter: none !important; border-color: transparent !important; }"; document.head.appendChild(st); })()`,
        quiet: 60,
      },
      { shot: "bc-count-glyphs", of: "[data-reel-count]", transparent: true },
    ],
    COUNT_STEPS,
    VALUE,
  },
];
