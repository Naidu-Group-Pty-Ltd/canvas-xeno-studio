// Reel 3's scenes, in film order: each a file exporting a function that returns the scene (its id, the brief's
// shots it draws, its palette, its page, what it measures on the page and its state at a time t). A scene not yet
// written is left out, so a range of the film can be drawn while the rest is being made.
const fs = require("fs");
const path = require("path");

const ORDER = [
  "question", // 01.1 to 01.3
  "oldway", // 02.1 to 02.3
  "brand", // 03.1
  "factfind", // 04.1, 04.2
  "click", // 05.1, 05.2
  "page", // 05.3 to 05.5
  "chain", // 05.6
  "scenarios", // 06.1 to 06.3
  "snapshot", // 06.4
  "handover", // 07.1 to 07.3
  "broker", // 07.4
  "gains", // 08.1 to 08.3
  "platform", // 09.1 to 09.3
  "means", // 10.1
  "arrived", // 11.1
  "trial", // 12.1
  "statements", // 13.1
  "close", // 14.1
];

const scenes = [];
for (const name of ORDER) {
  if (!fs.existsSync(path.join(__dirname, `${name}.cjs`))) continue;
  try {
    scenes.push(require(`./${name}.cjs`)());
  } catch (err) {
    console.warn(`scenes/${name}.cjs left out: ${err.message}`);
  }
}
module.exports = scenes;
