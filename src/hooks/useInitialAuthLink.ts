import { useSyncExternalStore } from "react";
import { initialAuthLink, NO_AUTH_LINK, type AuthLink } from "@/lib/auth-link";

const subscribe = () => () => {};

/**
 * The emailed link this page was opened from. The server can't see it (it's in
 * the address fragment), so the first render shows no link, matching the
 * server's HTML, and the link appears once the page has hydrated.
 */
export function useInitialAuthLink(): AuthLink {
  return useSyncExternalStore(
    subscribe,
    () => initialAuthLink,
    () => NO_AUTH_LINK,
  );
}
