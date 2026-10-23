-- ============ CREATIVE STUDIO: WORK THAT OUTLIVES A SESSION (additive, re-runnable) ============
-- Reel 1 was made over many sessions of an agent working outside the studio,
-- and most of what it did lived only on the machine it ran on: the files it
-- made (frames, lossless references, records, the master), what it decided
-- and why, what was done and what came next. When a session ended, that went
-- with it, and the next one had to rebuild it from what had reached git.
--
-- A work is a piece of work that runs over many sessions, by Claude Code
-- through the studio's API, by the Supercomputer, or by a person, each picking
-- up where the last stopped. It keeps, as it goes:
--   its goal, its plan (steps, each to do, doing, done, blocked or skipped)
--   and its own record (any JSON it keeps, versioned);
--   a journal: every save, with what was done, what comes next, what was
--   decided and why, the questions for a person, the code it ran on and who
--   wrote it. Nothing in it is changed or removed;
--   its files, by path and version: every version kept, its bytes stored once
--   by their SHA-256, in parts of at most 50 MB, in the private work-files
--   bucket (uploaded straight to storage, never through the app);
--   what it made or used in the studio: generations, library files, edits,
--   renders, long videos, review gates, conversations;
--   who is working on it now: a hold that its holder renews as it works and
--   that lapses when they stop, so a session that ended without a word frees
--   it for the next, and two sessions don't do the same work at once.
--
-- A save is one transaction (work_save): its entry, its change to the record
-- and the plan, its files and its links are kept together or not at all, and
-- a save sent twice with the same request id is kept once.
--
-- Members read every work; only the server writes. The app works before this
-- is applied: the studio says its work needs this update.

CREATE TABLE IF NOT EXISTS public.works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  -- What it is for and what finished looks like.
  goal text NOT NULL DEFAULT '' CHECK (char_length(goal) <= 20000),
  -- active: being worked on, or waiting for its next session; blocked: waiting on a person or
  -- something outside it; paused: set aside; done; abandoned.
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'blocked', 'paused', 'done', 'abandoned')),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  brand_kit_id uuid REFERENCES public.brand_kits(id) ON DELETE SET NULL,
  -- A work split off a larger one.
  parent_work_id uuid REFERENCES public.works(id) ON DELETE SET NULL,
  -- Its plan, in order: [{key, title, status, note, updated_at}].
  steps jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) <= 300),
  -- Its own record (the shots, the takes chosen, the settings: whatever it keeps), and how many
  -- times it has changed.
  state jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(state) = 'object' AND octet_length(state::text) <= 1048576),
  state_version integer NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  -- Where its files sit on a machine, by name: {"records": "docs/brands/aurixa-reel-1"}. A
  -- file's path starts with one of these names.
  roots jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(roots) = 'object'),
  -- The code it last ran on: {repository, branch, commit, dirty}.
  code jsonb CHECK (code IS NULL OR jsonb_typeof(code) = 'object'),
  -- Who is working on it now: a session's id, what to call it and what kind it is, since when,
  -- when it was last heard from, and when its hold lapses unless renewed.
  holder text CHECK (holder IS NULL OR char_length(holder) BETWEEN 1 AND 200),
  holder_label text CHECK (holder_label IS NULL OR char_length(holder_label) <= 300),
  holder_kind text
    CHECK (holder_kind IS NULL OR holder_kind IN ('claude_code', 'supercomputer', 'person', 'script')),
  held_since timestamptz,
  heard_at timestamptz,
  lease_expires_at timestamptz,
  CHECK ((holder IS NULL) = (lease_expires_at IS NULL)),
  -- What its journal last said happened and comes next, and the questions it left a person (so
  -- a list shows them without reading the journal), and how many entries it has.
  last_summary text NOT NULL DEFAULT '' CHECK (char_length(last_summary) <= 20000),
  next_steps jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(next_steps) = 'array'),
  questions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(questions) = 'array'),
  entries integer NOT NULL DEFAULT 0 CHECK (entries >= 0),
  last_entry_at timestamptz,
  client_request_id text
    CHECK (client_request_id IS NULL OR char_length(client_request_id) BETWEEN 8 AND 64),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS works_request_idx
  ON public.works (created_by, client_request_id) WHERE client_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS works_recent_idx
  ON public.works (last_entry_at DESC NULLS LAST, created_at DESC);
