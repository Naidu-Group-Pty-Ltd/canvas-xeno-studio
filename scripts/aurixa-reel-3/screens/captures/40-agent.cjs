// The Aurixa Agent (shot 09.3): the product's AgentChatWidget, docked beside the page as the person chose it (More →
// Layout → Beside the page), with Alex Morgan signed in. Its launcher; the panel it opens, headed "Aurixa"; Alex's ask
// that Jamie Chen (Harbour Finance Group) be given Jordan Ellis' file; Aurixa's turn ending on the product's approval
// card for assign_finance_partner_client ("Needs your go-ahead", "Give a finance partner a client"); and, after
// Approve, the card as the product draws it decided, with the act's own words under it. The backend answers as
// ai-dashboard-agent does (engine/handlers/agent.ts); the record adds Alex's staff row, Jamie's finance contact and
// Finance Portal account, and the workspace's Default Permission Template, as the clients and portals groups hold them
// (engine/extras/agent-partner.json).
//
// Each state is drawn whole (the viewport, 1440 x 1000) and as the panel alone (section.aurixa-panel, 448 x 976).
//
// What the scene should know is in frame (regions):
// - partnerLine: the card names the partner as "<name> (<email>)" (planFinanceAssign); the record holds no email for
//   Jamie, so it reads "Partner: Jamie Chen ()". No email address is drawn anywhere.
// - cardHeading and approvedFooter in agent-approved: "Approved", the card's own state for the agent's act (not a
//   lending approval).
//
// The panel's own "Ask Aurixa" is its composer's first placeholder ("Ask Aurixa anything…"), which turns every 4 s
// while the composer is empty; the pictures are taken while it shows. The launcher's "Ask Aurixa (Ctrl+J)" is its
// title, a tooltip the browser draws on hover, outside the page, so no picture of the page holds it.

const ASK = "Give Jamie Chen at Harbour Finance Group access to Jordan Ellis's file";

/** Waits for the composer's placeholder to turn to "Ask Aurixa anything…", so a picture has its whole 4 s. */
async function askAurixaPlaceholder() {
  const want = "Ask Aurixa anything…";
  const box = () => document.querySelector("section.aurixa-panel textarea");
  const until = Date.now() + 30000;
  const tick = () => new Promise((r) => setTimeout(r, 40));
  while (box() && box().placeholder === want && Date.now() < until) await tick();
  while (box() && box().placeholder !== want && Date.now() < until) await tick();
}

/**
 * Lays an unpainted box (opacity 0, no pointer events, outside React's tree) over each piece of text a region names
 * inside the card's lines, where the product draws several in one span, so the region can be measured. The pixels do
 * not change (checked: the panel's screenshot is byte-identical with and without them).
 */
function markRegions() {
  for (const old of document.querySelectorAll("[data-reel-region]")) old.remove();
  const detail = ".aurixa-approval li span.break-words.text-muted-foreground";
  const notice = ".aurixa-approval li span.whitespace-pre-wrap";
  const targets = [
    // [region, the span, the text, which occurrence]
    ["jordanEllis", detail, "Jordan Ellis", 0],
    ["jamieChen", detail, "Jamie Chen", 0],
  ];
  // The partner's line, whatever the record gives it after "Partner: " (its first line, up to the line's end).
  const lines = document.querySelector(notice)?.firstChild;
  if (lines && lines.nodeType === Node.TEXT_NODE && lines.data.startsWith("Partner: ")) {
    const end = lines.data.indexOf("\n");
    targets.push(["partnerLine", notice, lines.data.slice(0, end === -1 ? undefined : end), 0]);
  }
  for (const [name, within, text, nth] of targets) {
    const root = document.querySelector(within);
    if (!root) continue;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let seen = 0;
    let node;
    while ((node = walker.nextNode())) {
      let from = 0;
      let at;
      while ((at = node.data.indexOf(text, from)) !== -1) {
        if (seen++ === nth) {
          const range = document.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + text.length);
          const r = range.getBoundingClientRect();
          const mark = document.createElement("div");
          mark.dataset.reelRegion = name;
          Object.assign(mark.style, {
            position: "fixed",
            left: `${r.left}px`,
            top: `${r.top}px`,
            width: `${r.width}px`,
            height: `${r.height}px`,
            opacity: "0",
            pointerEvents: "none",
          });
          document.body.appendChild(mark);
        }
        from = at + text.length;
      }
    }
  }
}

