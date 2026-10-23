-- Migration 0037_work_journal, as the live database will run it (scripts/db/scratch.sh builds the
-- database and runs this): holds that lapse and can be taken over, saves that are kept whole or
-- not at all and kept once, the record's versions and conflicts, the plan's changes, files kept
-- by version from parts already stored, links, and who may read and write.

-- Two members (handle_new_user makes the first an admin, and since 0007_team_invitations a
-- later account waits to be let in: the second is let in here) and a work.
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'one@example.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'two@example.test');
UPDATE public.profiles SET is_active = true WHERE id = '00000000-0000-4000-8000-0000000000a2';
INSERT INTO public.works (id, title, goal, created_by)
  VALUES ('00000000-0000-4000-8000-0000000000f1', 'Reel 2', 'A sixty-second reel', '00000000-0000-4000-8000-0000000000a1');

-- RFC 7386's own examples.
DO $$
BEGIN
  ASSERT public.work_merge_patch('{"a":"b"}', '{"a":"c"}') = '{"a":"c"}', 'replaces a value';
  ASSERT public.work_merge_patch('{"a":"b"}', '{"b":"c"}') = '{"a":"b","b":"c"}', 'adds a key';
  ASSERT public.work_merge_patch('{"a":"b"}', '{"a":null}') = '{}', 'null removes a key';
  ASSERT public.work_merge_patch('{"a":"b","b":"c"}', '{"a":null}') = '{"b":"c"}', 'removes only that key';
  ASSERT public.work_merge_patch('{"a":["b"]}', '{"a":"c"}') = '{"a":"c"}', 'an array is replaced';
  ASSERT public.work_merge_patch('{"a":"c"}', '{"a":["b"]}') = '{"a":["b"]}', 'by an array too';
  ASSERT public.work_merge_patch('{"a":{"b":"c"}}', '{"a":{"b":"d","c":null}}') = '{"a":{"b":"d"}}', 'objects merge';
  ASSERT public.work_merge_patch('{"a":[{"b":"c"}]}', '{"a":[1]}') = '{"a":[1]}', 'arrays never merge';
  ASSERT public.work_merge_patch('{"e":null}', '{"a":1}') = '{"a":1,"e":null}', 'a stored null stays';
  ASSERT public.work_merge_patch('[1,2]', '{"a":"b","c":null}') = '{"a":"b"}', 'a patch object replaces a non-object';
  ASSERT public.work_merge_patch('{}', '{"a":{"bb":{"ccc":null}}}') = '{"a":{"bb":{}}}', 'nested null on nothing';
END $$;

-- The plan: added, changed by what a change names, removed; a status it doesn't know is refused.
DO $$
DECLARE
  v jsonb;
BEGIN
  v := public.work_merge_steps('[]', '[{"key":"plates","title":"Make the plates"},{"key":"animatic"}]');
  ASSERT jsonb_array_length(v) = 2, 'two steps added';
  ASSERT v -> 0 ->> 'status' = 'todo' AND v -> 0 ->> 'title' = 'Make the plates', 'added to do, with its title';
  ASSERT v -> 1 ->> 'title' = 'animatic', 'a step with no title is called by its key';
  v := public.work_merge_steps(v, '[{"key":"plates","status":"done","note":"11 of 11"}]');
  ASSERT v -> 0 ->> 'status' = 'done' AND v -> 0 ->> 'note' = '11 of 11' AND v -> 0 ->> 'title' = 'Make the plates',
    'a change touches only what it names';
  v := public.work_merge_steps(v, '[{"key":"plates","remove":true},{"key":"ghost","remove":true}]');
  ASSERT jsonb_array_length(v) = 1 AND v -> 0 ->> 'key' = 'animatic', 'removed (and removing nothing is nothing)';
  BEGIN
    PERFORM public.work_merge_steps(v, '[{"key":"animatic","status":"finished"}]');
    RAISE EXCEPTION 'an unknown status was taken';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.work_merge_steps(v, '[{"title":"no key"}]');
    RAISE EXCEPTION 'a change without a key was taken';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- Holds: given, renewed without a word, refused to another while live, taken over when asked,
