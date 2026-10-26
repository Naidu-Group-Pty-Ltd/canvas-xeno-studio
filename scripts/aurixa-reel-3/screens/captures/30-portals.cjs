// The partner portals (src/screens/portals.tsx), each on the record and the extras that make Jamie Chen Jordan's finance
// broker in his own Finance Portal and put the Borrowing Capacity Snapshot in Jordan's Client Portal:
//   assessment                 the assessment Calculate Capacity saved (9:12:20 am)
//   assessment-loan            when it is there: the base assessment saved again with 14 Wattle Grove's loan (9:12:57),
//                              the one the Snapshot in 06.4 reads
//   assessment-scenario        when it is there: the scenario "14 Wattle Grove · car loan repaid" saved as the current
//                              assessment in 07.2 (9:15:04), which Jamie's portal then shows as the latest
//   portals-workspace          the workspace's switches the Finance Portal reads (its AML/CTF Compliance entry)
//   portals-finance            Jamie's contact, portal account and session (9:20:45), agreement and allocation to Jordan
//   portals-client             Jordan's portal account and session (9:19:50)
//   portals-snapshot-scenario  the Snapshot published from the current assessment (9:19:05), when the scenario is there;
//   portals-snapshot           otherwise the Snapshot published from the assessment the 06.4 Snapshot reads (9:13:10)
//
// 07.4 and 08.2: Jamie's Finance Portal at 9:21, walked as he would walk it: My Clients, Jordan's row, then the
// Borrowing Capacity tab. 08.1: Jordan's Client Portal at 9:20:30, Reports.
//
// Regions named avoid* frame words or details the film must not show: an email address, "APRA" and "APRA-compliant",
// the engine's Recommendations, and "serviceability" (beside the forbidden "Serviceable"). No region names a figure,
// so the same steps picture whichever assessment is the latest.
const fs = require("fs");
const path = require("path");
const there = (name) => fs.existsSync(path.join(__dirname, `../engine/extras/${name}.json`));
const SCENARIO = there("assessment-scenario");
const EXTRAS = [
  "assessment",
  ...(there("assessment-loan") ? ["assessment-loan"] : []),
  ...(SCENARIO ? ["assessment-scenario"] : []),
  "portals-workspace",
  "portals-finance",
  "portals-client",
  SCENARIO ? "portals-snapshot-scenario" : "portals-snapshot",
];
const card = (text) =>
  `xpath=(//div[contains(@class,'luxury-card')][.//*[normalize-space(text())='${text}' or normalize-space(.)='${text}']])[last()]`;
const stat = (label) => `xpath=//p[normalize-space(text())='${label}']/parent::div`;
const row = (label) => `xpath=//span[normalize-space(text())='${label}']/parent::div`;

/**
 * A step that waits, in the page, until `xpath` names something and the screen's height has held for half a second,
 * then checks the whole screen fits the window. A picture taller than the window is taken beyond the viewport, which
 * scrolls the profile's tab row back to its start whatever tab is open (Chromium, measured), so each capture's window
 * is as tall as its page, and a page that outgrows it stops the capture and says so rather than drawing that.
 */
const steady = (xpath) => ({
  evaluate: `(async () => {
    const want = ${JSON.stringify(xpath)};
    const root = document.querySelector("[data-shot]");
    let last = -1, held = 0;
    for (const end = Date.now() + 20000; Date.now() < end; ) {
      const h = root.getBoundingClientRect().height;
      const there = document.evaluate(want, document, null, 9, null).singleNodeValue;
      held = there && h === last ? held + 1 : 0;
      last = h;
      if (held >= 3) {
        if (h > innerHeight + 0.5)
          throw new Error("The screen is " + h + "px tall, taller than its " + innerHeight + "px window: raise the capture's viewport to at least " + Math.ceil(h));
        return;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error("Never steady: " + want);
  })()`,
});

// The Finance Portal's chrome, the same on every page.
const financeChrome = {
  sidebar: { selector: "aside.finance-portal-sidebar" },
  portalName: { selector: "aside >> text=Finance Portal" },
  partnerAccess: { text: "Partner Access" },
  userCard: { selector: "xpath=//aside//p[normalize-space(text())='Jamie Chen']/ancestor::div[contains(@class,'rounded-xl')][1]" },
  navMyClients: { role: "link", name: "My Clients" },
  topBar: { selector: "header.finance-portal-topbar" },
  topBarName: { selector: "header >> text=Jamie Chen" },
  // The portal's quick-add button (QuickAddFab), fixed at the window's bottom right over whatever is there.
  quickAdd: { selector: "[data-fab='true'] button" },
};

