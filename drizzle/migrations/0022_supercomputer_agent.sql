-- ============ CREATIVE STUDIO: SUPERCOMPUTER AGENT (additive, re-runnable) ============
-- The Supercomputer becomes an agent: on Claude, it thinks, calls the
-- studio's tools (the library, models, characters, brands, generations, long
-- videos, edits), searches and reads the web, looks at pictures, and asks
-- before it spends. Its answers stream as they are written.
--
-- A thread keeps its settings (the Claude model, how hard it thinks, what it
-- may spend without asking, the brand it works in) and can be pinned. An
-- assistant message is written while it streams, may wait for a person's
-- approval of a tool call, or be stopped; an edited message supersedes the
-- ones after it (kept, but no longer part of the conversation). Memories are
-- what the agent keeps between conversations: a person's own, or the team's.
--
-- Members read their team's threads, messages and memories; only the server
-- writes them. The app works before this is applied: the Supercomputer keeps
-- its one-answer mode until then.

ALTER TABLE public.supercomputer_threads
  -- {model, effort, autoApproveUsd, brandKitId}: see src/lib/supercomputer/agent-settings.ts.
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(settings) = 'object'),
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

ALTER TABLE public.supercomputer_messages
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- streaming: being written; awaiting_approval: a tool call waits for a
-- person; stopped: stopped part-way by a person.
ALTER TABLE public.supercomputer_messages DROP CONSTRAINT IF EXISTS supercomputer_messages_status_check;
ALTER TABLE public.supercomputer_messages ADD CONSTRAINT supercomputer_messages_status_check
  CHECK (status IN ('complete', 'failed', 'streaming', 'awaiting_approval', 'stopped'));

CREATE INDEX IF NOT EXISTS supercomputer_messages_thread_live_idx
  ON public.supercomputer_messages (thread_id, created_at) WHERE superseded_at IS NULL;

DROP TRIGGER IF EXISTS supercomputer_messages_updated ON public.supercomputer_messages;
CREATE TRIGGER supercomputer_messages_updated BEFORE UPDATE ON public.supercomputer_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.supercomputer_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- personal: only its owner's conversations use it; team: everyone's do.
  scope text NOT NULL DEFAULT 'personal' CHECK (scope IN ('personal', 'team')),
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 600),
  -- The conversation it was learned in, if any.
  thread_id uuid REFERENCES public.supercomputer_threads(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supercomputer_memories_owner_idx
  ON public.supercomputer_memories (created_by, created_at DESC);

DROP TRIGGER IF EXISTS supercomputer_memories_updated ON public.supercomputer_memories;
CREATE TRIGGER supercomputer_memories_updated BEFORE UPDATE ON public.supercomputer_memories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON public.supercomputer_memories FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.supercomputer_memories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supercomputer_memories TO service_role;
ALTER TABLE public.supercomputer_memories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read their memories" ON public.supercomputer_memories;
CREATE POLICY "members read their memories" ON public.supercomputer_memories FOR SELECT TO authenticated
  USING (public.is_active_member() AND (scope = 'team' OR created_by = auth.uid()));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'supercomputer_messages') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.supercomputer_messages;
    END IF;
  END IF;
END $$;
