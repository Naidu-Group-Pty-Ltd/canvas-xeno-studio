// The client arrives and their workspace opens, as the film shows it in 04.1, 04.2, 05.1, 07.1, 07.2 and 08.3:
//
// - clients-add: Add New Client switched to Advanced, on Excel Import: the empty dropzone, Jordan's workbook set on it
//   (the real file: the product's parser reads it), "Parse Excel Sheet" pressed (the import's seven counts, as the
//   dialog first shows them and scrolled down to its buttons), then "Review Imported Data" (the Client Fact Find tab
//   with Jordan's values, and his employment and income).
// - clients-card: Client Management with the card the import creates.
// - clients-ws-bc: the card's "View details" opens Jordan's workspace; its Borrowing Capacity tab before and after
//   "Calculate Capacity" (the product's function answers).
// - clients-ws-team: the workspace's Overview, Team & Partners, then its Finance role: Jamie Chen assigned.
// - clients-ws-deal-onboarding, clients-ws-deal-advisory: the Deals tab and the deal's journey at Onboarding, then at
//   Advisory.
//
// Run with the browser in Australian English (LANG=en_AU.UTF-8 LANGUAGE=en_AU:en LC_ALL=en_AU.UTF-8 in capture.cjs's
// environment, which Chromium inherits), so a date field reads 14/05/1989 as it does for the client's team, not in
// the US order the browser defaults to. Jordan's workbook is REEL_FACTFIND_XLSX, or the data folder's copy.
const WORKBOOK =
  process.env.REEL_FACTFIND_XLSX ??
  "/tmp/claude-0/-home-user/0467c194-592b-542b-9c40-975738e514e0/scratchpad/r3-data/Jordan Ellis - Client Fact Find.xlsx";

const DIALOG = '[role="dialog"]';
/** An element inside the open dialog whose own text is `words` (the page behind it draws some of the same words). */
const inDialog = (words, tag = "*") => ({
  selector: `xpath=//*[@role='dialog']//${tag}[normalize-space(text())=${JSON.stringify(words)}]`,
});
/** The smallest element inside the dialog matching `xpath` that also contains the text `words` somewhere. */
const boxWith = (xpath, words) => ({
  selector: `xpath=(//*[@role='dialog']//${xpath}[.//*[normalize-space(text())=${JSON.stringify(words)}]])[last()]`,
});

// ── Add New Client ──────────────────────────────────────────────────────────────────────────────────────────────
const addChrome = {
  header: { selector: '[data-testid="add-client-premium-header"]' },
  eyebrow: { text: "Client onboarding", exact: true },
  title: { text: "Add New Client", exact: true },
  modeTabs: { selector: '[data-testid="premium-mode-tabs"]' },
  modeStandard: { role: "tab", name: "Standard", exact: true },
  modeAdvanced: { role: "tab", name: "Advanced", exact: true },
  advancedTabs: { selector: '[data-testid="advanced-navigation"]' },
  tabExcel: { role: "tab", name: "Excel Import", exact: true },
  tabFactFind: { role: "tab", name: "Client Fact Find", exact: true },
  tabExpenses: { role: "tab", name: "Living Expenses", exact: true },
  tabOutput: { role: "tab", name: "Client Form Output", exact: true },
  footer: { selector: '[data-testid="advanced-footer"]' },
  createClient: { role: "button", name: "Create Client", exact: true },
};
const IMPORT_CARD = boxWith("div[contains(@class,'rounded-2xl')]", "Excel Import");
const tile = (label) => ({
  [`tile${label.replace(/(^| )(\w)/g, (_, __, c) => c.toUpperCase())}`]: {
    selector: `xpath=//p[normalize-space(.)=${JSON.stringify(label)}]/parent::div`,
  },
  [`label${label.replace(/(^| )(\w)/g, (_, __, c) => c.toUpperCase())}`]: {
    selector: `xpath=//p[normalize-space(.)=${JSON.stringify(label)}]`,
  },
  [`value${label.replace(/(^| )(\w)/g, (_, __, c) => c.toUpperCase())}`]: {
    selector: `xpath=//p[normalize-space(.)=${JSON.stringify(label)}]/following-sibling::p[1]`,
  },
});
const TILES = [
  "Applicants found",
  "Address records found",
  "Employment records found",
  "Assets populated",
  "Liabilities populated",
  "Living expenses populated",
  "Warning count",
].reduce((all, label) => ({ ...all, ...tile(label) }), {});
const fileCard = (title) => ({
  selector: `xpath=(//div[contains(@class,'rounded-2xl')][.//*[normalize-space(text())=${JSON.stringify(title)}]])[last()]`,
});
const kpi = (label) => ({
  selector: `xpath=//section[@data-testid='fact-find-summary']//p[normalize-space(.)=${JSON.stringify(label)}]/parent::div`,
});
const kpiValue = (label) => ({
  selector: `xpath=//section[@data-testid='fact-find-summary']//p[normalize-space(.)=${JSON.stringify(label)}]/following-sibling::p[1]`,
});

