import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import PortalLayout from "@/app/(portal)/layout";
import TechVisionLogin from "@/app/(auth)/login/page";
import TVDashboard from "@/app/(portal)/dashboard/page";
import TVKnowledgeBases from "@/app/(portal)/knowledge-bases/page";
import TVAnalytics from "@/app/(portal)/analytics/page";
import TechVisionChatPage from "@/app/(portal)/chat/page";
import DemoWebsite from "@/app/(portal)/demo-website/page";
import { getStoredToken } from "@/lib/auth";

function RequireAuth() {
  if (!getStoredToken()) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

function PortalShell() {
  return (
    <PortalLayout>
      <Outlet />
    </PortalLayout>
  );
}

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/login" replace /> },
  { path: "/login", element: <TechVisionLogin /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <PortalShell />,
        children: [
          { path: "/dashboard", element: <TVDashboard /> },
          { path: "/knowledge-bases", element: <TVKnowledgeBases /> },
          { path: "/analytics", element: <TVAnalytics /> },
          { path: "/chat", element: <TechVisionChatPage /> },
          { path: "/demo-website", element: <DemoWebsite /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/login" replace /> },
]);
