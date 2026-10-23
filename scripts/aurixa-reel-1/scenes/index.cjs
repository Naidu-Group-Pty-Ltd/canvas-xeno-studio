// Reel 1's scenes, in film order: each a file exporting a function that returns the scene (its id, the brief's
// shots it draws, its palette, its page, what it measures on the page and its state at a time t). A scene not
// yet written is left out, so a range of the film can be drawn while the rest is being made; so is one that
// cannot be built against the brief as it stands (it says why), so the shots around it can still be drawn.
const fs = require("fs");
const path = require("path");

// The third cut (22 October 2026): 27 shots. The second cut's listing (01.1), horizon (10.1), demo (11.2), tour
// (12.1) and connected (12.4) scenes are gone, replaced by orbit, sunrise, trial, marketplace and devices.
const ORDER = [
  "orbit", // 01.1
  "ask", // 01.2
  "tools", // 02.1
  "waits", // 03.1
  "brand", // 04.1
  "portals", // 04.2
  "research", // 05.1
  "deliverable", // 05.2
  "hub", // 06.1
  "team", // 06.2
  "agent", // 06.3
  "approve", // 07.1
  "accountant", // 08.1
  "pages", // 08.2
  "clientReports", // 08.3
  "bridge", // 09.1
  "register", // 09.2
  "sunrise", // 10.1
  "invitation", // 10.2
  "trial", // 11.1
  "marketplace", // 12.1
  "builder", // 12.2 and 12.3
  "devices", // 12.4
  "decision", // 13.1
  "wall", // 14.1
  "close", // 15.1
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
