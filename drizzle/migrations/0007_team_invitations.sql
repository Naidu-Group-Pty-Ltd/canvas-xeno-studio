-- ============ TEAM INVITATIONS (additive, re-runnable) ============
-- Admins bring people into the studio by email invitation: the server records
-- the invitation, then asks the auth service to email the person a link; the
-- person opens it and chooses their own password. Everyone else who manages to
-- create an account (the auth service's public sign-up, say) starts inactive
-- and can't use the studio until an admin turns their access on.
-- Invitations are written only by the server; admins can read them.

CREATE TABLE IF NOT EXISTS public.team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stored as the auth service stores addresses: trimmed and lower case.
  email text NOT NULL CHECK (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 320 AND position('@' IN email) > 1),
  full_name text CHECK (full_name IS NULL OR char_length(full_name) <= 200),
  role public.app_role NOT NULL DEFAULT 'member',
  -- The account the invitation created (or found waiting, unconfirmed).
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
  send_count integer NOT NULL DEFAULT 0 CHECK (send_count >= 0),
  last_sent_at timestamptz,
  -- Why the last email couldn't be confirmed as sent, if it couldn't.
  last_error text CHECK (last_error IS NULL OR char_length(last_error) <= 1000),
  accepted_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- One open invitation per address: inviting the same person again resends it.
CREATE UNIQUE INDEX IF NOT EXISTS team_invitations_one_pending_per_email
  ON public.team_invitations (email) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS team_invitations_recent_idx ON public.team_invitations (created_at DESC);
CREATE INDEX IF NOT EXISTS team_invitations_user_idx ON public.team_invitations (user_id);

REVOKE ALL ON public.team_invitations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.team_invitations TO authenticated;
GRANT ALL ON public.team_invitations TO service_role;
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read team invitations" ON public.team_invitations;
CREATE POLICY "admins read team invitations" ON public.team_invitations FOR SELECT TO authenticated
  USING (public.is_admin());

DROP TRIGGER IF EXISTS team_invitations_updated ON public.team_invitations;
CREATE TRIGGER team_invitations_updated BEFORE UPDATE ON public.team_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Every new account gets a profile. The very first account (the workspace's
-- first admin) is an active admin; an invited person is active with the role
-- they were invited as; anyone else starts inactive, as a member.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  first_user boolean;
  invitation public.team_invitations%ROWTYPE;
BEGIN
  -- Two accounts created at once can't both be the first.
  PERFORM pg_advisory_xact_lock(hashtext('public.handle_new_user'));
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO first_user;
  SELECT * INTO invitation FROM public.team_invitations
   WHERE email = lower(btrim(NEW.email)) AND status = 'pending'
   ORDER BY created_at DESC LIMIT 1;
  INSERT INTO public.profiles (id, email, full_name, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''), NULLIF(btrim(NEW.raw_user_meta_data->>'name'), ''), invitation.full_name),
    CASE WHEN first_user THEN 'admin'::public.app_role
         WHEN invitation.id IS NOT NULL THEN invitation.role
         ELSE 'member'::public.app_role END,
    first_user OR invitation.id IS NOT NULL
  )
  ON CONFLICT (id) DO NOTHING;
  IF invitation.id IS NOT NULL THEN
    UPDATE public.team_invitations SET user_id = NEW.id WHERE id = invitation.id AND user_id IS NULL;
  END IF;
  RETURN NEW;
END; $function$;

-- Role and access are an admin's to change; the address is the account's own
-- (the invitation list and team list identify people by it), so no one
-- changes it from the browser.
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  -- auth.uid() is NULL for trusted server-side callers (service role, triggers).
  IF auth.uid() IS NOT NULL THEN
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'A profile''s email address follows its account and can''t be changed here';
    END IF;
    IF NOT public.is_admin() AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
      RAISE EXCEPTION 'Only administrators can change role or active status';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- The account (if any) behind an address, as the auth service records it.
