/**
 * An in-memory stand-in for the Supabase admin client: the query builder
 * calls the long-video service makes (select, insert, update, upsert, delete,
 * filters, order, limit, single rows) over plain tables, with each table's
 * column defaults. Enough to run a long video end to end in a test.
 */

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

const DEFAULTS: Record<string, () => Row> = {
  long_videos: () => ({
    status: "running",
    project_id: null,
    campaign_id: null,
    story: "",
    continuity: "",
    settings: {},
    references_used: [],
    sequence_id: null,
    client_request_id: null,
    error_code: null,
    error_message: null,
    created_by: null,
    completed_at: null,
    characters: [],
    identity_check: false,
    keyframe_model_id: null,
    keyframe_settings: {},
    storyboard_review: false,
    storyboard_approved_at: null,
    voiceover_preparation_id: null,
    voiceover: null,
    start_from: "chain",
    anchor_frame_asset_id: null,
    qc_settings: {},
    cutaway_fills: [],
    estimated_cost_usd: null,
  }),
  long_video_clips: () => ({
    beat: "",
    prompt: "",
    parameters: {},
    inputs: [],
    status: "waiting",
    attempt: 1,
    generation_id: null,
    start_frame_asset_id: null,
    output_asset_id: null,
    output_duration_seconds: null,
    output_fps: null,
    output_width: null,
    output_height: null,
    handoff_status: "none",
    handoff_task_id: null,
    handoff_attempts: 0,
    handoff_time_seconds: null,
    handoff_asset_id: null,
    error_code: null,
    error_message: null,
    claimed_at: null,
    started_at: null,
    completed_at: null,
    end_frame_asset_id: null,
    check_status: "none",
    check_task_id: null,
    check_attempts: 0,
    check_claims: 0,
    check_result: null,
    check_claimed_at: null,
    checked_at: null,
    audio_start_seconds: null,
    audio_end_seconds: null,
    audio_asset_id: null,
    sync_status: "none",
    sync_task_id: null,
    sync_attempts: 0,
    sync_offset_seconds: null,
    sync_result: null,
    synced_at: null,
    held: false,
    start_frame_override_asset_id: null,
    lip_status: "none",
    lip_task_id: null,
    lip_attempts: 0,
    lip_score: null,
    lip_score_at_zero: null,
    lip_offset_frames: null,
    lip_result: null,
    lip_checked_at: null,
  }),
  long_video_clip_takes: () => ({
    generation_id: null,
    output_asset_id: null,
    start_frame_asset_id: null,
    snapshot: {},
    lip_score: null,
    reason: "take",
  }),
  media_tasks: () => ({
    status: "submitting",
    error_code: null,
    error_message: null,
    result_asset_id: null,
    output_payload: null,
    input_payload: {},
  }),
  generations: () => ({
    status: "queued",
    ingest_status: "not_required",
    error_code: null,
    error_message: null,
    client_request_id: null,
  }),
  assets: () => ({
    deleted_at: null,
    duration_seconds: null,
    width: null,
    height: null,
    title: null,
  }),
  sequences: () => ({ is_archived: false }),
};

const UNIQUE: Record<string, string[][]> = {
  long_video_clip_takes: [["clip_id", "attempt"]],
  generations: [["client_request_id"]],
};

/** An `or` filter's conditions: split at the commas that aren't inside an in-list's brackets. */
function orConditions(conditions: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of conditions) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += character;
  }
  if (current) parts.push(current);
  return parts;
}

let ids = 0;
export function fakeId(): string {
  ids += 1;
  return `00000000-0000-4000-8000-${String(ids).padStart(12, "0")}`;
}

export class FakeDb {
  tables = new Map<string, Row[]>();
  rpcs = new Map<string, (args: Row) => unknown>();
  clock = Date.now();

  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  add(table: string, row: Row): Row {
    const now = new Date().toISOString();
    const full = {
      id: fakeId(),
      created_at: now,
      updated_at: now,
      ...(DEFAULTS[table]?.() ?? {}),
      ...row,
    };
    this.rows(table).push(full);
    return full;
  }