const mark = (name) => ({ selector: `[data-reel-region="${name}"]` });
const panel = {
  panel: { selector: "section.aurixa-panel" },
  header: { selector: "section.aurixa-panel > header" },
  title: { selector: "section.aurixa-panel > header .font-heading" },
  status: { selector: "section.aurixa-panel .aurixa-panel__status" },
  composer: { selector: "section.aurixa-panel .aurixa-composer" },
  placeholder: { selector: "section.aurixa-panel textarea" },
  mistakes: { text: "Aurixa may make mistakes", exact: true },
};
const turn = {
  ask: { selector: "section.aurixa-panel .aurixa-msg .rounded-2xl.bg-primary" },
  trace: { selector: "section.aurixa-panel .aurixa-trace" },
  reply: { text: "I'll give Jamie Chen at Harbour Finance Group access" },
  card: { selector: ".aurixa-approval" },
  cardHeading: { selector: ".aurixa-approval span.uppercase" },
  cardTitle: { text: "Give a finance partner a client", exact: true },
  cardDetail: { selector: ".aurixa-approval li span.break-words.text-muted-foreground" },
  cardLines: { selector: ".aurixa-approval li span.whitespace-pre-wrap" },
  jamieChen: mark("jamieChen"),
  jordanEllis: mark("jordanEllis"),
  partnerLine: mark("partnerLine"),
};

const waiting = {
  ...panel,
  presence: { selector: "section.aurixa-panel > header .aurixa-presence" },
  ...turn,
  approve: { role: "button", name: "Approve", exact: true },
  cancel: { role: "button", name: "Cancel", exact: true },
};
// In agent-approved the list keeps to its newest message: Alex's ask is under the header, the first reply's steps in view.
const { ask: _ask, ...seen } = turn;
const decided = {
  ...panel,
  presence: { selector: "section.aurixa-panel > header .aurixa-presence" },
  ...seen,
  approvedFooter: { selector: ".aurixa-approval p.text-primary" },
  resultTrace: { selector: "section.aurixa-panel .aurixa-trace", index: 1 },
  result: { text: "Assigned Jamie Chen with default permissions" },
  followUps: { selector: "section.aurixa-panel .aurixa-followups" },
};

module.exports = [
  {
    key: "agent",
    screen: "agent",
    extras: ["agent-partner"],
    viewport: [1440, 1000],
    width: 1440,
    scale: 3,
    query: { layout: "dock" },
    steps: [
      // (a) The launcher at rest, bottom right: Aurixa in her A. `launcherArt` is her whole figure (the orbit's box),
      // which reaches past the button's own box at the apex glow and the pedestal.
      {
        shot: "agent-launcher",
        regions: {
          launcher: { selector: ".aurixa-launcher" },
          launcherArt: { selector: ".aurixa-launcher .aurixa-presence__orbit" },
        },
      },
      // The press: the panel opens beside the page, on her home.
      { tap: { selector: ".aurixa-launcher" } },
      { wait: 600 },
      { evaluate: askAurixaPlaceholder, quiet: 100 },
      { shot: "agent-panel-home", regions: { ...panel, greeting: { text: "Good morning, Alex", exact: true } } },
      { evaluate: askAurixaPlaceholder, quiet: 100 },
      { shot: "agent-panel-home-panel", of: "section.aurixa-panel", regions: { ...panel, greeting: { text: "Good morning, Alex", exact: true } } },
      // The ask, typed.
      { fill: { selector: "section.aurixa-panel textarea" }, value: ASK },
      {
        shot: "agent-panel-typed",
        regions: { ...panel, typed: { selector: "section.aurixa-panel textarea" }, send: { role: "button", name: "Send", exact: true } },
      },
      // Sent: the turn streams (about 6 s) and ends on the card.
      { press: "Enter" },
      { wait: 1200 },
      { evaluate: markRegions },
      // (b) The card, waiting for the go-ahead.
      { evaluate: askAurixaPlaceholder, quiet: 100 },
      { shot: "agent-card", regions: waiting },
      { evaluate: askAurixaPlaceholder, quiet: 100 },
      { shot: "agent-card-panel", of: "section.aurixa-panel", regions: waiting },
      // Approve: the act runs; the toast it raises ("Action approved and executed") is left to go (sonner, 4 s).
      { evaluate: () => document.querySelectorAll("[data-reel-region]").forEach((m) => m.remove()) },
      { click: "Approve", exact: true },
      { wait: 6500 },
      { evaluate: markRegions },
      // (c) The card decided, and the act's own words under it. The list keeps to its newest message, as the product
      // scrolls it, so Alex's ask has gone up under the header here.
      { evaluate: askAurixaPlaceholder, quiet: 100 },
      { shot: "agent-approved", regions: decided },
      { evaluate: askAurixaPlaceholder, quiet: 100 },
      { shot: "agent-approved-panel", of: "section.aurixa-panel", regions: decided },
    ],
  },
];
// For checks outside capture.cjs (the marker's pixel test).
module.exports.__markRegions = markRegions;
