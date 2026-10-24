// The Aurixa agent's calls (src/components/agent/AgentChatWidget.tsx), answered on Jordan's record as the product's
// functions answer them (supabase/functions/<name>/index.ts at the product's checkout; the functions named are the
// rules followed, and the product's own pure modules compose every word and every stored row they compose):
//
// - ai-dashboard-agent: list-conversations, create-conversation, get-messages, get-notifications, list-skills,
//   chat-stream and confirm-action (index.ts handleListConversations, handleCreateConversation, handleGetMessages,
//   executeGetNotificationSummary, 'list-skills', handleChatStream, handleConfirmAction).
// - internal-messaging list_threads (the launcher's and the header's unread badge) and agent-library status (whether
//   the composer attaches through the Aurixa library).
//
// No model is called. A turn's own words and the tools the model calls (their names and arguments) are the script
// below, written as the model answers under the function's instructions (buildSystemPrompt rule 2: "describe what
// you're about to do and ask the user to confirm BEFORE the action executes"; rule 37a names the finance partner
// tools; AURIXA_IDENTITY_RULES: first person, warm, concise, Australian English). Everything else is the function's:
// the SSE events and their order (handleChatStream: `event: <name>\ndata: <json>\n\n`, then `data: [DONE]\n\n`), the
// steps (createAgentTurn, agentTurn.pure.ts), the card (prepareApprovalCard: the gate's client resolution,
// clientScope.pure.ts resolveClientArguments; describeCardAct → planFinanceAssign, financePartnerAsk.pure.ts; the
// stored call, approvalCard.pure.ts approvalSubject and cardToolCall), the decision (approvalPolicy.pure.ts
// judgeApproval), the act's words (financeActDone) and the receipts (agentReceipt.pure.ts buildReceipt). The reads the
// card makes of Finance Portal Admin (list_users, get_default_permissions, get_assignments) and the write its act makes
// (upsert_assignment) are answered from the record by that route's own code (finance-portal-admin/index.ts), with the
// product's request builders (financePortal/financePartners.pure.ts).
//
// The stream is paced as the function's would arrive (each model round's wait, each tool's run), so the trace says
// how long the turn took as the product times it. The demo's clock starts at the capture's (capture.cjs DEMO_TIME).
import path from "node:path";
import { CLIENT, PRODUCT } from "../product.ts";

const FUNCTIONS = path.join(PRODUCT, "supabase/functions");
const AGENT = path.join(FUNCTIONS, "_shared/agent");
const { createAgentTurn, wantsPanel } = await import(path.join(AGENT, "agentTurn.pure.ts"));
const { buildReceipt } = await import(path.join(AGENT, "agentReceipt.pure.ts"));
const { approvalSubject, cardToolCall, clientIdsOf, dealIdsOf } = await import(path.join(AGENT, "approvalCard.pure.ts"));
const { requiresApproval, judgeApproval } = await import(path.join(AGENT, "approvalPolicy.pure.ts"));
const { resolveClientArguments } = await import(path.join(AGENT, "clientScope.pure.ts"));
const { actionLogRow } = await import(path.join(AGENT, "actionRecord.pure.ts"));
const {
  clientRosterPartners,
  financeActDone,
  financeActRefused,
  financeAssignmentsOf,
  financeDefaultsOf,
  financePartnersOf,
  financePartnersReply,
  findFinancePartner,
  planFinanceAssign,
} = await import(path.join(AGENT, "financePartnerAsk.pure.ts"));
const { financeAssignmentsFields, financeDefaultPermissionsFields, financePartnersFields } = await import(
  path.join(FUNCTIONS, "_shared/financePortal/financePartners.pure.ts")
);
const { LIBRARY_LIMITS } = await import(path.join(FUNCTIONS, "_shared/agentLibrary/fileKinds.pure.ts"));

type Db = Record<string, any[]>;
type Row = Record<string, any>;
const refuse = (status: number, body: Row) => ({ ...body, __status: status });

/** Alex Morgan, signed in: engine/product.ts verifyAuth's userId, src/stubs/agent-useAuth.tsx, the record's custom_users. */
const STAFF = "demo-staff";

/** The meta tools and the panel tools (index.ts META_TOOL_NAMES, UI_TOOL_NAMES). */
const META = new Set(["list_tool_domains", "search_tools", "load_tools"]);
const UI = new Set(["show_plan", "open_page"]);

