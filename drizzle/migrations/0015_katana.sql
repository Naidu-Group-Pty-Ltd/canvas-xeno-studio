-- ============ CREATIVE STUDIO: KATANA (additive, re-runnable) ============
-- Higgsfield's Katana video workflow, run from the studio. Katana is an agent
-- workflow served by Higgsfield's MCP server, so each run is a Claude Managed
-- Agents session that has the team's Higgsfield account attached. The studio
-- answers that session's paid calls itself (its credit guard), follows its
-- progress and saves the finished video to the library.
--
-- Server-only tables hold the Higgsfield sign-in and the Anthropic resource
-- IDs; members read runs, their progress, their spend and their results. Every
-- write goes through the server. Until this is applied the Katana page says
-- so and nothing else changes.

-- ---------- The team's Higgsfield sign-in (server only) ----------

-- One row: the account an admin connected in Settings. The studio is the only
-- party that refreshes it; Katana sessions get its current access token.
CREATE TABLE IF NOT EXISTS public.higgsfield_connections (
  id text PRIMARY KEY DEFAULT 'team' CHECK (id = 'team'),
  status text NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('connected', 'disconnected', 'error')),
  issuer text,
  token_endpoint text,
  revocation_endpoint text,
  client_id text,
  client_secret text,
  token_auth_method text NOT NULL DEFAULT 'none'
    CHECK (token_auth_method IN ('none', 'client_secret_basic', 'client_secret_post')),
  scope text,
  access_token text,
  refresh_token text,
  -- Null when Higgsfield gave no lifetime.
  expires_at timestamptz,
  account_email text,
  account_name text,
  account_subject text,
  connected_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  connected_at timestamptz,
  -- Held while one request refreshes, so two never spend the refresh token at once.
  refresh_claimed_until timestamptz,
  last_refreshed_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The OAuth clients the studio registered with Higgsfield's sign-in, one per
-- callback address.
CREATE TABLE IF NOT EXISTS public.higgsfield_oauth_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer text NOT NULL,
  redirect_uri text NOT NULL,
  client_id text NOT NULL,
  client_secret text,
  token_auth_method text NOT NULL DEFAULT 'none'
    CHECK (token_auth_method IN ('none', 'client_secret_basic', 'client_secret_post')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, redirect_uri)
);

