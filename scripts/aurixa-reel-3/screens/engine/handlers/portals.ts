// The partner portals' calls, answered on Jordan's record by each function's own rules (supabase/functions/<name>/
// index.ts at the product's checkout; the lines named are the rules followed). The product's own pure helpers are
// imported rather than restated: the session token readers, the refusal shapes, the columns a portal may read.
//
// The portals have their own sessions. Their requests reach here through src/stubs/portals-network.ts, which sends what
// the browser would carry (the request's own headers and the portal's HttpOnly session cookie) in `__reel.headers`, and
// the page's clock in `__reel.now`: a session's expiry or a last login is read on the film's clock (the capture's), not
// the machine's, as the product's function would read it at that moment. Jamie Chen's Finance Portal session is in
// extras/portals-finance.json, Jordan Ellis' Client Portal session in extras/portals-client.json.
//
// A read returns the columns the function selects and what Postgres adds to the row the write sent (the table's
// defaults and generated columns, COLUMNS below). A function, operation or include the screens do not reach is refused
// with the harness's own words, never answered empty.
import { readdirSync } from "node:fs";
import path from "node:path";
import { PRODUCT } from "../product.ts";

const SHARED = path.join(PRODUCT, "supabase/functions/_shared");
const shared = (file: string) => import(path.join(SHARED, file));
const { extractFinanceSessionToken } = await shared("financeSessionToken.ts");
const { financeSessionRefusal, partnerColumns } = await shared("financeResolvedPartner.pure.ts");
const { passwordChangeRequired } = await shared("financePortalSessionAnswer.pure.ts");
const { extractClientPortalSessionToken } = await shared("clientPortalSessionToken.ts");
const { PORTAL_CLIENT_SELECT, projectPortalClient } = await shared("portalClientColumns.pure.ts");
const { PORTAL_REPORT_CLIENT_COLUMNS } = await shared("reports/portal/portalReportColumns.pure.ts");
const { PORTAL_NOTIFICATION_SELECT, PORTAL_REPORT_REQUEST_SELECT } = await shared("portalDisplayColumns.pure.ts");
const { arrangeTeam } = await shared("propertyTeam.pure.ts");
const { HUB_FLAG_KEY, hubFlagIsOn, displayNameOf } = await shared("messagingHub/hubActions.pure.ts");

type Db = Record<string, any[]>;
type Row = Record<string, any>;
type Handler = (body: Row, db: Db, ctx: any) => unknown;

/** capture.cjs DEMO_TIME, for a call that carries no clock. */
const DEMO_TIME = Date.parse("2026-10-24T09:12:30+11:00");
const nowOf = (body: Row): number => (typeof body.__reel?.now === "number" ? body.__reel.now : DEMO_TIME);
const headersOf = (body: Row) => new Headers(body.__reel?.headers ?? {});

/**
 * What Postgres adds to a row the write sent: a column's default where the write left it out, and a generated column.
 * clients.deal_status: `text NOT NULL DEFAULT 'active'` (20260219022734). borrowing_capacity_assessments.assessment_rate:
 * `GENERATED ALWAYS AS (interest_rate_used + buffer_rate) STORED` (20260120013214).
 */
const COLUMNS: Record<string, (r: Row) => Row> = {
  clients: (r) => ({ deal_status: "active", ...r }),
  borrowing_capacity_assessments: (r) => ({
    ...r,
    assessment_rate:
      r.interest_rate_used == null || r.buffer_rate == null
        ? null
        : Number(r.interest_rate_used) + Number(r.buffer_rate),
  }),
};
const rows = (db: Db, table: string): Row[] => (db[table] ?? []).map(COLUMNS[table] ?? ((r) => r));
const cols = (list: string) =>
  list
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
/** A PostgREST select's column list, applied to a row (an embedded resource is left to the caller). */
const pick = (r: Row, list: string) => Object.fromEntries(cols(list).map((c) => [c, r[c] ?? null]));
/** `.order(key, { ascending: false })` on a timestamp: by the instant, whatever offset each row was written with. */
const newestFirst = (key: string) => (a: Row, b: Row) =>
  (Date.parse(b[key] ?? "") || 0) - (Date.parse(a[key] ?? "") || 0);
const refuse = (status: number, body: Row) => ({ ...body, __status: status });
const fullName = (first: unknown, last: unknown) => [first, last].filter(Boolean).join(" ").trim() || null;