// ------------------------------------------------------------------ the demo's clock and the agent's tables
const DEMO = Date.parse("2026-10-24T09:12:30+11:00");
let epoch = Date.now();
let serial = 0;
/** The record is put back before each capture (server.ts __reset), which drops these tables: the clock starts again. */
function tables(db: Db) {
  if (!db.agent_conversations) {
    epoch = Date.now();
    serial = 0;
    db.agent_conversations = [];
    db.agent_messages = [];
    db.agent_action_log = [];
  }
  db.finance_portal_client_assignments ??= [];
  db.finance_portal_activity_log ??= [];
}
const now = () => DEMO + (Date.now() - epoch);
/** A timestamptz as PostgREST writes it (UTC, "+00:00"). */
const iso = (ms: number) => new Date(ms).toISOString().replace(/Z$/, "+00:00");
const uuid = (kind: string) => `00000000-0000-4000-8000-0000${kind}${String(++serial).padStart(6, "0")}`;
const of = (db: Db, table: string) => db[table] ?? [];

/** A row as Postgres returns it: the table's defaults where the insert left a column out (agent_messages, types.ts). */
function insertMessage(db: Db, row: Row, at: number): Row {
  const stored = {
    id: uuid("ad"),
    created_at: iso(at),
    content: "",
    tool_calls: null,
    tool_results: null,
    requires_confirmation: false,
    confirmation_status: null,
    sent_by: null,
    recalled_memory_ids: [],
    plan_id: null,
    step_id: null,
    ...row,
  };
  db.agent_messages.push(stored);
  return stored;
}

// ------------------------------------------------------------------ Finance Portal Admin, by its own code
/** finance-portal-admin/index.ts PERMISSION_TABLES and EMPTY_PERMISSIONS. */
const PERMISSION_TABLES = [
  "properties", "income", "expenses", "assets", "liabilities", "employment", "address_history", "notes", "contacts",
  "documents", "borrowing_capacity", "messages", "purchase_files",
];
const EMPTY_PERMISSIONS = Object.fromEntries(PERMISSION_TABLES.map((t) => [t, { view: false, edit: false, delete: false }]));
function normalizePermissions(input: any) {
  const out: Row = JSON.parse(JSON.stringify(EMPTY_PERMISSIONS));
  if (!input || typeof input !== "object") return out;
  for (const t of PERMISSION_TABLES) {
    const p = input[t];
    if (p && typeof p === "object") out[t] = { view: !!p.view, edit: !!p.edit, delete: !!p.delete };
  }
  return out;
}
const pickCols = (r: Row, cols: string) => Object.fromEntries(cols.split(",").map((c) => c.trim()).map((c) => [c, r[c] ?? null]));

