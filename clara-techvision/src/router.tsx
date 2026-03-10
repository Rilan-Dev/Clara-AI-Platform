import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { TechVisionPortalShell } from "@/features/portal-shell/layouts";
import { TechVisionLoginScreen } from "@/features/auth/screens";
import { TechVisionDashboardScreen } from "@/features/dashboard/screens";
import { TechVisionKnowledgeBasesScreen } from "@/features/knowledge-bases/screens";
import { TechVisionAnalyticsScreen } from "@/features/analytics/screens";
import { TechVisionChatScreen } from "@/features/chat/screens";
import { DemoWebsiteScreen } from "@/features/demo/screens";
import { getStoredToken } from "@/lib/auth";

function RequireAuth() {
  if (!getStoredToken()) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

function PortalShell() {
  return (
    <TechVisionPortalShell>
      <Outlet />
    </TechVisionPortalShell>
  );
}

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/login" replace /> },
  { path: "/login", element: <TechVisionLoginScreen /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <PortalShell />,
        children: [
          { path: "/dashboard", element: <TechVisionDashboardScreen /> },
          { path: "/knowledge-bases", element: <TechVisionKnowledgeBasesScreen /> },
          { path: "/analytics", element: <TechVisionAnalyticsScreen /> },
          { path: "/chat", element: <TechVisionChatScreen /> },
          { path: "/demo-website", element: <DemoWebsiteScreen /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/login" replace /> },
]);
