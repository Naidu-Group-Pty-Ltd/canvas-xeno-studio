/**
 * Reel 2's portal screens, drawn by the product's own components wherever the component is presentational
 * (PartnerRosterPanel, PartnerMatterList, PartnerPassportPanel, SolicitorPortalShell, the shadcn primitives) and,
 * where the component reads its data itself (ConsentStep, SolicitorPortalLayout, SolicitorDashboard), by its own
 * markup copied from the product with its data supplied: every class, word and icon is the product's.
 *
 * Jordan Ellis's case is fictional (./fixture.ts); so are the solicitor's other matters.
 */
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Briefcase,
  CalendarClock,
  Info,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Settings as SettingsIcon,
  Shield,
  ShieldCheck,
  FolderOpen,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { PartnerRosterPanel } from "@/components/aml/PartnerRosterPanel";
import { PartnerMatterList } from "@/components/partner-compliance/PartnerMatterList";
import { PartnerPassportPanel } from "@/components/partner-compliance/PartnerPassportPanel";
import { solicitorPortalAdapter } from "@/components/partner-compliance/adapters";
import { SolicitorPortalShell } from "@/components/solicitor-portal/SolicitorPortalShell";
import { MATTER_STATUS_CLASSES, MATTER_STATUS_LABELS } from "@/lib/legalMatters";
import { SOLICITOR_WELCOME_SUBTITLE } from "@/lib/solicitorPortalCopy";
import { buildPassportView } from "@/lib/aml/passport";
import type { RosterFacts } from "@/lib/aml/passport/partnerRoster.pure";
import type { MatterLinkInput } from "@/lib/aml/partnerMatterIndex";
import { MemoryRouter } from "react-router-dom";
import { AmlWorkspaceHeader } from "@/components/aml/workspace/AmlWorkspaceHeader";
import { AmlJourneyRail } from "@/components/aml/workspace/AmlJourneyRail";
import { AmlJourneyStageHeader } from "@/components/aml/workspace/AmlJourneyStageHeader";
import {
  JOURNEY_OWNER_LABELS,
  type AmlJourney,
  type AmlJourneyStage,
} from "@/lib/aml/journeyModel";
import type { AmlCase } from "@/lib/aml/amlCasesApi";
import { caseInput } from "./fixture";
import DOCS from "./consent-docs.json";

// Sydney's clock, AEDT.
const at = (day: number, hhmm: string) =>
  `2026-10-${String(day).padStart(2, "0")}T${hhmm}:00+11:00`;
const noop = () => undefined;