// ================================================================== the Finance Portal
/** finance-portal-session.ts resolveFinancePartner: no pepper is configured, so the plain token is read. */
function resolveFinancePartner(body: Row, db: Db, withContact = false) {
  const token = extractFinanceSessionToken(headersOf(body), body);
  if (!token) return { error: "Session token required", status: 401 };
  const now = nowOf(body);
  const select =
    "id, email, is_active, revoked_at, session_expires_at, session_idle_expires_at, session_token_hash, global_permissions, must_change_password" +
    (withContact ? ", finance_contact_id" : "");
  const found = rows(db, "finance_portal_users").find((u) => u.session_token === token);
  const portalUser = found ? pick(found, select) : null;
  if (!portalUser || !portalUser.is_active || portalUser.revoked_at) return { error: "Invalid session", status: 401 };
  if (!portalUser.session_expires_at || Date.parse(portalUser.session_expires_at) < now)
    return { error: "Session expired", status: 401 };
  if (portalUser.session_idle_expires_at && Date.parse(portalUser.session_idle_expires_at) < now)
    return { error: "Session expired", status: 401 };
  const mustChange = passwordChangeRequired(portalUser);
  if (mustChange) return mustChange;
  return { portalUser };
}

/** The partner, as each data function resolves it (resolveFinancePartner, then financeSessionRefusal). */
function financePartner(body: Row, db: Db, withContact = true) {
  const auth: any = resolveFinancePartner(body, db, withContact);
  const refusal = financeSessionRefusal(auth);
  return refusal ? { refusal: refuse(refusal.status, refusal.body) } : { portalUser: auth.portalUser as Row };
}

/** finance-portal-verify, the session check (no action): index.ts lines 59-132 and 162-183, the answer 296-321. */
function financeVerify(body: Row, db: Db) {
  const token = extractFinanceSessionToken(headersOf(body), body);
  if (!token) return refuse(401, { error: "Session token is required", valid: false });
  const now = nowOf(body);
  const u = rows(db, "finance_portal_users").find((r) => r.session_token === token);
  if (!u || !u.is_active || u.revoked_at) return refuse(401, { error: "Invalid or expired session", valid: false });
  if (!u.session_expires_at || Date.parse(u.session_expires_at) < now)
    return refuse(401, { error: "Session expired", valid: false });
  if (u.session_idle_expires_at && Date.parse(u.session_idle_expires_at) < now)
    return refuse(401, { error: "Session expired", valid: false });
  const contact = rows(db, "finance_agent_contacts").find((c) => c.id === u.finance_contact_id);
  if (!contact || !contact.is_active)
    return refuse(403, { error: "Linked finance contact is no longer active", valid: false });
  if (body.action) return refuse(400, { error: `The harness answers no ${body.action} for finance-portal-verify` });
  const currentTerms =
    rows(db, "portal_terms_versions")
      .filter((t) => t.portal === "finance" && !t.retired_at && Date.parse(t.effective_at) <= now)
      .sort(newestFirst("effective_at"))[0] ?? null;
  const accepted = Boolean(
    currentTerms &&
      rows(db, "portal_terms_acceptances").find(
        (a) => a.terms_version_id === currentTerms.id && a.finance_user_id === u.id,
      ),
  );
  return {
    valid: true,
    user: {
      id: u.id,
      finance_contact_id: u.finance_contact_id,
      email: u.email,
      name: contact.name,
      company: contact.company,
      contact_type: contact.contact_type,
      has_accepted_terms: u.has_accepted_terms,
      has_accepted_current_terms: accepted,
      current_terms_version: currentTerms?.version ?? null,
      current_terms_published: Boolean(currentTerms),
      has_completed_onboarding: u.has_completed_onboarding,
      must_change_password: !!u.must_change_password,
    },
  };
}

// ------------------------------------------------------------------ finance-portal-client-data
// Its own rules (index.ts): the per-client matrix OR-merged with the partner's global baseline (mergePermissions, lines
// 440-459), and the assignment every client-scoped operation requires (lines 745-760).
const TABLE_MAP: Record<string, string> = {
  properties: "client_properties",
  income: "client_income_sources",
  expenses: "client_expenses",
  assets: "client_assets",
  liabilities: "client_liabilities",
  employment: "client_employment",
  notes: "client_notes",
  contacts: "client_additional_contacts",
  address_history: "client_address_history",
};
function mergePermissions(global: any, perClient: any) {
  const out: Record<string, { view: boolean; edit: boolean; delete: boolean }> = {};
  const keys = new Set<string>([
    ...Object.keys(global && typeof global === "object" ? global : {}),
    ...Object.keys(perClient && typeof perClient === "object" ? perClient : {}),
  ]);
  for (const k of keys) {
    const g = (global && global[k]) || {};
    const p = (perClient && perClient[k]) || {};
    out[k] = { view: !!(g.view || p.view), edit: !!(g.edit || p.edit), delete: !!(g.delete || p.delete) };
  }
  return out;
}

