import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { TechVisionPortalShell }        from "@/features/portal-shell/layouts";
import { TechVisionLoginScreen }        from "@/features/auth/screens";
import { TechVisionDashboardScreen }    from "@/features/dashboard/screens";
import { TechVisionChatScreen }         from "@/features/chat/screens";
import { TechVisionKnowledgeBasesScreen } from "@/features/knowledge-bases/screens";
import { TechVisionAnalyticsScreen }    from "@/features/analytics/screens";

function PortalShell() {
  return (
    <TechVisionPortalShell>
      <Outlet />
    </TechVisionPortalShell>
  );
}

export const router = createBrowserRouter([
  { path: "/",      element: <Navigate to="/login" replace /> },
  { path: "/login", element: <TechVisionLoginScreen /> },
  {
    element: <PortalShell />,
    children: [
      { path: "/dashboard",       element: <TechVisionDashboardScreen /> },
      { path: "/chat",            element: <TechVisionChatScreen /> },
      { path: "/knowledge-bases", element: <TechVisionKnowledgeBasesScreen /> },
      { path: "/analytics",       element: <TechVisionAnalyticsScreen /> },
    ],
  },
  { path: "*", element: <Navigate to="/login" replace /> },
]);
