/**
 * The studio API's operations for work in progress (see ../work): a piece of
 * work that runs over many sessions, kept in the studio as it goes, so that
 * whoever picks it up next (another Claude Code session, the Supercomputer,
 * a person) carries on from where the last one stopped instead of starting
 * again. start_work makes one (in a project of its own unless one is named);
 * claim_work takes it up and answers with everything about it; save_work
 * keeps progress (an account of what was done, what comes next, decisions,
 * the plan, the work's record, files and links) in one transaction;
 * upload_work_files sends files' parts straight to storage; get_work_files
 * brings them back. Any operation that makes something takes a workId, and
 * what it makes is attached to the work (see runForWork in ./tools.server).
 *
 * As the token's owner, any active member: work is the team's. They join
 * STUDIO_TOOLS in ./tools.server. See docs/work.md.
 */
import { z } from "zod/v4";
import {
  LINK_KINDS,
  STEP_STATUSES,
  WORK_LIMITS,
  WORK_STATUSES,
  holdOf,
  resumeBrief,
  rootsOf,
  stepsOf,
  textList,
  decisionsOf,
  codeOf,
  type JournalRow,
  type WorkView,
} from "../work/model";
import type { WorkActor } from "../work/service.server";
import type { ApiScope } from "./tokens";
import type { ApiCaller } from "./tokens.server";
import type { StudioTool } from "./tools.server";

/** The same shape as tools.server's own `tool`, for operations kept beside it. */
function tool<S extends z.ZodType>(definition: {
  name: string;
  title: string;
  description: string;
  scope: ApiScope;
  readOnly?: boolean;
  input: S;
  run: (args: z.output<S>, caller: ApiCaller) => Promise<unknown>;
}): StudioTool {
  return {
    ...definition,
    readOnly: definition.readOnly ?? definition.scope === "read",
    run: (args, caller) => definition.run(definition.input.parse(args ?? {}), caller),
  };
}

const id = () => z.string().uuid();
const sha256 = () =>
  z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .describe("SHA-256, 64 lowercase hex digits");
const requestId = () =>
  z
    .string()
    .min(8)
    .max(64)
    .describe(
      "Your own unique id for this request (8-64 characters). Sending the same id again returns the first result instead of doing it twice.",
    );
const workPath = () =>
  z
    .string()
    .min(3)
    .max(500)
    .describe(
      'Where the file sits in the work: a root\'s name, then its path under it, with "/" (records/spec.json, renders/12.1/film.json). Never absolute, never "..".',
    );

/** The session doing it: what holds the work while it works on it, named in the journal. */
const sessionInput = () =>
  z
    .object({
      id: z
        .string()
        .min(1)
        .max(200)
        .regex(/^[\x21-\x7e]+$/, "printable, no spaces")
        .describe(
          "Your session's own id, the same for as long as it runs (Claude Code: claude-code:<its session id>). It holds the work while you work on it.",
        ),
      label: z
        .string()
        .max(300)
        .optional()
        .describe('What to call the session in the journal ("Claude Code session 0467c194")'),
      kind: z.enum(["claude_code", "script", "person"]).default("script"),
    })
    .describe("The session doing this");

type SessionInput = z.output<ReturnType<typeof sessionInput>>;

/** Who a call is from: the token's owner, as the session it names (the Supercomputer as itself). */
export function actorFor(caller: ApiCaller, session?: SessionInput | null): WorkActor {
  if (caller.tokenId === "supercomputer")
    return {
      userId: caller.userId,
      kind: "supercomputer",
      session: session?.id ?? null,
      label: session?.label ?? "Supercomputer",
    };
  return {
    userId: caller.userId,
    kind: session?.kind ?? "script",
    session: session?.id ?? null,
    label: session?.label ?? (session?.id ? null : "Studio API"),
  };
}

async function service() {
  return import("../work/service.server");
}

const stepChange = () =>
  z.object({
    key: z.string().min(1).max(80).describe("The step's own short key (plates, animatic, 12.1)"),
    title: z.string().max(300).optional(),
    status: z.enum(STEP_STATUSES).optional(),
    note: z.string().max(2000).optional(),
    remove: z.boolean().optional().describe("Take the step out of the plan"),
  });

/** The plan's changes as the service takes them (a field left out is left as it is). */
function stepChangesOf(steps: z.output<ReturnType<typeof stepChange>>[]) {
  return steps.map((step) => ({
    key: step.key,
    ...(step.title !== undefined ? { title: step.title } : {}),
    ...(step.status !== undefined ? { status: step.status } : {}),
    ...(step.note !== undefined ? { note: step.note } : {}),
    ...(step.remove !== undefined ? { remove: step.remove } : {}),
  }));
}