// Jordan's profile: its header, the cards above the tabs, and the tab row.
const profile = {
  back: { role: "link", name: "Back to clients" },
  header: { selector: "xpath=//h1[normalize-space()='Jordan Ellis']/ancestor::div[contains(@class,'luxury-card')][1]" },
  name: { selector: "main h1" },
  status: { selector: "xpath=//h1[normalize-space()='Jordan Ellis']/following-sibling::div[1]" },
  sections: { text: "sections accessible" },
  mirror: { selector: card("Client view mirror") },
  avoidEmailMirror: { text: "currently sees in their portal" },
  team: { selector: card("Property team") },
  teamBroker: { selector: "xpath=//li[.//p[normalize-space(text())='Finance broker']]" },
  tabRow: { selector: "xpath=//button[@data-tab-key='properties']/parent::div" },
  tabPrev: { role: "button", name: "Previous tab" },
  tabNext: { role: "button", name: "Next tab" },
};

const JORDAN_ROW = "div[role=button]:has-text('Jordan Ellis')";
const PROPERTIES_PANEL = card("Owner-occupied, investment, SMSF and rental properties.");
const BC_PANEL = "xpath=//div[@class='space-y-4'][.//p[normalize-space(text())='Maximum borrowing']]";
const HEADER = "xpath=//h1[normalize-space()='Jordan Ellis']/ancestor::div[contains(@class,'luxury-card')][1]";
const tabs = {
  tabDocuments: { selector: "[data-tab-key='documents']" },
  tabBorrowingCapacity: { selector: "[data-tab-key='borrowing_capacity']" },
  tabMessageHub: { selector: "[data-tab-key='messages']" },
  tabPurchaseFiles: { selector: "[data-tab-key='purchase_files']" },
};
const panel = {
  hero: { selector: card("Maximum borrowing") },
  panelTitle: { selector: "xpath=//h3[contains(.,'Borrowing Capacity')]" },
  latest: { text: "Latest assessment ·" },
  avoidServiceability: { text: "serviceability" },
  maximumLabel: { text: "Maximum borrowing", exact: true },
  maximum: { selector: "xpath=//p[normalize-space(text())='Maximum borrowing']/following-sibling::p[1]" },
  surplus: { selector: stat("Monthly surplus") },
  dti: { selector: stat("DTI ratio") },
  stress: { selector: stat("Stress-tested") },
  term: { selector: stat("Loan term") },
  inputs: { selector: card("Inputs used") },
  inputsTitle: { text: "Inputs used", exact: true },
  grossIncome: { selector: row("Gross annual income") },
  livingExpenses: { selector: row("Living expenses (monthly)") },
  commitments: { selector: row("Existing commitments (monthly)") },
  assessmentRate: { selector: row("Assessment rate") },
  avoidBufferApra: { selector: row("Buffer rate (APRA)") },
  avoidRecommendations: { selector: card("Recommendations") },
  avoidApraFooter: { selector: "xpath=//p[contains(.,'APRA-compliant')]" },
};
const finance = { screen: "fp-clients", extras: EXTRAS, clock: "2026-10-24T09:21:00+11:00", width: 1440, scale: 3 };
// After a press the pointer is moved off the page's cards, onto the sidebar's closing line (it does nothing), so no card
// is drawn in its hover state where the pointer happened to stop.
const park = { tap: { text: "Secured · Encrypted in transit and at rest" } };
// Jamie's path into Jordan's profile: his row on My Clients, pressed.
const openJordan = [
  steady(`//div[@role='button'][contains(.,'Jordan Ellis')]`),
  { tap: { selector: JORDAN_ROW } },
  park,
  steady(`//p[normalize-space()='Owner-occupied, investment, SMSF and rental properties.']`),
];

const REPORT_CARD = "xpath=//div[contains(@class,'client-portal-soft-panel')][.//button[contains(.,'Download Report')]]";
const reportCard = {
  icon: { selector: "xpath=//div[contains(@class,'client-portal-soft-panel')][.//button[contains(.,'Download Report')]]//div[contains(@class,'rounded-xl')][1]" },
  reportTitle: { selector: "xpath=//p[starts-with(normalize-space(),'Borrowing Capacity –')]" },
  newBadge: { text: "New", exact: true },
  label: { selector: "xpath=//div[contains(@class,'client-portal-soft-panel')]//div[contains(@class,'inline-flex')][normalize-space()='Borrowing Capacity']" },
  published: { selector: "xpath=//div[contains(@class,'client-portal-soft-panel')]//div[contains(@class,'text-right')]/p[1]" },
  publishedAgo: { selector: "xpath=//div[contains(@class,'client-portal-soft-panel')]//div[contains(@class,'text-right')]/p[2]" },
  download: { role: "button", name: "Download Report" },
};

