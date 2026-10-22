/**
 * Every composition template the studio offers, in the order the Editor lists
 * them. A template's id never changes once used (edits keep it); a change to
 * what it draws raises its version.
 */
import type { AnyCompositionTemplate } from "../types";
import { ctaTemplate } from "./cta";
import { dashboardTemplate } from "./dashboard";
import { documentTemplate } from "./document";
import { fileTemplate } from "./file";
import { listTemplate } from "./list";
import { notificationsTemplate } from "./notifications";
import { pagesTemplate } from "./pages";
import { railTemplate } from "./rail";
import { recordTemplate } from "./record";
import { reportTemplate } from "./report";
import { statTemplate } from "./stat";
import { titleTemplate } from "./title";
import { windowTemplate } from "./window";

export const TEMPLATES: readonly AnyCompositionTemplate[] = [
  // The graphics kit.
  windowTemplate,
  railTemplate,
  recordTemplate,
  documentTemplate,
  pagesTemplate,
  notificationsTemplate,
  ctaTemplate,
  // Brand cards.
  titleTemplate,
  statTemplate,
  // Product pages, drawn from the brand's demo record.
  dashboardTemplate,
  reportTemplate,
  listTemplate,
  fileTemplate,
];

export function templateById(id: string): AnyCompositionTemplate | null {
  return TEMPLATES.find((template) => template.id === id) ?? null;
}