/** The operations the card and its act send the route, answered as the route answers them. */
function financePortalAdmin(db: Db, body: Row, adminUserId = STAFF): Row {
  const op = body.operation;
  if (op === "list_users") {
    // list_users: contacts ordered by is_default desc, name; each with its portal account and status.
    const contacts = [...of(db, "finance_agent_contacts")]
      .sort((a, b) => Number(!!b.is_default) - Number(!!a.is_default) || String(a.name).localeCompare(String(b.name)))
      .map((c) => pickCols(c, "id, name, email, company, contact_type, is_active, is_default, notes, created_at"));
    const portalByContact = new Map(
      of(db, "finance_portal_users").map((u) => [
        u.finance_contact_id,
        pickCols(u, "id, finance_contact_id, email, is_active, invite_sent_at, invite_accepted_at, invite_token_expires_at, last_login_at, revoked_at, has_accepted_terms, has_completed_onboarding, terms_accepted_at, created_at, global_permissions"),
      ]),
    );
    const records = contacts.map((c) => {
      const pu = portalByContact.get(c.id) as Row | undefined;
      let status = "no_access";
      if (pu) {
        if (pu.revoked_at) status = "revoked";
        else if (!pu.invite_accepted_at && pu.invite_token_expires_at && Date.parse(pu.invite_token_expires_at) > now()) status = "invited";
        else if (!pu.invite_accepted_at) status = "invite_expired";
        else if (pu.is_active) status = "active";
        else status = "inactive";
      }
      return { ...c, portal_user: pu || null, status };
    });
    return { success: true, records };
  }
  if (op === "get_default_permissions") {
    const data = [...of(db, "finance_portal_default_permissions")].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
    return {
      success: true,
      record: data ? pickCols(data, "id, permissions, updated_at, updated_by") : { permissions: EMPTY_PERMISSIONS, updated_at: null, updated_by: null },
    };
  }
  if (op === "get_assignments") {
    const user = of(db, "finance_portal_users").find((u) => u.id === body.finance_user_id);
    const clients = new Map(of(db, "clients").map((c) => [c.id, c]));
    const records = of(db, "finance_portal_client_assignments")
      .filter((a) => a.finance_user_id === body.finance_user_id)
      .sort((a, b) => String(b.assigned_at).localeCompare(String(a.assigned_at)))
      .map((a) => {
        const c = clients.get(a.client_id);
        return {
          ...pickCols(a, "id, client_id, permissions, auto_linked, auto_link_source, assigned_at, assigned_by, updated_at"),
          effective_permissions: a.permissions,
          client: c
            ? {
                id: c.id,
                primary_contact_name: [c.primary_first_name, c.primary_surname].filter(Boolean).join(" ").trim() || null,
                secondary_contact_name: [c.secondary_first_name, c.secondary_surname].filter(Boolean).join(" ").trim() || null,
                primary_contact_email: c.primary_email ?? null,
                status: c.deal_status ?? "active",
                finance_contact_id: c.finance_contact_id ?? null,
              }
            : null,
        };
      });
    return { success: true, records, global_permissions: user?.global_permissions ?? null };
  }
  if (op === "upsert_assignment") {
    const { finance_user_id, client_id, permissions, auto_link_source } = body;
    if (!finance_user_id || !client_id) return refuse(400, { error: "finance_user_id and client_id are required" });
    const normalized = normalizePermissions(permissions);
    const list = of(db, "finance_portal_client_assignments");
    let upserted = list.find((a) => a.finance_user_id === finance_user_id && a.client_id === client_id);
    const at = iso(now());
    const fields = { permissions: normalized, auto_linked: !!auto_link_source, auto_link_source: auto_link_source || null, assigned_by: adminUserId, updated_at: at };
    if (upserted) Object.assign(upserted, fields);
    else {
      upserted = { id: uuid("fb"), finance_user_id, client_id, purchase_file_id: null, assigned_at: at, ...fields };
      list.push(upserted);
    }
    // The cascade: the client's finance_contact_id is set to this partner's contact where it is empty.
    let cascaded_finance_contact_id: string | null = null;
    const pUser = of(db, "finance_portal_users").find((u) => u.id === finance_user_id);
    const client = of(db, "clients").find((c) => c.id === client_id);
    if (pUser?.finance_contact_id && client && !client.finance_contact_id) {
      client.finance_contact_id = pUser.finance_contact_id;
      cascaded_finance_contact_id = pUser.finance_contact_id;
    }
    of(db, "finance_portal_activity_log").push({
      id: uuid("fa"),
      finance_user_id,
      client_id,
      actor_user_id: adminUserId,
      actor_type: "staff",
      action: "assignment_upserted",
      entity_type: "finance_portal_client_assignment",
      entity_id: upserted.id,
      metadata: { permissions: normalized, auto_link_source: auto_link_source || null, cascaded_finance_contact_id },
      created_at: at,
    });
    return { success: true, id: upserted.id, cascaded_finance_contact_id };
  }
  return refuse(400, { error: `The harness answers no finance-portal-admin ${op}` });
}

// ------------------------------------------------------------------ the agent's finance partner reads and acts
/** index.ts readFinanceClient. */
function readFinanceClient(db: Db, clientId: string) {
  const data = of(db, "clients").find((c) => c.id === clientId);
  if (!data) return { ok: false, code: "not_found", error: "Client not found. Nothing was changed." };
  const name = `${data.primary_first_name ?? ""} ${data.primary_surname ?? ""}`.trim() || "this client";
  return { ok: true, client: { id: data.id, name, financeContactId: data.finance_contact_id ?? null } };
}

