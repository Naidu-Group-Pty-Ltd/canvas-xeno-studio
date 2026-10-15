-- ============ CREATIVE STUDIO: KEYFRAME STARTS FENCED AGAINST REDOS (additive, re-runnable) ============
-- Each keyframe is painted from the one before, and a redo paints a keyframe
-- again under the run's lock. A step that read the storyboard before a redo
-- could still start the next keyframe (billed) from the frame the redo
-- replaced, or record clip requests as tried against it. These take the same
-- lock and check the storyboard is still as the step read it.

-- Claims a waiting keyframe to paint, while the run is going, the keyframe it
-- is painted from is still the attempt and image the step read, and no clip
-- requests kept at the start wait to be tried with the opening keyframe.
-- Outcome: claimed; taken (not waiting as read, or gone); stale (the one
-- before changed: read again); untried (kept clip requests come first); or
-- stopped (the run isn't going).
CREATE OR REPLACE FUNCTION public.claim_long_video_keyframe(
  p_keyframe_id uuid,
  p_attempt integer,
  p_previous_id uuid,
  p_previous_attempt integer,
  p_previous_asset_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_run uuid;
  v_position integer;
  v_status text;
  v_settings jsonb;
BEGIN
  SELECT long_video_id, position INTO v_run, v_position
    FROM public.long_video_keyframes WHERE id = p_keyframe_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'taken');
  END IF;
  SELECT status, keyframe_settings INTO v_status, v_settings
    FROM public.long_videos WHERE id = v_run FOR UPDATE;
  IF NOT FOUND OR v_status <> 'running' THEN
    RETURN jsonb_build_object('outcome', 'stopped');
  END IF;
  IF p_previous_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.long_video_keyframes
        WHERE id = p_previous_id AND long_video_id = v_run AND position = v_position - 1
          AND status = 'completed' AND attempt = p_previous_attempt
          AND asset_id IS NOT DISTINCT FROM p_previous_asset_id) THEN
    RETURN jsonb_build_object('outcome', 'stale');
  END IF;
  IF v_position > 0 AND jsonb_typeof(v_settings -> 'clipQuotes') = 'array'
     AND jsonb_array_length(v_settings -> 'clipQuotes') > 0 THEN
    RETURN jsonb_build_object('outcome', 'untried');
  END IF;
  UPDATE public.long_video_keyframes
     SET status = 'submitting', claimed_at = now(), error_code = NULL, error_message = NULL
   WHERE id = p_keyframe_id AND status = 'waiting' AND attempt = p_attempt;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'taken');
  END IF;
  RETURN jsonb_build_object('outcome', 'claimed');
