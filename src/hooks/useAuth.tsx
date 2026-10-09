import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  initialAuthLink,
  passwordSetupFor,
  readPendingPasswordSetup,
  SET_PASSWORD_PATH,
  writePendingPasswordSetup,
  type PasswordSetupKind,
} from "@/lib/auth-link";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: "admin" | "member";
  is_active: boolean;
}

interface AuthValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  /**
   * A password the signed-in person must choose before using the studio: they
   * arrived from a password-reset link ("recovery") or a team invitation
   * ("invite"). Until it's done every page sends them to /set-password.
   */
  passwordSetup: PasswordSetupKind | null;
  finishPasswordSetup: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  passwordSetup: null,
  finishPasswordSetup: () => {},
  signOut: async () => {},
});

/** The step an emailed link started in this tab: from this page's address, or remembered from earlier. */
function startingPasswordSetup(): PasswordSetupKind | null {
  if (typeof window === "undefined") return null;
  const fromLink = passwordSetupFor(initialAuthLink);
  if (fromLink) {
    writePendingPasswordSetup(fromLink);
    return fromLink;
  }
  return readPendingPasswordSetup();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [passwordSetup, setPasswordSetup] = useState<PasswordSetupKind | null>(
    startingPasswordSetup,
  );
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      // A password-reset link signed this person in, wherever it landed.
      if (event === "PASSWORD_RECOVERY") {
        writePendingPasswordSetup("recovery");
        setPasswordSetup((current) => current ?? "recovery");
      }
      if (event === "SIGNED_OUT") {
        writePendingPasswordSetup(null);
        setPasswordSetup(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => subscription.subscription.unsubscribe();
  }, [queryClient]);

  // Whatever page an emailed link opened (the auth service falls back to the
  // site's home page when it can't use the address it was given), the person
  // chooses their password first.
  useEffect(() => {
    if (ready && session && passwordSetup && pathname !== SET_PASSWORD_PATH) {
      navigate({ to: SET_PASSWORD_PATH, replace: true });
    }
  }, [ready, session, passwordSetup, pathname, navigate]);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile", session?.user.id],
    enabled: !!session?.user.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,email,full_name,avatar_url,role,is_active")
        .eq("id", session!.user.id)
        .maybeSingle();
      if (error) throw error;
      return (data as Profile) ?? null;
    },
  });

  const finishPasswordSetup = useCallback(() => {
    writePendingPasswordSetup(null);
    setPasswordSetup(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile: profile ?? null,
      loading: !ready || (!!session && profileLoading),
      isAdmin: profile?.role === "admin" && profile.is_active,
      passwordSetup,
      finishPasswordSetup,
      signOut: async () => {
        await supabase.auth.signOut();
        writePendingPasswordSetup(null);
        setPasswordSetup(null);
        queryClient.clear();
      },
    }),
    [session, profile, ready, profileLoading, passwordSetup, finishPasswordSetup, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
