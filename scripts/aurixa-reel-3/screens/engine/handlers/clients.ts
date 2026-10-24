// The calls Add New Client, Client Management and the client workspace make beyond the record's own reads, each
// answered as the product's function answers it, from the rows the capture's extras put in the record
// (engine/extras/clients-*.json). Where the record holds nothing, the answer is the function's own answer for nothing.
//
// - The staff session (src/hooks/usePermissions.tsx, useWorkspaceEntitlements.tsx, NotificationsContext.tsx; Alex
//   Morgan is signed in by the harness's stand-in for useAuth, src/stubs/agent-useAuth.tsx, or by the product's own
//   AuthProvider through custom-auth-verify-v2): the module grid admin-user-management's get_my_permissions reads from
//   user_permissions, on the demo workspace's plan (mission-control-balance), with an empty notification feed.
// - Add New Client's Standard form (manage-automation-settings' CRM pipelines: none).
// - Client Management's CRM checks (check-integration-secrets, import-clients-from-ghl) and AML case list (aml-cases).
// - The workspace's header and Overview: AML access (aml-access), the agreement document setting
//   (manage-agency-agreements), Commercial & Industrial (manage-ci-assessments).
// - Team & Partners (src/components/clients/teamRoster.ts): finance-portal-admin's list_users, get_assignments and
//   get_default_permissions, as supabase/functions/finance-portal-admin/index.ts builds them from
//   finance_agent_contacts, finance_portal_users, finance_portal_client_assignments and
//   finance_portal_default_permissions; the solicitor, matter and accountant reads, which find nobody.
type Db = Record<string, any[]>;

const rows = (db: Db, table: string) => db[table] ?? [];

/** The Finance Portal's permission areas, as finance-portal-admin's PERMISSION_TABLES list them. */
const PERMISSION_TABLES = [
  "properties",
  "income",
  "expenses",
  "assets",
  "liabilities",
  "employment",
  "address_history",
  "notes",
  "contacts",
  "documents",
  "borrowing_capacity",
  "messages",
  "purchase_files",
];
const EMPTY_PERMISSIONS = Object.fromEntries(
  PERMISSION_TABLES.map((t) => [t, { view: false, edit: false, delete: false }]),
);
/** finance-portal-admin's mergePermissions: the partner's global baseline or the client's own matrix grants. */
function mergePermissions(global: any, perClient: any) {
  const out: Record<string, any> = {};
  for (const t of PERMISSION_TABLES) {
    const g = (global && typeof global === "object" && global[t]) || {};
    const p = (perClient && typeof perClient === "object" && perClient[t]) || {};
    out[t] = { view: !!(g.view || p.view), edit: !!(g.edit || p.edit), delete: !!(g.delete || p.delete) };
  }
  return out;
}

/** The workspace's Mission Control balance: the demo workspace is on Scale (the plan that carries Borrowing Capacity). */
const BALANCE = {
  available: 250000,
  allowance: 250000,
  used: 0,
  reserved: 0,
  planName: "Scale",
  planSlug: "scale",
  addonSlugs: [],
  overagePolicy: null,
  currentPeriodEnd: "2026-11-24T00:00:00+11:00",
  exempt: false,
  source: "live",
  stale: false,
  updatedAt: "2026-10-24T09:12:00+11:00",
};

