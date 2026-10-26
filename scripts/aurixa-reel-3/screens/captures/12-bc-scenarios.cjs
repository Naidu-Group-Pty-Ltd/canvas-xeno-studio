// Portfolio Scenario Modelling (StrategyScenarioModeling, the Borrowing Capacity page's second tab), as the film shows
// it in 06.1 to 06.3 and 07.2. Every figure is the page's own engine (src/utils/scenarioDeltaEngine.ts) on the
// product's saved assessment.
//
// - 06.2: 14 Wattle Grove brought into "Model next purchase": its price, Jordan's cash on hand from the fact find's
//   savings, NSW, an investor's new build. The product's own verdict on it.
// - 06.3: the deposit adjusted (the cash on hand moved); the structures tried (the car loan paid out of the cash on
//   hand, then rates a point higher); the scenarios saved one by one.
// - 07.2: the chosen scenario loaded into the calculator and saved as the current assessment, with the product's own
//   toast confirming it.
//
// The viewport is taller than the page, so nothing scrolls and the workspace's dock never pins over a card (it pins
// once the hero's Back leaves the view, useStickyDock).
const CARD = (title) =>
  `xpath=//div[contains(@class,'luxury-card')][.//*[normalize-space(text())='${title}']][not(.//div[contains(@class,'luxury-card')][.//*[normalize-space(text())='${title}']])]`;
const CARD_STARTS = (start) =>
  `xpath=//div[contains(@class,'luxury-card')][.//*[starts-with(normalize-space(text()),'${start}')]][not(.//div[contains(@class,'luxury-card')][.//*[starts-with(normalize-space(text()),'${start}')]])]`;
const ACQ = CARD("Model next purchase");
const HEAD = CARD("Scenario Borrowing Capacity");
const DEBTS = CARD("Debt Consolidation");
const RATES = CARD("Interest Rate Adjustment");
const SAVED = CARD_STARTS("Saved Scenarios");
const RATIONALE = CARD("Strategy Rationale");
const CANVAS = CARD("Capital Flow Canvas");
const ACTIONS = `xpath=//button[normalize-space(.)='Save Scenario']/..`;
const NAMING = `xpath=//input[@placeholder='Scenario name...']/..`;
const RESULTS = CARD("Results");
const selectAfter = (label) =>
  `xpath=//label[normalize-space(text())='${label}']/following-sibling::button[@role='combobox'][1]`;
const debtRow = (label) =>
  `xpath=//div[contains(@class,'cursor-pointer') and contains(@class,'rounded-lg')][.//p[normalize-space(text())='${label}']]`;
const savedRow = (name) =>
  `xpath=//div[contains(@class,'rounded-lg') and contains(@class,'justify-between')][.//p[normalize-space(text())='${name}']]`;
const within = (root, rest) => `${root}${rest}`;

/** The three scenarios, in the order they are saved, and the one taken to the broker. */
const SCENARIOS = ["14 Wattle Grove", "14 Wattle Grove · car loan repaid", "14 Wattle Grove · rates +1%"];
const CHOSEN = SCENARIOS[1];

const save = (name, shotName) => [
  { tap: { role: "button", name: "Save Scenario" } },
  { fill: { selector: 'input[placeholder="Scenario name..."]' }, value: name },
  ...(shotName
    ? [
        {
          shot: shotName,
          of: NAMING,
          regions: {
            input: { selector: 'input[placeholder="Scenario name..."]' },
            save: { selector: `${NAMING}//button[normalize-space(.)='Save']` },
            cancel: { selector: `${NAMING}//button[normalize-space(.)='Cancel']` },
          },
        },
      ]
    : []),
  { tap: { selector: `xpath=//input[@placeholder='Scenario name...']/following-sibling::button[normalize-space(.)='Save']` } },
];

