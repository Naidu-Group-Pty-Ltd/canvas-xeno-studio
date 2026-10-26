// The Borrowing Capacity card on Jordan's client workspace (BorrowingCapacityCard): before the press, and after it.
module.exports = [
  {
    key: "bc-card",
    screen: "bc-card",
    width: 760,
    scale: 3,
    // The page's clock a moment after the engine's save (it stamps from 9:12:40), so "Last calculated" reads as the
    // product says it a moment after the press: "less than a minute ago", never "in less than a minute".
    clock: "2026-10-24T09:13:00+11:00",
    steps: [
      {
        shot: "bc-card-empty",
        regions: {
          calculate: { role: "button", name: "Calculate Capacity" },
          title: { text: "Borrowing Capacity", exact: true },
        },
      },
      { click: "Calculate Capacity" },
      { settle: true },
      {
        shot: "bc-card-result",
        regions: {
          figure: { text: "$1,049,786" },
          label: { text: "Maximum Borrowing Power" },
          band: { text: "Strong Position" },
          surplus: { text: "$8,827" },
          dti: { text: "3.6x" },
          stress: { text: "$964,993" },
          stressBar: { selector: '[role="progressbar"]' },
          calculated: { text: "Last calculated" },
          full: { role: "button", name: "View Full Calculator" },
        },
      },
    ],
  },
];
