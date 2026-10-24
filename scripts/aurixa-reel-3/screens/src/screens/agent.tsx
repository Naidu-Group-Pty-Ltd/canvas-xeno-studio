/**
 * The Aurixa agent (shot 09.3): the product's AgentChatWidget, as DashboardLayout mounts it beside every Command Centre
 * page (src/components/layout/DashboardLayout.tsx, the desktop shell), with the product's Sonner toaster that App.tsx
 * mounts (src/App.tsx). Alex Morgan is signed in (src/stubs/agent-useAuth.tsx); the widget's calls to
 * ai-dashboard-agent, streamed and not, are answered by engine/handlers/agent.ts in the shapes the function sends.
 *
 * ?layout=dock|float|focus is the panel's layout on a desktop, the choice the widget remembers on the device
 * (`aurixa_panel_mode`, its More menu's Layout: Floating, Beside the page, Focus). The film's is "Beside the page".
 */
import { AgentChatWidget } from "@/components/agent/AgentChatWidget";
import { Toaster as Sonner } from "@/components/ui/sonner";
import type { Screen } from "../record";

/** The layout the widget reads when it mounts (AgentChatWidget.tsx, LAYOUT_KEY; float is stored as nothing). */
function rememberLayout(q: URLSearchParams) {
  const layout = q.get("layout") ?? "dock";
  try {
    if (layout === "dock" || layout === "focus") localStorage.setItem("aurixa_panel_mode", layout);
    else localStorage.removeItem("aurixa_panel_mode");
  } catch {
    /* a private window keeps the default */
  }
}

export const SCREENS: Record<string, Screen> = {
  agent: {
    route: "/",
    style: { height: "100vh" },
    render: (q) => {
      rememberLayout(q);
      return (
        <>
          <AgentChatWidget />
          <Sonner />
        </>
      );
    },
  },
};