END $$;
REVOKE ALL ON FUNCTION public.claim_long_video_keyframe(uuid, integer, uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_long_video_keyframe(uuid, integer, uuid, integer, uuid) TO service_role;

-- Records that the clip requests kept at the start were tried with the
-- opening keyframe, while the run is going and the opening keyframe is still
-- the attempt they were tried with. Refused (p_refusal): the run stops and the
-- requests stay (p_quotes, written back), so a run picked up again tries them
-- again first. Otherwise they're cleared.
-- Outcome: recorded; stale (the opening keyframe changed); or stopped.
CREATE OR REPLACE FUNCTION public.record_long_video_clip_try(
  p_run_id uuid,
  p_opening_attempt integer,
  p_quotes jsonb,
  p_refusal text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.long_videos WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND OR v_status <> 'running' THEN
    RETURN jsonb_build_object('outcome', 'stopped');
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM public.long_video_keyframes
        WHERE long_video_id = p_run_id AND position = 0
          AND status = 'completed' AND attempt = p_opening_attempt) THEN
    RETURN jsonb_build_object('outcome', 'stale');
  END IF;
  IF p_refusal IS NOT NULL THEN
    UPDATE public.long_videos
       SET status = 'needs_attention',
           error_code = 'CLIP_REFUSED',
           error_message = left(p_refusal, 2000),
           keyframe_settings = jsonb_set(coalesce(keyframe_settings, '{}'::jsonb), '{clipQuotes}',
                                         coalesce(p_quotes, '[]'::jsonb))
     WHERE id = p_run_id;
  ELSE
    UPDATE public.long_videos
       SET keyframe_settings = jsonb_set(coalesce(keyframe_settings, '{}'::jsonb), '{clipQuotes}', '[]'::jsonb)
     WHERE id = p_run_id;
  END IF;
  RETURN jsonb_build_object('outcome', 'recorded');
END $$;
REVOKE ALL ON FUNCTION public.record_long_video_clip_try(uuid, integer, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_long_video_clip_try(uuid, integer, jsonb, text) TO service_role;

-- As in 0011, and a keyframe isn't painted again while the one after it is
-- being painted from it (that one would be painted from the frame replaced).
CREATE OR REPLACE FUNCTION public.redo_long_video_keyframes(
  p_run_id uuid,
  p_keyframe_ids uuid[],
  p_target_id uuid,
  p_note text,
  p_confirm_uncertain boolean
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_first integer;
  v_last integer;
  v_count integer;
  v_clip integer;
  v_uncertain integer;
BEGIN
  SELECT status INTO v_status FROM public.long_videos WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'missing');
  END IF;
  IF v_status = 'canceled' THEN
    RETURN jsonb_build_object('outcome', 'stopped');
  END IF;
  PERFORM 1 FROM public.long_video_keyframes
   WHERE long_video_id = p_run_id AND id = ANY(p_keyframe_ids) FOR UPDATE;
  SELECT min(position), max(position), count(*) INTO v_first, v_last, v_count FROM public.long_video_keyframes
   WHERE long_video_id = p_run_id AND id = ANY(p_keyframe_ids);
  IF v_count = 0 OR v_count <> cardinality(p_keyframe_ids) THEN
    RETURN jsonb_build_object('outcome', 'missing');
  END IF;
  IF EXISTS (SELECT 1 FROM public.long_video_keyframes
              WHERE long_video_id = p_run_id AND id = ANY(p_keyframe_ids) AND provided) THEN
    RETURN jsonb_build_object('outcome', 'provided');
  END IF;
  SELECT position INTO v_clip FROM public.long_video_clips
   WHERE long_video_id = p_run_id
     AND position >= GREATEST(v_first - 1, 0)
     AND status IN ('submitting', 'generating', 'completed')
   ORDER BY position
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('outcome', 'started', 'position', v_clip);
  END IF;
  IF EXISTS (SELECT 1 FROM public.long_video_keyframes
              WHERE long_video_id = p_run_id
                AND (id = ANY(p_keyframe_ids) OR position = v_last + 1)
                AND status IN ('submitting', 'generating', 'sizing')) THEN
    RETURN jsonb_build_object('outcome', 'painting');
  END IF;
  IF NOT p_confirm_uncertain THEN
    SELECT position INTO v_uncertain FROM public.long_video_keyframes
     WHERE long_video_id = p_run_id AND id = ANY(p_keyframe_ids)
       AND status = 'failed' AND error_code = 'SUBMISSION_UNCERTAIN'
     ORDER BY position
     LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('outcome', 'uncertain', 'position', v_uncertain);
    END IF;
  END IF;

  UPDATE public.long_video_keyframes
     SET status = 'waiting',
         attempt = attempt + 1,
         generation_id = NULL,
         raw_asset_id = NULL,
         asset_id = NULL,
         size_task_id = NULL,
         size_attempts = 0,
         check_status = 'none',
         check_attempts = 0,
         check_claims = 0,
         check_result = NULL,
         check_claimed_at = NULL,
         checked_at = NULL,
         note = CASE WHEN id = p_target_id THEN left(btrim(coalesce(p_note, '')), 1000) ELSE note END,
         error_code = NULL,
         error_message = NULL,
         claimed_at = NULL,
         started_at = NULL,
         completed_at = NULL
   WHERE long_video_id = p_run_id AND id = ANY(p_keyframe_ids);
  UPDATE public.long_video_clips
     SET status = 'waiting', claimed_at = NULL, error_code = NULL, error_message = NULL
   WHERE long_video_id = p_run_id AND status = 'failed' AND error_code = 'KEYFRAME_MISSING';
  UPDATE public.long_videos
     SET storyboard_approved_at = NULL,
         storyboard_review = true,
         status = 'running',
         error_code = NULL,
         error_message = NULL,
         completed_at = NULL
   WHERE id = p_run_id;
  RETURN jsonb_build_object('outcome', 'redone');
END $$;
REVOKE ALL ON FUNCTION public.redo_long_video_keyframes(uuid, uuid[], uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redo_long_video_keyframes(uuid, uuid[], uuid, text, boolean) TO service_role;