function financeClientData(body: Row, db: Db) {
  const { refusal, portalUser: resolved } = financePartner(body, db);
  if (refusal) return refusal;
  const portalUser: any = partnerColumns(resolved, [
    "id",
    "finance_contact_id",
    "email",
    "is_active",
    "revoked_at",
    "session_expires_at",
    "global_permissions",
  ]);
  const { operation } = body;
  if (!operation) return refuse(400, { error: "operation required" });

  // list_assigned_clients (lines 660-743)
  if (operation === "list_assigned_clients") {
    const assignments = rows(db, "finance_portal_client_assignments")
      .filter((a) => a.finance_user_id === portalUser.id)
      .map((a) => pick(a, "id, client_id, permissions, assigned_at"));
    const clientIds = assignments.map((a) => a.client_id);
    if (clientIds.length === 0) return { success: true, records: [] };
    const clients = rows(db, "clients")
      .filter((c) => clientIds.includes(c.id))
      .map((c) =>
        pick(
          c,
          "id, primary_first_name, primary_surname, secondary_first_name, secondary_surname, primary_email, primary_mobile, deal_status, created_at",
        ),
      );
    const files = rows(db, "purchase_files")
      .filter((f) => clientIds.includes(f.client_id) && f.archived_at == null)
      .sort(newestFirst("updated_at"));
    const cMap = new Map(
      clients.map((c) => [
        c.id,
        {
          id: c.id,
          primary_contact_name: fullName(c.primary_first_name, c.primary_surname),
          secondary_contact_name: fullName(c.secondary_first_name, c.secondary_surname),
          primary_contact_email: c.primary_email,
          primary_contact_phone: c.primary_mobile,
          status: c.deal_status,
          created_at: c.created_at,
        },
      ]),
    );
    const records = assignments.map((a) => {
      const mine = files.filter((f) => f.client_id === a.client_id);
      const active = mine[0] || null;
      let next_deadline: { date_type: string; due_date: string } | null = null;
      if (active) {
        const upcoming = (active.purchase_file_critical_dates || [])
          .filter((d: Row) => d.due_date && d.status !== "completed")
          .sort((x: Row, y: Row) => (x.due_date || "").localeCompare(y.due_date || ""))[0];
        if (upcoming) next_deadline = { date_type: upcoming.date_type, due_date: upcoming.due_date };
        else if (active.finance_clause_date)
          next_deadline = { date_type: "finance_clause", due_date: active.finance_clause_date };
        else if (active.settlement_date) next_deadline = { date_type: "settlement", due_date: active.settlement_date };
      }
      return {
        assignment_id: a.id,
        client_id: a.client_id,
        permissions: mergePermissions(portalUser.global_permissions, a.permissions),
        assigned_at: a.assigned_at,
        client: cMap.get(a.client_id) || null,
        active_purchase_file: active
          ? pick(active, "id, title, status, finance_status, lender, max_approved_budget, risk_level, updated_at")
          : null,
        purchase_file_count: mine.length,
        next_deadline,
      };
    });
    return { success: true, records };
  }

  const { client_id } = body;
  if (!client_id) return refuse(400, { error: "client_id required" });
  const assignment = rows(db, "finance_portal_client_assignments").find(
    (a) => a.finance_user_id === portalUser.id && a.client_id === client_id,
  );
  if (!assignment) return refuse(403, { error: "You are not assigned to this client" });
  const permissions = mergePermissions(portalUser.global_permissions, assignment.permissions);

  // get_client_summary (lines 805-829)
  if (operation === "get_client_summary") {
    const c = rows(db, "clients").find((r) => r.id === client_id);
    const client = c
      ? {
          id: c.id,
          primary_contact_name: fullName(c.primary_first_name, c.primary_surname),
          secondary_contact_name: fullName(c.secondary_first_name, c.secondary_surname),
          primary_contact_email: c.primary_email ?? null,
          primary_contact_phone: c.primary_mobile ?? null,
          primary_address: c.current_address ?? null,
          primary_suburb: c.current_suburb || null,
          primary_state: c.current_state || null,
          primary_postcode: c.current_postcode || null,
          country: c.country || null,
          living_situation: c.living_situation || null,
          residential_status: c.residential_status || null,
          status: c.deal_status,
          created_at: c.created_at,
        }
      : null;
    return { success: true, client, permissions };
  }

  // list_records (lines 832-849)
  if (operation === "list_records") {
    const { table_key } = body;
    const dbTable = TABLE_MAP[table_key];
    if (!dbTable) return refuse(400, { error: "Unknown table" });
    if (!permissions[table_key]?.view) return refuse(403, { error: "No view permission for " + table_key });
    let list = rows(db, dbTable).filter((r) => r.client_id === client_id);
    if (dbTable === "client_notes") list = list.filter((r) => ["shared", "finance_only"].includes(r.visibility));
    list =
      dbTable === "client_income_sources"
        ? [...list].sort((a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0))
        : [...list].sort(newestFirst("created_at"));
    return { success: true, records: list, permission: permissions[table_key] };
  }

  // get_borrowing_capacity (lines 1050-1071): read-only, the twelve most recent, the latest first.
  if (operation === "get_borrowing_capacity") {
    const bcPerm = permissions.borrowing_capacity;
    const canView = bcPerm ? !!bcPerm.view : true;
    if (!canView) return refuse(403, { error: "No view permission for borrowing_capacity" });
    const list = rows(db, "borrowing_capacity_assessments")
      .filter((r) => r.client_id === client_id)
      .sort(newestFirst("created_at"))
      .slice(0, 12)
      .map((r) =>
        pick(
          r,
          "id, borrowing_capacity, serviceability_band, monthly_surplus, dti_ratio, stress_tested_capacity, gross_annual_income, shaded_annual_income, living_expenses_monthly, existing_commitments_monthly, interest_rate_used, buffer_rate, assessment_rate, loan_term_years, proposed_loan_amount, proposed_lvr, lmi_amount, net_purchase_capacity, recommendations, warnings, created_at",
        ),
      );
    return {
      success: true,
      latest: list[0] || null,
      history: list,
      permission: { view: canView, edit: false, delete: false },
    };
  }
  return refuse(400, { error: `The harness answers no ${operation} for finance-portal-client-data` });
}