const linkInput = () =>
  z.object({
    kind: z.enum(LINK_KINDS),
    id: id(),
    role: z
      .string()
      .max(200)
      .optional()
      .describe('What it is to the work ("the delivered master", "take 3 of P")'),
    note: z.string().max(2000).optional(),
  });

/** An entry as the API answers it. */
function entryOut(entry: JournalRow, people: Record<string, string>) {
  return {
    n: entry.n,
    id: entry.id,
    kind: entry.kind,
    at: entry.created_at,
    by: {
      kind: entry.actor_kind,
      session: entry.actor_session,
      label: entry.actor_label,
      member: entry.created_by ? (people[entry.created_by] ?? null) : null,
    },
    summary: entry.summary,
    nextSteps: textList(entry.next_steps),
    decisions: decisionsOf(entry.decisions),
    questions: textList(entry.questions),
    steps: Array.isArray(entry.step_changes) ? entry.step_changes : [],
    stateVersion: entry.state_version,
    ...(entry.state_patch ? { statePatch: entry.state_patch } : {}),
    files: Array.isArray(entry.files) ? entry.files : [],
    links: Array.isArray(entry.links) ? entry.links : [],
    changes: entry.changes ?? {},
    code: codeOf(entry.code),
  };
}

/** A work as the API answers it: everything about it, and its brief. */
function workOut(view: WorkView, options: { includeState: boolean; brief: boolean }) {
  const { work } = view;
  return {
    id: work.id,
    title: work.title,
    goal: work.goal,
    status: work.status,
    project: view.project,
    campaignId: work.campaign_id,
    brandKitId: work.brand_kit_id,
    parentWorkId: work.parent_work_id,
    hold: holdOf(work),
    steps: stepsOf(work.steps),
    nextSteps: textList(work.next_steps),
    questions: textList(work.questions),
    lastSummary: work.last_summary,
    stateVersion: work.state_version,
    ...(options.includeState ? { state: work.state } : {}),
    roots: rootsOf(work.roots),
    code: codeOf(work.code),
    entries: work.entries,
    lastEntryAt: work.last_entry_at,
    createdAt: work.created_at,
    finishedAt: work.finished_at,
    journal: view.journal.map((entry) => entryOut(entry, view.people)),
    files: view.files.slice(0, 500).map((file) => ({
      path: file.path,
      version: file.version,
      sha256: file.sha256,
      size: file.size,
      mimeType: file.mime_type,
      note: file.note,
      savedAt: file.created_at,
    })),
    fileCount: view.files.length,
    links: view.links.map((link) => ({
      kind: link.kind,
      id: link.object_id,
      title: link.title,
      status: link.status,
      role: link.role,
      note: link.note,
    })),
    ...(options.brief ? { brief: resumeBrief(view) } : {}),
  };
}

const createProject = tool({
  name: "create_project",
  title: "Make a project",
  description:
    "Makes a project, the studio's folder for a piece of work's generations, files, edits and reviews (pass its id as projectId, so what you make isn't left unassigned). The same name from you within ten minutes returns that project instead of a second.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
  }),
  run: async (args, caller) => {
    const work = await service();
    await work.activeMember(caller.userId);
    return work.createProject({
      userId: caller.userId,
      name: args.name,
      description: args.description ?? null,
    });
  },
});