// ── The workspace ───────────────────────────────────────────────────────────────────────────────────────────────
const workspaceChrome = {
  header: { selector: `${DIALOG} h2` },
  name: { selector: "xpath=//*[@role='dialog']//h2//span[normalize-space(.)='Jordan Ellis']" },
  toolbar: { selector: `${DIALOG} .client-action-toolbar` },
  tabBar: { selector: `${DIALOG} [role="tablist"]` },
  tabOverview: { role: "tab", name: "Overview", exact: true },
  tabDeals: { role: "tab", name: "Deals", exact: true },
  tabBorrowing: { role: "tab", name: "Borrowing Capacity", exact: true },
  // Internal markings the film keeps out of frame (PLAN.md 5.1): the two legacy raster buttons.
  legacySendToFinance: { role: "button", name: "Send to Finance (legacy layout)" },
  legacyDownload: { role: "button", name: "Download (legacy layout)" },
};
const ACTIVE_TAB = `${DIALOG} [role="tabpanel"][data-state="active"]`;
const SCROLL_TO_END =
  "(() => { const s = document.querySelector('[role=dialog] .overscroll-contain'); s.scrollTop = s.scrollHeight; })()";
// Scrolled down until Team & Partners' role tiles are in view at the bottom of the workspace, as a person scrolling
// to the card sees it before choosing a role.
const SCROLL_TO_ROLES =
  "(() => { const s = document.querySelector('[role=dialog] .overscroll-contain'); const tile = [...s.querySelectorAll('[role=tab]')].find((t) => (t.getAttribute('aria-label') ?? '').startsWith('Command Center:')); tile.parentElement.scrollIntoView({ block: 'end' }); s.scrollTop += 12; })()";
const openWorkspace = [{ click: "View details for Jordan Ellis" }, { settle: true, quiet: 1500 }];
const TEAM = boxWith("div[contains(@class,'rounded-lg') and contains(@class,'border')]", "Team & Partners");
const TEAM_HEADER = { selector: `${TEAM.selector}/div[1]` };
const ROLE_TILES = {
  selector: "xpath=//*[@role='dialog']//*[@role='tablist'][./*[@role='tab'][starts-with(@aria-label,'Command Center:')]]",
};
const roleTile = (label) => ({ role: "tab", name: `${label}:` });
const FINANCE = { selector: `${DIALOG} section[aria-label="Finance partners"]` };
const JAMIE_ROW = {
  selector: `xpath=//*[@role='dialog']//section[@aria-label='Finance partners']//li[.//span[normalize-space(.)='Jamie Chen']]`,
};
const DEAL_CARD = {
  selector:
    "xpath=//*[@role='dialog']//div[contains(@class,'cursor-pointer')][.//span[normalize-space(.)='14 Wattle Grove, Banksia Rise NSW 2155']]",
};
const pill = (phase) => ({ selector: `${DIALOG} ol[aria-label="Deal journey"] span[title^="${phase} "]` });
const fieldTile = (label) => ({
  selector: `xpath=//*[@role='dialog']//div[contains(@class,'rounded-xl')][./p[normalize-space(.)=${JSON.stringify(label)}]]`,
});
const WHERE = { selector: "xpath=//*[@role='dialog']//section[.//h4[normalize-space(.)='Where this deal is']]" };

