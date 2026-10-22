-- ============ CREATIVE STUDIO: REVIEW GATES ON A PROJECT (additive, re-runnable) ============
-- Reel 1 moved through style frames, an animatic, a proof and the film, each
-- approved in chat before the next, costlier stage began. A project's review
-- gates keep that in the studio. Each gate, named and ordered by people,
-- holds:
--   versions of what is being reviewed: library files (stills or videos), a
--   render (its video, with the edit's clips and captions as rendered), or a
--   storyboard (its shots and times as they stood);
--   comments pinned to a frame or a time, and optionally a point on the
--   picture;
--   decisions: who approved a version, or asked for changes, and when.
-- A gate's state follows its latest version, and a gate can be held until
-- the one before it is approved: nothing can be added to it, or approved,
-- until then. A decision is never changed or removed; a new one supersedes it.
--
-- A client's notes on a gate (a numbered list pasted in) are kept one by one,
-- each with the shots and times it concerns, whether it is done, and the
-- version that answers it.
--
-- Any active member can review, in the app or through the studio API (as the
-- token's owner, recorded as through the API). The app works before this is
-- applied: the Reviews section says it needs it.

CREATE TABLE IF NOT EXISTS public.review_gates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  -- The gates' order in their project, lowest first (the older first on a tie).
  position integer NOT NULL DEFAULT 1,
  -- Held: nothing is added to it, or approved, until the gate before it is approved.
  held_until_previous boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS review_gates_project_idx
  ON public.review_gates (project_id, position, created_at);

CREATE TABLE IF NOT EXISTS public.review_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_id uuid NOT NULL REFERENCES public.review_gates(id) ON DELETE CASCADE,
  -- 1, 2, 3… within its gate, given when it is added (review_versions_before_insert).
  number integer NOT NULL DEFAULT 1 CHECK (number >= 1),
  -- files: library stills and videos (review_version_files); render: an Editor render, its
  -- video the version's one file; storyboard: a storyboard as it stood when added.
  kind text NOT NULL CHECK (kind IN ('files', 'render', 'storyboard')),
  render_id uuid REFERENCES public.sequence_renders(id) ON DELETE SET NULL,
  storyboard_id uuid REFERENCES public.storyboards(id) ON DELETE SET NULL,
  -- What it is, as it read when added; kept if the render or storyboard is deleted.
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 200),
  -- What changed since the version before, in the words of whoever added it.
  note text CHECK (note IS NULL OR char_length(note) <= 4000),
  -- What it showed, kept with it: a render's clips, captions and titles (from the timeline it
  -- rendered); a storyboard's shots and their times. Notes are matched to shots and times from it.
  snapshot jsonb CHECK (snapshot IS NULL OR jsonb_typeof(snapshot) = 'object'),
  -- The adder's own id for the request (the studio API's clientRequestId): sent again, the
  -- same version comes back rather than a second one.
  client_request_id text
    CHECK (client_request_id IS NULL OR char_length(client_request_id) BETWEEN 8 AND 64),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gate_id, number)
);
CREATE UNIQUE INDEX IF NOT EXISTS review_versions_request_once
  ON public.review_versions (created_by, client_request_id) WHERE client_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.review_version_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.review_versions(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  -- The file's title when it was added, kept if it leaves the library.
  title text CHECK (title IS NULL OR char_length(title) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, position)
);