/** index.ts readClientFinanceRoster: every partner with a live portal account, and each one's assignment to this client. */
function readClientFinanceRoster(db: Db, clientId: string) {
  const rows = financePartnersOf(financePortalAdmin(db, financePartnersFields()));
  if (!rows) return { ok: false, code: "read_failed", error: "The finance partners could not be read just now. Nothing was changed." };
  const client = readFinanceClient(db, clientId);
  if (client.ok === false) return client;
  const roster = clientRosterPartners(rows).map((partner: Row) => {
    const assigned = financeAssignmentsOf(financePortalAdmin(db, financeAssignmentsFields(partner.portal_user.id))) ?? [];
    return { partner, assignment: assigned.find((a: Row) => a.client_id === clientId) ?? null };
  });
  return { ok: true, rows, client: client.client, roster };
}

/** index.ts planFinancePartnerAct, for the client card's Assign (the one act this turn proposes). */
function planFinancePartnerAct(db: Db, tool: string, args: Row) {
  if (tool !== "assign_finance_partner_client") return { ok: false, code: "invalid", error: `${tool} is not run here.` };
  const read = readClientFinanceRoster(db, String(args.client_id ?? "")) as Row;
  if (read.ok === false) return read;
  const defaults = financePortalAdmin(db, financeDefaultPermissionsFields());
  const found = findFinancePartner(read.rows, args);
  if (found.ok === false) return found;
  const assignments = read.roster.filter((r: Row) => r.partner.id === found.partner.id && r.assignment).map((r: Row) => r.assignment);
  return planFinanceAssign(found.partner, read.client, assignments, financeDefaultsOf(defaults));
}

/** index.ts executeFinancePartnerAct: the page's own request to its own route, and the page's words after. */
function executeFinancePartnerAct(db: Db, tool: string, args: Row) {
  const planned = planFinancePartnerAct(db, tool, args) as Row;
  if (planned.ok === false) return { success: false, error: planned.error, code: planned.code };
  const { act } = planned;
  const asked = financePortalAdmin(db, act.request);
  const refused = financeActRefused(asked);
  if (refused) return { success: false, error: `It was not done: ${refused}. Nothing was changed.`, code: "refused" };
  return { success: true, message: financeActDone(act, asked) };
}

/** The data tools this turn runs, by their executors (index.ts executeGetFinancePortalPartners). */
function runTool(db: Db, name: string, args: Row): unknown {
  if (name === "get_finance_portal_partners") {
    const rows = financePartnersOf(financePortalAdmin(db, financePartnersFields()));
    return rows ? financePartnersReply(rows, args ?? {}) : { error: "The finance partners could not be read just now. Nothing was changed.", code: "read_failed" };
  }
  throw new Error(`The harness runs no ${name}`);
}

/** The person's own clients, as the gate's client resolution reads them (readScopedClientBook): Jordan's record. */
const clientBook = (db: Db) => of(db, "clients").filter((c) => c.id === CLIENT);

/** index.ts clientNamesFor. */
function clientNamesFor(db: Db, ids: string[]) {
  const names = new Map<string, string>();
  for (const row of of(db, "clients").filter((c) => ids.includes(c.id)))
    names.set(row.id, `${row.primary_first_name || ""} ${row.primary_surname || ""}`.trim() || "Unnamed client");
  return { names, read: true };
}

/** index.ts prepareApprovalCard, for this turn's act: the gate's preview, the card's reads, and the stored call. */
function prepareApprovalCard(db: Db, toolCalls: Row[]) {
  const stored: Row[] = [];
  for (const tc of toolCalls) {
    const name = tc.function.name;
    if (UI.has(name)) continue;
    if (META.has(name)) {
      stored.push(tc);
      continue;
    }
    // authorizeAgentTool: a client named in words becomes its id among the person's own clients.
    const resolved = resolveClientArguments(JSON.parse(tc.function.arguments), clientBook(db));
    if (resolved.ok === false) return { ok: false, refusedTool: name, error: resolved.error };
    const checked = resolved.args;
    // describeCardAct, case 'assign_finance_partner_client': the partner, the client and the template, as the card reads them.
    const planned = planFinancePartnerAct(db, name, checked) as Row;
    if (planned.ok === false) return { ok: false, refusedTool: name, error: planned.error, code: planned.code };
    const clientIds = clientIdsOf(checked);
    const named = clientNamesFor(db, clientIds);
    const deals = { ids: dealIdsOf(checked), labels: new Map<string, string>(), read: true };
    stored.push(cardToolCall(tc, checked, { ...approvalSubject(clientIds, named.names, named.read, deals), clientRecord: planned.plan }));
  }
  return { ok: true, toolCalls: stored };
}

