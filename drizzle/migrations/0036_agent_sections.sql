-- ============ CREATIVE STUDIO: SUPERCOMPUTER SECTIONS (additive, re-runnable) ============
-- Parallel work by sections (Reel 1's handover, proposal I1). The
-- Supercomputer splits a reel (an edit, a long video or a storyboard) into
-- sections, runs of whole shots, and gives each to a worker: a conversation
-- of its own, started with a brief that carries its neighbours' first and
-- last frames. What a worker saves is merged into one integration edit as it
-- saves, and every join between two sections is checked on both sides.
--
-- A plan belongs to the conversation that made it and keeps the reel's shots
-- as they were read. A section is a run of those shots: its step limit (set
-- from its work), its worker's conversation, what its worker saved and what
-- it made but didn't save (kept, so nothing done is lost), and the clips of
-- the integration edit it owns. A join is where two sections meet: the
-- frames either side and its verdict. A worker's conversation names the one
-- that planned it, and isn't listed with the others.
--
-- Members read their team's plans, sections and joins; only the server
-- writes them. The app works before this is applied: the Supercomputer says
-- its sections need this update, and everything else runs as before.

ALTER TABLE public.supercomputer_threads
  -- A section worker's conversation: the one whose plan it works for.
  ADD COLUMN IF NOT EXISTS parent_thread_id uuid
    REFERENCES public.supercomputer_threads(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS supercomputer_threads_parent_idx
  ON public.supercomputer_threads (parent_thread_id) WHERE parent_thread_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.supercomputer_section_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The conversation that planned it.
  thread_id uuid NOT NULL REFERENCES public.supercomputer_threads(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  -- What the reel is: an Editor edit, a long video or a storyboard.
  source_kind text NOT NULL CHECK (source_kind IN ('edit', 'long_video', 'storyboard')),
  source_id uuid NOT NULL,
  source_title text NOT NULL DEFAULT '',
  -- The integration edit: every section is merged into it as its worker saves.
  sequence_id uuid REFERENCES public.sequences(id) ON DELETE SET NULL,
  -- The reel's shots as planned from (see src/lib/supercomputer/sections.ts).
  shots jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(shots) = 'array'),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'working', 'done', 'stopped')),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supercomputer_section_plans_thread_idx
  ON public.supercomputer_section_plans (thread_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.supercomputer_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.supercomputer_section_plans(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0),
  title text NOT NULL,
  -- Its run of the reel's shots (indexes, inclusive).
  first_shot integer NOT NULL CHECK (first_shot >= 0),
  last_shot integer NOT NULL CHECK (last_shot >= first_shot),
  -- waiting: not given to a worker yet; queued: to run next; working; awaiting_approval:
  -- its worker waits for a person; saved: stopped part-way with its work saved (at its
  -- limit, or by its worker), to carry on; done; failed; stopped by a person.
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN (
    'waiting', 'queued', 'working', 'awaiting_approval', 'saved', 'done', 'failed', 'stopped'
  )),
  -- Its step limit (set from its work, raised by a carry-on) and the steps its worker used.
  step_budget integer NOT NULL CHECK (step_budget BETWEEN 1 AND 1000),
  estimated_steps integer NOT NULL DEFAULT 0 CHECK (estimated_steps >= 0),
  steps_used integer NOT NULL DEFAULT 0 CHECK (steps_used >= 0),
  worker_thread_id uuid REFERENCES public.supercomputer_threads(id) ON DELETE SET NULL,
  -- {shots, loose, summary, left, finished, note}: what its worker saved and said.
  work jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(work) = 'object'),
  -- [{shot, clipId}]: the integration edit's clips it owns.
  clips jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(clips) = 'array'),
  merged_at timestamptz,
  warned_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, position)
);
CREATE INDEX IF NOT EXISTS supercomputer_sections_worker_idx
  ON public.supercomputer_sections (worker_thread_id) WHERE worker_thread_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.supercomputer_section_joins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.supercomputer_section_plans(id) ON DELETE CASCADE,
  -- The join after the section at this position, into the next.
  position integer NOT NULL CHECK (position >= 0),
  -- continuous: one shot carrying straight on; cut: within a scene; scene: to another.
  kind text NOT NULL CHECK (kind IN ('continuous', 'cut', 'scene')),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN (
    'waiting', 'framing', 'checking', 'matches', 'differs', 'unmeasured'
  )),
  -- {before, after}: the frames either side, as taken from the integration edit's media.
  frames jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(frames) = 'object'),
  -- {status, findings, summary, fixes}: what its check found.
  verdict jsonb,
  -- A check in progress holds this, so two never run at once.
  claimed_at timestamptz,
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, position)
);

DROP TRIGGER IF EXISTS supercomputer_section_plans_updated ON public.supercomputer_section_plans;
CREATE TRIGGER supercomputer_section_plans_updated BEFORE UPDATE ON public.supercomputer_section_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS supercomputer_sections_updated ON public.supercomputer_sections;
CREATE TRIGGER supercomputer_sections_updated BEFORE UPDATE ON public.supercomputer_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS supercomputer_section_joins_updated ON public.supercomputer_section_joins;
CREATE TRIGGER supercomputer_section_joins_updated BEFORE UPDATE ON public.supercomputer_section_joins
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON public.supercomputer_section_plans FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.supercomputer_section_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supercomputer_section_plans TO service_role;
ALTER TABLE public.supercomputer_section_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read section plans" ON public.supercomputer_section_plans;
CREATE POLICY "members read section plans" ON public.supercomputer_section_plans FOR SELECT TO authenticated
  USING (public.is_active_member());

REVOKE ALL ON public.supercomputer_sections FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.supercomputer_sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supercomputer_sections TO service_role;
ALTER TABLE public.supercomputer_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read sections" ON public.supercomputer_sections;
CREATE POLICY "members read sections" ON public.supercomputer_sections FOR SELECT TO authenticated
  USING (public.is_active_member());

REVOKE ALL ON public.supercomputer_section_joins FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.supercomputer_section_joins TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supercomputer_section_joins TO service_role;
ALTER TABLE public.supercomputer_section_joins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read section joins" ON public.supercomputer_section_joins;
CREATE POLICY "members read section joins" ON public.supercomputer_section_joins FOR SELECT TO authenticated
  USING (public.is_active_member());
