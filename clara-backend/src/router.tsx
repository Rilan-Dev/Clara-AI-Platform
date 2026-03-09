import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import PlatformLayout from "@/app/(platform)/layout";
import AdminLayout from "@/app/(admin)/layout";
import LegacyAdminLayout from "@/app/admin/layout";
import LandingPage from "@/app/(platform)/page";
import FeaturesPage from "@/app/(platform)/features/page";
import PricingPage from "@/app/(platform)/pricing/page";
import ContactPage from "@/app/(platform)/contact/page";
import SandboxPage from "@/app/page";
import AdminLogin from "@/app/(admin)/login/page";
import AdminDashboard from "@/app/(admin)/dashboard/page";
import OrgsPage from "@/app/(admin)/orgs/page";
import OrgDetailPage from "@/app/(admin)/orgs/[id]/page";
import AdminSubscriptionsPage from "@/app/(admin)/subscriptions/page";
import AnalyticsPage from "@/app/(admin)/analytics/page";
import SettingsPage from "@/app/(admin)/settings/page";
import WorkspacePage from "@/app/workspace/page";
import IngestPage from "@/app/ingest/page";
import EmbedWidgetPage from "@/app/embed/widget/page";
import LegacyAdminRoot from "@/app/admin/page";
import LegacyAdminLogin from "@/app/admin/login/page";
import LegacyOrgsPage from "@/app/admin/orgs/page";
import LegacyOrgPage from "@/app/admin/orgs/[orgId]/page";
import LegacyProjectPage from "@/app/admin/orgs/[orgId]/projects/[projectId]/page";
import LegacyKbPage from "@/app/admin/kbs/[kbId]/page";
import LegacyKbConfigPage from "@/app/admin/kbs/[kbId]/config/page";
import LegacySettingsPage from "@/app/admin/settings/page";

function PlatformShell() {
  return (
    <PlatformLayout>
      <Outlet />
    </PlatformLayout>
  );
}

function AdminShell() {
  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}

function LegacyAdminShell() {
  return (
    <LegacyAdminLayout>
      <Outlet />
    </LegacyAdminLayout>
  );
}

export const router = createBrowserRouter([
  {
    element: <PlatformShell />,
    children: [
      { path: "/", element: <LandingPage /> },
      { path: "/sandbox", element: <SandboxPage /> },
      { path: "/features", element: <FeaturesPage /> },
      { path: "/pricing", element: <PricingPage /> },
      { path: "/contact", element: <ContactPage /> },
      { path: "/workspace", element: <WorkspacePage /> },
      { path: "/ingest", element: <IngestPage /> },
      { path: "/embed/widget", element: <EmbedWidgetPage /> },
    ],
  },
  { path: "/login", element: <AdminLogin /> },
  { path: "/admin/login", element: <LegacyAdminLogin /> },
  {
    element: <AdminShell />,
    children: [
      { path: "/dashboard", element: <AdminDashboard /> },
      { path: "/orgs", element: <OrgsPage /> },
      { path: "/orgs/:id", element: <OrgDetailPage /> },
      { path: "/subscriptions", element: <AdminSubscriptionsPage /> },
      { path: "/analytics", element: <AnalyticsPage /> },
      { path: "/settings", element: <SettingsPage /> },
    ],
  },
  {
    element: <LegacyAdminShell />,
    children: [
      { path: "/admin", element: <LegacyAdminRoot /> },
      { path: "/admin/orgs", element: <LegacyOrgsPage /> },
      { path: "/admin/orgs/:orgId", element: <LegacyOrgPage /> },
      { path: "/admin/orgs/:orgId/projects/:projectId", element: <LegacyProjectPage /> },
      { path: "/admin/kbs/:kbId", element: <LegacyKbPage /> },
      { path: "/admin/kbs/:kbId/config", element: <LegacyKbConfigPage /> },
      { path: "/admin/settings", element: <LegacySettingsPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
