/**
 * Jordan Ellis's case, as the product's own projection takes it (PassportViewInput): the brand kit's demo record
 * (docs/brands/aurixa-reel-2/demo-record.json) in the shape the edge function hands the assembler. Every value is
 * fictional. Nothing on any page is drawn from anything but this, through the product's own code.
 *
 * The case is drawn at the three moments the reel shows it (`Stage`): just ISSUED (shots 04.1–04.3, and the Stage 9
 * roster before anything is sent in 05.2), sent to the SOLICITOR (the Passport as Shah Legal opens it in 05.2), and
 * sent to ALL three partners (05.3). A partner earns a "shared" stamp only once it holds the Passport, and a
 * "reliance accepted" impression only appears once it does, so each moment carries exactly the seals it has earned.
 */
import type { PassportViewInput } from "@/lib/aml/passport";

export const ISSUER = "Aurixa Systems · Property";
// Times are Sydney's (AEDT, UTC+11 from 4 October 2026).
const at = (day: number, hhmm: string) =>
  `2026-10-${String(day).padStart(2, "0")}T${hhmm}:00+11:00`;
const CONSENT = at(6, "09:12");
const IDV = at(6, "09:27");
const DOCS = at(7, "14:05");
const SCREENED = at(7, "14:40");
const FUNDS = at(8, "11:18");
const WEALTH = at(8, "11:35");
const ISSUED = at(8, "16:02");
const SHARED = { solicitor: at(9, "10:15"), finance: at(9, "10:21"), accountant: at(9, "10:26") };
// The site's own illustrative fingerprint, 8F3C·B41D·9AE0·72CF, as the first 16 of the record's SHA-256.
const SHA = "8f3cb41d9ae072cf" + "5e21b7c40d9a63f8e1b2c7d4a96f0e3b8c5d2a7f1e4b9c06";

const PARTNERS = [
  { org_name: "Shah Legal", org_type: "solicitor_conveyancer", created_at: SHARED.solicitor },
  { org_name: "Harbour Finance Group", org_type: "finance", created_at: SHARED.finance },
  { org_name: "Patel & Co Accountants", org_type: "accountant", created_at: SHARED.accountant },
];

export type Stage = "issued" | "solicitor" | "all";
const HOLDS: Record<Stage, number> = { issued: 0, solicitor: 1, all: 3 };

export function caseInput(stage: Stage): PassportViewInput {
  const holding = PARTNERS.slice(0, HOLDS[stage]);
  const holds = (name: string) => holding.some((p) => p.org_name === name);
  return {
    issuer_org: ISSUER,
    officer_label: "Alex Morgan",
    case: {
      id: "case-wg14",
      case_reference: "AML-2026-0014",
      subject_display_name: "Jordan Ellis",
      subject_type: "individual",
      status: "cleared",
      case_stage: "cleared",
      service_gate_status: "approved",
      opened_at: at(6, "08:55"),
      closed_at: null,
    },
    attestations: [
      {
        version: 1,
        issued_at: ISSUED,
        superseded_at: null,
        payload_sha256: SHA,
        schema_version: 2,
      },
    ],
    material_inputs_current: true,
    open_refresh_obligations: 0,
    personal_details: null,
    entity_details: null,
    documents: [
      {
        id: "d1",
        requirement_label: "Primary photo ID",
        requirement_code: "primary_id",
        required: true,
        status: "accepted",
        created_at: at(6, "09:20"),
        version_number: 1,
      },
      {
        id: "d2",
        requirement_label: "Proof of residential address",
        requirement_code: "proof_of_address",
        required: true,
        status: "accepted",
        created_at: at(6, "09:41"),
        version_number: 1,
      },
      {
        id: "d3",
        requirement_label: "Bank statements (deposit funds)",
        requirement_code: "source_of_funds_evidence",
        required: true,
        status: "accepted",
        created_at: at(7, "10:02"),
        version_number: 1,
      },
    ],
    transactions: [
      {
        id: "t1",
        kind: "purchase",
        status: "under_contract",
        property_address: "14 Wattle Grove, Banksia Rise NSW 2155",
        contract_date: "2026-10-03",
        settlement_date: "2026-11-14",
        purchase_price: 1150000,
      },
    ],
    ownership: [],
    screening: {
      subjects: [{ state: "completed", completed_at: SCREENED, party_label: "Jordan Ellis" }],
      pep_result: null,
      pep_determined_at: null,
      list_freshness: { dfat: at(7, "06:00") },
    },
    funding: {
      sof: [{ verified: true, verified_at: FUNDS }],
      sow: [{ verified: true, verified_at: WEALTH }],
      edd: [],
    },
    partners: PARTNERS.map((p) => ({
      org_name: p.org_name,
      org_type: p.org_type,
      portal_type: p.org_type,
      link_state: "active",
      legal_route: "reliance",
      grant_created_at: holds(p.org_name) ? p.created_at : null,
      grant_expires_at: holds(p.org_name) ? "2027-04-09T00:00:00+10:00" : null,
      grant_revoked_at: null,
      attestation_version: holds(p.org_name) ? 1 : null,
      last_viewed_at: null,
      assessment_status: null,
      assessment_decided_at: null,
      assessor_name: null,
    })),
    events: [],
    client_requests: [],
    stamp_input: {
      issuer_org: ISSUER,
      attestations: [{ version: 1, issued_at: ISSUED, superseded_at: null }],
      consents: [{ id: "c1", kind: "privacy", accepted_at: CONSENT, actor_label: "Jordan Ellis" }],
      verification_checks: [
        // A hosted check: the provider keeps the captures, so the Passport holds no photograph (no face anywhere).
        {
          id: "v1",
          party_label: "Jordan Ellis",
          check_type: "electronic_idv",
          status: "passed",
          completed_at: IDV,
          document_choice: "passport",
          issuing_state: "AUS",
        },
      ],
      documents: [
        { status: "accepted", reviewed_at: at(7, "13:52") },
        { status: "accepted", reviewed_at: at(7, "13:58") },
        { status: "accepted", reviewed_at: DOCS },
      ],
      screening_subjects: [{ state: "completed", completed_at: SCREENED }],
      owners: [],
      source_of_funds: [{ verified: true, verified_at: FUNDS }],
      source_of_wealth: [{ verified: true, verified_at: WEALTH }],
      edd_cases: [],
      grants: holding.map((p, i) => ({
        id: `g${i + 1}`,
        created_at: p.created_at,
        revoked_at: null,
        partner_org_name: p.org_name,
        partner_org_type: p.org_type,
        attestation_version: 1,
      })),
      assessments: [],
      refresh_obligations: [],
      transactions: [
        {
          id: "t1",
          status: "under_contract",
          settlement_date: "2026-11-14",
          property_address: "14 Wattle Grove, Banksia Rise NSW 2155",
        },
      ],
    },
  };
}