CREATE INDEX IF NOT EXISTS works_project_idx ON public.works (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS works_parent_idx
  ON public.works (parent_work_id) WHERE parent_work_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.work_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The order entries were kept in, across every work.
  n bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  work_id uuid NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  -- start; save: a session's own account of its progress; auto: kept by itself while a session
  -- works (its files); turn: a session's turn ended, in its last words; interrupted: a turn ended
  -- early (a usage limit, an error, a person stopping it); note: a person's; claim, takeover and
  -- release: its holder changed; status: its status changed; link: things attached.
  kind text NOT NULL CHECK (kind IN (
    'start', 'save', 'auto', 'turn', 'interrupted', 'note', 'claim', 'takeover', 'release', 'status', 'link'
  )),
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 20000),
  next_steps jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(next_steps) = 'array'),
  -- [{what, why}]
  decisions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(decisions) = 'array'),
  questions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(questions) = 'array'),
  -- The changes it made to the plan ([{key, title, status, note, remove}]) and to the record (a
  -- JSON merge patch), and the record's version after it (null when the record didn't change).
  step_changes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(step_changes) = 'array'),
  state_patch jsonb CHECK (state_patch IS NULL OR jsonb_typeof(state_patch) = 'object'),
  state_version integer,
  -- The files it kept ([{path, version, sha256, size} or {path, version, deleted}]) and what it
  -- attached ([{kind, id, role}]).
  files jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(files) = 'array'),
  links jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(links) = 'array'),
  -- Anything else it changed about the work (its title, goal, status, roots).
  changes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(changes) = 'object'),
  code jsonb CHECK (code IS NULL OR jsonb_typeof(code) = 'object'),
  -- Who wrote it: what kind of session, its id and its name; and the member it acts for.
  actor_kind text NOT NULL
    CHECK (actor_kind IN ('claude_code', 'supercomputer', 'person', 'script', 'studio')),
  actor_session text CHECK (actor_session IS NULL OR char_length(actor_session) <= 200),
  actor_label text CHECK (actor_label IS NULL OR char_length(actor_label) <= 300),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  client_request_id text
    CHECK (client_request_id IS NULL OR char_length(client_request_id) BETWEEN 8 AND 64),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS work_journal_request_idx
  ON public.work_journal (work_id, client_request_id) WHERE client_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS work_journal_work_idx ON public.work_journal (work_id, n DESC);

-- A file's bytes, stored once a work by their SHA-256, in parts of at most 50 MB.
CREATE TABLE IF NOT EXISTS public.work_blobs (
  work_id uuid NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size bigint NOT NULL CHECK (size BETWEEN 0 AND 52428800),
  md5 text CHECK (md5 IS NULL OR md5 ~ '^[0-9a-f]{32}$'),
  -- Its object in the work-files bucket.
  storage_path text NOT NULL,
  -- pending: an upload was offered; stored: its object was found, of its size (and of its MD5
  -- where the store says one).
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'stored')),
  created_at timestamptz NOT NULL DEFAULT now(),
  stored_at timestamptz,
  PRIMARY KEY (work_id, sha256),
  CHECK ((status = 'stored') = (stored_at IS NOT NULL))
);

-- A work's files: every version of every path. Its files as they stand are each path's latest
-- version, unless that version deletes it.
CREATE TABLE IF NOT EXISTS public.work_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  -- A root's name, then the file's path under it ("records/spec.json"): never absolute, never
  -- climbing out ("..").
  path text NOT NULL CHECK (
    char_length(path) BETWEEN 1 AND 500
    AND left(path, 1) <> '/'
    AND strpos(path, '//') = 0
    AND strpos(path, '\') = 0
    AND path !~ '(^|/)\.\.?(/|$)'
    AND path !~ '[[:cntrl:]]'
  ),
  version integer NOT NULL CHECK (version >= 1),
  deleted boolean NOT NULL DEFAULT false,
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  size bigint CHECK (size IS NULL OR size >= 0),
  mime_type text CHECK (mime_type IS NULL OR char_length(mime_type) <= 200),
  -- Its bytes in order: each part's SHA-256 (a work_blobs row).
  chunks jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(chunks) = 'array' AND jsonb_array_length(chunks) <= 4096),
  -- When it last changed on the machine that kept it, and whether it runs (a script).
  modified_at timestamptz,
  executable boolean NOT NULL DEFAULT false,
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  -- The library file it was also put in as, if it was.
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  entry_id uuid REFERENCES public.work_journal(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_id, path, version),
  CHECK (deleted OR (sha256 IS NOT NULL AND size IS NOT NULL))
);

