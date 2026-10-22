// Helvetica's advance widths, in 1/1000 em: the standard Type 1 metrics pdf-lib measures the Investment
// PDF's text with (StandardFonts.Helvetica, HelveticaBold), as Liberation Sans draws them. Liberation Sans is
// Helvetica's metric twin, so a line broken with these widths breaks where the product's PDF breaks it.
// Printable ASCII from the space (32) to the tilde (126), then the few other characters the pages use.
const REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];
const EXTRA = {
  regular: {
    "•": 350,
    "–": 556,
    "—": 1000,
    "’": 222,
    "‘": 222,
    "“": 333,
    "”": 333,
    "²": 333,
    "·": 333,
    "…": 1000,
    é: 556,
  },
  bold: {
    "•": 350,
    "–": 556,
    "—": 1000,
    "’": 278,
    "‘": 278,
    "“": 500,
    "”": 500,
    "²": 333,
    "·": 333,
    "…": 1000,
    é: 556,
  },
};

/** The width of `text` at `size` pt, as pdf-lib measures it (no kerning). */
function widthOf(text, size, bold = false) {
  const table = bold ? BOLD : REGULAR;
  const extra = bold ? EXTRA.bold : EXTRA.regular;
  let units = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    units +=
      code >= 32 && code < 127 ? table[code - 32] : (extra[ch] ?? table["?".charCodeAt(0) - 32]);
  }
  return (units * size) / 1000;
}

module.exports = { widthOf };