const purchaseRegions = () => ({
  header: { text: "Acquisition / Purchase Power" },
  phase: { selector: within(ACQ, "//*[normalize-space(text())='Phase 2']") },
  targetMet: { selector: within(ACQ, "//*[normalize-space(text())='Target met']") },
  modelNext: { text: "Model next purchase", exact: true },
  adds: { text: "Adds stamp duty, LMI, cash-on-hand" },
  enable: { selector: within(ACQ, "//button[@role='switch']") },
  target: { selector: 'input[placeholder="e.g. 750000"]' },
  cash: { selector: 'input[placeholder="Cash available for deposit/costs"]' },
  state: { selector: selectAfter("State") },
  intent: { selector: selectAfter("Intent") },
  property: { selector: selectAfter("Property") },
  lmiTreatment: { selector: selectAfter("LMI treatment") },
  power: { selector: within(ACQ, "//p[normalize-space(text())='Effective purchase power']/..") },
  powerFigure: { selector: within(ACQ, "//p[normalize-space(text())='Effective purchase power']/following-sibling::p[1]") },
  achievable: { selector: within(ACQ, "//*[normalize-space(text())='Target achievable']") },
  loanAvailable: { selector: within(ACQ, "//*[normalize-space(text())='Loan available']/..") },
  cashAvailable: { selector: within(ACQ, "//*[normalize-space(text())='Cash available']/..") },
  stampDuty: { selector: within(ACQ, "//*[normalize-space(text())='Stamp duty']/..") },
  lmi: { selector: within(ACQ, "//*[normalize-space(text())='LMI']/..") },
  loanRequired: { selector: within(ACQ, "//*[normalize-space(text())='Loan required']/..") },
  netCash: { selector: within(ACQ, "//*[normalize-space(text())='Net cash after settlement']/..") },
  notes: { selector: within(ACQ, "//ul") },
});
const headRegions = (capacity, change) => ({
  label: { selector: within(HEAD, "//*[normalize-space(text())='Scenario Borrowing Capacity']") },
  verdict: { selector: within(HEAD, "//*[contains(normalize-space(.),'achievable') and not(*[contains(normalize-space(.),'achievable')])]") },
  capacity: { selector: within(HEAD, `//p[normalize-space(text())='${capacity}']`) },
  // "Serviceable loan ceiling under APRA stress assumptions." stays out of frame (PLAN.md 5.1).
  ceilingLine: { selector: within(HEAD, "//p[starts-with(normalize-space(text()),'Serviceable loan ceiling')]") },
  power: { selector: within(HEAD, "//*[normalize-space(.)='Effective Purchase Power']/..") },
  vsBase: { selector: within(HEAD, "//*[normalize-space(text())='vs Base Capacity']/..") },
  change: { selector: within(HEAD, `//p[contains(normalize-space(.),'${change}')]`) },
  progress: { selector: within(HEAD, "//*[normalize-space(text())='Progress to target']/../..") },
});