// ------------------------------------------------------------------ the profile's other cards
/**
 * finance-portal-client-mirror summary (index.ts lines 76-216): what the client sees in their portal, and how engaged
 * they are, from their portal account, the documents asked of them and their portal messages.
 */
function financeClientMirror(body: Row, db: Db) {
  const { operation = "summary", client_id } = body;
  if (!client_id) return refuse(400, { error: "client_id required" });
  const { refusal, portalUser } = financePartner(body, db, false);
  if (refusal) return refusal;
  const assigned = rows(db, "finance_portal_client_assignments").find(
    (a) => a.finance_user_id === portalUser.id && a.client_id === client_id,
  );
  if (!assigned) return refuse(403, { error: "Not assigned to this client" });
  const account = rows(db, "client_portal_users").find((u) => u.client_id === client_id);
  const portalUserRow = account
    ? pick(account, "id, email, status, last_login_at, has_completed_onboarding, created_at")
    : null;
  const allDocs = rows(db, "document_requirement_instances").filter(
    (d) => d.client_id === client_id && d.visible_to_client === true,
  );
  const msgs = rows(db, "client_portal_messages")
    .filter((m) => m.client_id === client_id)
    .sort(newestFirst("created_at"))
    .slice(0, 200);
  const pending = allDocs.filter((d) => d.status === "requested" || d.status === "pending");
  const uploaded = allDocs.filter((d) => ["uploaded", "verified", "approved"].includes(String(d.status)));
  const fulfillmentPct = allDocs.length ? Math.round((uploaded.length / allDocs.length) * 100) : null;
  const staff = (m: Row) => m.sender_type === "admin" || m.sender_type === "staff";
  const unreadFromAdmin = msgs.filter((m) => staff(m) && !m.is_read).length;
  const respTimes: number[] = [];
  const ordered = [...msgs].reverse();
  for (let i = 0; i < ordered.length - 1; i++) {
    const cur = ordered[i];
    const nxt = ordered[i + 1];
    if (staff(cur) && nxt.sender_type === "client") {
      const diffMin = (Date.parse(nxt.created_at) - Date.parse(cur.created_at)) / 60000;
      if (diffMin >= 0 && diffMin < 60 * 24 * 14) respTimes.push(diffMin);
    }
  }
  respTimes.sort((a, b) => a - b);
  const medianResponseMin = respTimes.length ? Math.round(respTimes[Math.floor(respTimes.length / 2)]) : null;
  const lastLogin = portalUserRow?.last_login_at || null;
  const daysSinceLogin = lastLogin ? Math.floor((nowOf(body) - Date.parse(lastLogin)) / 86_400_000) : null;
  let score: number | null = null;
  if (portalUserRow) {
    let s = 0;
    s += fulfillmentPct == null ? 25 : (fulfillmentPct / 100) * 40;
    if (daysSinceLogin == null) s += 8;
    else if (daysSinceLogin <= 2) s += 30;
    else if (daysSinceLogin <= 7) s += 22;
    else if (daysSinceLogin <= 30) s += 14;
    else if (daysSinceLogin <= 60) s += 6;
    if (medianResponseMin == null) s += 10;
    else if (medianResponseMin <= 120) s += 30;
    else if (medianResponseMin <= 480) s += 22;
    else if (medianResponseMin <= 1440) s += 14;
    else if (medianResponseMin <= 4320) s += 6;
    score = Math.max(0, Math.min(100, Math.round(s)));
  }
  const tier =
    score == null ? "unknown" : score >= 75 ? "engaged" : score >= 50 ? "steady" : score >= 25 ? "cooling" : "ghosting";
  if (operation === "handoff_check")
    return {
      success: true,
      has_portal_user: !!portalUserRow,
      portal_user_active: portalUserRow?.status === "active",
    };
  return {
    success: true,
    portal_user: portalUserRow
      ? {
          id: portalUserRow.id,
          email: portalUserRow.email,
          status: portalUserRow.status,
          has_completed_onboarding: portalUserRow.has_completed_onboarding,
          last_login_at: lastLogin,
          days_since_login: daysSinceLogin,
          created_at: portalUserRow.created_at,
        }
      : null,
    documents: {
      total: allDocs.length,
      pending: pending.length,
      uploaded: uploaded.length,
      fulfilment_pct: fulfillmentPct,
      pending_items: pending
        .slice(0, 8)
        .map((d) => ({ id: d.id, label: d.label, status: d.status, requested_at: d.requested_at })),
    },
    messages: {
      total: msgs.length,
      unread_for_client: unreadFromAdmin,
      median_client_response_minutes: medianResponseMin,
    },
    engagement: { score, tier },
  };
}