export default {
  // The Command Centre's session check (_shared/customAuth/verify.ts), for the record's staff user. The harness signs
  // Alex in with its stand-in for useAuth (src/stubs/agent-useAuth.tsx), which never asks; this answers the
  // product's own AuthProvider wherever it runs instead (src/screens/clients.tsx sends its request here).
  "custom-auth-verify-v2": (_body: any, db: Db) => {
    const user = rows(db, "custom_users").find((u) => u.is_active);
    if (!user) return { error: "No session", valid: false };
    return {
      valid: true,
      user: { id: user.id, username: user.username, role: user.role },
      roles: rows(db, "user_roles")
        .filter((r) => r.user_id === user.id)
        .map((r) => r.role),
      access_token: null,
      jwt_unavailable: true,
    };
  },

  // admin-user-management's get_my_permissions, for the signed-in staff user (the record's custom_users row): the
  // modules user_permissions grants them, by dashboard_modules' keys and names.
  "admin-user-management": (body: any, db: Db) => {
    if (body.action !== "get_my_permissions")
      return { __status: 404, success: false, error: `The harness answers no admin-user-management ${body.action}` };
    const user = rows(db, "custom_users")[0];
    const modules = new Map(rows(db, "dashboard_modules").map((m) => [m.id, m]));
    return {
      success: true,
      permissions: rows(db, "user_permissions")
        .filter((p) => p.user_id === user?.id)
        .map((p) => ({
          module_key: modules.get(p.module_id)?.module_key || "",
          module_name: modules.get(p.module_id)?.module_name || "",
          can_view: Boolean(p.can_view),
          can_edit: Boolean(p.can_edit),
          can_delete: Boolean(p.can_delete),
        }))
        .filter((p) => p.module_key),
    };
  },

  "mission-control-balance": () => BALANCE,

  // Add New Client's Standard form reads the CRM pipelines it can file a new client under (getPipelines, getStages):
  // the demo workspace has none synced (ghl_pipelines, ghl_pipeline_stages).
  "manage-automation-settings": (body: any, db: Db) => {
    if (body.operation === "getPipelines")
      return { success: true, pipelines: rows(db, "ghl_pipelines").filter((p) => p.is_active) };
    if (body.operation === "getStages") return { success: true, stages: rows(db, "ghl_pipeline_stages") };
    return { __status: 404, success: false, error: `The harness answers no manage-automation-settings ${body.operation}` };
  },

  // Client Management asks whether the CRM integration is configured, and its auto-sync imports from the CRM. The demo
  // workspace has no CRM connected, so check-integration-secrets reports its two secrets missing and
  // import-clients-from-ghl refuses as it does without credentials (500, "GoHighLevel credentials not configured").
  "check-integration-secrets": (body: any) => {
    const map: Record<string, string[]> = {
      gohighlevel: ["GOHIGHLEVEL_API_KEY", "GOHIGHLEVEL_LOCATION_ID"],
    };
    const names = map[body.integrationId];
    if (!names) return { __status: 404, success: false, error: `The harness answers no check-integration-secrets ${body.integrationId}` };
    return {
      success: true,
      configured: false,
      configuredSecrets: [],
      missingSecrets: names,
      ...(body.integrationId === "gohighlevel" ? { locationId: null } : {}),
    };
  },
  "import-clients-from-ghl": () => ({ __status: 500, error: "GoHighLevel credentials not configured", success: false }),

  // aml-cases' list: the workspace's AML/CTF cases, newest first (none: Jordan has just been created).
  "aml-cases": (body: any, db: Db) => {
    if (body.op !== "list") return { __status: 404, success: false, error: `The harness answers no aml-cases ${body.op}` };
    const limit = Math.min(Number(body.limit ?? 50), 200);
    const offset = Math.max(Number(body.offset ?? 0), 0);
    const cases = [...rows(db, "aml_cases")].sort((a, b) => String(b.opened_at).localeCompare(String(a.opened_at)));
    return { cases: cases.slice(offset, offset + limit), total: cases.length, limit, offset };
  },

  // aml-access' summary (src/hooks/useAmlAccess.ts): the module's switch (feature_flags `aml_ctf` and the V3 rollout
  // keys) and the signed-in user's AML roles (aml.role_assignments, held here as `aml_role_assignments`). Alex holds
  // none in this record, so the workspace's AML action and summary card draw nothing.
  "aml-access": (body: any, db: Db) => {
    if ((body.op ?? "summary") !== "summary")
      return { __status: 404, success: false, error: `The harness answers no aml-access ${body.op}` };
    const flag = (key: string) => {
      const value = rows(db, "feature_flags").find((f) => f.key === key)?.value;
      if (typeof value === "boolean") return value;
      if (typeof value === "string") return value === "true";
      return Boolean(value && typeof value === "object" && value.enabled === true);
    };
    const user = rows(db, "custom_users")[0];
    const roles = [
      ...new Set(
        rows(db, "aml_role_assignments")
          .filter((r) => r.user_id === user?.id && !r.revoked_at)
          .map((r) => String(r.role))
          .filter((r) => ["analyst", "reviewer", "mlro", "auditor"].includes(r)),
      ),
    ];
    const V3 = [
      "aml_v3_nav",
      "aml_v3_start_client_compliance",
      "aml_v3_compliance_home",
      "aml_v3_case_workspace",
      "aml_v3_regulatory_hub",
      "aml_v3_terminology_editor",
      "aml_v3_metrics_relocation",
      "aml_v3_org_settings",
    ];
    return {
      flagEnabled: flag("aml_ctf"),
      roles,
      hasAnyRole: roles.length > 0,
      canWrite: roles.some((r) => ["analyst", "reviewer", "mlro"].includes(r)),
      isMlro: roles.includes("mlro"),
      userId: user?.id ?? null,
      v3Flags: Object.fromEntries(V3.map((k) => [k, flag(k)])),
    };
  },

  // manage-agency-agreements' get_document_settings (Send Agreement's dialog, closed): how agreements are drawn, as
  // global_report_settings holds it, or the product's default ("gamma") with no Gamma key held.
  "manage-agency-agreements": (body: any, db: Db) => {
    if (body.action !== "get_document_settings")
      return { __status: 404, success: false, error: `The harness answers no manage-agency-agreements ${body.action}` };
    const stored = rows(db, "global_report_settings").find((s) => s.setting_key === "agreement_document_source")
      ?.setting_value;
    const source = stored?.source === "in_house" || stored?.source === "gamma" ? stored.source : "gamma";
    return {
      success: true,
      source,
      gamma_configured: false,
      updated_by: typeof stored?.updated_by === "string" ? stored.updated_by : null,
      updated_at: typeof stored?.updated_at === "string" ? stored.updated_at : null,
    };
  },

  // The rest of Team & Partners and the Overview: Jordan has no solicitor, legal matter, accountant or Commercial &
  // Industrial assessment, so each function answers with its empty lists. A record that holds such rows is refused
  // rather than answered short, because these answers do not build them.
  "solicitor-portal-admin": (body: any, db: Db) =>
    body.operation === "list_users" && !rows(db, "solicitor_portal_users").length
      ? { success: true, records: [] }
      : { __status: 404, success: false, error: `The harness answers no solicitor-portal-admin ${body.operation} here` },
  "legal-matters-admin": (body: any, db: Db) =>
    body.operation === "list_for_client" && !rows(db, "legal_matters").some((m) => m.client_id === body.client_id)
      ? { success: true, records: [] }
      : { __status: 404, success: false, error: `The harness answers no legal-matters-admin ${body.operation} here` },
  "accountant-portal-admin": (body: any, db: Db) =>
    body.operation === "get_client_accounting" &&
    !rows(db, "accountant_client_allocations").some((a) => a.client_id === body.client_id)
      ? { success: true, briefs: [], requests: [], allocations: [] }
      : { __status: 404, success: false, error: `The harness answers no accountant-portal-admin ${body.operation} here` },
  "manage-ci-assessments": (body: any, db: Db) => {
    if (body.operation !== "client_workspace" || rows(db, "commercial_industrial_assessments").length)
      return { __status: 404, success: false, error: `The harness answers no manage-ci-assessments ${body.operation} here` };
    const c = rows(db, "clients").find((x) => x.id === body.clientId);
    if (!c) return { __status: 404, success: false, error: "Client not found", code: "CLIENT_NOT_FOUND" };
    const client = {
      id: c.id,
      primary_first_name: c.primary_first_name,
      primary_surname: c.primary_surname,
      primary_email: c.primary_email ?? null,
      primary_mobile: c.primary_mobile ?? null,
    };
    return {
      success: true,
      data: { client, assessments: [], runs: [], renders: [], documents: [], links: [], uploads: [], candidates: [] },
    };
  },

  // notifications-feed-v2's list: the bell's feed (nothing raised for Alex).
  "notifications-feed-v2": (body: any, db: Db) =>
    body.action === "list"
      ? { success: true, notifications: rows(db, "notifications") }
      : { success: true },

  "finance-portal-admin": (body: any, db: Db) => {
    const op = body.operation;
    if (op === "list_users") {
      const portal = new Map(rows(db, "finance_portal_users").map((u) => [u.finance_contact_id, u]));
      const records = [...rows(db, "finance_agent_contacts")]
        .sort((a, b) => Number(b.is_default) - Number(a.is_default) || String(a.name).localeCompare(String(b.name)))
        .map((c) => {
          const pu = portal.get(c.id);
          let status = "no_access";
          if (pu) {
            if (pu.revoked_at) status = "revoked";
            else if (!pu.invite_accepted_at && pu.invite_token_expires_at && new Date(pu.invite_token_expires_at) > new Date())
              status = "invited";
            else if (!pu.invite_accepted_at) status = "invite_expired";
            else if (pu.is_active) status = "active";
            else status = "inactive";
          }
          return { ...c, portal_user: pu || null, status };
        });
      return { success: true, records };
    }
    if (op === "get_assignments") {
      if (!body.finance_user_id) return { __status: 400, error: "finance_user_id is required" };
      const partner = rows(db, "finance_portal_users").find((u) => u.id === body.finance_user_id);
      const clients = new Map(rows(db, "clients").map((c) => [c.id, c]));
      const records = rows(db, "finance_portal_client_assignments")
        .filter((a) => a.finance_user_id === body.finance_user_id)
        .sort((a, b) => String(b.assigned_at).localeCompare(String(a.assigned_at)))
        .map(({ finance_user_id: _, ...a }) => {
          const c = clients.get(a.client_id);
          return {
            ...a,
            effective_permissions: mergePermissions(partner?.global_permissions ?? null, a.permissions),
            client: c
              ? {
                  id: c.id,
                  primary_contact_name: [c.primary_first_name, c.primary_surname].filter(Boolean).join(" ").trim() || null,
                  secondary_contact_name:
                    [c.secondary_first_name, c.secondary_surname].filter(Boolean).join(" ").trim() || null,
                  primary_contact_email: c.primary_email ?? null,
                  status: c.deal_status ?? null,
                  finance_contact_id: c.finance_contact_id ?? null,
                }
              : null,
          };
        });
      return { success: true, records };
    }
    if (op === "get_default_permissions") {
      const latest = [...rows(db, "finance_portal_default_permissions")].sort((a, b) =>
        String(b.updated_at).localeCompare(String(a.updated_at)),
      )[0];
      return {
        success: true,
        record: latest
          ? { id: latest.id, permissions: latest.permissions, updated_at: latest.updated_at, updated_by: latest.updated_by ?? null }
          : { permissions: EMPTY_PERMISSIONS, updated_at: null, updated_by: null },
      };
    }
    return { __status: 404, success: false, error: `The harness answers no finance-portal-admin ${op}` };
  },
};
