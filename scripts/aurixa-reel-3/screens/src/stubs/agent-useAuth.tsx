/**
 * The harness's stand-in for the product's src/hooks/useAuth.tsx: the same exports, with Alex Morgan (the demo record's
 * buyer's agent, fictional) signed in to the Command Centre, and no sign-in, device registration or session check
 * reaching a Supabase host.
 *
 * The product's AuthProvider verifies the HttpOnly session with custom-auth-verify-v2 when it mounts and registers the
 * device; a page drawn here has no session to verify, and the product's useAuth throws outside its provider. The
 * person is the one the harness's backend answers as (engine/product.ts verifyAuth: userId "demo-staff", "Alex
 * Morgan"), the record's staff row (engine/extras/clients-staff.json custom_users), so a message he sent reads as his
 * own (AgentChatWidget compares `sent_by` with `user.id`).
 *
 * Every screen runs under this stand-in (vite.config.ts applies src/stubs/*.stubs.json to the whole harness), the
 * clients group's among them: usePermissions reads isAdmin and roles from here.
 */
import type { ReactNode } from "react";
import type { DeviceRow } from "@/lib/deviceSession";

/** Alex Morgan's staff id: the one engine/product.ts's sign-in check answers with. */
export const REEL_STAFF_ID = "demo-staff";

interface User {
  id: string;
  username: string;
  role: string;
}

export interface DeviceLimitInfo {
  devices_active: number;
  device_limit: number;
  devices: DeviceRow[];
}

const USER: User = { id: REEL_STAFF_ID, username: "Alex Morgan", role: "admin" };

const VALUE = {
  user: USER,
  loading: false,
  isSuperadmin: false,
  isAdmin: true,
  roles: ["admin"],
  accessToken: "demo",
  signIn: async () => ({ error: "Signing in is not part of the demo." }),
  signOut: async () => undefined,
  retryDeviceRegistration: async () => ({}),
  cancelPendingSession: async () => undefined,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useAuth() {
  return VALUE;
}

export function useAuthUserIdOptional(): string | null {
  return USER.id;
}