/**
 * property-team, the Finance Portal's door (index.ts lines 172-180): the client's team as composePropertyTeam
 * (_shared/propertyTeam.ts) builds it from the four allocation records, read as a professional reads it
 * (teamForProfessional: the accountant's team note, never the client summary).
 */
function propertyTeam(body: Row, db: Db) {
  if (String(body.op || "get") !== "get") return refuse(400, { success: false, error: "Unknown operation" });
  if (body.portal !== "finance")
    return refuse(404, { success: false, error: `The harness answers property-team for the finance portal only` });
  const auth: any = resolveFinancePartner(body, db, false);
  if (auth.error || !auth.portalUser)
    return refuse(auth.status || 401, { success: false, error: auth.error || "Invalid session" });
  const clientId = typeof body.client_id === "string" ? body.client_id : "";
  if (!clientId) return refuse(400, { success: false, error: "client_id is required" });
  // canAccessFinanceClient (financePortalObjectAuthz.ts): an assignment of this client to this partner.
  if (
    !rows(db, "finance_portal_client_assignments").some(
      (a) => a.finance_user_id === auth.portalUser.id && a.client_id === clientId,
    )
  )
    return refuse(404, { success: false, error: "Client not found" });
  const members: Row[] = [];
  const client = rows(db, "clients").find((c) => c.id === clientId);
  if (client?.assigned_team_user_id) {
    const staff = rows(db, "custom_users").find((u) => u.id === client.assigned_team_user_id);
    if (staff && staff.is_active !== false && !staff.deleted_at)
      members.push({
        role: "buyers_agent",
        name: fullName(staff.first_name, staff.last_name),
        organisation: null,
        email: staff.email ?? null,
        phone: staff.phone ?? null,
        since: null,
      });
  }
  for (const row of rows(db, "finance_portal_client_assignments").filter((a) => a.client_id === clientId)) {
    const u = rows(db, "finance_portal_users").find((p) => p.id === row.finance_user_id);
    if (!u || !u.is_active || u.revoked_at) continue;
    const contact = rows(db, "finance_agent_contacts").find((c) => c.id === u.finance_contact_id);
    members.push({
      role: "finance_broker",
      name: contact?.name ?? null,
      organisation: contact?.company ?? null,
      email: contact?.email || u.email || null,
      phone: null,
      since: row.assigned_at ?? null,
    });
  }
  // The record holds no legal matter and no accountant allocation for the client; a record that did would need their
  // slots composed here too (composePropertyTeam's solicitor and accountant reads, and the accountant's brief).
  if (
    rows(db, "legal_matters").some((r) => r.client_id === clientId && !r.archived_at && !r.closed_at) ||
    rows(db, "accountant_portal_client_assignments").some((a) => a.client_id === clientId && a.status !== "ended")
  )
    return refuse(501, { success: false, error: "The harness composes no solicitor or accountant slot" });
  return { success: true, team: { slots: arrangeTeam(members), unavailable: [], accountant: null } };
}

/**
 * finance-portal-purchase-files list_files_for_client (index.ts lines 643-656): refused unless the partner may view
 * purchase files on the client (getEffectivePermissions, lines 164-188).
 */
