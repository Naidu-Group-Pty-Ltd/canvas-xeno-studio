/**
 * Every composition template the studio offers, in the order the Editor lists
 * them. A template's id never changes once used (edits keep it); a change to
 * what it draws raises its version.
 */
import type { AnyCompositionTemplate } from "../types";
import { windowTemplate } from "./window";

export const TEMPLATES: readonly AnyCompositionTemplate[] = [windowTemplate];

export function templateById(id: string): AnyCompositionTemplate | null {
  return TEMPLATES.find((template) => template.id === id) ?? null;
}