const startWork = tool({
  name: "start_work",
  title: "Start a work",
  description:
    "Starts a work: a piece of work that may run over many sessions (a reel, a campaign, a brand's launch), kept in the studio as it goes so whoever picks it up next carries on from where the last one stopped. Give its title, its goal (what finished looks like), its plan (steps) and its record (state, any JSON it keeps), and the roots its files sit under on your machine. It goes in a project of its own, named after it, unless you name one (projectId, or null for none). With session, you hold it from the start. Then: save_work as you go (after every meaningful step), and pass workId to the operations that make things. The same clientRequestId returns the first work instead of a second.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    title: z.string().min(1).max(200),
    goal: z
      .string()
      .max(WORK_LIMITS.goalChars)
      .optional()
      .describe("What it is for and what finished looks like"),
    projectId: id()
      .nullable()
      .optional()
      .describe("Its project; left out, one is made named after it; null, none"),
    projectName: z
      .string()
      .max(200)
      .optional()
      .describe("The name of the project made for it (default: its title)"),
    campaignId: id().nullable().optional(),
    brandKitId: id().nullable().optional().describe("The brand it is made in"),
    parentWorkId: id().nullable().optional().describe("The larger work it is a part of"),
    steps: z
      .array(stepChange())
      .max(WORK_LIMITS.stepChanges)
      .optional()
      .describe("Its plan, in order"),
    state: z.record(z.string(), z.unknown()).optional().describe("Its record to start with"),
    roots: z
      .record(z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,39}$/i), z.string().max(500))
      .optional()
      .describe(
        'Where its files sit, by name: {"records": "docs/brands/aurixa-reel-2", "renders": "renders"}',
      ),
    nextSteps: z
      .array(z.string().max(WORK_LIMITS.listItemChars))
      .max(WORK_LIMITS.listItems)
      .optional(),
    session: sessionInput().optional(),
    clientRequestId: requestId(),
  }),
  run: async (args, caller) => {
    const work = await service();
    await work.activeMember(caller.userId);
    const actor = actorFor(caller, args.session ?? null);
    const started = await work.createWork({
      actor: { ...actor, userId: caller.userId },
      title: args.title,
      ...(args.goal !== undefined ? { goal: args.goal } : {}),
      ...(args.projectId !== undefined ? { projectId: args.projectId } : {}),
      ...(args.projectName !== undefined ? { projectName: args.projectName } : {}),
      campaignId: args.campaignId ?? null,
      brandKitId: args.brandKitId ?? null,
      parentWorkId: args.parentWorkId ?? null,
      steps: stepChangesOf(args.steps ?? []),
      state: args.state ?? {},
      roots: args.roots ?? {},
      nextSteps: args.nextSteps ?? [],
      clientRequestId: args.clientRequestId,
      hold: !!actor.session,
    });
    return started;
  },
});

const listWorks = tool({
  name: "list_works",
  title: "List works",
  description:
    "Works in progress (latest first): each one's status, who is working on it now (hold: held, lapsed when its holder stopped renewing it, or free), its plan's progress, what was last done and what comes next. Finished ones (done, abandoned) only when asked for.",
  scope: "read",
  input: z.object({
    status: z.array(z.enum(WORK_STATUSES)).max(5).optional(),
    projectId: id().optional(),
    search: z.string().max(80).optional().describe("Words in its title"),
    includeFinished: z.boolean().default(false),
    limit: z.number().int().min(1).max(100).default(30),
  }),
  run: async (args) => {
    const work = await service();
    return work.listWorks({
      ...(args.status ? { statuses: args.status } : {}),
      projectId: args.projectId ?? null,
      search: args.search ?? null,
      includeFinished: args.includeFinished,
      limit: args.limit,
    });
  },
});

const getWork = tool({
  name: "get_work",
  title: "Get a work",
  description:
    "Everything about a work: its goal, status and who holds it, its plan, next steps and the questions waiting on a person, its record (state, at stateVersion: send that back as baseVersion when you change it), its latest journal entries (before: an entry's n, for earlier ones), its files as they stand, what it made in the studio, the code it last ran on, and its brief: all of that in Markdown, written for whoever picks it up.",
  scope: "read",
  input: z.object({
    workId: id(),
    entries: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(20)
      .describe("How many journal entries, latest first"),
    before: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Only entries before this n (the next page back)"),
    includeState: z.boolean().default(true),
    brief: z.boolean().default(true),
  }),
  run: async (args) => {
    const work = await service();
    const view = await work.loadWorkView(args.workId, {
      entries: args.entries,
      before: args.before ?? null,
    });
    return workOut(view, { includeState: args.includeState, brief: args.brief });
  },
});

