/**
 * Reel 2's screens, drawn by the product's own components (npc-client-dashboard) from Jordan Ellis's fictional
 * case (./fixture.ts). ?screen=booklet&audience=command|partner|client draws the cover and every leaf at their
 * design size; ?screen=stamps draws every stamp face the case earns, and the ones it doesn't. Each piece carries
 * data-shot, for the screenshot script; window.__ready says the fonts and images are in.
 */
import "@/index.css";
import "./windows.css";
import "./tenant.css";
import { createRoot } from "react-dom/client";
import { BookletCover, BookletLeaf } from "@/components/aml/passport/design/PassportBook";
import { PendingStampFace, StampFace } from "@/components/aml/passport/design/StampFace";
import {
  buildBooklet,
  bookletCover,
  buildPassportView,
  type PassportAudience,
} from "@/lib/aml/passport";
import { caseInput, ISSUER, type Stage } from "./fixture";
import { Consent, Roster, Solicitor } from "./screens";

const q = new URLSearchParams(location.search);
const screen = q.get("screen") ?? "booklet";
const audience = (q.get("audience") ?? "command") as PassportAudience;
const stage = (q.get("stage") ?? "issued") as Stage;
const view = buildPassportView(audience, caseInput(stage));

/**
 * One wording change, and only one. The booklet prints a verified party's method as the stored code
 * (`electronic_idv`), which the product's own partner booklet calls "not a phrase anybody says out loud" and words
 * as "Electronic identity verification" (METHOD_LABELS in src/lib/aml/passport/partnerBooklet.pure.ts). The page on
 * screen takes the product's wording for that code; nothing else on any leaf is touched.
 */
const METHOD_WORDS: Record<string, string> = { electronic_idv: "Electronic identity verification" };
const worded = (pages: ReturnType<typeof buildBooklet>) =>
  pages.map((p) =>
    p.id !== "verification"
      ? p
      : {
          ...p,
          blocks: p.blocks.map((b) =>
            b.kind !== "rows"
              ? b
              : {
                  ...b,
                  items: b.items.map((i) => ({
                    ...i,
                    note: (i.note && METHOD_WORDS[i.note]) ?? i.note,
                  })),
                },
          ),
        },
  );
(window as unknown as Record<string, unknown>).__view = view;

function Booklet() {
  const pages = worded(buildBooklet(view));
  (window as unknown as Record<string, unknown>).__pages = pages.map((p) => ({
    id: p.id,
    variant: p.variant,
    kicker: p.kicker,
    title: p.title,
  }));
  return (
    <div
      className="passport-scope"
      style={{
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 24,
        background: "transparent",
      }}
    >
      <div data-shot="cover" style={{ width: 470, height: 648 }}>
        <BookletCover page={bookletCover(view)} />
      </div>
      {pages
        .filter((p) => p.variant !== "cover")
        .map((p) => (
          <div key={p.id} data-shot={`leaf-${p.id}`} style={{ width: 470, height: 648 }}>
            <BookletLeaf page={p} />
          </div>
        ))}
    </div>
  );
}

function Stamps() {
  return (
    <div
      className="passport-scope"
      style={{ padding: 24, display: "flex", flexWrap: "wrap", gap: 40, background: "transparent" }}
    >
      {view.stamps.map((s, i) => (
        <div
          key={s.code}
          data-shot={`stamp-${s.code}`}
          style={{ padding: 18, display: "inline-block" }}
        >
          <StampFace stamp={s} issuerOrg={ISSUER} index={i} upright />
        </div>
      ))}
      {view.pending_stamps.map((s) => (
        <div
          key={s.code}
          data-shot={`pending-${s.code}`}
          style={{ padding: 18, display: "inline-block" }}
        >
          <PendingStampFace stamp={s} />
        </div>
      ))}
    </div>
  );
}

// The portals' screens are drawn in the product's dark theme under the demo tenant's colours (./tenant.css).
if (q.get("theme") === "dark") document.documentElement.classList.add("dark");
const width = Number(q.get("width") ?? 1440);

function Portal() {
  if (screen === "solicitor") {
    const state = (q.get("state") ?? "dashboard") as "dashboard" | "compliance" | "matter";
    return (
      <div data-shot={`solicitor-${state}`} style={{ width }}>
        <Solicitor state={state} />
      </div>
    );
  }
  if (screen === "roster") {
    const sent = (q.get("sent") ?? "").split(",").filter(Boolean);
    return (
      <div data-shot={`roster-${sent.length ? "sent" : "issued"}`} style={{ width, padding: 2 }}>
        <Roster sent={sent} />
      </div>
    );
  }
  const sharing = q.get("sharing") === "1";
  return (
    <div data-shot={`consent-${sharing ? "ticked" : "open"}`} style={{ width, padding: 2 }}>
      <Consent sharing={sharing} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  screen === "stamps" ? <Stamps /> : screen === "booklet" ? <Booklet /> : <Portal />,
);
(async () => {
  // React renders on its own schedule, so the faces are asked for by name rather than trusted to have started.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 400));
  const faces = [
    '400 16px "Segoe UI"',
    '600 16px "Segoe UI"',
    '700 16px "Segoe UI"',
    "400 16px Georgia",
    "italic 400 16px Georgia",
    "500 16px Georgia",
    "600 16px Georgia",
    "700 16px Georgia",
    "400 16px Consolas",
    "600 16px Consolas",
    "700 16px Consolas",
  ];
  await Promise.all(faces.map((f) => document.fonts.load(f).catch(() => null)));
  await document.fonts.ready;
  await new Promise((r) => setTimeout(r, 300));
  await Promise.all([...document.images].map((i) => i.decode().catch(() => null)));
  (window as unknown as Record<string, unknown>).__ready = true;
})();
