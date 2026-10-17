-- ============ CREATIVE STUDIO: API TOKENS FOR THE HEADLESS STUDIO API (additive, re-runnable) ============
-- The studio's API (and its MCP server) lets a script or an agent do what a
-- member does in the app, as that member: queue generations within the same
-- spending checks, start and steer long videos, build and render edits. Each
-- request carries a personal token made in Settings. Only a SHA-256 hash of a
-- token is kept; the token itself is shown once, when it is made.
-- The app works before this is applied: the API answers that it isn't set up.

CREATE TABLE IF NOT EXISTS public.api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  -- The token's first characters, to tell tokens apart (e.g. "xs_3fK9a").
  token_prefix text NOT NULL CHECK (char_length(token_prefix) BETWEEN 4 AND 16),
  -- SHA-256 of the whole token, hex. Never readable by members.
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  -- What the token may do: read; generate (spends credits); edit (edits and renders).
  scopes text[] NOT NULL DEFAULT ARRAY['read']::text[]
    CHECK (scopes <@ ARRAY['read', 'generate', 'edit']::text[] AND cardinality(scopes) >= 1),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_tokens_user_idx ON public.api_tokens (user_id, created_at DESC);

REVOKE ALL ON public.api_tokens FROM PUBLIC, anon, authenticated;
-- Members see their own tokens, but never a token's hash.
GRANT SELECT (id, user_id, name, token_prefix, scopes, last_used_at, expires_at, revoked_at, created_at)
  ON public.api_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_tokens TO service_role;
ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read their own api tokens" ON public.api_tokens;
CREATE POLICY "members read their own api tokens" ON public.api_tokens FOR SELECT TO authenticated
  USING (public.is_active_member() AND user_id = auth.uid());