-- A work's files as they stand: each path's latest version, unless that version deletes it, in
-- order of their paths. Read under the reader's own row security.
CREATE OR REPLACE FUNCTION public.work_files_now(p_work_id uuid) RETURNS SETOF public.work_files
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT latest.* FROM (
    SELECT DISTINCT ON (path) * FROM public.work_files
     WHERE work_id = p_work_id
     ORDER BY path, version DESC
  ) latest
  WHERE NOT latest.deleted
  ORDER BY latest.path;
$$;

-- What a work made or used in the studio.
CREATE TABLE IF NOT EXISTS public.work_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'generation', 'asset', 'edit', 'render', 'long_video', 'review_gate', 'storyboard', 'brief',
    'character', 'brand_kit', 'composition', 'thread', 'section_plan', 'work'
  )),
  object_id uuid NOT NULL,
  -- What it is to the work ("the delivered master", "take 3 of shot P").
  role text CHECK (role IS NULL OR char_length(role) <= 200),
  note text CHECK (note IS NULL OR char_length(note) <= 2000),
  entry_id uuid REFERENCES public.work_journal(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_id, kind, object_id)
);
CREATE INDEX IF NOT EXISTS work_links_object_idx ON public.work_links (kind, object_id);

-- A Supercomputer conversation working on a work: what it makes is kept with the work, and each
-- of its turns is written into the work's journal as it ends.
ALTER TABLE public.supercomputer_threads
  ADD COLUMN IF NOT EXISTS work_id uuid REFERENCES public.works(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS supercomputer_threads_work_idx
  ON public.supercomputer_threads (work_id) WHERE work_id IS NOT NULL;

-- The work's files: private, read and written only through links the server signs for a member.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
  VALUES ('work-files', 'work-files', false, 52428800)
  ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit;

-- RFC 7386 JSON merge patch: an object's keys merged in, a null removing its key, anything else
-- replacing what was there.
CREATE OR REPLACE FUNCTION public.work_merge_patch(p_target jsonb, p_patch jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_result jsonb;
  v_key text;
  v_value jsonb;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RETURN p_patch;
  END IF;
  v_result := CASE WHEN jsonb_typeof(p_target) = 'object' THEN p_target ELSE '{}'::jsonb END;
  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_patch) LOOP
    IF jsonb_typeof(v_value) = 'null' THEN
      v_result := v_result - v_key;
    ELSE
      v_result := jsonb_set(v_result, ARRAY[v_key],
        public.work_merge_patch(v_result -> v_key, v_value), true);
    END IF;
  END LOOP;
  RETURN v_result;
END $$;

-- A plan with changes made to it, in order: a step found by its key is changed (only what the
-- change names) or removed; one not found is added at the end, to do unless said.
CREATE OR REPLACE FUNCTION public.work_merge_steps(p_steps jsonb, p_changes jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_steps jsonb := COALESCE(p_steps, '[]'::jsonb);
  v_change jsonb;
  v_key text;
  v_index integer;
  v_step jsonb;
BEGIN
  FOR v_change IN SELECT value FROM jsonb_array_elements(COALESCE(p_changes, '[]'::jsonb)) LOOP
    v_key := btrim(COALESCE(v_change ->> 'key', ''));
    IF char_length(v_key) NOT BETWEEN 1 AND 80 THEN
      RAISE EXCEPTION 'Every step change names its step''s key (1 to 80 characters).'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_change ? 'status' AND (v_change ->> 'status') NOT IN ('todo', 'doing', 'done', 'blocked', 'skipped') THEN
      RAISE EXCEPTION 'A step''s status is todo, doing, done, blocked or skipped.'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT ordinality - 1 INTO v_index
      FROM jsonb_array_elements(v_steps) WITH ORDINALITY
     WHERE value ->> 'key' = v_key
     LIMIT 1;
    IF COALESCE((v_change ->> 'remove')::boolean, false) THEN
      IF v_index IS NOT NULL THEN
        v_steps := v_steps - v_index;
      END IF;
      CONTINUE;
    END IF;
    IF v_index IS NULL THEN
      v_steps := v_steps || jsonb_build_array(jsonb_build_object(
        'key', v_key,
        'title', left(COALESCE(NULLIF(btrim(v_change ->> 'title'), ''), v_key), 300),
        'status', COALESCE(v_change ->> 'status', 'todo'),
        'note', left(COALESCE(v_change ->> 'note', ''), 2000),
        'updated_at', now()));
    ELSE
      v_step := (v_steps -> v_index)
        || jsonb_strip_nulls(jsonb_build_object(
             'title', left(NULLIF(btrim(v_change ->> 'title'), ''), 300),
             'status', v_change ->> 'status',
             'note', left(v_change ->> 'note', 2000)))
        || jsonb_build_object('updated_at', now());
      v_steps := jsonb_set(v_steps, ARRAY[v_index::text], v_step);
    END IF;
  END LOOP;
  RETURN v_steps;
END $$;

-- Each entry is counted on its work, and dated.
CREATE OR REPLACE FUNCTION public.work_journal_after_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.works SET entries = entries + 1, last_entry_at = NEW.created_at
   WHERE id = NEW.work_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS work_journal_after_insert ON public.work_journal;
CREATE TRIGGER work_journal_after_insert AFTER INSERT ON public.work_journal
  FOR EACH ROW EXECUTE FUNCTION public.work_journal_after_insert();

-- A session takes up a work: its hold is renewed when it already has it, given when nobody does
-- or the last holder's has lapsed, and taken only when asked for (take_over) while another's is
-- live. A work that was set aside is active again. The journal says when the holder changes.
-- With renew_only, a session that is still at it renews its own hold and nothing else: a work
-- another session took, or that was let go, is not taken up again by a heartbeat.
CREATE OR REPLACE FUNCTION public.work_claim(
  p_work_id uuid,
  p_holder text,
  p_label text,
  p_kind text,
  p_user uuid,
  p_seconds integer DEFAULT 900,
  p_take_over boolean DEFAULT false,
  p_renew_only boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_work public.works%ROWTYPE;
  v_live boolean;
  v_entry uuid;
  v_summary text;
BEGIN
  IF p_holder IS NULL OR char_length(p_holder) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'A holder is named (1 to 200 characters).' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_work FROM public.works WHERE id = p_work_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  v_live := v_work.holder IS NOT NULL AND v_work.lease_expires_at > now();
  IF p_renew_only AND v_work.holder IS DISTINCT FROM p_holder THEN
    RETURN jsonb_build_object(
      'found', true, 'claimed', false, 'renewOnly', true,
      'holder', v_work.holder, 'holderLabel', v_work.holder_label, 'holderKind', v_work.holder_kind,
      'heardAt', v_work.heard_at, 'leaseExpiresAt', v_work.lease_expires_at);
  END IF;
  IF v_live AND v_work.holder <> p_holder AND NOT p_take_over THEN
    RETURN jsonb_build_object(
      'found', true, 'claimed', false,
      'holder', v_work.holder, 'holderLabel', v_work.holder_label, 'holderKind', v_work.holder_kind,
      'heardAt', v_work.heard_at, 'leaseExpiresAt', v_work.lease_expires_at);
  END IF;
  IF v_work.holder IS DISTINCT FROM p_holder OR v_work.status <> 'active' THEN
    v_summary := CASE
      WHEN v_work.holder IS NOT DISTINCT FROM p_holder THEN 'Picked up again.'
      WHEN v_live THEN format('Taken over from %s, last heard from %s.',
        COALESCE(v_work.holder_label, v_work.holder),
        to_char(v_work.heard_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'))
      WHEN v_work.holder IS NOT NULL THEN format('Picked up: %s had stopped renewing its hold (last heard from %s).',
        COALESCE(v_work.holder_label, v_work.holder),
        to_char(v_work.heard_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'))
      ELSE 'Picked up.'
    END || CASE WHEN v_work.status <> 'active' THEN format(' It was %s; it is active again.', v_work.status) ELSE '' END;
    INSERT INTO public.work_journal (work_id, kind, summary, changes, actor_kind, actor_session, actor_label, created_by)
      VALUES (p_work_id, CASE WHEN v_live AND v_work.holder <> p_holder THEN 'takeover' ELSE 'claim' END,
        v_summary,
        CASE WHEN v_work.status <> 'active' THEN jsonb_build_object('status', 'active') ELSE '{}'::jsonb END,
        p_kind, p_holder, p_label, p_user)
      RETURNING id INTO v_entry;
  END IF;
  UPDATE public.works SET
    holder = p_holder,
    holder_label = p_label,
    holder_kind = p_kind,
    held_since = CASE WHEN v_work.holder IS NOT DISTINCT FROM p_holder AND v_live
      THEN COALESCE(v_work.held_since, now()) ELSE now() END,
    heard_at = now(),
    lease_expires_at = now() + make_interval(secs => LEAST(GREATEST(COALESCE(p_seconds, 900), 60), 86400)),
    status = 'active',
    finished_at = NULL
  WHERE id = p_work_id;
  RETURN jsonb_build_object(
    'found', true, 'claimed', true, 'entryId', v_entry,
    'previousHolder', CASE WHEN v_work.holder IS DISTINCT FROM p_holder THEN v_work.holder END,
    'previousLabel', CASE WHEN v_work.holder IS DISTINCT FROM p_holder THEN v_work.holder_label END,
    'previousHeardAt', CASE WHEN v_work.holder IS DISTINCT FROM p_holder THEN v_work.heard_at END,
    'tookOver', v_live AND v_work.holder <> p_holder);
END $$;

-- A session lets a work go (only its own hold), saying so in the journal.
CREATE OR REPLACE FUNCTION public.work_release(
  p_work_id uuid,
  p_holder text,
  p_kind text,
  p_label text,
  p_user uuid,
  p_summary text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_work public.works%ROWTYPE;
BEGIN
  SELECT * INTO v_work FROM public.works WHERE id = p_work_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  IF v_work.holder IS DISTINCT FROM p_holder THEN
    RETURN jsonb_build_object('found', true, 'released', false,
      'holder', v_work.holder, 'holderLabel', v_work.holder_label);
  END IF;
  INSERT INTO public.work_journal (work_id, kind, summary, actor_kind, actor_session, actor_label, created_by)
    VALUES (p_work_id, 'release', left(COALESCE(NULLIF(btrim(p_summary), ''), 'Let go.'), 20000),
      p_kind, p_holder, p_label, p_user);
  UPDATE public.works SET holder = NULL, holder_label = NULL, holder_kind = NULL, held_since = NULL,
    heard_at = now(), lease_expires_at = NULL
  WHERE id = p_work_id;
  RETURN jsonb_build_object('found', true, 'released', true);
END $$;

-- A save: its journal entry, its changes to the record (a merge patch, refused when it was made
-- from a version that is no longer the latest) and to the plan, the files it keeps (each part
-- already stored, and adding up to the file), what it attaches, any change to the work itself,
-- and its saver's hold renewed (or taken up, where nobody else's is live). All of it or none; and
-- a save sent again with the same request id returns the first.
CREATE OR REPLACE FUNCTION public.work_save(
  p_work_id uuid,
  p_entry jsonb,
  p_user uuid,
  p_state_patch jsonb DEFAULT NULL,
  p_base_version integer DEFAULT NULL,
  p_step_changes jsonb DEFAULT NULL,
  p_files jsonb DEFAULT NULL,
  p_links jsonb DEFAULT NULL,
  p_changes jsonb DEFAULT NULL,
  p_holder text DEFAULT NULL,
  p_seconds integer DEFAULT 900
) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_work public.works%ROWTYPE;
  v_request text := NULLIF(p_entry ->> 'client_request_id', '');
  v_kind text := COALESCE(NULLIF(p_entry ->> 'kind', ''), 'save');
  v_actor_kind text := COALESCE(NULLIF(p_entry ->> 'actor_kind', ''), 'script');
  v_summary text := left(COALESCE(p_entry ->> 'summary', ''), 20000);
  v_existing record;
  v_entry uuid;
  v_n bigint;
  v_state jsonb;
  v_version integer;
  v_state_changed boolean := false;
  v_steps jsonb;
  v_file jsonb;
  v_path text;
  v_latest record;
  v_parts integer;
  v_found integer;
  v_total bigint;
  v_saved_files jsonb := '[]'::jsonb;
  v_link jsonb;
  v_saved_links jsonb := '[]'::jsonb;
  v_link_row record;
  v_status text;
  v_live boolean;
  v_hold text := NULL;
  v_changes jsonb := COALESCE(p_changes, '{}'::jsonb);
  v_code jsonb := NULLIF(p_entry -> 'code', 'null'::jsonb);
BEGIN
  -- The work is locked first, so a save sent twice at once is kept once: the second waits for
  -- the first, then finds its entry.
  SELECT * INTO v_work FROM public.works WHERE id = p_work_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  IF v_request IS NOT NULL THEN
    SELECT id, n INTO v_existing FROM public.work_journal
     WHERE work_id = p_work_id AND client_request_id = v_request;
    IF FOUND THEN
      RETURN jsonb_build_object('found', true, 'duplicate', true, 'entryId', v_existing.id,
        'n', v_existing.n, 'stateVersion', v_work.state_version, 'status', v_work.status);
    END IF;
  END IF;

  IF p_state_patch IS NOT NULL AND jsonb_typeof(p_state_patch) <> 'object' THEN
    RAISE EXCEPTION 'A change to the record is a JSON object (a merge patch).'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_state_patch IS NOT NULL AND p_base_version IS NOT NULL AND p_base_version <> v_work.state_version THEN
    RETURN jsonb_build_object('found', true, 'conflict', true,
      'stateVersion', v_work.state_version, 'baseVersion', p_base_version);
  END IF;

  -- The record and the plan as they will be.
  v_state := v_work.state;
  v_version := v_work.state_version;
  IF p_state_patch IS NOT NULL THEN
    v_state := public.work_merge_patch(v_work.state, p_state_patch);
    IF v_state IS DISTINCT FROM v_work.state THEN
      v_state_changed := true;
      v_version := v_work.state_version + 1;
    END IF;
  END IF;
  v_steps := public.work_merge_steps(v_work.steps, p_step_changes);

  INSERT INTO public.work_journal (
    work_id, kind, summary, next_steps, decisions, questions, step_changes, state_patch,
    state_version, changes, code, actor_kind, actor_session, actor_label, created_by, client_request_id
  ) VALUES (
    p_work_id, v_kind, v_summary,
    COALESCE(p_entry -> 'next_steps', '[]'::jsonb),
    COALESCE(p_entry -> 'decisions', '[]'::jsonb),
    COALESCE(p_entry -> 'questions', '[]'::jsonb),
    COALESCE(p_step_changes, '[]'::jsonb),
    CASE WHEN v_state_changed THEN p_state_patch END,
    CASE WHEN v_state_changed THEN v_version END,
    v_changes,
    v_code,
    v_actor_kind,
    NULLIF(p_entry ->> 'actor_session', ''),
    NULLIF(p_entry ->> 'actor_label', ''),
    p_user, v_request
  ) RETURNING id, n INTO v_entry, v_n;

  -- The files: a new version of each path that changed (an unchanged one is kept as it is).
  FOR v_file IN SELECT value FROM jsonb_array_elements(COALESCE(p_files, '[]'::jsonb)) LOOP
    v_path := v_file ->> 'path';
    SELECT version, deleted, sha256 INTO v_latest FROM public.work_files
     WHERE work_id = p_work_id AND path = v_path ORDER BY version DESC LIMIT 1;
    IF COALESCE((v_file ->> 'deleted')::boolean, false) THEN
      IF v_latest.version IS NULL OR v_latest.deleted THEN
        CONTINUE;
      END IF;
      INSERT INTO public.work_files (work_id, path, version, deleted, entry_id, created_by)
        VALUES (p_work_id, v_path, v_latest.version + 1, true, v_entry, p_user);
      v_saved_files := v_saved_files || jsonb_build_array(jsonb_build_object(
        'path', v_path, 'version', v_latest.version + 1, 'deleted', true));
      CONTINUE;
    END IF;
    IF v_latest.version IS NOT NULL AND NOT v_latest.deleted AND v_latest.sha256 = v_file ->> 'sha256' THEN
      CONTINUE;
    END IF;
    IF v_file ->> 'sha256' IS NULL OR v_file ->> 'size' IS NULL
       OR jsonb_typeof(v_file -> 'chunks') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'The file % gives its SHA-256, its size and its parts.', v_path
        USING ERRCODE = 'check_violation';
    END IF;
    v_parts := jsonb_array_length(v_file -> 'chunks');
    SELECT count(b.sha256), COALESCE(sum(b.size), 0) INTO v_found, v_total
      FROM jsonb_array_elements_text(v_file -> 'chunks') AS c(sha)
      JOIN public.work_blobs b ON b.work_id = p_work_id AND b.sha256 = c.sha AND b.status = 'stored';
    IF v_found <> v_parts THEN
      RAISE EXCEPTION 'The file % has % of its % parts stored: upload the rest first.',
        v_path, v_found, v_parts USING ERRCODE = 'check_violation';
    END IF;
    IF v_total <> (v_file ->> 'size')::bigint THEN
      RAISE EXCEPTION 'The file %''s parts add up to % bytes, not %.', v_path, v_total, v_file ->> 'size'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.work_files (
      work_id, path, version, sha256, size, mime_type, chunks, modified_at, executable, note,
      entry_id, created_by
    ) VALUES (
      p_work_id, v_path, COALESCE(v_latest.version, 0) + 1, v_file ->> 'sha256',
      (v_file ->> 'size')::bigint, NULLIF(v_file ->> 'mime_type', ''), v_file -> 'chunks',
      (v_file ->> 'modified_at')::timestamptz, COALESCE((v_file ->> 'executable')::boolean, false),
      NULLIF(v_file ->> 'note', ''), v_entry, p_user
    );
    v_saved_files := v_saved_files || jsonb_build_array(jsonb_build_object(
      'path', v_path, 'version', COALESCE(v_latest.version, 0) + 1,
      'sha256', v_file ->> 'sha256', 'size', (v_file ->> 'size')::bigint));
  END LOOP;

  -- What it attaches (a link kept again keeps the role and note it had, unless given new ones).
  FOR v_link IN SELECT value FROM jsonb_array_elements(COALESCE(p_links, '[]'::jsonb)) LOOP
    INSERT INTO public.work_links (work_id, kind, object_id, role, note, entry_id, created_by)
      VALUES (p_work_id, v_link ->> 'kind', (v_link ->> 'object_id')::uuid,
        NULLIF(left(v_link ->> 'role', 200), ''), NULLIF(left(v_link ->> 'note', 2000), ''),
        v_entry, p_user)
      ON CONFLICT (work_id, kind, object_id) DO UPDATE SET
        role = COALESCE(EXCLUDED.role, public.work_links.role),
        note = COALESCE(EXCLUDED.note, public.work_links.note),
        updated_at = now()
      RETURNING kind, object_id, role, (xmax = 0) AS added INTO v_link_row;
    v_saved_links := v_saved_links || jsonb_build_array(jsonb_build_object(
      'kind', v_link_row.kind, 'id', v_link_row.object_id, 'role', v_link_row.role,
      'added', v_link_row.added));
  END LOOP;
  UPDATE public.work_journal SET files = v_saved_files, links = v_saved_links WHERE id = v_entry;

  -- The work itself.
  v_status := COALESCE(NULLIF(v_changes ->> 'status', ''), v_work.status);
  IF v_status NOT IN ('active', 'blocked', 'paused', 'done', 'abandoned') THEN
    RAISE EXCEPTION 'A work is active, blocked, paused, done or abandoned.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.works SET
    state = v_state,
    state_version = v_version,
    steps = v_steps,
    title = COALESCE(NULLIF(btrim(v_changes ->> 'title'), ''), title),
    goal = CASE WHEN v_changes ? 'goal' THEN COALESCE(v_changes ->> 'goal', '') ELSE goal END,
    roots = CASE WHEN v_changes ? 'roots' THEN public.work_merge_patch(roots, v_changes -> 'roots') ELSE roots END,
    project_id = CASE WHEN v_changes ? 'project_id' THEN (v_changes ->> 'project_id')::uuid ELSE project_id END,
    brand_kit_id = CASE WHEN v_changes ? 'brand_kit_id' THEN (v_changes ->> 'brand_kit_id')::uuid ELSE brand_kit_id END,
    status = v_status,
    finished_at = CASE
      WHEN v_status IN ('done', 'abandoned') THEN COALESCE(finished_at, now())
      ELSE NULL END,
    code = COALESCE(v_code, code),
    last_summary = CASE
      WHEN btrim(v_summary) <> '' AND v_kind NOT IN ('claim', 'takeover', 'release', 'link', 'auto')
        THEN v_summary ELSE last_summary END,
    next_steps = CASE WHEN p_entry ? 'next_steps' THEN p_entry -> 'next_steps' ELSE next_steps END,
    questions = CASE WHEN p_entry ? 'questions' THEN p_entry -> 'questions' ELSE questions END
  WHERE id = p_work_id;

  -- Its saver's hold: renewed, or taken up where nobody else's is live; a finished work is let go.
  IF v_status IN ('done', 'abandoned') THEN
    UPDATE public.works SET holder = NULL, holder_label = NULL, holder_kind = NULL, held_since = NULL,
      lease_expires_at = NULL, heard_at = now()
     WHERE id = p_work_id AND holder IS NOT NULL;
    v_hold := 'released';
  ELSIF p_holder IS NOT NULL AND v_actor_kind <> 'studio' THEN
    v_live := v_work.holder IS NOT NULL AND v_work.lease_expires_at > now();
    IF NOT v_live OR v_work.holder = p_holder THEN
      UPDATE public.works SET
        holder = p_holder,
        holder_label = NULLIF(p_entry ->> 'actor_label', ''),
        holder_kind = v_actor_kind,
        held_since = CASE WHEN v_work.holder IS NOT DISTINCT FROM p_holder AND v_live
          THEN COALESCE(v_work.held_since, now()) ELSE now() END,
        heard_at = now(),
        lease_expires_at = now() + make_interval(secs => LEAST(GREATEST(COALESCE(p_seconds, 900), 60), 86400))
      WHERE id = p_work_id;
      v_hold := 'held';
    ELSE
      v_hold := 'held_by_other';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'found', true, 'duplicate', false, 'entryId', v_entry, 'n', v_n,
    'stateVersion', v_version, 'stateChanged', v_state_changed,
    'files', v_saved_files, 'links', v_saved_links, 'status', v_status, 'hold', v_hold,
    'holder', CASE WHEN v_hold = 'held_by_other' THEN v_work.holder END,
    'holderLabel', CASE WHEN v_hold = 'held_by_other' THEN v_work.holder_label END,
    'heardAt', CASE WHEN v_hold = 'held_by_other' THEN v_work.heard_at END);
END $$;

DROP TRIGGER IF EXISTS works_updated ON public.works;
CREATE TRIGGER works_updated BEFORE UPDATE ON public.works
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS work_links_updated ON public.work_links;
CREATE TRIGGER work_links_updated BEFORE UPDATE ON public.work_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Members read; only the server writes.
REVOKE ALL ON public.works, public.work_journal, public.work_blobs, public.work_files, public.work_links
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.works, public.work_journal, public.work_blobs, public.work_files, public.work_links
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.works, public.work_journal, public.work_blobs,
  public.work_files, public.work_links TO service_role;

ALTER TABLE public.works ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read works" ON public.works;
CREATE POLICY "members read works" ON public.works FOR SELECT TO authenticated
  USING (public.is_active_member());
ALTER TABLE public.work_journal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read work journal" ON public.work_journal;
CREATE POLICY "members read work journal" ON public.work_journal FOR SELECT TO authenticated
  USING (public.is_active_member());
ALTER TABLE public.work_blobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read work blobs" ON public.work_blobs;
CREATE POLICY "members read work blobs" ON public.work_blobs FOR SELECT TO authenticated
  USING (public.is_active_member());
ALTER TABLE public.work_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read work files" ON public.work_files;
CREATE POLICY "members read work files" ON public.work_files FOR SELECT TO authenticated
  USING (public.is_active_member());
ALTER TABLE public.work_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read work links" ON public.work_links;
CREATE POLICY "members read work links" ON public.work_links FOR SELECT TO authenticated
  USING (public.is_active_member());

REVOKE ALL ON FUNCTION public.work_merge_patch(jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.work_files_now(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.work_merge_steps(jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.work_journal_after_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.work_claim(uuid, text, text, text, uuid, integer, boolean, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.work_release(uuid, text, text, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.work_save(uuid, jsonb, uuid, jsonb, integer, jsonb, jsonb, jsonb, jsonb, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.work_merge_patch(jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_files_now(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_merge_steps(jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_claim(uuid, text, text, text, uuid, integer, boolean, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.work_release(uuid, text, text, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.work_save(uuid, jsonb, uuid, jsonb, integer, jsonb, jsonb, jsonb, jsonb, text, integer)
  TO service_role;

-- The work pages follow a work's journal as it is written (not the work itself: its row is
-- renewed every few minutes while someone holds it, and can carry a large record).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'work_journal') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.work_journal;
    END IF;
  END IF;
END $$;
