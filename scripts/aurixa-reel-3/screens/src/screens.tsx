/**
 * Reel 3's screens, gathered from ./screens/*.tsx: each module exports SCREENS, a record of screen name → what it
 * draws (a Screen, ./record.ts). Each screen is a product component (or the product's own markup around one) on
 * Jordan's record.
 */
import type { Screen } from "./record";

const groups = import.meta.glob<{ SCREENS: Record<string, Screen> }>("./screens/*.tsx", {
  eager: true,
});
export const SCREENS: Record<string, Screen> = Object.assign(
  {},
  ...Object.values(groups).map((m) => m.SCREENS),
);