module.exports = [
  {
    key: "bc-scenarios",
    screen: "bc-page",
    extras: ["assessment"],
    viewport: [1440, 6800],
    scale: 2,
    steps: [
      // The calculator as 05.4 leaves it (11-bc-page.cjs): 14 Wattle Grove's value and a 20% deposit in the LMI
      // section, and its $920,000 loan as the proposed loan. They stay with the page, so the assessment saved in 07.2
      // carries them.
      { fill: { selector: 'input[placeholder="e.g. 800,000"]' }, value: 1150000 },
      { fill: { selector: 'input[placeholder="e.g. 100,000"]' }, value: 230000 },
      { click: "Display Deduction" },
      { fill: { selector: `xpath=//div[contains(@class,'luxury-card')][.//*[normalize-space(text())='Proposed Loan']]//input` }, value: 920000 },
      { settle: true },
      // Saved, so the assessment the Snapshot reads holds the loan (the film doesn't show this press): the Snapshot's
      // "Capacity at a glance" then draws the $920,000 loan as its bar against the two limits.
      { click: "Save", exact: true },
      { settle: true, quiet: 1500 },
      // 06.1 to 06.2: the tab, then Model next purchase with 14 Wattle Grove's price and Jordan's savings.
      { tap: { role: "tab", name: "Portfolio Scenario Modelling" } },
      { tap: { text: "Acquisition / Purchase Power" } },
      { tap: { selector: `${ACQ}//button[@role='switch']` } },
      { fill: { selector: 'input[placeholder="e.g. 750000"]' }, value: 1150000 },
      { fill: { selector: 'input[placeholder="Cash available for deposit/costs"]' }, value: 300000 },
      { tap: { selector: selectAfter("Property") } },
      { tap: { role: "option", name: "New build" } },
      { settle: true },
      { shot: "bc-scen-page", regions: { tabs: { role: "tablist" }, tabScenarios: { role: "tab", name: "Portfolio Scenario Modelling" }, builder: { text: "Strategy Scenario Builder", exact: true }, acquisition: { selector: ACQ }, head: { selector: HEAD }, saved: { selector: SAVED } } },
      { shot: "bc-scen-purchase", of: ACQ, regions: purchaseRegions() },
      { shot: "bc-scen-head-purchase", of: HEAD, regions: headRegions("+$1,049,786", "$0") },
      { shot: "bc-scen-debts-off", of: DEBTS, regions: { title: { text: "Debt Consolidation", exact: true }, carLoan: { selector: debtRow("Car loan") }, carLoanSwitch: { selector: `${debtRow("Car loan")}//button[@role='switch']` }, creditCard: { selector: debtRow("Credit card") } } },
      { shot: "bc-scen-actions", of: ACTIONS, regions: { saveScenario: { role: "button", name: "Save Scenario" }, apply: { role: "button", name: "Apply to Calculator" }, exportPdf: { selector: `${ACTIONS}//button[contains(normalize-space(.),'Export PDF')]` } } },
      // 06.3 "Adjust deposits": the cash on hand moved, and back.
      { fill: { selector: 'input[placeholder="Cash available for deposit/costs"]' }, value: 250000 },
      { settle: true },
      { shot: "bc-scen-purchase-250", of: ACQ, regions: purchaseRegions() },
      { fill: { selector: 'input[placeholder="Cash available for deposit/costs"]' }, value: 300000 },
      { settle: true },
      // "Model purchasing scenarios": the purchase saved as it stands.
      ...save(SCENARIOS[0], "bc-scen-naming"),
      { shot: "bc-scen-saved-2", of: SAVED, regions: { title: { selector: `${SAVED}//*[starts-with(normalize-space(text()),'Saved Scenarios')]` }, base: { selector: savedRow("Base (Original)") }, s1: { selector: savedRow(SCENARIOS[0]) } } },
      // "Explore financial structures": the car loan paid out of the cash on hand (the Capital Flow Canvas funds it).
      { tap: { selector: `${debtRow("Car loan")}//button[@role='switch']` } },
      { settle: true },
      { shot: "bc-scen-debts-on", of: DEBTS, regions: { title: { text: "Debt Consolidation", exact: true }, selected: { text: "1 selected", exact: true }, carLoan: { selector: debtRow("Car loan") }, carLoanSwitch: { selector: `${debtRow("Car loan")}//button[@role='switch']` }, creditCard: { selector: debtRow("Credit card") } } },
      { shot: "bc-scen-head-carloan", of: HEAD, regions: headRegions("+$1,111,628", "+$61,842") },
      { shot: "bc-scen-canvas-carloan", of: CANVAS, regions: { title: { selector: `${CANVAS}//*[normalize-space(text())='Capital Flow Canvas']` }, pool: { selector: `${CANVAS}//*[normalize-space(text())='Pool available']/../..` }, allocation: { selector: `${CANVAS}//*[normalize-space(text())='Allocation']/../..` } } },
      { shot: "bc-scen-rationale-carloan", of: RATIONALE, regions: { title: { selector: `${RATIONALE}//*[normalize-space(text())='Strategy Rationale']` }, finding: { selector: `${RATIONALE}//*[starts-with(normalize-space(text()),'This change lifts borrowing capacity')]` }, propose: { selector: `${RATIONALE}//*[normalize-space(text())='What we propose and why']` }, payout: { selector: `${RATIONALE}//*[starts-with(normalize-space(text()),'Pay out and close Car loan')]` } } },
      ...save(SCENARIOS[1]),
      { shot: "bc-scen-saved-3", of: SAVED, regions: { title: { selector: `${SAVED}//*[starts-with(normalize-space(text()),'Saved Scenarios')]` }, s1: { selector: savedRow(SCENARIOS[0]) }, s2: { selector: savedRow(SCENARIOS[1]) } } },
      // Then the purchase tried at rates a point higher (the car loan back as it is).
      { tap: { selector: `${debtRow("Car loan")}//button[@role='switch']` } },
      { tap: { text: "Interest Rate Adjustment", exact: true } },
      { tap: { selector: `${RATES}//button[normalize-space(.)='+1%']` } },
      { settle: true },
      { shot: "bc-scen-rates", of: RATES, regions: { title: { selector: `${RATES}//*[normalize-space(text())='Interest Rate Adjustment']` }, badge: { selector: `${RATES}//*[normalize-space(.)='+1.00%'][not(*)]` }, line: { selector: `${RATES}//*[starts-with(normalize-space(.),'Base: 6.50%')][not(*[starts-with(normalize-space(.),'Base: 6.50%')])]` }, slider: { selector: `${RATES}//*[@role='slider']` }, chip: { selector: `${RATES}//button[normalize-space(.)='+1%']` } } },
      { shot: "bc-scen-head-rates", of: HEAD, regions: headRegions("+$964,993", "$84,793") },
      ...save(SCENARIOS[2]),
      { shot: "bc-scen-saved-4", of: SAVED, regions: { title: { selector: `${SAVED}//*[starts-with(normalize-space(text()),'Saved Scenarios')]` }, base: { selector: savedRow("Base (Original)") }, s1: { selector: savedRow(SCENARIOS[0]) }, s2: { selector: savedRow(SCENARIOS[1]) }, s3: { selector: savedRow(SCENARIOS[2]) }, load2: { selector: `${savedRow(SCENARIOS[1])}//button[normalize-space(.)='Load']` } } },
      // 06.4: the Snapshot, from the calculator's Results panel ("Export PDF", then "Download without preview": the
      // saved assessment and the scenarios saved here, and nothing unsaved). Portfolio Scenario Modelling's own export
      // adds the unsaved state of its builder as a fifth scenario, "Current Portfolio Scenario", which here would repeat
      // the last one saved. The harness keeps the request (engine/handlers/bc.ts) and engine/run_snapshot.ts draws it
      // with the product's own route and render container.
      { tap: { role: "tab", name: "Calculator" } },
      { settle: true },
      { shot: "bc-calc-export", regions: { tabCalculator: { role: "tab", name: "Calculator" }, results: { selector: `${RESULTS}` }, chooseTemplate: { selector: `${RESULTS}//button[contains(normalize-space(.),'Choose template')]` }, exportPdf: { selector: `${RESULTS}//button[contains(normalize-space(.),'Export PDF')]` }, exportMenu: { selector: `${RESULTS}//button[@aria-label='Other snapshot formats']` }, capacity: { selector: `${RESULTS}//*[normalize-space(text())='$1,049,786']` } } },
      { tap: { selector: `${RESULTS}//button[@aria-label='Other snapshot formats']` } },
      { tap: { role: "menuitem", name: "Download without preview" } },
      { settle: true },
      { press: "Escape" },
      { tap: { role: "tab", name: "Portfolio Scenario Modelling" } },
      { settle: true },
      // 07.2: the chosen scenario into the calculator, then the one click that saves it as the current assessment.
      { tap: { selector: `${savedRow(CHOSEN)}//button[normalize-space(.)='Load']` } },
      { settle: true, quiet: 1500 },
      { wait: 4600 },
      { shot: "bc-calc-scenario", regions: { tabCalculator: { role: "tab", name: "Calculator" }, banner: { text: "Scenario Active:" }, save: { role: "button", name: "Save", exact: true } } },
      // The toast is shot the moment it lands: it leaves after four seconds. The save's reply is held back six seconds
      // first, because it brings a second toast ("Borrowing capacity calculated successfully") in front of this one.
      {
        evaluate: () => {
          const send = window.fetch.bind(window);
          window.fetch = async (url, init) => {
            if (String(url).endsWith("/calculate-borrowing-capacity") && String(init?.body ?? "").includes('"saveResult":true'))
              await new Promise((r) => setTimeout(r, 6000));
            return send(url, init);
          };
        },
      },
      // The page's ground is lifted for the toast's picture alone, so its corner button and shadow come out on nothing.
      {
        evaluate: () => {
          for (const el of [document.documentElement, document.body, document.getElementById("root")])
            el.style.setProperty("background", "transparent", "important");
        },
      },
      { click: "Save", exact: true, quiet: 60 },
      { shot: "bc-toast-saved", of: `[data-sonner-toast]:has-text("saved as the current assessment")`, pad: 24, transparent: true, regions: { words: { text: "saved as the current assessment" } } },
      {
        evaluate: () => {
          for (const el of [document.documentElement, document.body, document.getElementById("root")])
            el.style.removeProperty("background");
        },
      },
      { settle: true, quiet: 1500 },
      { wait: 4600 },
      { shot: "bc-calc-saved", regions: { banner: { text: "Scenario Active:" }, save: { role: "button", name: "Save", exact: true }, lastSaved: { text: "Last assessment saved" } } },
    ],
  },
];
module.exports.SCENARIOS = SCENARIOS;
module.exports.CHOSEN = CHOSEN;