-- Sign-ins in flight: the PKCE verifier for each state, used once.
CREATE TABLE IF NOT EXISTS public.higgsfield_oauth_states (
  state text PRIMARY KEY CHECK (char_length(state) BETWEEN 16 AND 128),
  code_verifier text NOT NULL,
  issuer text NOT NULL,
  client_id text NOT NULL,
  redirect_uri text NOT NULL,
  -- Where the admin is sent back to afterwards (an allowed studio origin).
  return_origin text NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS higgsfield_oauth_states_expires_idx ON public.higgsfield_oauth_states (expires_at);

-- The Managed Agents resources Katana runs on: the agent (and the version its
-- configuration was saved as), the environment, and the vault holding the
-- Higgsfield credential.
CREATE TABLE IF NOT EXISTS public.katana_setup (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  agent_id text,
  agent_version integer,
  config_hash text,
  environment_id text,
  vault_id text,
  credential_id text,
  -- The expiry of the access token the credential holds now.
  credential_expires_at timestamptz,
  credential_synced_at timestamptz,
  -- Held while one request creates or updates these, so two never race.
  claimed_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['higgsfield_connections', 'higgsfield_oauth_clients', 'higgsfield_oauth_states', 'katana_setup'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ---------- Runs ----------

CREATE TABLE IF NOT EXISTS public.katana_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  -- A revision started in a new session from an earlier run's saved state.
  parent_run_id uuid REFERENCES public.katana_runs(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '' CHECK (char_length(title) <= 120),
  -- remix: a reference edit remade for the subject; preset: a published
  -- Katana preset; edit: the user's own footage edited to their brief.
  mode text NOT NULL CHECK (mode IN ('remix', 'preset', 'edit')),
  preset_slug text CHECK (preset_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(preset_slug) <= 128),
  preset_name text CHECK (char_length(preset_name) <= 200),
  brief text NOT NULL DEFAULT '' CHECK (char_length(brief) <= 4000),
  reference_url text CHECK (char_length(reference_url) <= 2048),
  -- [{asset_id, field, kind, title, media_id}]: the library media handed to Katana.
  inputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Higgsfield credits the run may commit (the guard's cap) and has committed.
  credit_limit numeric(12, 3) NOT NULL CHECK (credit_limit > 0 AND credit_limit <= 100000),
  credits_reserved numeric(12, 3) NOT NULL DEFAULT 0 CHECK (credits_reserved >= 0),
  -- The Claude session's spend cap and its list cost so far, in US cents.
  claude_budget_cents integer NOT NULL CHECK (claude_budget_cents BETWEEN 100 AND 100000),
  claude_cost_cents integer NOT NULL DEFAULT 0 CHECK (claude_cost_cents >= 0),
  -- The account's credit balance when the run started and when it settled.
  balance_start numeric(14, 3),
  balance_end numeric(14, 3),
  status text NOT NULL DEFAULT 'preparing'
    CHECK (status IN ('preparing', 'starting', 'running', 'waiting', 'idle', 'delivered',
                      'paused', 'uncertain', 'failed', 'cancelled')),
  status_detail text CHECK (char_length(status_detail) <= 1000),
  session_id text UNIQUE CHECK (char_length(session_id) <= 100),
  agent_version integer,
  -- Where reading the session's events got to: the last event's time and the
  -- events already handled at exactly that time.
  last_event_at timestamptz,
  boundary_event_ids text[] NOT NULL DEFAULT '{}',
  -- Held while one request reads the session, so a page, the tick and a
  -- webhook never answer the same call twice.
  sync_lease_until timestamptz,
  synced_at timestamptz,
  -- Katana's own resume line (its saved state), for a revision in a new session.
  resume_line text CHECK (char_length(resume_line) <= 4000),
  -- Media IDs Katana reported with their URLs, to find the final video's file.
  known_media jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Katana's last message.
  summary text CHECK (char_length(summary) <= 8000),
  error text CHECK (char_length(error) <= 2000),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (mode <> 'preset' OR preset_slug IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS katana_runs_created_idx ON public.katana_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS katana_runs_status_idx ON public.katana_runs (status);

DROP TRIGGER IF EXISTS katana_runs_set_updated_at ON public.katana_runs;
CREATE TRIGGER katana_runs_set_updated_at BEFORE UPDATE ON public.katana_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- A run's progress, as the studio shows it: Katana's messages, the steps it
-- took, the guard's decisions, and what the studio did.
CREATE TABLE IF NOT EXISTS public.katana_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.katana_runs(id) ON DELETE CASCADE,
  -- The session event it came from (so a re-read never repeats it).
  source_id text CHECK (char_length(source_id) <= 100),
  kind text NOT NULL CHECK (kind IN ('message', 'step', 'credit', 'status', 'error', 'result', 'user', 'note')),
  title text NOT NULL DEFAULT '' CHECK (char_length(title) <= 200),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 8000),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, source_id)
);
CREATE INDEX IF NOT EXISTS katana_run_events_run_idx ON public.katana_run_events (run_id, occurred_at);

-- Every paid call a run asked for, and the guard's answer: the credits it was
-- priced at (from Higgsfield's own quote for those exact settings) and the
-- jobs it made.
CREATE TABLE IF NOT EXISTS public.katana_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.katana_runs(id) ON DELETE CASCADE,
  -- The session event that asked (sevt_...).
  tool_use_id text NOT NULL CHECK (char_length(tool_use_id) <= 100),
  tool_name text NOT NULL CHECK (char_length(tool_name) <= 100),
  decision text NOT NULL CHECK (decision IN ('allowed', 'denied')),
  credits numeric(12, 3) NOT NULL DEFAULT 0 CHECK (credits >= 0),
  -- False when the call has no quote and a set estimate was used.
  priced boolean NOT NULL DEFAULT true,
  reason text CHECK (char_length(reason) <= 1000),
  -- [{index, model, credits}] for each job the call asked for.
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  job_ids text[] NOT NULL DEFAULT '{}',
  -- When the answer reached the session (null: still to send).
  sent_at timestamptz,
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, tool_use_id)
);
CREATE INDEX IF NOT EXISTS katana_spend_decided_idx ON public.katana_spend (decided_at DESC);

-- The finished videos a run delivered (a revision adds another), and their
-- copies in the library.
CREATE TABLE IF NOT EXISTS public.katana_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.katana_runs(id) ON DELETE CASCADE,
  media_id text NOT NULL CHECK (char_length(media_id) <= 100),
  url text CHECK (char_length(url) <= 4000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'saving', 'saved', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  -- Held while one request saves it.
  claimed_until timestamptz,
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  error text CHECK (char_length(error) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, media_id)
);

DROP TRIGGER IF EXISTS katana_results_set_updated_at ON public.katana_results;
CREATE TRIGGER katana_results_set_updated_at BEFORE UPDATE ON public.katana_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Access: members read runs; the server writes ----------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['katana_runs', 'katana_run_events', 'katana_spend', 'katana_results'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "members read %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "members read %s" ON public.%I FOR SELECT TO authenticated USING (public.is_active_member())', t, t);
  END LOOP;
END $$;

-- ---------- The Katana tick ----------

-- Katana stops at every paid call until the studio answers, so while a run is
-- going the studio checks on it every minute (the route then keeps checking for
-- most of that minute). With nothing going, no call is made at all.
CREATE OR REPLACE FUNCTION app_private.call_katana_tick()
 RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare
  v_secret text;
  v_base text := 'https://project--2a4921ec-3e39-43b5-8d85-e5ba53b7eb5e-dev.lovable.app';
  v_headers jsonb;
begin
  if not exists (
    select 1 from public.katana_runs
    where status in ('preparing', 'starting', 'running', 'waiting', 'uncertain')
  ) and not exists (
    select 1 from public.katana_results where status in ('pending', 'failed') and attempts < 5
  ) then
    return null;
  end if;
  select value into v_secret from app_private.cron_secrets where name = 'LOVABLE_CRON_SECRET';
  if v_secret is null or v_secret = '' then raise exception 'cron secret missing'; end if;
  v_headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_secret);
  return net.http_post(url := v_base || '/api/public/katana-tick', headers := v_headers, body := '{}'::jsonb, timeout_milliseconds := 65000);
end;
$function$;
REVOKE ALL ON FUNCTION app_private.call_katana_tick() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'xeno-katana-tick';
  PERFORM cron.schedule('xeno-katana-tick', '* * * * *', 'select app_private.call_katana_tick();');
END $$;

-- ---------- Settings and the page's flag ----------

INSERT INTO public.app_settings (key, value) VALUES
  ('katana_model', '"claude-opus-5-5"'::jsonb),
  ('katana_effort', '"high"'::jsonb),
  ('katana_default_credit_limit', '300'::jsonb),
  ('katana_max_credit_limit', '3000'::jsonb),
  ('katana_default_claude_budget_usd', '25'::jsonb),
  ('katana_remove_background_credits', '2'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.feature_flags (key, label, description, enabled) VALUES
  ('v2_katana', 'Katana', 'Higgsfield''s Katana video workflow: reference remixes, presets and footage edits', true)
ON CONFLICT (key) DO NOTHING;
