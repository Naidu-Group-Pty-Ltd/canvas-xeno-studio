// Reel 2's scenes, in film order: each a file exporting a function that returns the scene (its id, the brief's
// shots it draws, its palette, its page, what it measures on the page and its state at a time t). A scene not yet
// written is left out, so a range of the film can be drawn while the rest is being made.
const fs = require("fs");
const path = require("path");

const ORDER = [
  "switchboard", // 01.1, 01.2
  "requests", // 02.1 to 02.3
  "brand", // 03.1, 03.2
  "platform", // 03.3, 03.4
  "passport", // 04.1 to 04.3
  "consent", // 05.1
  "share", // 05.2
  "network", // 05.3, 06.1
  "result", // 06.2
  "part", // 07.1
  "trial", // 07.2
  "statements", // 08.1
  "close", // 09.1
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