function dealCapture(key, extra, phase, stageLabel, stageNumber) {
  return {
    key,
    screen: "clients-management",
    extras: ["clients-staff", "clients-finance", extra],
    viewport: [1440, 1000],
    scale: 3,
    steps: [
      ...openWorkspace,
      { tap: { role: "tab", name: "Deals", exact: true } },
      { settle: true },
      {
        shot: `${key}-list`,
        of: DIALOG,
        regions: {
          ...workspaceChrome,
          tracker: inDialog("Deal Tracker", "h3"),
          newDeal: { role: "button", name: "New Deal" },
          dealCard: DEAL_CARD,
          dealAddress: inDialog("14 Wattle Grove, Banksia Rise NSW 2155", "span"),
          stageBadge: { selector: `${DEAL_CARD.selector}//div[contains(@class,'inline-flex')][normalize-space(.)='S${stageNumber}']` },
          risk: { selector: `${DEAL_CARD.selector}//div[contains(normalize-space(.),'On Track')][contains(@class,'inline-flex')]` },
          stage: inDialog(stageLabel, "p"),
          phase: { selector: `${DEAL_CARD.selector}//div[contains(@class,'inline-flex')][contains(normalize-space(.),'${phase}')]` },
          progress: { selector: `${DEAL_CARD.selector}//div[contains(@class,'h-1.5')]` },
        },
      },
      { tap: { selector: `${DEAL_CARD.selector}//span[normalize-space(.)='14 Wattle Grove, Banksia Rise NSW 2155']` } },
      { settle: true },
      {
        shot: `${key}-journey`,
        of: DIALOG,
        regions: {
          ...workspaceChrome,
          back: { role: "button", name: "Back to deals" },
          caseFile: inDialog("Transaction case file", "p"),
          dealTitle: { selector: "xpath=//*[@role='dialog']//h3[normalize-space(.)='Existing Property Deal']" },
          stageBadge: { selector: `xpath=//*[@role='dialog']//div[contains(@class,'inline-flex')][normalize-space(.)='S${stageNumber}: ${stageLabel}']` },
          addressBadge: { selector: "xpath=//*[@role='dialog']//div[contains(@class,'inline-flex')][normalize-space(.)='14 Wattle Grove, Banksia Rise NSW 2155']" },
          where: WHERE,
          whereTitle: inDialog("Where this deal is", "h4"),
          journey: { selector: `${DIALOG} ol[aria-label="Deal journey"]` },
          pillOnboarding: pill("Onboarding"),
          pillAdvisory: pill("Advisory"),
          pillAcquisition: pill("Acquisition"),
          pillFinance: pill("Finance"),
          pillLegal: pill("Legal"),
          pillFinalised: pill("Finalised"),
          now: fieldTile("Now"),
          nextStep: fieldTile("Our next step"),
          clientDoes: fieldTile("What the client does"),
          keyDate: fieldTile("Key date"),
          then: { selector: "xpath=//*[@role='dialog']//p[starts-with(normalize-space(.),'Then:')]" },
        },
      },
    ],
  };
}

