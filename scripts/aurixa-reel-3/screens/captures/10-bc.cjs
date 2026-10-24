// The Borrowing Capacity card on Jordan's client workspace (BorrowingCapacityCard): before the press, and after it.
module.exports = [
  {
    key: "bc-card",
    screen: "bc-card",
    width: 760,
    scale: 3,
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