function financePurchaseFiles(body: Row, db: Db) {
  const { refusal, portalUser } = financePartner(body, db, true);
  if (refusal) return refusal;
  if (body.operation !== "list_files_for_client")
    return refuse(400, { error: `The harness answers no ${body.operation} for finance-portal-purchase-files` });
  const clientId = body.client_id;
  if (!clientId) return refuse(400, { error: "client_id required" });
  const assignment = rows(db, "finance_portal_client_assignments").find(
    (a) => a.finance_user_id === portalUser.id && a.client_id === clientId,
  );
  const merged = assignment ? mergePermissions(portalUser.global_permissions, assignment.permissions) : null;
  const pf = assignment?.permissions?.purchase_files;
  const g = portalUser.global_permissions?.purchase_files;
  const canEdit = g === undefined && pf === undefined ? true : g?.edit === true || pf?.edit === true;
  if (merged && canEdit && !merged.purchase_files?.edit) merged.purchase_files = { view: true, edit: true, delete: false };
  if (!merged?.purchase_files?.view) return refuse(403, { error: "Forbidden" });
  return {
    files: rows(db, "purchase_files")
      .filter((f) => f.client_id === clientId && f.archived_at == null)
      .sort(newestFirst("updated_at")),
  };
}

// ------------------------------------------------------------------ the Finance Portal's chrome
/** finance-portal-notifications (index.ts lines 134-171): this partner's notifications. */
function financeNotifications(body: Row, db: Db) {
  const { refusal, portalUser } = financePartner(body, db, false);
  if (refusal) return refusal;
  const mine = rows(db, "finance_portal_notifications").filter((n) => n.portal_user_id === portalUser.id);
  if (body.operation === "unread_count") return { count: mine.filter((n) => n.is_read === false).length };
  if (body.operation === "list")
    return {
      notifications: [...mine].sort(newestFirst("created_at")).slice(0, Math.min(Number(body.limit) || 50, 200)),
    };
  return refuse(400, { error: `Unknown operation: ${body.operation}` });
}

/** finance-portal-settings get_notification_prefs (index.ts lines 189-196): the partner's own. */
function financeSettings(body: Row, db: Db) {
  const { refusal, portalUser } = financePartner(body, db, true);
  if (refusal) return refusal;
  if (body.operation === "get_notification_prefs")
    return {
      prefs: rows(db, "finance_partner_notification_prefs")
        .filter((p) => p.finance_contact_id === portalUser.finance_contact_id)
        .sort((a, b) => String(a.event_type).localeCompare(String(b.event_type))),
    };
  return refuse(400, { error: `The harness answers no ${body.operation} for finance-portal-settings` });
}

/** feature_flags as aml-reliance reads a switch (flagEnabled, index.ts lines 896-903). */
function flagOn(db: Db, key: string) {
  const v = rows(db, "feature_flags").find((f) => f.key === key)?.value;
  return v === true || v === "true" || (!!v && typeof v === "object" && (v as Row).enabled === true);
}

/** aml-reliance get_partner_surface_availability (index.ts lines 1475-1495; WORKSPACE_PORTAL_FLAGS, line 993). */
const WORKSPACE_PORTAL_FLAGS: Record<string, string> = {
  finance: "aml_partner_workspace_finance",
  builder: "aml_partner_workspace_builder",
  solicitor_conveyancer: "aml_partner_workspace_solicitor",
  accountant: "aml_partner_workspace_accountant",
};
function amlSurfaceAvailability(body: Row, db: Db) {
  const requested = String(body.portal_type ?? "");
  const surface = requested === "developer" ? "builder" : requested;
  const flagKey = WORKSPACE_PORTAL_FLAGS[surface];
  if (!flagKey)
    return refuse(400, { error: `portal_type must be one of: ${Object.keys(WORKSPACE_PORTAL_FLAGS).join(", ")}` });
  const master = flagOn(db, "aml_partner_compliance_workspace");
  const surfaceOn = flagOn(db, flagKey);
  return {
    availability: {
      portal_type: surface,
      compliance_page: master && surfaceOn,
      passport_view: master && surfaceOn && flagOn(db, "aml_partner_passport_view"),
    },
  };
}

// ================================================================== the Client Portal
/**
 * verifyPortalSession (requestSecurity.ts lines 175-231): the session by its token (no pepper, so the plain token),
 * unexpired, unrevoked and not idle, and its portal account active.
 */
function clientPortalSession(body: Row, db: Db, token: string | null) {
  if (!token) return { errorCode: "missing_credentials" as const };
  const now = nowOf(body);
  const row = rows(db, "client_portal_sessions").find(
    (s) => s.session_token === token && Date.parse(s.expires_at) > now,
  );
  const user = row ? rows(db, "client_portal_users").find((u) => u.id === row.user_id) : null;
  if (!row || !user || row.revoked_at) return { errorCode: "invalid_session" as const };
  if (row.idle_expires_at && Date.parse(row.idle_expires_at) < now) return { errorCode: "invalid_session" as const };
  if (user.status !== "active") return { errorCode: "inactive_actor" as const };
  return { session: row, user };
}

