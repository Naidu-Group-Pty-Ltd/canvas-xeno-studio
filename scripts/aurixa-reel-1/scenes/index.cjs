// Reel 1's scenes, in film order: each a file exporting a function that returns the scene (its id, the brief's
// shots it draws, its palette, its page, what it measures on the page and its state at a time t).
module.exports = ["brand", "research", "deliverable"].map((name) => require(`./${name}.cjs`)());