/* ───────────────────────── the Client Portal's consents (ConsentStep, src/pages/portal/PortalAml.tsx) ───────── */
type Doc = (typeof DOCS)[number];
export function Consent({ sharing }: { sharing: boolean }) {
  const docs = [...DOCS]
    .sort((a: Doc, b: Doc) => a.sort_order - b.sort_order)
    .map((d: Doc) => ({ ...d, accepted_at: null as string | null }));
  const version = "2026.2";
  const checked: Record<string, boolean> = Object.fromEntries(
    docs.map((d) => [d.code, d.code === "compliance_sharing" ? sharing : true]),
  );
  const readOnly = false;
  const saving = false;
  const outstanding = docs.filter((d) => d.required && !checked[d.code]);
  const allChecked = docs.length > 0 && outstanding.length === 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Consents and disclosures</CardTitle>
        <CardDescription>
          We are a reporting entity regulated by AUSTRAC. Before we collect your identity
          information, the law requires us to tell you what we collect, why, and who we may give it
          to. Please read each item and confirm.
          {version && <span className="block mt-1 text-xs">Document set version {version}</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {docs.map((doc) => (
          <div key={doc.code} className="rounded-md border p-4" data-doc={doc.code}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{doc.title}</div>
                <p className="text-xs text-muted-foreground mt-1">{doc.summary}</p>
              </div>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {doc.acknowledgement_type === "notice" ? "Please read" : "Your consent"}
              </Badge>
            </div>
            <div className="mt-3 max-h-56 overflow-y-auto rounded bg-muted/40 p-3 text-xs leading-relaxed whitespace-pre-line">
              {doc.body}
            </div>
            {doc.statutory_basis.length > 0 && (
              <div className="mt-3">
                <div className="text-[11px] font-medium text-muted-foreground">Legal basis</div>
                <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground list-disc pl-4">
                  {doc.statutory_basis.map((b: string) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
            {doc.reference_links.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                {doc.reference_links.map((link: { label: string; url: string }) => (
                  <a
                    key={link.url}
                    className="text-[11px] underline underline-offset-2 hover:text-foreground text-muted-foreground"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            )}
            <label className="mt-4 flex items-start gap-3 cursor-pointer" data-tick={doc.code}>
              <Checkbox
                checked={Boolean(checked[doc.code])}
                disabled={readOnly || Boolean(doc.accepted_at)}
                className="mt-0.5"
              />
              <span className="text-xs">
                {doc.acknowledgement_type === "notice"
                  ? "I have read and understood this disclosure."
                  : "I have read this and I consent."}
              </span>
            </label>
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground">
          A record of what you accepted, and the exact wording shown to you, is kept as part of your
          compliance file.
        </p>
        <div className="flex justify-end">
          <Button disabled={!allChecked || saving} data-confirm>
            I confirm — continue <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ───────────────────────── Stage 9's roster (PartnerRosterPanel) ───────── */
const ORGS = [
  {
    id: "org-shah",
    agreement: "ag-shah",
    name: "Shah Legal",
    type: "solicitor_conveyancer",
    ack: at(7, "16:40"),
  },
  {
    id: "org-harbour",
    agreement: "ag-harbour",
    name: "Harbour Finance Group",
    type: "finance",
    ack: at(7, "17:05"),
  },
  {
    id: "org-patel",
    agreement: "ag-patel",
    name: "Patel & Co Accountants",
    type: "accountant",
    ack: at(8, "09:30"),
  },
];
export function rosterFacts(sent: string[]): RosterFacts {
  return {
    agreements: ORGS.map((o) => ({
      id: o.agreement,
      partner_org_id: o.id,
      partner_org_name: o.name,
      partner_org_type: o.type,
      status: "active",
      next_review_due: "2027-04-09",
      eligibility_classification: "reporting_entity",
      current_assessment_id: `as-${o.id}`,
    })),
    links: ORGS.map((o) => ({
      id: `lk-${o.id}`,
      partner_org_id: o.id,
      relationship_role: o.type,
      legal_route: "reliance",
      state: "active",
      portal_type: o.type,
      partner_organisations: { legal_name: o.name, classification_status: "classified" },
    })),
    acknowledgements: ORGS.map((o) => ({
      id: `ak-${o.id}`,
      partner_org_id: o.id,
      recipient_name: o.name,
      recipient_email: "partner@example.com",
      status: "accepted",
      accepted_at: o.ack,
      expires_at: "2026-11-07T00:00:00+11:00",
    })),
    grants: ORGS.filter((o) => sent.includes(o.id)).map((o) => ({
      id: `gr-${o.id}`,
      agreement_id: o.agreement,
      granted_at: at(9, "10:15"),
      expires_at: "2027-04-09T00:00:00+10:00",
      revoked_at: null,
      revoke_reason: null,
      delivered_to_email: "partner@example.com",
    })),
    hasAttestation: true,
    isMlro: true,
    now: new Date(sent.length ? at(9, "10:16") : at(9, "10:14")),
  };
}
export function Roster({ sent }: { sent: string[] }) {
  return (
    <PartnerRosterPanel
      facts={rosterFacts(sent)}
      busyKey={null}
      workspaceEnabled
      handlers={{
        onSend: noop,
        onRevoke: noop,
        onCopyEmail: noop,
        onRecordAssessment: noop,
        onResendAgreement: noop,
        onDownloadAgreement: noop,
        onEndLink: noop,
        onOnboard: noop,
      }}
    />
  );
}

/* ───────────────────────── Priya Shah's Solicitor Portal (SolicitorPortalLayout) ───────── */
const NAV_ITEMS = [
  { to: "/solicitor", label: "Dashboard", icon: LayoutDashboard },
  { to: "/solicitor/compliance", label: "AML/CTF Compliance", icon: ShieldCheck },
  { to: "/solicitor/matters", label: "Matters", icon: Briefcase },
  { to: "/solicitor/pipeline", label: "Pipeline", icon: KanbanSquare },
  { to: "/solicitor/messages", label: "Message Hub", icon: MessageSquare },
  { to: "/solicitor/settings", label: "Settings", icon: SettingsIcon },
];
const PRIYA = { name: "Priya Shah", firm: "Shah Legal", initials: "PS" };

function SolicitorLayout({ path, children }: { path: string; children: ReactNode }) {
  return (
    <div className="solicitor-portal-theme flex min-h-screen flex-col">
      <div className="flex flex-1">
        <aside className="solicitor-portal-sidebar hidden w-72 flex-col border-r md:flex">
          <div className="flex items-center justify-between gap-3 p-6 pb-4">
            <div className="min-w-0 flex-1 rounded-xl">
              {/* BrandLockup slot="auth" meta="Solicitor Portal", for the demo workspace's brand (Aurixa Systems). */}
              <div className="flex items-center gap-3">
                <img
                  src="/brand/aurixa-emblem.png"
                  alt="Aurixa Systems"
                  className="h-10 w-auto max-w-[160px] object-contain"
                />
                <div className="min-w-0">
                  <p className="break-words font-semibold leading-tight text-foreground text-base font-bold tracking-tight truncate">
                    Aurixa Systems
                  </p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground tracking-widest truncate">
                    Solicitor Portal
                  </p>
                </div>
              </div>
            </div>
            <div className="shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="relative h-9 w-9"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
          <Separator />
          <div className="px-4 py-4">
            <div className="flex items-center gap-3 rounded-2xl border border-primary/15 bg-gradient-to-r from-primary/10 via-primary/5 to-card/90 p-3 shadow-lg shadow-primary/5">
              <Avatar className="h-10 w-10 border-2 border-primary/20">
                <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                  {PRIYA.initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{PRIYA.name}</p>
                <p className="truncate text-xs text-muted-foreground">{PRIYA.firm}</p>
              </div>
            </div>
          </div>
          <div className="flex-1 py-2">
            <nav aria-label="Solicitor portal" className="space-y-1 px-3">
              {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
                const isActive = to === "/solicitor" ? path === to : path.startsWith(to);
                return (
                  <a
                    key={to}
                    data-nav={label}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 focus-visible:ring-ring/80",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                        : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                    {label}
                  </a>
                );
              })}
            </nav>
          </div>
          <Separator />
          <div className="p-4">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start rounded-xl py-2.5 text-muted-foreground"
            >
              <LogOut className="mr-2 h-4 w-4" aria-hidden /> Sign out
            </Button>
            <div className="mt-3 flex items-center gap-1.5 px-3 text-[10px] text-muted-foreground/50">
              <Shield className="h-3 w-3" aria-hidden />
              <span>Secured Portal • Privileged &amp; encrypted</span>
            </div>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="solicitor-portal-topbar sticky top-0 z-30 border-b">
            <div className="flex h-14 items-center gap-3 px-4 md:px-6">
              {path !== "/solicitor" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1.5 rounded-full text-muted-foreground"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                  <span className="hidden text-xs font-medium sm:inline">Back to dashboard</span>
                </Button>
              )}
              <div className="ml-auto flex items-center gap-2">
                {/* The reel's own label, on every screen it shows (as Reel 1's): the data is a demo workspace's. */}
                <span
                  data-demo
                  className="mr-2 rounded-full border px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.16em]"
                  style={{ color: "#D7B35F", borderColor: "rgba(215,179,95,.5)" }}
                >
                  Demo workspace
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden h-9 w-9 md:inline-flex"
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4" aria-hidden />
                </Button>
                <Button variant="ghost" className="h-9 gap-2 px-2">
                  <Avatar className="h-8 w-8 border border-primary/20">
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                      {PRIYA.initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm font-medium sm:inline">{PRIYA.name}</span>
                </Button>
              </div>
            </div>
          </header>
          <main id="main-content" className="solicitor-portal-main flex-1 overflow-auto">
            <div className="solicitor-portal-content">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}

/** SolicitorDashboard's own markup, on two fictional matters. */
function SolicitorHome() {
  const tiles = [
    { label: "Active matters", value: 6, icon: Briefcase },
    { label: "Settling in 30 days", value: 1, icon: CalendarClock },
    { label: "Flagged at risk", value: 0, icon: AlertTriangle },
  ];
  const upcoming = [
    {
      id: "m1",
      title: "Ellis — purchase",
      address: "14 Wattle Grove, Banksia Rise NSW 2155",
      status: "conditions" as const,
      settlement: "14 Nov 2026",
      countdown: "in 36 days",
    },
    {
      id: "m2",
      title: "Nguyen — purchase",
      address: "7 Ironbark Close, Kellyville NSW 2155",
      status: "exchanged" as const,
      settlement: "21 Nov 2026",
      countdown: "in 43 days",
    },
  ];
  return (
    <SolicitorPortalShell
      eyebrow="Welcome back"
      title={PRIYA.name}
      description={SOLICITOR_WELCOME_SUBTITLE}
      actions={
        <Button size="sm">
          Open matters <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="solicitor-portal-stat-card">
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10">
                <Icon className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Settlement runway</CardTitle>
            <CardDescription>Matters settling in the next 45 days, soonest first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.map((m) => (
              <a
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{m.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.address}</p>
                </div>
                <div className="shrink-0 text-right">
                  <Badge
                    variant="outline"
                    className={cn("mb-1 font-medium", MATTER_STATUS_CLASSES[m.status])}
                  >
                    {MATTER_STATUS_LABELS[m.status]}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    {m.settlement} · {m.countdown}
                  </p>
                </div>
              </a>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden /> Needs attention
            </CardTitle>
            <CardDescription>Matters the Command Centre has flagged as at risk.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
              No matters are flagged right now.
            </p>
          </CardContent>
        </Card>
      </div>
    </SolicitorPortalShell>
  );
}

const LINKS: MatterLinkInput[] = [
  {
    id: "lk-wg14",
    relationship_role: "solicitor_conveyancer",
    legal_route: "reliance",
    state: "active",
    portal_type: "solicitor_conveyancer",
    linked_at: at(7, "16:40"),
    legal_matter_id: "lm-5c2e91a7c41e",
    subject_label: "Jordan Ellis",
    case_reference: "AML-2026-0014",
    passport_state: "available",
    expires_at: "2027-04-09T00:00:00+10:00",
    issuer_label: "Aurixa Systems · Property",
  },
  {
    id: "lk-ik7",
    relationship_role: "solicitor_conveyancer",
    legal_route: "reliance",
    state: "active",
    portal_type: "solicitor_conveyancer",
    linked_at: at(5, "11:20"),
    legal_matter_id: "lm-0b77d48e21f0",
    subject_label: "Sam Nguyen",
    case_reference: "AML-2026-0011",
    passport_state: "not_shared",
    expires_at: null,
    issuer_label: "Aurixa Systems · Property",
  },
];

/** PartnerComplianceWorkspace's own layout (WorkspaceHeader, the filing cabinet and the document), for Shah Legal. */
function SolicitorCompliance({ open }: { open: boolean }) {
  const adapter = solicitorPortalAdapter;
  const passport = open ? buildPassportView("partner", caseInput("solicitor")) : null;
  return (
    <div className="p-4 md:p-6">
      <div
        className="mx-auto w-full max-w-[92rem] space-y-3"
        data-testid="partner-compliance-workspace"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h1 className="text-lg font-semibold">{adapter.workspaceTitle}</h1>
          <details className="group max-w-2xl text-xs">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-muted-foreground">
              <Info className="h-3.5 w-3.5" aria-hidden />
              About this page
            </summary>
          </details>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(14rem,17rem)_minmax(0,1fr)] lg:items-start">
          <div className="lg:sticky lg:top-4" data-region="matters">
            <PartnerMatterList
              links={LINKS}
              ownReferenceLabel={adapter.ownReferenceLabel ?? adapter.matterLabel}
              selectedId={open ? "lk-wg14" : null}
              onSelect={noop}
            />
          </div>
          <div className="min-w-0 space-y-3" data-region="document">
            {open ? (
              <PartnerPassportPanel passport={passport} />
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex min-h-[22rem] flex-col items-center justify-center gap-2 py-12 text-center">
                  <FolderOpen className="h-8 w-8 text-muted-foreground/50" aria-hidden />
                  <p className="text-sm font-medium">
                    Choose a matter to open its Compliance Passport
                  </p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    {`${LINKS.length} matters are shared with your organisation.`} Opening one shows
                    the issuing organisation&apos;s completed customer due diligence for that
                    customer.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Solicitor({ state }: { state: "dashboard" | "compliance" | "matter" }) {
  return state === "dashboard" ? (
    <SolicitorLayout path="/solicitor">
      <div className="p-4 md:p-6">
        <SolicitorHome />
      </div>
    </SolicitorLayout>
  ) : (
    <SolicitorLayout path="/solicitor/compliance">
      <SolicitorCompliance open={state === "matter"} />
    </SolicitorLayout>
  );
}

/* ───────────────────────── Jordan Ellis's case, at Stage 9 (the case workspace's own header, rail and stage) ───── */
// The stages as journeyModel.ts defines them (STAGE_DEFINITIONS: its labels and purposes, which it does not export).
const STAGES: Array<[AmlJourneyStage["id"], string, string, string]> = [
  [
    "activation",
    "Activation",
    "Activation",
    "The recorded trigger that opened this case, and the terms it opened under.",
  ],
  [
    "intake",
    "Client intake",
    "Intake",
    "Consents, the client's own information, and anything we have asked them for.",
  ],
  [
    "identity",
    "Identity verification",
    "Identity",
    "Verification of every party the case requires, and the evidence behind it.",
  ],
  [
    "documents",
    "Documents & evidence",
    "Documents",
    "What was required, what arrived, and what we accepted or sent back.",
  ],
  [
    "screening",
    "Screening & ownership",
    "Screening",
    "Sanctions, PEP and adverse screening, and who ultimately owns or controls the customer.",
  ],
  [
    "funding",
    "Funding & transaction",
    "Funding",
    "The matter, how it is funded, and the counterparties on the other side of it.",
  ],
  [
    "submission",
    "Submission review",
    "Submission",
    "Whether there is enough evidence to take this case into risk and decision.",
  ],
  [
    "decision",
    "Risk & MLRO decision",
    "Decision",
    "The risk position, the evidence behind it, and the recorded human decision.",
  ],
  [
    "passport",
    "Passport & Partners",
    "Passport & Partners",
    "The credential itself — issued, previewed, and shared with the partners entitled to rely on it.",
  ],
  [
    "distribution",
    "Ongoing CDD",
    "Ongoing CDD",
    "What keeps this case current once the service is under way: the review cycle, trigger reviews, screening refresh and the end of the relationship.",
  ],
];
function journey(): AmlJourney {
  const stages = STAGES.map(([id, label, shortLabel, purpose], i): AmlJourneyStage => {
    const passport = id === "passport";
    const done = i < 9;
    return {
      id,
      number: i + 1,
      label,
      shortLabel,
      purpose,
      status: done ? "complete" : "in_progress",
      owner: done ? "none" : "system",
      ownerLabel: JOURNEY_OWNER_LABELS[done ? "none" : "system"],
      attention: "none",
      blocking: false,
      aheadOfSequence: false,
      // passportStage's own summary for a cleared case with the gate approved and the Passport in force at v1.
      summary: passport ? "The service may proceed and the Passport is in force at v1." : "",
      blockers: [],
      warnings: [],
      completedItems: passport
        ? [
            { key: "gate", label: "Service gate: Approved", attention: "steady" },
            { key: "passport", label: "Passport issued · v1", attention: "steady" },
          ]
        : [],
      outstandingItems: [],
      primaryAction: null,
      secondaryActions: [],
      completedAt: null,
      targetSection: "passport",
      sections: ["passport"],
      applicable: true,
      notApplicableReason: null,
      sourceFacts: [],
      unavailableFacts: [],
    } as AmlJourneyStage;
  });
  return {
    stages,
    currentStageId: "passport",
    completeCount: 9,
    applicableCount: 10,
    attention: "none",
  } as AmlJourney;
}
const CASE_ROW = {
  id: "case-wg14",
  case_reference: "AML-2026-0014",
  client_id: "client-je",
  purchase_file_id: null,
  subject_type: "individual",
  subject_display_name: "Jordan Ellis",
  status: "cleared",
  risk_rating: "low",
  risk_score: 18,
  assigned_analyst_id: "u-analyst",
  assigned_mlro_id: "u-mlro",
  opened_at: at(6, "08:55"),
  closed_at: null,
  metadata: {},
  created_by: null,
  created_at: at(6, "08:55"),
  updated_at: new Date().toISOString(),
  case_stage: "cleared",
  service_gate_status: "approved",
} as unknown as AmlCase;

export function CaseStage({ sent }: { sent: string[] }) {
  const j = journey();
  const stage = j.stages[8];
  const visible = new Set(j.stages.map((s) => s.id));
  return (
    <MemoryRouter>
      <div className="space-y-5">
        <AmlWorkspaceHeader
          caseRow={CASE_ROW}
          matterLabel="14 Wattle Grove, Banksia Rise NSW 2155"
        />
        <AmlJourneyRail
          journey={j}
          activeStageId="passport"
          onSelectStage={noop}
          visibleStages={visible}
        />
        <AmlJourneyStageHeader
          stage={stage}
          totalStages={10}
          onOpenSection={noop}
          deferToSurfaceBelow
        />
        <div data-region="roster">
          <Roster sent={sent} />
        </div>
      </div>
    </MemoryRouter>
  );
}