const claimWork = tool({
  name: "claim_work",
  title: "Take up a work",
  description:
    "Takes up a work for your session, so nobody else works on it at the same time: you hold it for seconds (15 minutes unless said), and every save_work with your session renews the hold. While another session holds it you are told who and when they were last heard from; takeOver takes it from them (the journal says so: only when they have stopped). A hold that isn't renewed lapses, so a session that ends without a word frees its work for the next; renew is a heartbeat that renews your own hold and never takes one up. A paused, blocked or finished work taken up is active again. Answers with the work's brief.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    workId: id(),
    session: sessionInput(),
    seconds: z
      .number()
      .int()
      .min(WORK_LIMITS.holdMinSeconds)
      .max(WORK_LIMITS.holdMaxSeconds)
      .optional(),
    takeOver: z.boolean().default(false),
    renew: z
      .boolean()
      .default(false)
      .describe(
        "Only renew your session's own hold (a heartbeat while it works): never take one up, so a work another took, or that was let go, stays theirs",
      ),
    brief: z.boolean().default(true),
  }),
  run: async (args, caller) => {
    const work = await service();
    await work.activeMember(caller.userId);
    const actor = actorFor(caller, args.session);
    const claimed = await work.claimWork(args.workId, actor, {
      ...(args.seconds !== undefined ? { seconds: args.seconds } : {}),
      takeOver: args.takeOver && !args.renew,
      renewOnly: args.renew,
    });
    if (!args.brief) return claimed;
    const { brief } = await work.workBrief(args.workId);
    return { ...claimed, brief };
  },
});

const releaseWork = tool({
  name: "release_work",
  title: "Let go of a work",
  description:
    "Lets go of a work your session holds, so the next session can take it up at once (save_work first: this keeps nothing but its words). Only its holder can.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    workId: id(),
    session: sessionInput(),
    summary: z
      .string()
      .max(2000)
      .optional()
      .describe('What to say in the journal ("Stopping here: the animatic is next")'),
  }),
  run: async (args, caller) => {
    const work = await service();
    await work.activeMember(caller.userId);
    return work.releaseWork(args.workId, actorFor(caller, args.session), args.summary ?? null);
  },
});

const fileInput = () =>
  z.union([
    z.object({
      path: workPath(),
      sha256: sha256().describe("The whole file's SHA-256"),
      size: z.number().int().min(0).describe("Its size in bytes"),
      chunks: z
        .array(sha256())
        .max(WORK_LIMITS.chunksPerFile)
        .describe(
          `Its parts' SHA-256s, in order: the file cut every ${WORK_LIMITS.chunkBytes} bytes (32 MiB), the last part shorter ([] for an empty file). Each must be stored first (upload_work_files).`,
        ),
      mimeType: z.string().max(200).optional(),
      modifiedAt: z
        .string()
        .max(40)
        .optional()
        .describe("When it last changed on your machine (ISO 8601)"),
      executable: z.boolean().optional(),
      note: z.string().max(500).optional().describe('What it is ("the delivered master")'),
    }),
    z.object({ path: workPath(), deleted: z.literal(true) }),
  ]);

