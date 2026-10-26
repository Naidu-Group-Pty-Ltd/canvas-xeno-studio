/**
 * Reel 3's screens, drawn by the product's own components (npc-client-dashboard) on Jordan Ellis' fictional record.
 * The product's network layer is the harness's (src/stubs/secureInvoke.ts): every Edge Function call is answered by
 * the product's own functions on the record (engine/server.ts), so what a page draws is what the product computes.
 *
 * ?screen=<name> picks the screen (SCREENS below); each piece carries data-shot for the capture script, and
 * window.__ready says the fonts and images are in and the page has stopped asking the backend for anything.
 */
import "@/index.css";
import "./windows.css";
import "./tenant.css";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SCREENS } from "./screens";

const q = new URLSearchParams(location.search);
const screen = q.get("screen") ?? "bc-card";
if (q.get("theme") !== "light") document.documentElement.classList.add("dark");
const width = Number(q.get("width") ?? 1440);
const def = SCREENS[screen];
if (!def) throw new Error(`No screen ${screen}`);

const client = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <TooltipProvider>
      <MemoryRouter initialEntries={[def.route ?? "/"]}>
        <div data-shot={screen} style={{ width, ...(def.style ?? {}) }}>
          {def.render(q)}
        </div>
      </MemoryRouter>
    </TooltipProvider>
  </QueryClientProvider>,
);

(async () => {
  // Fonts asked for by name, then the page left until it has made no backend call for a second.
  await new Promise((r) => setTimeout(r, 300));
  const faces = [
    '400 16px "Segoe UI"',
    '600 16px "Segoe UI"',
    '700 16px "Segoe UI"',
    "400 16px Consolas",
    "700 16px Consolas",
  ];
  await Promise.all(faces.map((f) => document.fonts.load(f).catch(() => null)));
  await document.fonts.ready;
  const calls = () => ((window as unknown as { __calls: string[] }).__calls ?? []).length;
  let last = -1;
  while (calls() !== last) {
    last = calls();
    await new Promise((r) => setTimeout(r, 1000));
  }
  await Promise.all([...document.images].map((i) => i.decode().catch(() => null)));
  (window as unknown as Record<string, unknown>).__ready = true;
})();