-- taken up once it lapses; let go only by their holder.
DO $$
DECLARE
  w uuid := '00000000-0000-4000-8000-0000000000f1';
  one uuid := '00000000-0000-4000-8000-0000000000a1';
  r jsonb;
  before integer;
BEGIN
  r := public.work_claim(w, 'claude-code:s1', 'Claude Code session s1', 'claude_code', one, 900, false);
  ASSERT (r ->> 'claimed')::boolean, 'a free work is claimed';
  ASSERT (SELECT count(*) FROM public.work_journal WHERE work_id = w AND kind = 'claim') = 1, 'its claim is in the journal';
  ASSERT (SELECT entries FROM public.works WHERE id = w) = 1, 'and counted';
  SELECT entries INTO before FROM public.works WHERE id = w;
  r := public.work_claim(w, 'claude-code:s1', 'Claude Code session s1', 'claude_code', one, 900, false);
  ASSERT (r ->> 'claimed')::boolean, 'its holder renews it';
  ASSERT (SELECT entries FROM public.works WHERE id = w) = before, 'a renewal writes nothing';
  r := public.work_claim(w, 'supercomputer:t1', 'Supercomputer', 'supercomputer', one, 900, false);
  ASSERT NOT (r ->> 'claimed')::boolean AND r ->> 'holder' = 'claude-code:s1', 'another is told who holds it';
  r := public.work_claim(w, 'supercomputer:t1', 'Supercomputer', 'supercomputer', one, 900, true);
  ASSERT (r ->> 'claimed')::boolean AND (r ->> 'tookOver')::boolean, 'taken over when asked';
  ASSERT (SELECT summary FROM public.work_journal WHERE work_id = w AND kind = 'takeover') LIKE 'Taken over from Claude Code session s1%',
    'the takeover says from whom';
  UPDATE public.works SET lease_expires_at = now() - interval '1 minute' WHERE id = w;
  r := public.work_claim(w, 'claude-code:s2', 'Claude Code session s2', 'claude_code', one, 900, false);
  ASSERT (r ->> 'claimed')::boolean AND NOT (r ->> 'tookOver')::boolean, 'a lapsed hold is free';
  ASSERT (SELECT summary FROM public.work_journal WHERE work_id = w ORDER BY n DESC LIMIT 1) LIKE 'Picked up: Supercomputer had stopped renewing%',
    'and the journal says the last holder had stopped';
  r := public.work_release(w, 'claude-code:s1', 'claude_code', 'Claude Code session s1', one, NULL);
  ASSERT NOT (r ->> 'released')::boolean, 'only its holder lets it go';
  r := public.work_release(w, 'claude-code:s2', 'claude_code', 'Claude Code session s2', one, 'Done for today.');
  ASSERT (r ->> 'released')::boolean, 'its holder lets it go';
  ASSERT (SELECT holder IS NULL AND lease_expires_at IS NULL FROM public.works WHERE id = w), 'and it is free';
  ASSERT (SELECT summary FROM public.work_journal WHERE work_id = w ORDER BY n DESC LIMIT 1) = 'Done for today.', 'in its words';
  -- A paused work picked up is active again.
  UPDATE public.works SET status = 'paused' WHERE id = w;
  r := public.work_claim(w, 'claude-code:s3', 'Claude Code session s3', 'claude_code', one, 60, false);
  ASSERT (SELECT status FROM public.works WHERE id = w) = 'active', 'picked up, it is active';
  ASSERT (SELECT summary FROM public.work_journal WHERE work_id = w ORDER BY n DESC LIMIT 1) LIKE '%It was paused; it is active again.',
    'and the journal says so';
  ASSERT (SELECT lease_expires_at > now() + interval '50 seconds' AND lease_expires_at < now() + interval '70 seconds' FROM public.works WHERE id = w),
    'held for the seconds asked';
  r := public.work_claim(w, 'claude-code:s4', 'x', 'claude_code', one, 1, true);
  ASSERT (SELECT lease_expires_at > now() + interval '55 seconds' FROM public.works WHERE id = w), 'never for less than a minute';
  -- A heartbeat renews its own hold and takes up nothing else.
  SELECT entries INTO before FROM public.works WHERE id = w;
  r := public.work_claim(w, 'claude-code:s5', 'x', 'claude_code', one, 900, false, true);
  ASSERT NOT (r ->> 'claimed')::boolean AND (r ->> 'renewOnly')::boolean AND r ->> 'holder' = 'claude-code:s4',
    'a heartbeat never takes another session''s hold';
  UPDATE public.works SET lease_expires_at = now() - interval '1 minute' WHERE id = w;
  r := public.work_claim(w, 'claude-code:s4', 'x', 'claude_code', one, 900, false, true);
  ASSERT (r ->> 'claimed')::boolean AND (SELECT lease_expires_at > now() + interval '14 minutes' FROM public.works WHERE id = w),
    'its own hold, lapsed but not taken, is renewed';
  PERFORM public.work_release(w, 'claude-code:s4', 'claude_code', 'x', one, NULL);
  SELECT entries INTO before FROM public.works WHERE id = w;
  r := public.work_claim(w, 'claude-code:s4', 'x', 'claude_code', one, 900, false, true);
  ASSERT NOT (r ->> 'claimed')::boolean AND (SELECT holder IS NULL FROM public.works WHERE id = w),
    'and a work let go is not taken up again by one';
  ASSERT (SELECT entries FROM public.works WHERE id = w) = before, 'writing nothing';
  ASSERT (public.work_claim('00000000-0000-4000-8000-00000000dead', 'x', 'x', 'script', one) ->> 'found')::boolean = false,
    'no such work';