/** client-portal-verify's own smartCapitalizeStr (index.ts lines 13-26), by which it names the signed-in client. */
function smartCapitalizeStr(name: string): string {
  if (!name) return "";
  return name
    .trim()
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower.startsWith("o'") && lower.length > 2) return "O'" + lower.charAt(2).toUpperCase() + lower.slice(3);
      const mc = lower.match(/^(mc|mac)(.+)$/i);
      if (mc) return mc[1].charAt(0).toUpperCase() + mc[1].slice(1) + mc[2].charAt(0).toUpperCase() + mc[2].slice(1);
      if (word.includes("-"))
        return word
          .split("-")
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
          .join("-");
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}
/**
 * client-portal-verify, the session check (no action): the session from the cookie first (extractClientPortalSessionToken),
 * as verifyPortalSession reads it; who is signed in, and the token for the page to carry on its data calls.
 */
function clientVerify(body: Row, db: Db) {
  const token = extractClientPortalSessionToken(headersOf(body), body);
  if (!token) return refuse(400, { error: "Session token is required", valid: false });
  const auth = clientPortalSession(body, db, token);
  if (!("user" in auth) || !auth.user) return refuse(401, { error: "Invalid or expired session", valid: false });
  if (body.action) return refuse(400, { error: `The harness answers no ${body.action} for client-portal-verify` });
  const u = auth.user;
  const c = rows(db, "clients").find((r) => r.id === u.client_id);
  return {
    valid: true,
    user: {
      id: u.id,
      client_id: u.client_id,
      email: u.email,
      name: c ? smartCapitalizeStr(`${c.primary_first_name || ""} ${c.primary_surname || ""}`.trim()) : u.email,
      has_completed_onboarding: u.has_completed_onboarding ?? false,
      has_accepted_terms: u.has_accepted_terms ?? false,
    },
    session_token: token,
  };
}

/**
 * get-portal-client-data (index.ts): the session by the token the page carries (its own extractPortalToken: the
 * header or the body, never the cookie), then each include the page asks for, in the columns the client may read.
 */
const PORTAL_PROPERTY_SELECT =
  "id, address, property_type, value, purchase_price, purchase_date, deal_closed_at, loan_remaining, interest_rate, ownership_percentage, monthly_interest_repayment, repayment_type, interest_only_period_years, weekly_rental_income, monthly_rental_income, monthly_council_rates, monthly_water_rates, monthly_body_corporate, monthly_building_insurance, monthly_landlord_insurance, monthly_property_management, monthly_repairs_maintenance, net_monthly_cashflow";
function portalClientData(body: Row, db: Db) {
  const h = headersOf(body);
  const token =
    h.get("x-portal-session-token") || body.portal_session_token || h.get("x-session-token") || body.session_token || null;
  if (!token) return refuse(401, { error: "Authentication required", success: false });
  const now = nowOf(body);
  const session = rows(db, "client_portal_sessions").find(
    (s) => s.session_token === token && Date.parse(s.expires_at) > now,
  );
  const user = session ? rows(db, "client_portal_users").find((u) => u.id === session.user_id) : null;
  if (!session || !user || user.status !== "active")
    return refuse(401, { error: "Invalid or expired session", success: false });
  const clientId = user.client_id;
  if (body.action) return refuse(404, { error: `The harness answers no ${body.action}`, success: false });
  const include = body.include || {};
  const result: Row = { success: true, clientId };
  const of = (table: string) => rows(db, table).filter((r) => r.client_id === clientId);
  if (include.client !== false) {
    const c = rows(db, "clients").find((r) => r.id === clientId);
    result.client = projectPortalClient(c ? pick(c, PORTAL_CLIENT_SELECT) : null);
  }
  if (include.properties !== false)
    result.properties = of("client_properties")
      .sort(newestFirst("created_at"))
      .map((r) => pick(r, PORTAL_PROPERTY_SELECT));
  if (include.reports)
    result.reports = of("client_portal_reports")
      .sort(newestFirst("published_at"))
      .slice(0, 100)
      .map((r) => pick(r, PORTAL_REPORT_CLIENT_COLUMNS));
  if (include.reportRequests)
    result.reportRequests = of("client_portal_report_requests")
      .sort(newestFirst("created_at"))
      .slice(0, 50)
      .map((r) => pick(r, PORTAL_REPORT_REQUEST_SELECT));
  if (include.notifications)
    result.notifications = of("client_portal_notifications")
      .sort(newestFirst("created_at"))
      .slice(0, 50)
      .map((r) => pick(r, PORTAL_NOTIFICATION_SELECT));
  const answered = new Set(["client", "properties", "reports", "reportRequests", "notifications"]);
  const unanswered = Object.keys(include).filter((k) => include[k] && !answered.has(k));
  if (unanswered.length)
    return refuse(404, { error: `The harness answers no ${unanswered.join(", ")} here`, success: false });
  return result;
}