CREATE TABLE IF NOT EXISTS public.review_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.review_versions(id) ON DELETE CASCADE,
  -- The version's file it is on (one still among several), when it names one.
  file_id uuid REFERENCES public.review_version_files(id) ON DELETE SET NULL,
  -- Where it is pinned: a time in a video or render and the frame it falls in; a point on the
  -- picture, 0 to 1 across and down; a storyboard's shot.
  at_seconds numeric CHECK (at_seconds IS NULL OR (at_seconds >= 0 AND at_seconds <= 36000)),
  frame integer CHECK (frame IS NULL OR frame >= 0),
  x real CHECK (x IS NULL OR (x >= 0 AND x <= 1)),
  y real CHECK (y IS NULL OR (y >= 0 AND y <= 1)),
  shot_id uuid REFERENCES public.shots(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  -- app, or api: a script or agent with a studio API token, as the token's owner.
  via text NOT NULL DEFAULT 'app' CHECK (via IN ('app', 'api')),
  client_request_id text
    CHECK (client_request_id IS NULL OR char_length(client_request_id) BETWEEN 8 AND 64),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((x IS NULL) = (y IS NULL))
);
CREATE INDEX IF NOT EXISTS review_comments_version_idx
  ON public.review_comments (version_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS review_comments_request_once
  ON public.review_comments (created_by, client_request_id) WHERE client_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.review_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.review_versions(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('approved', 'changes_requested')),
  note text CHECK (note IS NULL OR char_length(note) <= 4000),
  -- Recorded for someone outside the team (the client approving on a call or by email): who.
  on_behalf_of text CHECK (on_behalf_of IS NULL OR char_length(on_behalf_of) BETWEEN 1 AND 200),
  via text NOT NULL DEFAULT 'app' CHECK (via IN ('app', 'api')),
  client_request_id text
    CHECK (client_request_id IS NULL OR char_length(client_request_id) BETWEEN 8 AND 64),
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS review_decisions_version_idx
  ON public.review_decisions (version_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS review_decisions_request_once
  ON public.review_decisions (decided_by, client_request_id) WHERE client_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.review_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_id uuid NOT NULL REFERENCES public.review_gates(id) ON DELETE CASCADE,
  -- The version the note was given on, when it names one.
  version_id uuid REFERENCES public.review_versions(id) ON DELETE SET NULL,
  -- Its number in the list it came in: the giver's own numbering where it had one.
  number integer NOT NULL CHECK (number >= 1),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  -- Who gave it, in words ("the client, by email"), for someone outside the team.
  given_by text CHECK (given_by IS NULL OR char_length(given_by) <= 200),
  -- The shots and times it concerns, each with the evidence it was matched on and whether a
  -- person set it: [{shotId, label, name, start, end, evidence: [{kind, text}], by}].
  targets jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(targets) = 'array'),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  -- The version that answers it.
  answered_in_version_id uuid REFERENCES public.review_versions(id) ON DELETE SET NULL,
  done_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  done_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'done') = (done_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS review_notes_gate_idx ON public.review_notes (gate_id, created_at, number);

-- Whether a gate is approved: its latest version's latest decision approves it.
CREATE OR REPLACE FUNCTION public.review_gate_approved(p_gate_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE((
    SELECT d.decision = 'approved'
      FROM (SELECT id FROM public.review_versions WHERE gate_id = p_gate_id
             ORDER BY number DESC LIMIT 1) latest
      JOIN public.review_decisions d ON d.version_id = latest.id
     ORDER BY d.created_at DESC, d.id DESC
     LIMIT 1
  ), false);
$$;

-- The gate a held gate waits for (the one before it, until approved); null when it can go ahead.
CREATE OR REPLACE FUNCTION public.review_gate_waiting_for(p_gate_id uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_gate record;
  v_before uuid;
BEGIN
  SELECT id, project_id, position, created_at, held_until_previous INTO v_gate
    FROM public.review_gates WHERE id = p_gate_id;
  IF NOT FOUND OR NOT v_gate.held_until_previous THEN
    RETURN NULL;
  END IF;
  SELECT id INTO v_before FROM public.review_gates
   WHERE project_id = v_gate.project_id
     AND (position, created_at, id) < (v_gate.position, v_gate.created_at, v_gate.id)
   ORDER BY position DESC, created_at DESC, id DESC
   LIMIT 1;
  IF v_before IS NULL OR public.review_gate_approved(v_before) THEN
    RETURN NULL;
  END IF;
  RETURN v_before;
END $$;

-- A new version: its gate is locked while it is numbered (two added at once can't take the
-- same number), it must not be held, and it names what it is a version of.
CREATE OR REPLACE FUNCTION public.review_versions_before_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_waiting uuid;
BEGIN
  PERFORM 1 FROM public.review_gates WHERE id = NEW.gate_id FOR UPDATE;
  v_waiting := public.review_gate_waiting_for(NEW.gate_id);
  IF v_waiting IS NOT NULL THEN
    RAISE EXCEPTION 'This gate is held until the one before it is approved.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'render' AND NEW.render_id IS NULL THEN
    RAISE EXCEPTION 'A render version names its render.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'storyboard' AND NEW.storyboard_id IS NULL THEN
    RAISE EXCEPTION 'A storyboard version names its storyboard.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(MAX(number), 0) + 1 INTO NEW.number
    FROM public.review_versions WHERE gate_id = NEW.gate_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS review_versions_before_insert ON public.review_versions;
CREATE TRIGGER review_versions_before_insert BEFORE INSERT ON public.review_versions
  FOR EACH ROW EXECUTE FUNCTION public.review_versions_before_insert();

-- A decision is on its gate's latest version, and a held gate can't be approved.
CREATE OR REPLACE FUNCTION public.review_decisions_before_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_gate uuid;
  v_number integer;
BEGIN
  SELECT gate_id, number INTO v_gate, v_number FROM public.review_versions WHERE id = NEW.version_id;
  IF EXISTS (SELECT 1 FROM public.review_versions WHERE gate_id = v_gate AND number > v_number) THEN
    RAISE EXCEPTION 'A newer version is in review: decide on that one.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.decision = 'approved' AND public.review_gate_waiting_for(v_gate) IS NOT NULL THEN
    RAISE EXCEPTION 'This gate is held until the one before it is approved.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS review_decisions_before_insert ON public.review_decisions;
CREATE TRIGGER review_decisions_before_insert BEFORE INSERT ON public.review_decisions
  FOR EACH ROW EXECUTE FUNCTION public.review_decisions_before_insert();

-- Done says when, and (for a member) who; opened again, neither.
CREATE OR REPLACE FUNCTION public.review_notes_done() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' THEN
    NEW.done_at := now();
    NEW.done_by := COALESCE(auth.uid(), NEW.done_by);
  ELSIF NEW.status = 'open' THEN
    NEW.done_at := NULL;
    NEW.done_by := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS review_notes_done ON public.review_notes;
CREATE TRIGGER review_notes_done BEFORE UPDATE OF status ON public.review_notes
  FOR EACH ROW EXECUTE FUNCTION public.review_notes_done();

DROP TRIGGER IF EXISTS review_gates_updated ON public.review_gates;
CREATE TRIGGER review_gates_updated BEFORE UPDATE ON public.review_gates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS review_notes_updated ON public.review_notes;
CREATE TRIGGER review_notes_updated BEFORE UPDATE ON public.review_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON public.review_gates, public.review_versions, public.review_version_files,
  public.review_comments, public.review_decisions, public.review_notes
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_gate_approved(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_gate_waiting_for(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_gate_approved(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_gate_waiting_for(uuid) TO authenticated, service_role;

-- Members read everything; they add gates, versions, comments, decisions and notes as
-- themselves. A gate's name, place and hold can change; a note's text, shots and progress can.
-- Versions, comments and decisions are records: a comment can be taken back by its writer (or
-- an admin), a version by its adder (or an admin) only until it has a decision, and a decision
-- never.
GRANT SELECT, INSERT, DELETE ON public.review_gates TO authenticated;
GRANT UPDATE (name, position, held_until_previous) ON public.review_gates TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.review_versions TO authenticated;
GRANT SELECT, INSERT ON public.review_version_files TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.review_comments TO authenticated;
GRANT SELECT, INSERT ON public.review_decisions TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.review_notes TO authenticated;
GRANT UPDATE (number, body, given_by, version_id, targets, status, answered_in_version_id)
  ON public.review_notes TO authenticated;
GRANT ALL ON public.review_gates, public.review_versions, public.review_version_files,
  public.review_comments, public.review_decisions, public.review_notes TO service_role;

ALTER TABLE public.review_gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_version_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read review gates" ON public.review_gates;
DROP POLICY IF EXISTS "members add review gates" ON public.review_gates;
DROP POLICY IF EXISTS "members change review gates" ON public.review_gates;
DROP POLICY IF EXISTS "owner or admin delete review gates" ON public.review_gates;
CREATE POLICY "members read review gates" ON public.review_gates FOR SELECT TO authenticated
  USING (public.is_active_member());
CREATE POLICY "members add review gates" ON public.review_gates FOR INSERT TO authenticated
  WITH CHECK (public.is_active_member() AND created_by = auth.uid());
CREATE POLICY "members change review gates" ON public.review_gates FOR UPDATE TO authenticated
  USING (public.is_active_member()) WITH CHECK (public.is_active_member());
CREATE POLICY "owner or admin delete review gates" ON public.review_gates FOR DELETE TO authenticated
  USING (public.is_active_member() AND (created_by = auth.uid() OR public.is_admin()));

DROP POLICY IF EXISTS "members read review versions" ON public.review_versions;
DROP POLICY IF EXISTS "members add review versions" ON public.review_versions;
DROP POLICY IF EXISTS "adder or admin delete undecided review versions" ON public.review_versions;
CREATE POLICY "members read review versions" ON public.review_versions FOR SELECT TO authenticated
  USING (public.is_active_member());
CREATE POLICY "members add review versions" ON public.review_versions FOR INSERT TO authenticated
  WITH CHECK (public.is_active_member() AND created_by = auth.uid());
CREATE POLICY "adder or admin delete undecided review versions" ON public.review_versions
  FOR DELETE TO authenticated
  USING (
    public.is_active_member()
    AND (created_by = auth.uid() OR public.is_admin())
    AND NOT EXISTS (SELECT 1 FROM public.review_decisions d WHERE d.version_id = review_versions.id)
  );

DROP POLICY IF EXISTS "members read review version files" ON public.review_version_files;
DROP POLICY IF EXISTS "adders add their versions' files" ON public.review_version_files;
CREATE POLICY "members read review version files" ON public.review_version_files
  FOR SELECT TO authenticated USING (public.is_active_member());
CREATE POLICY "adders add their versions' files" ON public.review_version_files
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_member()
    AND EXISTS (
      SELECT 1 FROM public.review_versions v
       WHERE v.id = review_version_files.version_id AND v.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "members read review comments" ON public.review_comments;
DROP POLICY IF EXISTS "members comment as themselves" ON public.review_comments;
DROP POLICY IF EXISTS "writer or admin delete review comments" ON public.review_comments;
CREATE POLICY "members read review comments" ON public.review_comments FOR SELECT TO authenticated
  USING (public.is_active_member());
CREATE POLICY "members comment as themselves" ON public.review_comments FOR INSERT TO authenticated
  WITH CHECK (public.is_active_member() AND created_by = auth.uid() AND via = 'app');
CREATE POLICY "writer or admin delete review comments" ON public.review_comments
  FOR DELETE TO authenticated
  USING (public.is_active_member() AND (created_by = auth.uid() OR public.is_admin()));

DROP POLICY IF EXISTS "members read review decisions" ON public.review_decisions;
DROP POLICY IF EXISTS "members decide as themselves" ON public.review_decisions;
CREATE POLICY "members read review decisions" ON public.review_decisions FOR SELECT TO authenticated
  USING (public.is_active_member());
CREATE POLICY "members decide as themselves" ON public.review_decisions FOR INSERT TO authenticated
  WITH CHECK (public.is_active_member() AND decided_by = auth.uid() AND via = 'app');

DROP POLICY IF EXISTS "members read review notes" ON public.review_notes;
DROP POLICY IF EXISTS "members add review notes" ON public.review_notes;
DROP POLICY IF EXISTS "members work on review notes" ON public.review_notes;
DROP POLICY IF EXISTS "writer or admin delete review notes" ON public.review_notes;
CREATE POLICY "members read review notes" ON public.review_notes FOR SELECT TO authenticated
  USING (public.is_active_member());
CREATE POLICY "members add review notes" ON public.review_notes FOR INSERT TO authenticated
  WITH CHECK (public.is_active_member() AND created_by = auth.uid());
CREATE POLICY "members work on review notes" ON public.review_notes FOR UPDATE TO authenticated
  USING (public.is_active_member()) WITH CHECK (public.is_active_member());
CREATE POLICY "writer or admin delete review notes" ON public.review_notes
  FOR DELETE TO authenticated
  USING (public.is_active_member() AND (created_by = auth.uid() OR public.is_admin()));