const saveWork = tool({
  name: "save_work",
  title: "Save a work's progress",
  description:
    "Keeps a work's progress, so it can be picked up from here by anyone: an account of what was done (summary), what comes next (nextSteps: replaces the work's), what was decided and why, the questions waiting on a person (questions: replaces them), changes to its plan (steps, by key: status todo, doing, done, blocked or skipped), a change to its record (state: a JSON merge patch; with baseVersion, refused with CONFLICT if someone saved since), the files it keeps (each part already stored with upload_work_files; an unchanged file isn't kept again, a changed one is a new version, every version kept), the things in the studio it attaches (links), and changes to the work itself (title, goal, status, roots). All of it is kept together or not at all. Save after every meaningful step, and before stopping: a session can end at any moment, and what wasn't saved is lost. With session, your hold is renewed. The same clientRequestId returns the first save.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    workId: id(),
    session: sessionInput().optional(),
    kind: z
      .enum(["save", "auto", "turn", "interrupted", "note"])
      .default("save")
      .describe(
        "save: your account; auto: kept by itself (files); turn: a turn ended; interrupted: one cut short; note: a remark",
      ),
    summary: z
      .string()
      .max(WORK_LIMITS.summaryChars)
      .optional()
      .describe(
        "What was done since the last save: what is finished, what changed, what you found",
      ),
    nextSteps: z
      .array(z.string().max(WORK_LIMITS.listItemChars))
      .max(WORK_LIMITS.listItems)
      .optional(),
    decisions: z
      .array(z.object({ what: z.string().min(1).max(1000), why: z.string().max(2000).optional() }))
      .max(WORK_LIMITS.listItems)
      .optional(),
    questions: z
      .array(z.string().max(WORK_LIMITS.listItemChars))
      .max(WORK_LIMITS.listItems)
      .optional(),
    steps: z.array(stepChange()).max(WORK_LIMITS.stepChanges).optional(),
    state: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("A change to the work's record: a JSON merge patch (RFC 7386); null removes a key"),
    baseVersion: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("The record's version your change was made from (get_work's stateVersion)"),
    files: z.array(fileInput()).max(WORK_LIMITS.filesPerSave).optional(),
    links: z.array(linkInput()).max(WORK_LIMITS.linksPerSave).optional(),
    title: z.string().min(1).max(200).optional(),
    goal: z.string().max(WORK_LIMITS.goalChars).optional(),
    status: z
      .enum(WORK_STATUSES)
      .optional()
      .describe("done or abandoned finishes it (and lets it go)"),
    roots: z
      .record(z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,39}$/i), z.string().max(500).nullable())
      .optional()
      .describe("Roots to add or change (null removes one)"),
    projectId: id().nullable().optional(),
    brandKitId: id().nullable().optional(),
    code: z
      .object({
        repository: z.string().max(300).optional(),
        branch: z.string().max(200).optional(),
        commit: z.string().max(64).optional(),
        dirty: z.boolean().optional(),
        upstream: z.string().max(300).optional().describe("The remote branch it follows"),
        unpushed: z
          .number()
          .int()
          .min(0)
          .max(1_000_000)
          .optional()
          .describe("How many of its commits no remote holds yet"),
      })
      .optional()
      .describe(
        "The code the work runs on, as it stands (its repository, branch, commit, whether it has changes not committed, and how many commits no remote holds)",
      ),
    holdSeconds: z
      .number()
      .int()
      .min(WORK_LIMITS.holdMinSeconds)
      .max(WORK_LIMITS.holdMaxSeconds)
      .optional(),
    clientRequestId: requestId(),
  }),
  run: async (args, caller) => {
    const work = await service();
    await work.activeMember(caller.userId);
    const actor = actorFor(caller, args.session ?? null);
    const changes = {
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.goal !== undefined ? { goal: args.goal } : {}),
      ...(args.status !== undefined ? { status: args.status } : {}),
      ...(args.roots !== undefined ? { roots: args.roots } : {}),
      ...(args.projectId !== undefined ? { projectId: args.projectId } : {}),
      ...(args.brandKitId !== undefined ? { brandKitId: args.brandKitId } : {}),
    };
    return work.saveWork(args.workId, actor, {
      kind: args.kind,
      ...(args.summary !== undefined ? { summary: args.summary } : {}),
      ...(args.nextSteps !== undefined ? { nextSteps: args.nextSteps } : {}),
      ...(args.decisions !== undefined
        ? { decisions: args.decisions.map((item) => ({ what: item.what, why: item.why ?? "" })) }
        : {}),
      ...(args.questions !== undefined ? { questions: args.questions } : {}),
      ...(args.steps !== undefined ? { stepChanges: stepChangesOf(args.steps) } : {}),
      ...(args.state !== undefined ? { statePatch: args.state } : {}),
      ...(args.baseVersion !== undefined ? { baseVersion: args.baseVersion } : {}),
      ...(args.files !== undefined
        ? {
            files: args.files.map((file) =>
              "deleted" in file
                ? { path: file.path, deleted: true }
                : {
                    path: file.path,
                    sha256: file.sha256,
                    size: file.size,
                    chunks: file.chunks,
                    mimeType: file.mimeType ?? null,
                    modifiedAt: file.modifiedAt ?? null,
                    executable: file.executable ?? false,
                    note: file.note ?? null,
                  },
            ),
          }
        : {}),
      ...(args.links !== undefined
        ? {
            links: args.links.map((link) => ({
              kind: link.kind,
              id: link.id,
              role: link.role ?? null,
              note: link.note ?? null,
            })),
          }
        : {}),
      ...(Object.keys(changes).length ? { changes } : {}),
      ...(args.code !== undefined
        ? {
            code: {
              ...(args.code.repository !== undefined ? { repository: args.code.repository } : {}),
              ...(args.code.branch !== undefined ? { branch: args.code.branch } : {}),
              ...(args.code.commit !== undefined ? { commit: args.code.commit } : {}),
              ...(args.code.dirty !== undefined ? { dirty: args.code.dirty } : {}),
              ...(args.code.upstream !== undefined ? { upstream: args.code.upstream } : {}),
              ...(args.code.unpushed !== undefined ? { unpushed: args.code.unpushed } : {}),
            },
          }
        : {}),
      clientRequestId: args.clientRequestId,
      ...(args.holdSeconds !== undefined ? { holdSeconds: args.holdSeconds } : {}),
    });
  },
});

