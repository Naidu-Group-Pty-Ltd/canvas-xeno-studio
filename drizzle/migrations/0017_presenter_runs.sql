-- ============ CREATIVE STUDIO: PRESENTER RUNS, LIP CHECKS, TAKES, SPENDING AND RETRIES (additive, re-runnable) ============
-- What a presenter video made to a voiceover needed and a run couldn't say
-- (from the Aurixa "Janice presents" job, done by hand in the database):
--   - clips started from one approved still rather than each from the last
--     frame of the one before (a likeness drifts within three hops);
--   - stretches of the voiceover covered by B-roll, which no clip is made for;
--   - each clip's lips scored from its picture (SyncNet), and several takes of
--     a clip kept so the best can be used;
--   - a spending cap for work with no project or campaign, provider failures
--     that cost nothing tried again on their own, and runs moved on every
--     minute instead of every five.
-- The app works before this is applied: a run uses these only when asked to.

-- ---------- A run may be a single clip ----------
-- A video made to a voiceover can be one clip (its piece is the whole
-- voiceover, or the presenter's one stretch between cutaways).
DO $$
DECLARE
  v_name text;
BEGIN
  FOR v_name IN
    SELECT con.conname FROM pg_constraint con
    WHERE con.conrelid = 'public.long_videos'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%clip_count%'
      AND con.conname <> 'long_videos_clip_count_range'
  LOOP
    EXECUTE format('ALTER TABLE public.long_videos DROP CONSTRAINT %I', v_name);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'long_videos_clip_count_range') THEN
    ALTER TABLE public.long_videos ADD CONSTRAINT long_videos_clip_count_range
      CHECK (clip_count BETWEEN 1 AND 40);
  END IF;
END $$;

-- ---------- Where clips start from ----------
-- chain: each clip starts from the frame the clip before is cut on (one
-- continuous shot); anchor: every clip starts from the run's anchor frame (the
-- approved still), so a likeness never drifts and clips can be made side by
-- side. In a chain, a clip after a cutaway starts from the anchor too. A
-- clip's own start frame (start_frame_override_asset_id), when a person chose
-- one, wins over both.
ALTER TABLE public.long_videos
  ADD COLUMN IF NOT EXISTS start_from text NOT NULL DEFAULT 'chain'
    CHECK (start_from IN ('chain', 'anchor')),
  ADD COLUMN IF NOT EXISTS anchor_frame_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  -- Quality checks and takes: {lip_check: bool, takes: 1-4, flag_below: number, redo_below: number}.
  ADD COLUMN IF NOT EXISTS qc_settings jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(qc_settings) = 'object'),
  -- The B-roll chosen for each cutaway, in order: [{asset_id, kind, in_point, label} | null].
  ADD COLUMN IF NOT EXISTS cutaway_fills jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(cutaway_fills) = 'array'),
  -- What the whole run was estimated to cost when it started (its clips and their takes).
  ADD COLUMN IF NOT EXISTS estimated_cost_usd numeric CHECK (estimated_cost_usd IS NULL OR estimated_cost_usd >= 0);

-- A clip a person holds is skipped until released (the run waits at it); a
-- clip's own start frame; and its lips scored from its picture:
--   none: not scored (or the run doesn't score lips);
--   checking: with the media service (lip_check);
--   scored: lip_score is SyncNet's confidence at its best offset,
--     lip_score_at_zero where the clip sits, lip_offset_frames that offset (at
--     25 fps; negative: the lips lead the sound);
--   unscored: there was no face, or no speech, to score;
--   failed: the media service couldn't score it after several tries;
--   skipped: the media service can't score lips.
ALTER TABLE public.long_video_clips
  ADD COLUMN IF NOT EXISTS held boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS start_frame_override_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lip_status text NOT NULL DEFAULT 'none'
    CHECK (lip_status IN ('none', 'checking', 'scored', 'unscored', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS lip_task_id uuid REFERENCES public.media_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lip_attempts integer NOT NULL DEFAULT 0 CHECK (lip_attempts >= 0),
  ADD COLUMN IF NOT EXISTS lip_score numeric,
  ADD COLUMN IF NOT EXISTS lip_score_at_zero numeric,
  ADD COLUMN IF NOT EXISTS lip_offset_frames integer,
  ADD COLUMN IF NOT EXISTS lip_result jsonb CHECK (lip_result IS NULL OR jsonb_typeof(lip_result) = 'object'),
  ADD COLUMN IF NOT EXISTS lip_checked_at timestamptz;
CREATE INDEX IF NOT EXISTS long_video_clips_lip_task_idx ON public.long_video_clips (lip_task_id);

-- ---------- Takes ----------
-- Every attempt at a clip that came back is kept as a take, with what was
-- measured of it, so a better one can be swapped in (the clip's own row is
-- always the take in use). Written by the server only.
CREATE TABLE IF NOT EXISTS public.long_video_clip_takes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  long_video_id uuid NOT NULL REFERENCES public.long_videos(id) ON DELETE CASCADE,
  clip_id uuid NOT NULL REFERENCES public.long_video_clips(id) ON DELETE CASCADE,
  attempt integer NOT NULL CHECK (attempt >= 1),
  generation_id uuid REFERENCES public.generations(id) ON DELETE SET NULL,
  output_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  start_frame_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  -- The clip's measured facts for this take, as its row had them ({output_*,
  -- sync_*, lip_*, check_*, handoff_*}), so swapping it back in restores them.
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(snapshot) = 'object'),
  lip_score numeric,
  -- Why it was made: the first try, a person's redo, or one of several taken for the best.
  reason text NOT NULL DEFAULT 'take' CHECK (reason IN ('take', 'redo', 'best_of')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clip_id, attempt)
);
CREATE INDEX IF NOT EXISTS long_video_clip_takes_run_idx ON public.long_video_clip_takes (long_video_id);