END $$;

-- Saves: an entry and what it changes, kept once; the record versioned, a stale change refused
-- with nothing written; the plan; a finished work let go.
DO $$
DECLARE
  w uuid := '00000000-0000-4000-8000-0000000000f1';
  two uuid := '00000000-0000-4000-8000-0000000000a2';
  r jsonb;
  entries_before integer;
BEGIN
  r := public.work_save(w,
    '{"kind":"save","summary":"Plates made","next_steps":["Animatic"],"decisions":[{"what":"9:16","why":"Reels"}],"actor_kind":"claude_code","actor_session":"s4","actor_label":"Claude Code s4","client_request_id":"save-plates-1","code":{"commit":"abc123","branch":"main"}}',
    two, '{"shots":{"P":{"take":3}}}', 0,
    '[{"key":"plates","title":"Plates","status":"done"}]', NULL, NULL, NULL, 'claude-code:s4', 900);
  ASSERT (r ->> 'found')::boolean AND NOT (r ->> 'duplicate')::boolean, 'saved';
  ASSERT (r ->> 'stateVersion')::integer = 1 AND (r ->> 'stateChanged')::boolean, 'the record is at version 1';
  ASSERT (SELECT state #>> '{shots,P,take}' FROM public.works WHERE id = w) = '3', 'with the change in it';
  ASSERT (SELECT last_summary FROM public.works WHERE id = w) = 'Plates made', 'its summary is the latest';
  ASSERT (SELECT next_steps FROM public.works WHERE id = w) = '["Animatic"]', 'and its next steps';
  ASSERT (SELECT code ->> 'commit' FROM public.works WHERE id = w) = 'abc123', 'and the code it ran on';
  ASSERT (SELECT steps -> 0 ->> 'status' FROM public.works WHERE id = w) = 'done', 'the plan changed';
  ASSERT r ->> 'hold' = 'held', 'its saver holds it (s4 had it)';

  SELECT entries INTO entries_before FROM public.works WHERE id = w;
  r := public.work_save(w, '{"kind":"save","summary":"Plates made","actor_kind":"claude_code","client_request_id":"save-plates-1"}',
    two, '{"shots":{"P":{"take":4}}}', 0, NULL, NULL, NULL, NULL, NULL, 900);
  ASSERT (r ->> 'duplicate')::boolean AND (r ->> 'stateVersion')::integer = 1, 'the same request is kept once';
  ASSERT (SELECT entries FROM public.works WHERE id = w) = entries_before, 'nothing more written';
  ASSERT (SELECT state #>> '{shots,P,take}' FROM public.works WHERE id = w) = '3', 'nor changed';

  r := public.work_save(w, '{"kind":"save","summary":"From an old copy","actor_kind":"claude_code","client_request_id":"stale-1"}',
    two, '{"shots":{"P":{"take":5}}}', 0, NULL, NULL, NULL, NULL, NULL, 900);
  ASSERT (r ->> 'conflict')::boolean AND (r ->> 'stateVersion')::integer = 1, 'a change made from version 0 is refused';
  ASSERT (SELECT entries FROM public.works WHERE id = w) = entries_before, 'with nothing written';

  r := public.work_save(w, '{"kind":"auto","summary":"","actor_kind":"claude_code"}',
    two, '{"shots":{"P":{"take":3}}}', NULL, NULL, NULL, NULL, NULL, NULL, 900);
  ASSERT NOT (r ->> 'stateChanged')::boolean AND (r ->> 'stateVersion')::integer = 1, 'a change to the same value is no new version';
  ASSERT (SELECT last_summary FROM public.works WHERE id = w) = 'Plates made', 'an automatic save leaves the summary';
  ASSERT (SELECT next_steps FROM public.works WHERE id = w) = '["Animatic"]', 'and the next steps it didn''t give';

  r := public.work_save(w, '{"kind":"save","summary":"Another session''s","actor_kind":"supercomputer","actor_session":"t9"}',
    two, NULL, NULL, NULL, NULL, NULL, NULL, 'supercomputer:t9', 900);
  ASSERT r ->> 'hold' = 'held_by_other' AND r ->> 'holder' = 'claude-code:s4', 'a save while another holds it is kept, and says who does';
  ASSERT (SELECT holder FROM public.works WHERE id = w) = 'claude-code:s4', 'the hold stays';

  r := public.work_save(w, '{"kind":"status","summary":"Delivered","actor_kind":"person"}',
    two, NULL, NULL, NULL, NULL, NULL, '{"status":"done","title":"Reel 2 (delivered)"}', NULL, 900);
  ASSERT (SELECT status = 'done' AND finished_at IS NOT NULL AND holder IS NULL AND title = 'Reel 2 (delivered)' FROM public.works WHERE id = w),
    'done: finished, let go and renamed';
  ASSERT r ->> 'hold' = 'released', 'its hold let go';
  r := public.work_save(w, '{"kind":"status","summary":"","actor_kind":"person"}', two, NULL, NULL, NULL, NULL, NULL, '{"status":"active"}', NULL, 900);
  ASSERT (SELECT finished_at IS NULL FROM public.works WHERE id = w), 'reopened, not finished';
  BEGIN
    PERFORM public.work_save(w, '{"kind":"status","actor_kind":"person"}', two, NULL, NULL, NULL, NULL, NULL, '{"status":"finished"}', NULL, 900);
    RAISE EXCEPTION 'an unknown status was taken';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  ASSERT (public.work_save('00000000-0000-4000-8000-00000000dead', '{"actor_kind":"script"}', two) ->> 'found')::boolean = false, 'no such work';
END $$;

-- Files: kept from parts already stored, each change a new version, an unchanged file not kept
-- again, a deletion a version of its own; a part not yet stored, or parts that don't add up, refuse
-- the whole save.
DO $$
DECLARE
  w uuid := '00000000-0000-4000-8000-0000000000f1';
  two uuid := '00000000-0000-4000-8000-0000000000a2';
  a text := repeat('a', 64);
  b text := repeat('b', 64);
  c text := repeat('c', 64);
  r jsonb;
  entries_before integer;
BEGIN
  INSERT INTO public.work_blobs (work_id, sha256, size, storage_path, status)
    VALUES (w, a, 10, w || '/aa/' || a, 'pending');
  SELECT entries INTO entries_before FROM public.works WHERE id = w;
  BEGIN
    PERFORM public.work_save(w, '{"kind":"save","summary":"x","actor_kind":"claude_code"}', two, NULL, NULL, NULL,
      jsonb_build_array(jsonb_build_object('path', 'renders/film.mp4', 'sha256', a, 'size', 10, 'chunks', jsonb_build_array(a))));
    RAISE EXCEPTION 'a file whose part isn''t stored was kept';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  ASSERT (SELECT entries FROM public.works WHERE id = w) = entries_before, 'and nothing of that save was written';
  UPDATE public.work_blobs SET status = 'stored', stored_at = now() WHERE work_id = w AND sha256 = a;
  INSERT INTO public.work_blobs (work_id, sha256, size, storage_path, status, stored_at)
    VALUES (w, b, 6, w || '/bb/' || b, 'stored', now()), (w, c, 4, w || '/cc/' || c, 'stored', now());

  r := public.work_save(w, '{"kind":"save","summary":"First cut","actor_kind":"claude_code"}', two, NULL, NULL, NULL,
    jsonb_build_array(
      jsonb_build_object('path', 'renders/film.mp4', 'sha256', a, 'size', 10, 'chunks', jsonb_build_array(a), 'mime_type', 'video/mp4', 'note', 'the first cut'),
      jsonb_build_object('path', 'records/spec.json', 'sha256', repeat('d', 64), 'size', 10, 'chunks', jsonb_build_array(b, c)),
      jsonb_build_object('path', 'records/empty.txt', 'sha256', repeat('e', 64), 'size', 0, 'chunks', '[]'::jsonb)));
  ASSERT jsonb_array_length(r -> 'files') = 3, 'three files kept';
  ASSERT (SELECT version FROM public.work_files WHERE work_id = w AND path = 'renders/film.mp4') = 1, 'at version 1';
  ASSERT (SELECT entry_id = (r ->> 'entryId')::uuid FROM public.work_files WHERE work_id = w AND path = 'records/spec.json'),
    'each with the entry that kept it';
  ASSERT (SELECT jsonb_array_length(files) FROM public.work_journal WHERE id = (r ->> 'entryId')::uuid) = 3, 'which lists them';

  r := public.work_save(w, '{"kind":"auto","summary":"","actor_kind":"claude_code"}', two, NULL, NULL, NULL,
    jsonb_build_array(jsonb_build_object('path', 'renders/film.mp4', 'sha256', a, 'size', 10, 'chunks', jsonb_build_array(a))));
  ASSERT jsonb_array_length(r -> 'files') = 0, 'an unchanged file is not kept again';
  r := public.work_save(w, '{"kind":"auto","summary":"","actor_kind":"claude_code"}', two, NULL, NULL, NULL,
    jsonb_build_array(jsonb_build_object('path', 'renders/film.mp4', 'sha256', b, 'size', 6, 'chunks', jsonb_build_array(b))));
  ASSERT (SELECT max(version) FROM public.work_files WHERE work_id = w AND path = 'renders/film.mp4') = 2, 'a change is version 2';
  ASSERT (SELECT count(*) FROM public.work_files WHERE work_id = w AND path = 'renders/film.mp4') = 2, 'and version 1 is kept';
  r := public.work_save(w, '{"kind":"auto","summary":"","actor_kind":"claude_code"}', two, NULL, NULL, NULL,
    '[{"path":"renders/film.mp4","deleted":true},{"path":"renders/never.mp4","deleted":true}]');
  ASSERT jsonb_array_length(r -> 'files') = 1 AND (r -> 'files' -> 0 ->> 'deleted')::boolean, 'a deletion is a version; deleting nothing is nothing';
  r := public.work_save(w, '{"kind":"auto","summary":"","actor_kind":"claude_code"}', two, NULL, NULL, NULL,
    '[{"path":"renders/film.mp4","deleted":true}]');
  ASSERT jsonb_array_length(r -> 'files') = 0, 'deleting a deleted file is nothing';

  SELECT entries INTO entries_before FROM public.works WHERE id = w;
  BEGIN
    PERFORM public.work_save(w, '{"kind":"save","summary":"x","actor_kind":"claude_code"}', two, NULL, NULL, NULL,
      jsonb_build_array(jsonb_build_object('path', 'records/wrong.json', 'sha256', repeat('f', 64), 'size', 11, 'chunks', jsonb_build_array(b, c))));
    RAISE EXCEPTION 'parts that don''t add up were kept';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.work_save(w, '{"kind":"save","summary":"x","actor_kind":"claude_code"}', two, NULL, NULL, NULL,
      jsonb_build_array(jsonb_build_object('path', '../outside.txt', 'sha256', c, 'size', 4, 'chunks', jsonb_build_array(c))));
    RAISE EXCEPTION 'a path climbing out was kept';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  ASSERT (SELECT entries FROM public.works WHERE id = w) = entries_before, 'refused saves write nothing';
  ASSERT NOT EXISTS (SELECT 1 FROM public.work_files_now(w) WHERE path = 'renders/film.mp4'),
    'the files as they stand: the deleted film is not among them';
  ASSERT (SELECT array_agg(path || ' v' || version ORDER BY path) FROM public.work_files_now(w))
    = ARRAY['records/empty.txt v1', 'records/spec.json v1'], 'the two files still there, in order';
END $$;

-- A file's path: a root's name and a path under it, nothing else.
DO $$
DECLARE
  w uuid := '00000000-0000-4000-8000-0000000000f1';
  bad text;
BEGIN
  FOREACH bad IN ARRAY ARRAY['/abs/file', 'a//b', 'a\b', '../up', 'a/../b', 'a/./b', '.', 'a/..', E'a\nb', ''] LOOP
    BEGIN
      INSERT INTO public.work_files (work_id, path, version, deleted) VALUES (w, bad, 99, true);
      RAISE EXCEPTION 'the path % was taken', bad;
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END LOOP;
  INSERT INTO public.work_files (work_id, path, version, deleted) VALUES (w, 'records/.hidden/a b ü.json', 99, true);
END $$;

-- Links: attached once, a link attached again keeps its role unless given another.
DO $$
DECLARE
  w uuid := '00000000-0000-4000-8000-0000000000f1';
  two uuid := '00000000-0000-4000-8000-0000000000a2';
  g uuid := '00000000-0000-4000-8000-0000000000b1';
  r jsonb;
BEGIN
  r := public.work_save(w, '{"kind":"link","summary":"","actor_kind":"claude_code"}', two, NULL, NULL, NULL, NULL,
    jsonb_build_array(jsonb_build_object('kind', 'generation', 'object_id', g, 'role', 'take 3 of P')));
  ASSERT (r -> 'links' -> 0 ->> 'added')::boolean, 'attached';
  r := public.work_save(w, '{"kind":"link","summary":"","actor_kind":"claude_code"}', two, NULL, NULL, NULL, NULL,
    jsonb_build_array(jsonb_build_object('kind', 'generation', 'object_id', g)));
  ASSERT NOT (r -> 'links' -> 0 ->> 'added')::boolean AND r -> 'links' -> 0 ->> 'role' = 'take 3 of P', 'once, keeping its role';
  ASSERT (SELECT count(*) FROM public.work_links WHERE work_id = w) = 1, 'one link';
  BEGIN
    PERFORM public.work_save(w, '{"kind":"link","actor_kind":"claude_code"}', two, NULL, NULL, NULL, NULL,
      jsonb_build_array(jsonb_build_object('kind', 'spaceship', 'object_id', g)));
    RAISE EXCEPTION 'an unknown kind was attached';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- Two saves of the same request at once are kept once: the second waits for the first's lock,
-- then finds its entry (shown here one after the other, as the lock makes them).
DO $$
DECLARE
  w uuid := '00000000-0000-4000-8000-0000000000f1';
  r1 jsonb;
  r2 jsonb;
BEGIN
  r1 := public.work_save(w, '{"kind":"save","summary":"once","actor_kind":"script","client_request_id":"same-request"}', NULL);
  r2 := public.work_save(w, '{"kind":"save","summary":"once","actor_kind":"script","client_request_id":"same-request"}', NULL);
  ASSERT r1 ->> 'entryId' = r2 ->> 'entryId' AND (r2 ->> 'duplicate')::boolean, 'one entry';
END $$;

-- Who may read and write: a member reads; nobody signed out does; nobody but the server writes.
DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', false); END $$;
SET ROLE authenticated;
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.works) = 1, 'a member reads works';
  ASSERT (SELECT count(*) FROM public.work_journal) > 0, 'and their journals';
  ASSERT (SELECT count(*) FROM public.work_files) > 0, 'files';
  ASSERT (SELECT count(*) FROM public.work_files_now('00000000-0000-4000-8000-0000000000f1')) > 0, 'files as they stand';
  ASSERT (SELECT count(*) FROM public.work_links) = 1, 'and links';
  BEGIN
    INSERT INTO public.works (title) VALUES ('mine');
    RAISE EXCEPTION 'a member wrote a work';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.work_save('00000000-0000-4000-8000-0000000000f1', '{"actor_kind":"person"}', NULL);
    RAISE EXCEPTION 'a member saved directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.work_claim('00000000-0000-4000-8000-0000000000f1', 'me', 'me', 'person', NULL);
    RAISE EXCEPTION 'a member claimed directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub', '', false); END $$;
SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM count(*) FROM public.works;
    RAISE EXCEPTION 'the signed-out read works';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
-- A member who is no longer active reads nothing.
UPDATE public.profiles SET is_active = false WHERE id = '00000000-0000-4000-8000-0000000000a2';
DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', false); END $$;
SET ROLE authenticated;
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.works) = 0, 'an inactive member reads no works';
  ASSERT (SELECT count(*) FROM public.work_files_now('00000000-0000-4000-8000-0000000000f1')) = 0,
    'nor their files, through the function';
END $$;
RESET ROLE;

-- The server (service_role) runs the functions; a thread can work on a work; the bucket is private.
SET ROLE service_role;
DO $$
DECLARE
  r jsonb;
BEGIN
  r := public.work_claim('00000000-0000-4000-8000-0000000000f1', 'claude-code:s9', 'Claude Code s9', 'claude_code', NULL, 900, true);
  ASSERT (r ->> 'claimed')::boolean, 'the server claims';
  ASSERT (public.work_save('00000000-0000-4000-8000-0000000000f1', '{"kind":"save","summary":"from the server","actor_kind":"claude_code"}', NULL) ->> 'found')::boolean,
    'and saves';
END $$;
RESET ROLE;
DO $$
BEGIN
  ASSERT (SELECT NOT public AND file_size_limit = 52428800 FROM storage.buckets WHERE id = 'work-files'), 'a private bucket, 50 MB a part';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supercomputer_threads' AND column_name = 'work_id'),
    'a conversation can work on a work';
  ASSERT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'work_journal'),
    'the journal is followed live';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'works'),
    'the works themselves are not';
END $$;

SELECT 'work: ' || count(*) || ' journal entries written by the checks' AS result FROM public.work_journal;
