/**
 * The partner portals, each as its own person sees it, on Jordan's record:
 *
 * - The Finance Portal as Jamie Chen (Harbour Finance Group) sees it: the product's FinancePortalAuthProvider,
 *   FinancePortalProtectedRoute and FinancePortalLayout around My Clients (FinancePortalClients) and Jordan's profile
 *   (FinancePortalClientProfile, its BorrowingCapacityPanel on the Borrowing Capacity tab), mounted as src/App.tsx
 *   mounts the /finance routes.
 * - The Client Portal as Jordan sees it: the product's ClientPortalAuthLayout, PortalProtectedRoute and PortalLayout
 *   around Reports (PortalReports), mounted as src/App.tsx mounts the /client routes.
 *
 * Every component runs as the product ships it. The portals' own requests go to the harness's backend through
 * src/stubs/portals-network.ts, carrying each person's session; the backend answers them by the functions' own rules
 * (engine/handlers/portals.ts) on the record and the extras the captures name (captures/30-portals.cjs).
 */
import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import { FinancePortalAuthProvider } from "@/hooks/useFinancePortalAuth";
import { FinancePortalProtectedRoute } from "@/components/finance-portal/FinancePortalProtectedRoute";
import { FinancePortalLayout } from "@/components/finance-portal/FinancePortalLayout";
import FinancePortalClients from "@/pages/finance-portal/FinancePortalClients";
import FinancePortalClientProfile from "@/pages/finance-portal/FinancePortalClientProfile";
import { ClientPortalAuthLayout } from "@/components/portal/ClientPortalAuthLayout";
import { PortalProtectedRoute } from "@/components/portal/PortalProtectedRoute";
import { PortalLayout } from "@/components/portal/PortalLayout";
import PortalReports from "@/pages/portal/PortalReports";
import { CLIENT_SESSION_COOKIE, FINANCE_SESSION_COOKIE, installPortalNetwork } from "../stubs/portals-network";
import { CLIENT, type Screen } from "../record";

/** Before anything mounts: the person's browser, with its session cookie and what it already remembers. */
function useBrowser(cookie: string, remembered: Record<string, string>) {
  useState(() => {
    installPortalNetwork(cookie);
    for (const [key, value] of Object.entries(remembered))
      try {
        localStorage.setItem(key, value);
      } catch {
        /* a browser without storage forgets */
      }
    return null;
  });
}

/** The product's /finance routes (src/App.tsx, "Finance Portal Routes"), with the pages the film opens. */
function FinancePortal() {
  // Jamie has used his portal since August, so his browser has been through the welcome tour, which the product
  // remembers in the browser (FinanceOnboardingTour.tsx, STORAGE_KEY).
  useBrowser(FINANCE_SESSION_COOKIE, { finance_tour_completed_v1: "1" });
  return (
    <Routes>
      <Route
        path="/finance/*"
        element={
          <FinancePortalAuthProvider>
            <Routes>
              <Route
                path=""
                element={
                  <FinancePortalProtectedRoute>
                    <FinancePortalLayout />
                  </FinancePortalProtectedRoute>
                }
              >
                <Route path="clients" element={<FinancePortalClients />} />
                <Route path="clients/:clientId" element={<FinancePortalClientProfile />} />
              </Route>
            </Routes>
          </FinancePortalAuthProvider>
        }
      />
    </Routes>
  );
}

/** The product's /client routes (src/App.tsx, "Client Portal Routes"), with the page the film opens. */
function ClientPortal() {
  // Jordan's browser was asked about push notifications on his first visit, which the product remembers in the
  // browser (ClientPortalPushPrompt.tsx, PROMPTED_KEY).
  useBrowser(CLIENT_SESSION_COOKIE, { "npc:portal-push-prompted-v1": "1" });
  return (
    <Routes>
      <Route element={<ClientPortalAuthLayout />}>
        <Route
          path="/client"
          element={
            <PortalProtectedRoute>
              <PortalLayout />
            </PortalProtectedRoute>
          }
        >
          <Route path="reports" element={<PortalReports />} />
        </Route>
      </Route>
    </Routes>
  );
}

export const SCREENS: Record<string, Screen> = {
  "fp-clients": { route: "/finance/clients", render: () => <FinancePortal /> },
  "fp-profile": { route: `/finance/clients/${CLIENT}`, render: () => <FinancePortal /> },
  "cp-reports": { route: "/client/reports", render: () => <ClientPortal /> },
};