REVOKE ALL ON public.long_video_clip_takes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.long_video_clip_takes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.long_video_clip_takes TO service_role;
ALTER TABLE public.long_video_clip_takes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read long video clip takes" ON public.long_video_clip_takes;
CREATE POLICY "members read long video clip takes" ON public.long_video_clip_takes FOR SELECT TO authenticated
  USING (public.is_active_member());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'long_video_clip_takes') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.long_video_clip_takes;
    END IF;
  END IF;
END $$;

-- ---------- Provider failures that cost nothing, tried again ----------
-- A request Higgsfield turned away for a moment (rate limited, a model
-- temporarily unavailable or overloaded) was never charged: it goes back in
-- the queue on its own, a few minutes later each time, up to three times.
-- Nothing whose outcome is uncertain is ever sent again on its own.
ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS auto_retries integer NOT NULL DEFAULT 0 CHECK (auto_retries >= 0),
  ADD COLUMN IF NOT EXISTS retry_after timestamptz;
CREATE INDEX IF NOT EXISTS generations_local_queue_idx
  ON public.generations (created_at) WHERE status = 'local_queued';

-- ---------- A spending cap for work with no project or campaign ----------
-- An admin sets member_monthly_cap_usd (a number of dollars, or null for none)
-- in app_settings. Each member's generations this calendar month with neither
-- a project nor a campaign count towards it, at what they cost (or were
-- estimated to). Checked under a lock per member, so two submissions at once
-- can't together pass it. Called by the server only.
CREATE OR REPLACE FUNCTION public.check_member_spend_allowance(_user_id uuid, _amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_cap numeric;
  v_spent numeric;
  v_setting jsonb;
BEGIN
  SELECT value INTO v_setting FROM public.app_settings WHERE key = 'member_monthly_cap_usd';
  IF v_setting IS NULL OR jsonb_typeof(v_setting) <> 'number' THEN
    RETURN jsonb_build_object('allowed', true, 'warning', NULL, 'cap', NULL);
  END IF;
  v_cap := (v_setting #>> '{}')::numeric;
  IF v_cap IS NULL OR v_cap <= 0 THEN
    RETURN jsonb_build_object('allowed', true, 'warning', NULL, 'cap', NULL);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('member_spend:' || _user_id::text));
  SELECT COALESCE(SUM(COALESCE(actual_cost_usd, estimated_cost_usd, 0)), 0) INTO v_spent
  FROM public.generations
  WHERE user_id = _user_id
    AND project_id IS NULL
    AND campaign_id IS NULL
    AND created_at >= date_trunc('month', now())
    AND status::text NOT IN ('failed', 'canceled', 'draft', 'nsfw');
  IF v_spent + COALESCE(_amount, 0) > v_cap THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'cap', v_cap,
      'spent', round(v_spent, 4),
      'message', format(
        'This would take your spending this month on work outside any project or campaign past the $%s cap ($%s spent). Put it in a project, or ask an admin to raise the cap.',
        to_char(v_cap, 'FM999999990.00'), to_char(v_spent, 'FM999999990.00')));
  END IF;
  RETURN jsonb_build_object(
    'allowed', true,
    'cap', v_cap,
    'spent', round(v_spent, 4),
    'warning', CASE WHEN v_spent + COALESCE(_amount, 0) > v_cap * 0.8
      THEN format('Over 80%% of your $%s monthly cap for work outside a project is used.', to_char(v_cap, 'FM999999990.00'))
      ELSE NULL END);
END;
$function$;
REVOKE ALL ON FUNCTION public.check_member_spend_allowance(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_member_spend_allowance(uuid, numeric) TO service_role;

-- ---------- Runs moved on every minute ----------
-- A run's next step waits on events (a webhook, the media service's callback)
-- and, where none comes or a step needs a minute (an identity check), on the
-- reconcile job every five minutes. While a run is going, this tick calls
-- every minute (the route keeps moving runs for most of it); with none going,
-- no call is made. Same site as the reconcile job, which already moves runs.
CREATE OR REPLACE FUNCTION app_private.call_long_video_tick()
 RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare
  v_secret text;
  v_base text := 'https://project--2a4921ec-3e39-43b5-8d85-e5ba53b7eb5e-dev.lovable.app';
  v_headers jsonb;
begin
  if not exists (select 1 from public.long_videos where status = 'running')
    and not exists (select 1 from public.long_video_clips where status in ('submitting', 'generating'))
    and not exists (
      select 1 from public.generations
      where status = 'local_queued' and (retry_after is null or retry_after <= now())
    ) then
    return null;
  end if;
  select value into v_secret from app_private.cron_secrets where name = 'LOVABLE_CRON_SECRET';
  if v_secret is null or v_secret = '' then raise exception 'cron secret missing'; end if;
  v_headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_secret);
  return net.http_post(url := v_base || '/api/public/long-video-tick', headers := v_headers, body := '{}'::jsonb, timeout_milliseconds := 65000);
end;
$function$;
REVOKE ALL ON FUNCTION app_private.call_long_video_tick() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'xeno-long-video-tick';
  PERFORM cron.schedule('xeno-long-video-tick', '* * * * *', 'select app_private.call_long_video_tick();');
END $$;
