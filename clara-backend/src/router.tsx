import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { PlatformShellLayout } from "@/features/platform/layouts";
import {
  PlatformLandingScreen,
  PlatformFeaturesScreen,
  PlatformPricingScreen,
  PlatformContactScreen,
  PlatformSandboxScreen,
} from "@/features/platform/screens";
import { AdminShellLayout } from "@/features/admin/layouts";
import {
  AdminLoginScreen,
  AdminDashboardScreen,
  AdminOrgsScreen,
  AdminOrgDetailScreen,
  AdminSubscriptionsScreen,
  AdminAnalyticsScreen,
  AdminSettingsScreen,
} from "@/features/admin/screens";
import { LegacyAdminShellLayout } from "@/features/legacy-admin/layouts";
import {
  LegacyAdminRootScreen,
  LegacyAdminLoginScreen,
  LegacyAdminOrgsScreen,
  LegacyAdminOrgScreen,
  LegacyAdminProjectScreen,
  LegacyAdminKbScreen,
  LegacyAdminKbConfigScreen,
  LegacyAdminSettingsScreen,
} from "@/features/legacy-admin/screens";
import { WorkspaceScreen, IngestScreen } from "@/features/workspace/screens";
import { EmbedWidgetScreen } from "@/features/embed/screens";

function PlatformShell() {
  return (
    <PlatformShellLayout>
      <Outlet />
    </PlatformShellLayout>
  );
}

function AdminShell() {
  return (
    <AdminShellLayout>
      <Outlet />
    </AdminShellLayout>
  );
}

function LegacyAdminShell() {
  return (
    <LegacyAdminShellLayout>
      <Outlet />
    </LegacyAdminShellLayout>
  );
}

export const router = createBrowserRouter([
  {
    element: <PlatformShell />,
    children: [
      { path: "/", element: <PlatformLandingScreen /> },
      { path: "/sandbox", element: <PlatformSandboxScreen /> },
      { path: "/features", element: <PlatformFeaturesScreen /> },
      { path: "/pricing", element: <PlatformPricingScreen /> },
      { path: "/contact", element: <PlatformContactScreen /> },
      { path: "/workspace", element: <WorkspaceScreen /> },
      { path: "/ingest", element: <IngestScreen /> },
      { path: "/embed/widget", element: <EmbedWidgetScreen /> },
    ],
  },
  { path: "/login", element: <AdminLoginScreen /> },
  { path: "/admin/login", element: <LegacyAdminLoginScreen /> },
  {
    element: <AdminShell />,
    children: [
      { path: "/dashboard", element: <AdminDashboardScreen /> },
      { path: "/orgs", element: <AdminOrgsScreen /> },
      { path: "/orgs/:id", element: <AdminOrgDetailScreen /> },
      { path: "/subscriptions", element: <AdminSubscriptionsScreen /> },
      { path: "/analytics", element: <AdminAnalyticsScreen /> },
      { path: "/settings", element: <AdminSettingsScreen /> },
    ],
  },
  {
    element: <LegacyAdminShell />,
    children: [
      { path: "/admin", element: <LegacyAdminRootScreen /> },
      { path: "/admin/orgs", element: <LegacyAdminOrgsScreen /> },
      { path: "/admin/orgs/:orgId", element: <LegacyAdminOrgScreen /> },
      { path: "/admin/orgs/:orgId/projects/:projectId", element: <LegacyAdminProjectScreen /> },
      { path: "/admin/kbs/:kbId", element: <LegacyAdminKbScreen /> },
      { path: "/admin/kbs/:kbId/config", element: <LegacyAdminKbConfigScreen /> },
      { path: "/admin/settings", element: <LegacyAdminSettingsScreen /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
