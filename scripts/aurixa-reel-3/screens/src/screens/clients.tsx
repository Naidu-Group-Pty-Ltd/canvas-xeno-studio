/**
 * The client's arrival and their workspace, run on Jordan's record:
 *
 * - clients-add: Add New Client (src/components/clients/AddClientModal.tsx), opened, for its Advanced mode's Excel
 *   Import of Jordan's own workbook (the product's parser runs on the real file the capture sets on the dropzone).
 * - clients-management: Client Management (src/pages/ClientManagement.tsx) with the card the import creates
 *   (src/components/clients/ClientCard.tsx). Its "View details" opens the client workspace
 *   (src/components/clients/ClientDetailsModal.tsx) as the page opens it, with the client row the page lists.
 *
 * Every component runs as the product ships it, in the staff session the product's App.tsx gives a Command Centre
 * page (PermissionsProvider, WorkspaceEntitlementsProvider, NotificationsProvider, inside AuthProvider, which the
 * harness signs Alex Morgan in to: src/stubs/agent-useAuth.tsx). Their calls are answered by the harness's backend
 * (engine/handlers/clients.ts) from the extras each capture names (captures/20-clients.cjs).
 *
 * The product's modules are loaded only when one of these screens is drawn: src/screens.tsx imports every screen
 * module, and these reach several hundred of the product's files.
 */
import type { ReactNode } from "react";
import type { Screen } from "../record";

const query = new URLSearchParams(location.search);
const MINE = (query.get("screen") ?? "").startsWith("clients-");

/**
 * Nothing leaves the machine. A call a page makes to `${SUPABASE_URL}/functions/v1/<name>` with `fetch` rather than
 * through src/lib/secureInvoke.ts goes to the harness's backend like every other function call; anything else bound
 * for another host (a direct table read, storage, a realtime socket) is refused and logged.
 */
function keepLocal() {
  const engine = `http://localhost:${query.get("engine") ?? 5299}/fn/`;
  const local = (url: URL) => url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, location.href);
    if (local(url) || url.protocol === "data:" || url.protocol === "blob:") return real(input, init);
    const fn = url.pathname.match(/\/functions\/v1\/([^/?]+)/)?.[1];
    if (fn) {
      ((window as unknown as { __calls: string[] }).__calls ??= []).push(fn);
      const body = init?.body ?? (input instanceof Request ? await input.text() : undefined);
      return real(engine + fn, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: typeof body === "string" && body ? body : "{}",
      });
    }
    console.error(`clients: refused a request to ${url.origin}${url.pathname}`);
    return new Response(JSON.stringify({ error: "The harness reaches no other host" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, href: string | URL, ...rest: unknown[]) {
    const url = new URL(String(href), location.href);
    if (!local(url)) {
      console.error(`clients: refused a request to ${url.origin}${url.pathname}`);
      return open.call(this, method, "data:,", ...(rest as [boolean]));
    }
    return open.call(this, method, href, ...(rest as [boolean]));
  } as typeof XMLHttpRequest.prototype.open;
  const Socket = window.WebSocket;
  window.WebSocket = new Proxy(Socket, {
    construct(target, args: [string | URL, (string | string[])?]) {
      const url = new URL(String(args[0]), location.href);
      if (!local(url)) {
        console.error(`clients: refused a socket to ${url.origin}${url.pathname}`);
        return new target("ws://localhost:9/");
      }
      return new target(...args);
    },
  });
}

async function load() {
  keepLocal();
  const [add, management, auth, permissions, entitlements, notifications] = await Promise.all([
    import("@/components/clients/AddClientModal"),
    import("@/pages/ClientManagement"),
    import("@/hooks/useAuth"),
    import("@/hooks/usePermissions"),
    import("@/hooks/useWorkspaceEntitlements"),
    import("@/contexts/NotificationsContext"),
  ]);
  return {
    AddClientModal: add.AddClientModal,
    ClientManagement: management.default,
    AuthProvider: auth.AuthProvider,
    PermissionsProvider: permissions.PermissionsProvider,
    WorkspaceEntitlementsProvider: entitlements.WorkspaceEntitlementsProvider,
    NotificationsProvider: notifications.NotificationsProvider,
  };
}
const P = MINE ? await load() : null;

/** The staff session a Command Centre page runs in, nested as the product's App.tsx nests it. */
function Staff({ children }: { children: ReactNode }) {
  const { AuthProvider, PermissionsProvider, WorkspaceEntitlementsProvider, NotificationsProvider } = P!;
  return (
    <AuthProvider>
      <PermissionsProvider>
        <WorkspaceEntitlementsProvider>
          <NotificationsProvider>{children}</NotificationsProvider>
        </WorkspaceEntitlementsProvider>
      </PermissionsProvider>
    </AuthProvider>
  );
}

export const SCREENS: Record<string, Screen> = {
  "clients-add": {
    route: "/clients",
    style: { minHeight: 1000 },
    render: () => {
      const { AddClientModal } = P!;
      return <AddClientModal open onOpenChange={() => undefined} />;
    },
  },
  "clients-management": {
    route: "/clients",
    style: { padding: 24 },
    render: () => {
      const { ClientManagement } = P!;
      return (
        <Staff>
          <ClientManagement />
        </Staff>
      );
    },
  },
};