// ================================================================== the Message Hub
/**
 * messaging-hub hub_state (index.ts lines 1583-1598): who the reader is in the Hub, and whether it is on. Its switch
 * (feature_flags `messaging_hub`, hubFlagIsOn) is not set on this record, so the Hub is off, and every other operation
 * is refused 403 hub_not_enabled (hubGate). Live updates need the doorbell secret, which the harness's service key is
 * too short to give (resolveDoorbellSecret). The reader is resolved by each surface's own session (resolveIdentity).
 */
function messagingHub(body: Row, db: Db) {
  let identity: { key: string; displayName: string } | null = null;
  if (body.surface === "finance") {
    const { refusal, portalUser } = financePartner(body, db, true);
    if (refusal) return refuse(401, { error: "unauthorised", code: "unauthorised" });
    const contact = rows(db, "finance_agent_contacts").find((c) => c.id === portalUser.finance_contact_id);
    identity = { key: `finance:${portalUser.id}`, displayName: displayNameOf(contact?.name, "Finance partner") };
  } else if (body.surface === "client") {
    const auth = clientPortalSession(body, db, extractClientPortalSessionToken(headersOf(body), body));
    if (!("user" in auth) || !auth.user) return refuse(401, { error: "unauthorised", code: "unauthorised" });
    const c = rows(db, "clients").find((r) => r.id === auth.user.client_id);
    const name = c ? `${c.primary_first_name ?? ""} ${c.primary_surname ?? ""}`.trim() : "";
    identity = { key: `client:${String(auth.user.client_id).toLowerCase()}`, displayName: displayNameOf(name, "Client") };
  } else return null;
  const enabled = hubFlagIsOn(rows(db, "feature_flags").find((f) => f.key === HUB_FLAG_KEY)?.value);
  if (body.op !== "hub_state" && !enabled) return refuse(403, { error: "hub_not_enabled", code: "hub_not_enabled" });
  if (body.op !== "hub_state") return refuse(404, { error: `The harness answers no ${body.op}` });
  return {
    enabled,
    preview: false,
    me: { principalKey: identity.key, displayName: identity.displayName, oversight: false, governance: false },
    securityLabel: "Encrypted in transit and at rest",
    e2ee: {
      available: false,
      reason:
        "End-to-end encryption needs an owner decision and keys held on members' devices; until then conversations are encrypted in transit and at rest.",
    },
    realtime: { available: false },
  };
}

// ================================================================== registration
/**
 * Functions other groups may answer too (the Hub's other surfaces, aml-reliance's other operations, property-team's other
 * portals): a call that is not the portals' goes to the handler a file sorted before this one registered for it, as if
 * this one were not here. A file sorted after this one that answers the same name replaces this one (server.ts).
 */
const HERE = path.basename(import.meta.path);
const EARLIER: Record<string, Handler> = {};
for (const f of readdirSync(import.meta.dir)
  .filter((x) => x.endsWith(".ts") && x < HERE)
  .sort())
  Object.assign(EARLIER, (await import(path.join(import.meta.dir, f))).default);
const orEarlier = (name: string, mine: (body: Row, db: Db) => unknown): Handler => (body, db, ctx) => {
  const answer = mine(body, db);
  if (answer !== null) return answer;
  if (EARLIER[name]) return EARLIER[name](body, db, ctx);
  return refuse(404, { error: `The harness answers no ${name} ${body.op ?? body.operation ?? ""}`.trim() });
};

export default {
  "finance-portal-verify": (body: Row, db: Db) => financeVerify(body, db),
  "finance-portal-client-data": (body: Row, db: Db) => financeClientData(body, db),
  "finance-portal-client-mirror": (body: Row, db: Db) => financeClientMirror(body, db),
  "finance-portal-purchase-files": (body: Row, db: Db) => financePurchaseFiles(body, db),
  "finance-portal-notifications": (body: Row, db: Db) => financeNotifications(body, db),
  "finance-portal-settings": (body: Row, db: Db) => financeSettings(body, db),
  "property-team": orEarlier("property-team", (body, db) => (body.portal === "finance" ? propertyTeam(body, db) : null)),
  "aml-reliance": orEarlier("aml-reliance", (body, db) =>
    body.op === "get_partner_surface_availability" ? amlSurfaceAvailability(body, db) : null,
  ),
  "messaging-hub": orEarlier("messaging-hub", messagingHub),
  "client-portal-verify": (body: Row, db: Db) => clientVerify(body, db),
  "get-portal-client-data": (body: Row, db: Db) => portalClientData(body, db),
} satisfies Record<string, Handler>;