// ------------------------------------------------------------------ the turn the model takes
interface Call {
  /** The id the function gives a call the gateway streamed without one (callAIStream: `call_<base36>`). */
  id: string;
  name: string;
  args: Row;
  /** How long the tool ran. */
  ms?: number;
}
interface Round {
  /** How long the model took before its first output in this round. */
  thinkMs: number;
  /** What the model wrote in this round, streamed as it arrives. */
  text?: string;
  calls: (results: Record<string, any>) => Call[];
  /** How long the card's reads took (the gate's preview, Finance Portal Admin's roster and template). */
  cardMs?: number;
}

/** The person's words, as Alex Morgan types them into the composer. */
export const AGENT_ASK = "Give Jamie Chen at Harbour Finance Group access to Jordan Ellis's file";

const TURNS: Record<string, Round[]> = {
  [AGENT_ASK]: [
    // Rule 37a names both tools; they are deferred, so the model loads them by name first (TOOL DISCOVERY).
    {
      thinkMs: 1400,
      calls: () => [{ id: "call_k3v9q2xw7m", name: "load_tools", args: { names: ["get_finance_portal_partners", "assign_finance_partner_client"] } }],
    },
    // The partner's id, as get_finance_portal_partners lists it (assign_finance_partner_client's finance_contact_id).
    {
      thinkMs: 1300,
      calls: () => [{ id: "call_p8d2r6t4hn", name: "get_finance_portal_partners", args: { search: "Jamie Chen" }, ms: 640 }],
    },
    // The act, named by the id the read returned and the client as the person named them.
    {
      thinkMs: 900,
      text: "I'll give Jamie Chen at Harbour Finance Group access to Jordan Ellis's file in the Finance Portal, with your default permissions. Can I go ahead?",
      calls: (results) => {
        const partner = (results["call_p8d2r6t4hn"]?.partners ?? []).find((p: Row) => p.name === "Jamie Chen");
        return [{ id: "call_w5c7j1b9fz", name: "assign_finance_partner_client", args: { finance_contact_id: partner?.finance_contact_id, client_id: "Jordan Ellis" } }];
      },
      cardMs: 880,
    },
  ],
};

/** A round's words as the gateway streams them: a few words at a time. */
function tokens(text: string): string[] {
  const words = text.match(/\S+\s*/g) ?? [];
  const out: string[] = [];
  for (let i = 0; i < words.length; i += 3) out.push(words.slice(i, i + 3).join(""));
  return out;
}