const uploadWorkFiles = tool({
  name: "upload_work_files",
  title: "Upload a work's files",
  description: `Where to send files' bytes for a work, part by part: cut each file every ${WORK_LIMITS.chunkBytes} bytes (32 MiB) and give each part's SHA-256 and size (and its MD5, to have storage check it). A part already stored is said to be (each is stored once a work); for the rest you get an address to PUT its bytes to, straight to storage, valid for two hours. Then name the files and their parts in save_work, which checks every part is there. Up to ${WORK_LIMITS.blobsPerUpload} parts a call. scripts/studio-work/work.py does all of it for a folder.`,
  scope: "edit",
  readOnly: false,
  input: z.object({
    workId: id(),
    parts: z
      .array(
        z.object({
          sha256: sha256(),
          size: z.number().int().min(0).max(WORK_LIMITS.blobMaxBytes),
          md5: z
            .string()
            .regex(/^[0-9a-f]{32}$/)
            .optional(),
        }),
      )
      .min(1)
      .max(WORK_LIMITS.blobsPerUpload),
  }),
  run: async (args, caller) => {
    const work = await service();
    await work.activeMember(caller.userId);
    return work.offerUploads(
      args.workId,
      args.parts.map((part) => ({ sha256: part.sha256, size: part.size, md5: part.md5 ?? null })),
    );
  },
});

const getWorkFiles = tool({
  name: "get_work_files",
  title: "Get a work's files",
  description:
    "A work's files as they stand (or one path's chosen version), each with its SHA-256, size and, unless withUrls is false, its parts in order with download links valid for an hour: fetch them, join them, and check the file's SHA-256. In order of path, up to limit at a time (after: the last path of the page before; more says whether there are others).",
  scope: "read",
  input: z.object({
    workId: id(),
    paths: z.array(workPath()).max(1000).optional().describe("Only these"),
    version: z.number().int().min(1).optional().describe("This version of the one path given"),
    withUrls: z.boolean().default(true),
    after: z.string().max(500).optional(),
    limit: z.number().int().min(1).max(1000).default(200),
  }),
  run: async (args) => {
    const work = await service();
    return work.workFiles(args.workId, {
      ...(args.paths ? { paths: args.paths } : {}),
      ...(args.version !== undefined ? { version: args.version } : {}),
      withUrls: args.withUrls,
      after: args.after ?? null,
      limit: args.limit,
    });
  },
});

const getWorkFileHistory = tool({
  name: "get_work_file_history",
  title: "Get a file's versions",
  description:
    "Every version of one of a work's files, latest first: its SHA-256, size, when it was kept and the entry that kept it (get_work_files with version brings one back).",
  scope: "read",
  input: z.object({ workId: id(), path: workPath() }),
  run: async (args) => {
    const work = await service();
    return work.fileHistory(args.workId, args.path);
  },
});

const attachToWork = tool({
  name: "attach_to_work",
  title: "Attach things to a work",
  description:
    "Attaches things in the studio to a work (generations, library files, edits, renders, long videos, review gates, storyboards, briefs, characters, brand kits, motion graphics, conversations, other works), each with what it is to the work (role). With adopt, library files and generations in no project are put in the work's: how what an earlier session made without a project is found with its work again. Attached again, a thing keeps its role unless given another.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    workId: id(),
    links: z.array(linkInput()).min(1).max(WORK_LIMITS.linksPerSave),
    adopt: z.boolean().default(false),
    summary: z.string().max(2000).optional(),
    session: sessionInput().optional(),
    clientRequestId: requestId().optional(),
  }),
  run: async (args, caller) => {
    const work = await service();
    await work.activeMember(caller.userId);
    return work.attachToWork(
      args.workId,
      actorFor(caller, args.session ?? null),
      args.links.map((link) => ({
        kind: link.kind,
        id: link.id,
        role: link.role ?? null,
        note: link.note ?? null,
      })),
      {
        adopt: args.adopt,
        ...(args.summary ? { summary: args.summary } : {}),
        clientRequestId: args.clientRequestId ?? null,
      },
    );
  },
});

/** The work operations, in the order they are listed. */
export const WORK_TOOLS: StudioTool[] = [
  createProject,
  startWork,
  listWorks,
  getWork,
  claimWork,
  releaseWork,
  saveWork,
  uploadWorkFiles,
  getWorkFiles,
  getWorkFileHistory,
  attachToWork,
];

/** The names of the work operations (they take workId as their own, not to attach to it). */
export const WORK_TOOL_NAMES = new Set(WORK_TOOLS.map((entry) => entry.name));
