/**
 * The harness's stand-in for the product's src/branding/BrandProvider.tsx (and so for useBrand, useWhiteLabel and
 * every re-export of them): the demo workspace's white-label settings, without the product's read of
 * `whitelabel_settings` from the Supabase host. The settings are the product's defaults (brand-defaults.ts) with the
 * demo workspace's own: its name, Aurixa Systems (the tenant Reel 1's portals were drawn for), its logo, the Aurixa
 * emblem the product itself ships (public/brand/aurixa-emblem-240.png, served by the harness from the product's public
 * folder), and the dark theme the workspace is filmed in.
 *
 * The product's provider also sets `.dark` on <html> and writes the tenant's colour tokens there; the harness does both
 * itself (src/main.tsx, src/tenant.css), so this one writes nothing. `useBrand` answers without a provider mounted, so a
 * page drawn on its own gets the same workspace.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { defaultBrandConfig } from "@/branding/brand-defaults";
import { resolveBrandTokens } from "@/branding/token-resolver";
import type { BrandContextValue, ThemeMode, WhiteLabelSettings } from "@/branding/brand-types";

/** The demo workspace's name. */
export const REEL_COMPANY_NAME = "Aurixa Systems";
/** The demo workspace's logo: the product's own Aurixa emblem. */
const REEL_LOGO = "/brand/aurixa-emblem-240.png";

const SETTINGS: WhiteLabelSettings = {
  ...(defaultBrandConfig as WhiteLabelSettings),
  companyName: REEL_COMPANY_NAME,
  authLogo: REEL_LOGO,
  sidebarLogo: REEL_LOGO,
  sidebarIcon: REEL_LOGO,
  darkModeDefault: "dark",
};

function demoValue(themeMode: ThemeMode, setThemeMode: any): BrandContextValue {
  return {
    settings: SETTINGS,
    updateSettings: async () => ({ ok: false, reason: "not-persisted", message: "Branding is not edited here." }) as any,
    isLoading: false,
    currentTheme: "dark",
    themeMode,
    theme: themeMode,
    isDark: true,
    setThemeMode,
    setTheme: setThemeMode,
    resolvedTokens: resolveBrandTokens(SETTINGS),
  };
}

const BrandContext = createContext<BrandContextValue | undefined>(undefined);
const FALLBACK = demoValue("dark", () => undefined);

export function BrandProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const value = useMemo(() => demoValue(themeMode, setThemeMode), [themeMode]);
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandContextValue {
  return useContext(BrandContext) ?? FALLBACK;
}