module.exports = [
  {
    key: "clients-add",
    screen: "clients-add",
    viewport: [1440, 1000],
    scale: 3,
    steps: [
      { tap: { role: "tab", name: "Advanced", exact: true } },
      { settle: true },
      {
        shot: "clients-add-empty",
        of: DIALOG,
        regions: {
          ...addChrome,
          importCard: IMPORT_CARD,
          template: { role: "link", name: "Download Template" },
          dropzone: { selector: '[data-testid="excel-dropzone"]' },
          dropzoneWords: { text: "Drag and drop an Excel workbook here", exact: true },
          dropzoneRules: { text: ".xlsx or .xls · one file · maximum 10 MB", exact: true },
          browse: { role: "button", name: "Browse Files" },
        },
      },
      { files: { selector: '[data-testid="excel-dropzone"] input[type="file"]' }, path: WORKBOOK },
      { settle: true },
      {
        shot: "clients-add-selected",
        of: DIALOG,
        regions: {
          ...addChrome,
          dropzone: { selector: '[data-testid="excel-dropzone"]' },
          fileCard: fileCard("Workbook selected"),
          fileTitle: { text: "Workbook selected", exact: true },
          fileName: { text: "Jordan Ellis - Client Fact Find.xlsx", exact: true },
          fileSize: { text: "17.0 KB", exact: true },
          clearFile: { role: "button", name: "Clear File" },
          parse: { role: "button", name: "Parse Excel Sheet" },
        },
      },
      { click: "Parse Excel Sheet" },
      { settle: true },
      {
        shot: "clients-add-parsed-top",
        of: DIALOG,
        regions: {
          ...addChrome,
          importCard: IMPORT_CARD,
          dropzone: { selector: '[data-testid="excel-dropzone"]' },
          success: { text: "Import successful", exact: true },
          fileName: { text: "Jordan Ellis - Client Fact Find.xlsx", exact: true },
          ...TILES,
        },
      },
      // The import's counts sit below the dropzone; the dialog's content is scrolled to them, as a person would.
      { evaluate: "document.querySelector('[data-testid=\"advanced-content-scroll\"]').scrollTop = 1e6" },
      { settle: true },
      {
        shot: "clients-add-parsed",
        of: DIALOG,
        regions: {
          ...addChrome,
          dropzone: { selector: '[data-testid="excel-dropzone"]' },
          fileCard: fileCard("Import successful"),
          success: { text: "Import successful", exact: true },
          fileName: { text: "Jordan Ellis - Client Fact Find.xlsx", exact: true },
          ...TILES,
          clearFile: { role: "button", name: "Clear File" },
          parseAgain: { role: "button", name: "Parse Again" },
          review: { role: "button", name: "Review Imported Data" },
        },
      },
      { click: "Review Imported Data" },
      { settle: true },
      {
        shot: "clients-add-review",
        of: DIALOG,
        regions: {
          ...addChrome,
          sections: { selector: '[role="tablist"][aria-label="Client Fact Find sections"]' },
          sectionApplicants: { role: "tab", name: "Applicants", exact: true },
          snapshot: { selector: '[data-testid="fact-find-summary"]' },
          salaryTile: kpi("Applicant 1 Income"),
          salary: kpiValue("Applicant 1 Income"),
          assetsTile: kpi("Total Assets"),
          debtTile: kpi("Total Debt"),
          netTile: kpi("Net Position"),
          applicantHeader: { selector: '[data-testid="applicant-card-1"] header' },
          firstNameLabel: { selector: 'label[for="advanced-applicants-0-firstName"]' },
          firstName: { selector: "#advanced-applicants-0-firstName" },
          surnameLabel: { selector: 'label[for="advanced-applicants-0-surname"]' },
          surname: { selector: "#advanced-applicants-0-surname" },
          dateOfBirth: { selector: "#advanced-applicants-0-dateOfBirth" },
        },
      },
      { tap: { role: "tab", name: "Employment & Income", exact: true } },
      { settle: true },
      {
        shot: "clients-add-employment",
        of: DIALOG,
        regions: {
          ...addChrome,
          sections: { selector: '[role="tablist"][aria-label="Client Fact Find sections"]' },
          sectionEmployment: { role: "tab", name: "Employment & Income", exact: true },
          snapshot: { selector: '[data-testid="fact-find-summary"]' },
          salaryTile: kpi("Applicant 1 Income"),
          salary: kpiValue("Applicant 1 Income"),
          employmentHeader: {
            selector: "xpath=(//section[.//h3[normalize-space(.)='Applicant 1 Employment and Income']])[last()]/header",
          },
          annualIncome: { selector: '[data-testid="applicant-income-total-1"]' },
          employmentType: { selector: "#advanced-employment-0-employmentType" },
          employer: { selector: "#advanced-employment-0-employerOrBusiness" },
          role: { selector: "#advanced-employment-0-roleOrPosition" },
          startDate: { selector: "#advanced-employment-0-startDate" },
          baseSalaryLabel: { selector: 'label[for="advanced-employment-0-baseSalary"]' },
          baseSalary: { selector: "#advanced-employment-0-baseSalary" },
        },
      },
    ],
  },
  {
    key: "clients-card",
    screen: "clients-management",
    extras: ["clients-staff", "clients-finance"],
    viewport: [1440, 1000],
    scale: 3,
    steps: (() => {
      const CARD = {
        selector:
          "xpath=//div[contains(@class,'dashboard-theme-premium-card')][.//button[normalize-space(.)='Jordan Ellis']]",
      };
      const metric = (label) => ({
        selector: `xpath=//div[contains(@class,'client-metric-tile')][.//span[normalize-space(.)=${JSON.stringify(label)}]]`,
      });
      const card = {
        card: CARD,
        initials: { selector: "xpath=//span[@aria-hidden='true'][normalize-space(.)='JE']" },
        name: { role: "button", name: "Jordan Ellis", exact: true },
        star: { role: "button", name: "Star Jordan Ellis", exact: true },
        contact: { selector: "xpath=//div[contains(@class,'glass-inset')][.//span[normalize-space(.)='No email on file']]" },
        noEmail: { text: "No email on file", exact: true },
        noPhone: { text: "No phone on file", exact: true },
        tileProperties: metric("Properties"),
        tilePortfolio: metric("Portfolio"),
        tileCashFlow: metric("Cash flow"),
        viewDetails: { role: "button", name: "View details for Jordan Ellis" },
        // The CRM's name, which the film keeps out of frame: the card's sync chip.
        ghlChip: { selector: "xpath=//span[contains(@class,'dashboard-status-chip')][.//span[normalize-space(.)='GHL']]" },
      };
      const kpiCard = (label) => ({
        selector: `xpath=//div[contains(@class,'dashboard-kpi-card')][.//*[normalize-space(text())=${JSON.stringify(label)}]]`,
      });
      return [
        {
          shot: "clients-management",
          regions: {
            hero: { selector: '[data-shot="clients-management"] header' },
            eyebrow: { text: "Client workspace", exact: true },
            title: { role: "heading", name: "Client Management", exact: true },
            addClient: { role: "button", name: "Add Client" },
            kpiClients: kpiCard("Total Clients"),
            kpiProperties: kpiCard("Total Properties"),
            kpiPortfolio: kpiCard("Portfolio Value"),
            tabs: { role: "tablist", name: "Client management sections" },
            tabClients: { role: "tab", name: "Clients", exact: true },
            search: { selector: 'input[aria-label="Search clients"]' },
            showing: { text: "Showing 1 of 1 clients", exact: true },
            ...card,
            // The CRM's name, which the film keeps out of frame: the page's line, its import button, auto-sync and
            // the pending-sync count.
            ghlSubtitle: { text: "Manage clients, properties, and sync with GoHighLevel.", exact: true },
            ghlImport: { role: "button", name: "Import from GHL" },
            ghlAutoSync: { selector: "xpath=//label[.//span[normalize-space(.)='Auto-sync']]" },
            ghlLastSync: { text: "Last auto-sync: Never", exact: true },
            ghlPending: kpiCard("Pending GHL Sync"),
          },
        },
        { shot: "clients-card", of: CARD.selector, pad: 12, regions: card },
      ];
    })(),
  },
  {
    key: "clients-ws-bc",
    screen: "clients-management",
    extras: ["clients-staff", "clients-finance"],
    // The backend stamps the assessment on its own clock, which starts at 9:12:40 (engine/server.ts); the page's clock
    // starts a little after it here, so the card says "Last calculated less than a minute ago" as it does a moment
    // after the press, not "in less than a minute".
    clock: "2026-10-24T09:13:00+11:00",
    viewport: [1440, 1000],
    scale: 3,
    steps: [
      ...openWorkspace,
      { tap: { role: "tab", name: "Borrowing Capacity", exact: true } },
      { settle: true },
      {
        shot: "clients-ws-bc-empty",
        of: DIALOG,
        regions: {
          ...workspaceChrome,
          card: { selector: `${ACTIVE_TAB} > *` },
          cardTitle: { selector: `xpath=//*[@role='dialog']//*[@role='tabpanel'][@data-state='active']//*[normalize-space(text())='Borrowing Capacity']` },
          cardWords: { text: "Calculate borrowing power based on income, expenses, and existing commitments.", exact: true },
          calculate: { role: "button", name: "Calculate Capacity" },
        },
      },
      { click: "Calculate Capacity" },
      { settle: true },
      {
        shot: "clients-ws-bc-result",
        of: DIALOG,
        regions: {
          ...workspaceChrome,
          card: { selector: `${ACTIVE_TAB} > *` },
          figure: { text: "$1,049,786", exact: true },
          label: { text: "Maximum Borrowing Power", exact: true },
          band: { text: "Strong Position" },
          surplus: { text: "$8,827", exact: true },
          dti: { text: "3.6x", exact: true },
          stressLabel: { text: "Stress-Tested Capacity" },
          stress: { text: "$964,993", exact: true },
          stressBar: { selector: `${ACTIVE_TAB} [role="progressbar"]` },
          calculated: { text: "Last calculated" },
          full: { role: "button", name: "View Full Calculator" },
        },
      },
    ],
  },
  {
    key: "clients-ws-team",
    screen: "clients-management",
    extras: ["clients-staff", "clients-finance"],
    viewport: [1440, 1000],
    scale: 3,
    steps: [
      ...openWorkspace,
      // Team & Partners is the Overview's last card; the workspace is scrolled down to its role tiles.
      { evaluate: SCROLL_TO_ROLES },
      { settle: true },
      {
        shot: "clients-ws-team",
        of: DIALOG,
        regions: {
          ...workspaceChrome,
          teamHeader: TEAM_HEADER,
          roles: ROLE_TILES,
          teamTitle: { selector: "xpath=//*[@role='dialog']//h3[contains(normalize-space(.),'Team & Partners')]" },
          rolesFilled: { selector: "xpath=//*[@role='dialog']//div[contains(@class,'inline-flex')][normalize-space(.)='1 of 4 roles filled']" },
          tileCommandCenter: roleTile("Command Center"),
          tileFinance: roleTile("Finance"),
          tileSolicitor: roleTile("Solicitor"),
          tileAccountant: roleTile("Accountant"),
          tileBuilder: roleTile("Builder & developer"),
        },
      },
      { tap: roleTile("Finance") },
      { settle: true },
      { evaluate: SCROLL_TO_END },
      { settle: true },
      {
        shot: "clients-ws-finance",
        of: DIALOG,
        regions: {
          ...workspaceChrome,
          team: TEAM,
          teamTitle: { selector: "xpath=//*[@role='dialog']//h3[contains(normalize-space(.),'Team & Partners')]" },
          rolesFilled: { selector: "xpath=//*[@role='dialog']//div[contains(@class,'inline-flex')][normalize-space(.)='1 of 4 roles filled']" },
          tileCommandCenter: roleTile("Command Center"),
          tileFinance: roleTile("Finance"),
          tileSolicitor: roleTile("Solicitor"),
          tileAccountant: roleTile("Accountant"),
          tileBuilder: roleTile("Builder & developer"),
          roles: ROLE_TILES,
          finance: FINANCE,
          financeTitle: inDialog("Finance Partners", "h3"),
          financeWords: inDialog("Finance officers with portal access to this client", "p"),
          inviteNew: { role: "button", name: "Invite a new finance partner and link them to this client" },
          assignExisting: { role: "button", name: "Assign a finance partner you already work with to this client" },
          jamie: JAMIE_ROW,
          jamieName: { selector: `${JAMIE_ROW.selector}//span[normalize-space(.)='Jamie Chen']` },
          jamieSections: { selector: `${JAMIE_ROW.selector}//div[normalize-space(.)='11/12 sections']` },
          makePrimary: { role: "button", name: "Make primary" },
          noPrimary: { selector: "xpath=//*[@role='dialog']//section[@aria-label='Finance partners']//p[starts-with(normalize-space(.),'No primary contact yet.')]" },
        },
      },
    ],
  },
  dealCapture("clients-ws-deal-onboarding", "clients-deal-onboarding", "Onboarding", "Exclusive Client Signed", 1),
  dealCapture("clients-ws-deal-advisory", "clients-deal-advisory", "Advisory", "Strategy Confirmed", 2),
];