const sse = (event: string, payload: unknown) => `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;

/** handleChatStream, on this turn. */
function chatStream(db: Db, body: Row) {
  const { conversation_id } = body;
  const message: string = typeof body.message === "string" ? body.message : "";
  if (!conversation_id || !message.trim()) return refuse(400, { error: "conversation_id and message are required" });
  const conversation = of(db, "agent_conversations").find((c) => c.id === conversation_id && c.user_id === STAFF);
  if (!conversation) return refuse(403, { error: "Not authorized for this conversation" });
  const rounds = TURNS[message.trim()];
  if (!rounds) {
    console.log(`refused: ai-dashboard-agent chat-stream: no turn is written for "${message.slice(0, 80)}"`);
    return refuse(404, { error: "The harness answers no other question" });
  }

  const started = now();
  insertMessage(db, { conversation_id, role: "user", content: message, sent_by: STAFF }, started);

  let clock = started;
  let last = started;
  const chunks: { after: number; text: string }[] = [];
  const emit = (event: string, payload: unknown) => {
    chunks.push({ after: clock - last, text: sse(event, payload) });
    last = clock;
  };
  const turn = createAgentTurn({ panel: wantsPanel(body), emit: (e: Row) => emit(e.event, e.data), now: () => clock });
  const results: Record<string, any> = {};
  let finalResponse = "";
  let pendingToolCalls: Row[] | null = null;

  for (const round of rounds) {
    clock += round.thinkMs;
    for (const tok of tokens(round.text ?? "")) {
      finalResponse += tok;
      emit("token", { delta: tok });
      clock += 45;
    }
    const calls = round.calls(results);
    const toolCalls = calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } }));
    const hasWrite = calls.some((c) => !META.has(c.name) && !UI.has(c.name) && requiresApproval(c.name));
    if (hasWrite) {
      clock += round.cardMs ?? 0;
      const card = prepareApprovalCard(db, toolCalls) as Row;
      if (!card.ok) throw new Error(`The card was refused: ${card.error}`);
      pendingToolCalls = card.toolCalls;
      break;
    }
    const jobs: Call[] = [];
    for (const c of calls) {
      if (META.has(c.name)) {
        emit("tool", { phase: "start", name: c.name, id: c.id });
        emit("tool", { phase: "end", name: c.name, id: c.id });
        continue;
      }
      jobs.push(c);
      emit("tool", { phase: "start", name: c.name, id: c.id });
    }
    for (const job of jobs) {
      const raw = runTool(db, job.name, job.args);
      results[job.id] = raw;
      clock += job.ms ?? 0;
      emit("tool", { phase: "end", name: job.name, id: job.id });
      turn.ran(job.name, raw, job.ms ?? 0, job.id);
    }
  }

  const receipt = turn.receipt({ halted: false });
  if (pendingToolCalls) {
    insertMessage(
      db,
      {
        conversation_id,
        role: "assistant",
        content: finalResponse,
        tool_calls: pendingToolCalls,
        requires_confirmation: true,
        confirmation_status: "pending",
        recalled_memory_ids: [],
        ...(receipt ? { tool_results: receipt } : {}),
      },
      clock,
    );
  }
  // The first turn is titled by a model call (fire-and-forget); with no model, the function's own fallback: the question.
  if (of(db, "agent_messages").filter((m) => m.conversation_id === conversation_id).length <= 2)
    conversation.title = message.length > 60 ? `${message.substring(0, 57)}...` : message;
  conversation.updated_at = iso(clock);

  emit("done", {
    requires_confirmation: Boolean(pendingToolCalls),
    pending_tool_calls: pendingToolCalls ?? undefined,
    aborted: false,
    receipt: turn.panel && receipt ? receipt : undefined,
  });
  chunks.push({ after: 0, text: "data: [DONE]\n\n" });
  return { __stream: chunks };
}

/** handleConfirmAction. */
function confirmAction(db: Db, body: Row) {
  const pending = of(db, "agent_messages").find((m) => m.id === body.message_id);
  if (!pending) return refuse(404, { success: false, error: "Message not found" });
  const conversation = of(db, "agent_conversations").find((c) => c.id === pending.conversation_id);
  if (!conversation || conversation.user_id !== STAFF) return refuse(403, { success: false, error: "Not authorized for this conversation" });
  const approved = body.approved === true;
  const verdict = judgeApproval(pending, now());
  if (!verdict.ok) return refuse(verdict.status, { success: false, code: verdict.code, error: verdict.message });
  if (pending.confirmation_status !== "pending")
    return refuse(409, { success: false, code: "approval_already_decided", error: "That action was decided a moment ago, so it did not run again." });
  pending.confirmation_status = approved ? "approved" : "rejected";
  const conversation_id = pending.conversation_id;
  if (!approved) {
    insertMessage(db, { conversation_id, role: "assistant", content: "Action cancelled. No changes were made." }, now());
    return { success: true, message: "Action cancelled." };
  }
  const results: Row[] = [];
  const steps: Row[] = [];
  for (const tc of pending.tool_calls ?? []) {
    const name = tc?.function?.name;
    if (typeof name !== "string" || META.has(name) || UI.has(name)) continue;
    const args = JSON.parse(tc.function.arguments || "{}");
    // The route's request, as the person: Finance Portal Admin answers in about the time a read takes.
    const ms = 760;
    const result = name === "assign_finance_partner_client" ? executeFinancePartnerAct(db, name, args) : { success: false, error: `The harness runs no ${name}` };
    of(db, "agent_action_log").push({
      id: uuid("ae"),
      created_at: iso(now()),
      ...actionLogRow({ userId: STAFF, tool: name, args, result, ms, context: { conversationId: conversation_id, messageId: pending.id }, target: null, rollback: null }),
    });
    results.push({ tool_call_id: tc.id, result });
    steps.push({ tool: name, ms, ok: !(result?.success === false || (result as Row)?.error) });
  }
  const lines = results
    .map((r) => {
      const out = r.result || {};
      if (out.success === false || out.error) return `⚠️ Error: ${out.error || out.message}`;
      return typeof out.message === "string" && out.message.trim() ? out.message : null;
    })
    .filter((l): l is string => !!l);
  const content = lines.length ? lines.join("\n") : "Done.";
  const receipt = buildReceipt({ steps, views: [] });
  insertMessage(db, { conversation_id, role: "assistant", content, ...(receipt ? { tool_results: receipt } : {}) }, now());
  return { success: true, results };
}

/** handleGetMessages: the latest 200, oldest first, each with the sender's username and its recalled memories. */
function getMessages(db: Db, body: Row) {
  const conversation = of(db, "agent_conversations").find((c) => c.id === body.conversation_id && c.user_id === STAFF);
  if (!conversation) return refuse(403, { success: false, error: "Not authorized for this conversation" });
  const users = new Map(of(db, "custom_users").map((u) => [u.id, u.username]));
  const messages = of(db, "agent_messages")
    .filter((m) => m.conversation_id === body.conversation_id)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .slice(-200)
    .map((m) => ({ ...m, sent_by_username: (m.sent_by && users.get(m.sent_by)) || null, recalled_memories: [] }));
  // conversationAmlReach: no AML tool was called in this conversation.
  return { success: true, messages, aml_reached: false };
}

/** executeGetNotificationSummary, on the record. */
function notificationSummary(db: Db) {
  const t = now();
  const week = t + 7 * 86400000;
  const in90 = t + 90 * 86400000;
  const when = (v: unknown) => (typeof v === "string" ? Date.parse(v) : NaN);
  const overdue = of(db, "client_reminders").filter((r) => r.status === "pending" && when(r.due_date) < t).length;
  const deals = of(db, "client_deals");
  const urgent = deals.filter((d) => d.risk_status === "urgent").length;
  const settlements = deals.filter((d) => when(d.settlement_date) >= t && when(d.settlement_date) <= week).length;
  const alerts = of(db, "call_alert_history").filter((a) => a.is_read === false).length;
  const clawback = deals.filter((d) => when(d.clawback_expiry_date) >= t && when(d.clawback_expiry_date) <= in90).length;
  const total = overdue + urgent + alerts;
  return {
    total_notifications: total,
    overdue_reminders: overdue,
    urgent_deals: urgent,
    upcoming_settlements: settlements,
    unread_call_alerts: alerts,
    clawback_risk_deals: clawback,
    severity: total > 5 ? "high" : total > 0 ? "medium" : "clear",
  };
}

export default {
  "ai-dashboard-agent": (body: Row, db: Db) => {
    tables(db);
    switch (body.action) {
      case "list-conversations": {
        const own = of(db, "agent_conversations")
          .filter((c) => c.user_id === STAFF)
          .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
          .slice(0, 50)
          .map((c) => pickCols(c, "id, title, created_at, updated_at"));
        return { success: true, conversations: own, shared_conversations: [], shared_by_me_conversations: [] };
      }
      case "create-conversation": {
        const at = iso(now());
        const row = { id: uuid("ac"), user_id: STAFF, title: body.title || "New Conversation", created_at: at, updated_at: at };
        db.agent_conversations.push(row);
        return { success: true, conversation: row };
      }
      case "get-messages":
        return getMessages(db, body);
      case "get-notifications":
        return { success: true, ...notificationSummary(db) };
      case "list-skills":
        return { success: true, skills: of(db, "agent_skills").filter((s) => s.is_enabled && (s.user_id === STAFF || s.is_public)) };
      case "chat-stream":
        return chatStream(db, body);
      case "confirm-action":
        return confirmAction(db, body);
      default:
        console.log(`refused: ai-dashboard-agent ${body.action}`);
        return refuse(404, { error: `The harness answers no ai-dashboard-agent ${body.action}` });
    }
  },
  // internal-messaging/index.ts list_threads and unread_count: Alex takes part in no thread.
  "internal-messaging": (body: Row) => {
    const action = String(body.action ?? "list_threads");
    if (action === "list_threads") return { success: true, threads: [], archived_count: 0 };
    if (action === "unread_count") return { success: true, unread: 0 };
    console.log(`refused: internal-messaging ${action}`);
    return refuse(404, { error: `The harness answers no internal-messaging ${action}` });
  },
  // agent-library/index.ts 'status': the library is on, and a person with the agent's view may attach.
  "agent-library": (body: Row) => {
    if (body.op === "status") return { success: true, available: true, limits: LIBRARY_LIMITS, can_attach: true };
    console.log(`refused: agent-library ${body.op}`);
    return refuse(404, { error: `The harness answers no agent-library ${body.op}` });
  },
};