-- The server asks before inviting: it won't invite a current member, and it
-- treats a confirmed account differently from one still waiting to be
-- confirmed. Server only.
CREATE OR REPLACE FUNCTION public.team_account_for_email(p_email text)
RETURNS TABLE (user_id uuid, confirmed boolean, has_password boolean, is_active boolean, role public.app_role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT u.id,
         u.email_confirmed_at IS NOT NULL,
         coalesce(u.encrypted_password, '') <> '',
         coalesce(p.is_active, false),
         p.role
    FROM auth.users AS u
    LEFT JOIN public.profiles AS p ON p.id = u.id
   WHERE lower(u.email) = lower(btrim(p_email))
   ORDER BY u.created_at
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.team_account_for_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.team_account_for_email(text) TO service_role;

-- Brings open invitations up to date with their accounts: links each to the
-- account created for its address, and marks it accepted once that account
-- has confirmed its address (which opening the invitation link does). Returns
-- how many were accepted. Server only.
CREATE OR REPLACE FUNCTION public.settle_team_invitations()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  accepted integer;
BEGIN
  UPDATE public.team_invitations AS invitation
     SET user_id = account.id
    FROM auth.users AS account
   WHERE invitation.status = 'pending'
     AND invitation.user_id IS NULL
     AND lower(account.email) = invitation.email
     AND EXISTS (SELECT 1 FROM public.profiles AS profile WHERE profile.id = account.id);
  UPDATE public.team_invitations AS invitation
     SET status = 'accepted',
         accepted_at = coalesce(account.last_sign_in_at, account.email_confirmed_at, now()),
         last_error = NULL
    FROM auth.users AS account
   WHERE invitation.status = 'pending'
     AND account.id = invitation.user_id
     AND account.email_confirmed_at IS NOT NULL;
  GET DIAGNOSTICS accepted = ROW_COUNT;
  RETURN accepted;
END;
$$;
REVOKE ALL ON FUNCTION public.settle_team_invitations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_team_invitations() TO service_role;

-- Withdraws an open invitation. The link it emailed signs in only the account
-- the invitation made, which hasn't been confirmed yet; that account is
-- removed, so the link stops working. If the person has already accepted (their
-- account is confirmed) nothing is removed and 'accepted' is returned: their
-- access is then switched off from the team list instead. The account row is
-- locked first, so accepting and withdrawing at the same moment can't both
-- happen. Returns 'revoked', 'accepted' or 'not_found' (or the invitation's
-- status, if it was already settled). Server only.
CREATE OR REPLACE FUNCTION public.revoke_team_invitation(p_invitation_id uuid, p_revoked_by uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  invitation public.team_invitations%ROWTYPE;
  account_confirmed boolean;
BEGIN
  SELECT * INTO invitation FROM public.team_invitations WHERE id = p_invitation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF invitation.status <> 'pending' THEN RETURN invitation.status; END IF;
  IF invitation.user_id IS NULL THEN
    -- Not linked yet: the account for its address, if one was made.
    SELECT account.id INTO invitation.user_id FROM auth.users AS account
     WHERE lower(account.email) = invitation.email ORDER BY account.created_at LIMIT 1;
  END IF;
  IF invitation.user_id IS NOT NULL THEN
    SELECT account.email_confirmed_at IS NOT NULL INTO account_confirmed
      FROM auth.users AS account WHERE account.id = invitation.user_id FOR UPDATE;
    IF account_confirmed THEN
      UPDATE public.team_invitations
         SET status = 'accepted', user_id = invitation.user_id, accepted_at = coalesce(accepted_at, now()), last_error = NULL
       WHERE id = invitation.id;
      RETURN 'accepted';
    END IF;
    DELETE FROM auth.users WHERE id = invitation.user_id AND email_confirmed_at IS NULL;
  END IF;
  UPDATE public.team_invitations
     SET status = 'revoked', revoked_at = now(), revoked_by = p_revoked_by, last_error = NULL
   WHERE id = invitation.id;
  RETURN 'revoked';
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_team_invitation(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_team_invitation(uuid, uuid) TO service_role;