  find(table: string, id: unknown): Row | undefined {
    return this.rows(table).find((row) => row["id"] === id);
  }

  from(table: string) {
    return new Query(this, table);
  }

  rpc(name: string, args: Row) {
    const handler = this.rpcs.get(name);
    return Promise.resolve(
      handler
        ? { data: handler(args), error: null }
        : { data: null, error: { message: `no ${name}` } },
    );
  }

  storage = {
    from: () => ({
      remove: async () => ({ error: null }),
      createSignedUrl: async () => ({ data: { signedUrl: "https://example.test/file" } }),
    }),
  };
}

function containsJson(haystack: unknown, needle: unknown): boolean {
  if (Array.isArray(needle))
    return (
      Array.isArray(haystack) &&
      needle.every((item) => haystack.some((entry) => containsJson(entry, item)))
    );
  if (needle && typeof needle === "object")
    return (
      !!haystack &&
      typeof haystack === "object" &&
      !Array.isArray(haystack) &&
      Object.entries(needle).every(([key, value]) => containsJson((haystack as Row)[key], value))
    );
  return haystack === needle;
}

const copy = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

class Query implements PromiseLike<{ data: unknown; error: unknown; count?: number }> {
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private filters: Filter[] = [];
  private patch: Row = {};
  private input: Row[] = [];
  private returning = false;
  private sort: { column: string; ascending: boolean }[] = [];
  private cap: number | null = null;
  private skip = 0;
  private one: "single" | "maybe" | null = null;
  private upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean } = {};

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  select(_columns?: string) {
    if (this.op !== "select") this.returning = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.input = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert";
    this.input = Array.isArray(rows) ? rows : [rows];
    this.upsertOptions = options;
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push(
      (row) =>
        row[column] === value ||
        (row[column] !== null && value !== null && String(row[column]) === String(value)),
    );
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.some((value) => row[column] === value));
    return this;
  }
  is(column: string, value: null) {
    this.filters.push((row) =>
      value === null ? row[column] === null || row[column] === undefined : row[column] === value,
    );
    return this;
  }
  not(column: string, operator: string, value: unknown) {
    if (operator === "is")
      this.filters.push((row) => !(row[column] === null || row[column] === undefined));
    else if (operator === "in") {
      const values = String(value).replace(/[()]/g, "").split(",");
      this.filters.push((row) => !values.includes(String(row[column])));
    }
    return this;
  }
  /** Any one of PostgREST's conditions, as `or` takes them: "status.in.(a,b),code.eq.X" (eq, neq, in and is). */
  or(conditions: string) {
    const tests = orConditions(conditions).map((condition): Filter => {
      const [column = "", operator, ...rest] = condition.split(".");
      const value = rest.join(".");
      if (operator === "in") {
        const values = value.replace(/^\(|\)$/g, "").split(",");
        return (row) => values.includes(String(row[column]));
      }
      if (operator === "is")
        return (row) =>
          value === "null"
            ? row[column] === null || row[column] === undefined
            : String(row[column]) === value;
      if (operator === "neq") return (row) => String(row[column]) !== value;
      return (row) => String(row[column]) === value;
    });
    this.filters.push((row) => tests.some((test) => test(row)));
    return this;
  }
  /** JSON containment, as Postgres's @> reads it. */
  contains(column: string, value: unknown) {
    this.filters.push((row) => containsJson(row[column], value));
    return this;
  }
  gt(column: string, value: number) {
    this.filters.push((row) => Number(row[column]) > value);
    return this;
  }
  gte(column: string, value: number | string) {
    // A date (an ISO string) compares as written, as lt's does; a number as a number.
    this.filters.push((row) =>
      typeof value === "string" ? (row[column] as string) >= value : Number(row[column]) >= value,
    );
    return this;
  }
  /** PostgREST's ilike: % for any run of characters, case ignored. */
  ilike(column: string, pattern: string) {
    const regex = new RegExp(
      `^${pattern
        .split("%")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*")}$`,
      "i",
    );
    this.filters.push((row) => typeof row[column] === "string" && regex.test(row[column]));
    return this;
  }
  /** Rows from to to (inclusive), as PostgREST's range takes them. */
  range(from: number, to: number) {
    this.skip = from;
    this.cap = to - from + 1;
    return this;
  }
  lt(column: string, value: number | string) {
    this.filters.push((row) => (row[column] as number | string) < value);
    return this;
  }
  order(column: string, options: { ascending?: boolean } = {}) {
    this.sort.push({ column, ascending: options.ascending !== false });
    return this;
  }
  limit(count: number) {
    this.cap = count;
    return this;
  }
  maybeSingle() {
    this.one = "maybe";
    return this;
  }
  single() {
    this.one = "single";
    return this;
  }

  private matching(): Row[] {
    return this.db.rows(this.table).filter((row) => this.filters.every((filter) => filter(row)));
  }

  private shape(rows: Row[]) {
    let out = [...rows];
    for (const { column, ascending } of [...this.sort].reverse())
      out.sort((a, b) => {
        const x = a[column] as number | string;
        const y = b[column] as number | string;
        return (x < y ? -1 : x > y ? 1 : 0) * (ascending ? 1 : -1);
      });
    if (this.skip || this.cap !== null)
      out = out.slice(this.skip, this.cap === null ? undefined : this.skip + this.cap);
    out = out.map(copy);
    if (this.one) {
      if (out.length > 1 && this.one === "maybe")
        return { data: null, error: { message: "more than one row" } };
      if (!out.length && this.one === "single")
        return { data: null, error: { message: "no rows" } };
      return { data: out[0] ?? null, error: null };
    }
    return { data: out, error: null };
  }

  private run() {
    const now = new Date().toISOString();
    switch (this.op) {
      case "select":
        return this.shape(this.matching());
      case "insert": {
        for (const row of this.input)
          for (const columns of UNIQUE[this.table] ?? [])
            if (
              columns.every((column) => row[column] !== null && row[column] !== undefined) &&
              this.db
                .rows(this.table)
                .some((other) => columns.every((column) => other[column] === row[column]))
            )
              return { data: null, error: { code: "23505", message: "duplicate key" } };
        const added = this.input.map((row) => this.db.add(this.table, copy(row)));
        return this.returning || this.one ? this.shapeRows(added) : { data: null, error: null };
      }
      case "upsert": {
        const keys = (this.upsertOptions.onConflict ?? "id").split(",");
        const out: Row[] = [];
        for (const row of this.input) {
          const existing = this.db
            .rows(this.table)
            .find((other) => keys.every((key) => other[key] === row[key]));
          if (existing) {
            if (!this.upsertOptions.ignoreDuplicates)
              Object.assign(existing, copy(row), { updated_at: now });
            out.push(existing);
          } else out.push(this.db.add(this.table, copy(row)));
        }
        return this.returning ? this.shapeRows(out) : { data: null, error: null };
      }
      case "update": {
        const rows = this.matching();
        for (const row of rows) Object.assign(row, copy(this.patch), { updated_at: now });
        return this.returning ? this.shape(rows) : { data: null, error: null };
      }
      case "delete": {
        const rows = this.matching();
        const all = this.db.rows(this.table);
        for (const row of rows) all.splice(all.indexOf(row), 1);
        return this.returning ? this.shape(rows) : { data: null, error: null };
      }
    }
  }

  private shapeRows(rows: Row[]) {
    const out = rows.map(copy);
    if (this.one) return { data: out[0] ?? null, error: null };
    return { data: out, error: null };
  }

  then<A, B>(
    resolve?: ((value: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null,
    reject?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    try {
      return Promise.resolve(this.run()).then(resolve, reject);
    } catch (error) {
      return Promise.reject(error).then(resolve, reject);
    }
  }
}