module.exports = [
  // My Clients, as Jamie opens it (the window is the portal's own height; the list is short).
  {
    ...finance,
    key: "fp-clients",
    viewport: [1440, 1000],
    steps: [
      steady(`//div[@role='button'][contains(.,'Jordan Ellis')]`),
      {
        shot: "fp-clients",
        regions: {
          ...financeChrome,
          title: { selector: "main h1" },
          count: { text: "client assigned to you" },
          search: { selector: "xpath=//input[starts-with(@placeholder,'Search clients')]/parent::div" },
          jordanRow: { selector: JORDAN_ROW },
          jordanName: { selector: "div[role=button] >> text=Jordan Ellis" },
          jordanStatus: { selector: "div[role=button] >> text=Active" },
          jordanSections: { selector: "div[role=button] >> text=/^\\d+\\/\\d+$/" },
          governed: { text: "Data access governed by permission policies" },
        },
      },
    ],
  },
  // Jordan's profile as it opens, on its first open tab (Properties; the record holds none), then with the tab row
  // scrolled along, as a person scrolls it, until Borrowing Capacity is in view (it sits past Notes). The page is 1157px.
  {
    ...finance,
    key: "fp-profile",
    viewport: [1440, 1160],
    steps: [
      ...openJordan,
      {
        shot: "fp-profile-opened",
        regions: {
          ...financeChrome,
          ...profile,
          tabProperties: { selector: "[data-tab-key='properties']" },
          openedPanel: { selector: PROPERTIES_PANEL },
        },
      },
      {
        evaluate: () =>
          document
            .querySelector("[data-tab-key='borrowing_capacity']")
            .scrollIntoView({ behavior: "instant", inline: "center", block: "nearest" }),
      },
      steady(`//button[@data-tab-key='borrowing_capacity']`),
      { shot: "fp-profile-tabs", regions: { ...financeChrome, ...profile, ...tabs } },
    ],
  },
  // The Borrowing Capacity tab pressed: the latest assessment, its figures and the inputs used (07.4), and the profile's
  // header with its sections line (08.2). The page is 1680px with the first assessment.
  {
    ...finance,
    key: "fp-bc",
    viewport: [1440, 1690],
    steps: [
      ...openJordan,
      { click: "Borrowing Capacity" },
      park,
      steady(`//p[normalize-space(text())='Maximum borrowing']`),
      {
        shot: "fp-profile-bc",
        regions: { ...financeChrome, ...profile, ...tabs, panel: { selector: BC_PANEL }, ...panel },
      },
      // The quick-add button floats over the panel's bottom right (the Recommendations and the footer).
      { shot: "fp-bc-panel", of: BC_PANEL, regions: { ...panel, quickAdd: financeChrome.quickAdd } },
      {
        shot: "fp-profile-header",
        of: HEADER,
        regions: {
          avatar: { selector: `${HEADER}//span[contains(@class,'rounded-full')][1]` },
          name: { selector: "main h1" },
          status: { selector: "xpath=//h1[normalize-space()='Jordan Ellis']/following-sibling::div[1]" },
          sections: { text: "sections accessible" },
        },
      },
    ],
  },
  // Jordan's Client Portal on Reports (08.1). The page is 1104px (the portal's menu).
  {
    key: "cp-reports",
    screen: "cp-reports",
    extras: EXTRAS,
    clock: "2026-10-24T09:20:30+11:00",
    viewport: [1440, 1110],
    width: 1440,
    scale: 3,
    steps: [
      steady(`//button[contains(.,'Download Report')]`),
      {
        shot: "cp-reports",
        regions: {
          sidebar: { selector: "aside.client-portal-sidebar" },
          brand: { selector: "aside >> text=Aurixa Systems" },
          secureAccess: { text: "Secure Access" },
          bell: { selector: "aside button.h-9.w-9" },
          userName: { selector: "aside >> text=Jordan Ellis" },
          avoidEmail: { text: "jordan.ellis@example.com" },
          navReports: { role: "link", name: "Reports" },
          header: { selector: ".client-portal-page-header" },
          title: { selector: "main h1" },
          subtitle: { text: "View reports and request new analyses" },
          requestReport: { role: "button", name: "Request Report" },
          tabMyReports: { role: "tab", name: "My Reports" },
          search: { selector: "input[placeholder='Search reports...']" },
          filterBorrowingCapacity: { role: "button", name: "Borrowing Capacity", exact: true },
          card: { selector: REPORT_CARD },
          ...reportCard,
          showing: { text: "Showing 1 report" },
        },
      },
      { shot: "cp-report-card", of: REPORT_CARD, regions: reportCard },
    ],
  },
];
