import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { OmenPortalShell } from "@/features/portal-shell/layouts";
import { OmenLoginScreen } from "@/features/auth/screens";
import { OmenDashboardScreen } from "@/features/dashboard/screens";
import { OmenKnowledgeBasesScreen } from "@/features/knowledge-bases/screens";
import { OmenAnalyticsScreen } from "@/features/analytics/screens";
import { OmenChatScreen } from "@/features/chat/screens";
import { OmenSettingsScreen } from "@/features/settings/screens";
import { getStoredToken } from "@/lib/auth";

function RequireAuth() {
  if (!getStoredToken()) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

function PortalShell() {
  return (
    <OmenPortalShell>
      <Outlet />
    </OmenPortalShell>
  );
}

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/login" replace /> },
  { path: "/login", element: <OmenLoginScreen /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <PortalShell />,
        children: [
          { path: "/dashboard", element: <OmenDashboardScreen /> },
          { path: "/knowledge-bases", element: <OmenKnowledgeBasesScreen /> },
          { path: "/analytics", element: <OmenAnalyticsScreen /> },
          { path: "/chat", element: <OmenChatScreen /> },
          { path: "/settings", element: <OmenSettingsScreen /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/login" replace /> },
]);
