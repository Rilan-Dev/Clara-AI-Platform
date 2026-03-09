import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import PortalLayout from "@/app/(portal)/layout";
import OmenLogin from "@/app/(auth)/login/page";
import Dashboard from "@/app/(portal)/dashboard/page";
import KnowledgeBasesPage from "@/app/(portal)/knowledge-bases/page";
import AnalyticsPage from "@/app/(portal)/analytics/page";
import ChatPage from "@/app/(portal)/chat/page";
import SettingsPage from "@/app/(portal)/settings/page";
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
  { path: "/login", element: <OmenLogin /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <PortalShell />,
        children: [
          { path: "/dashboard", element: <Dashboard /> },
          { path: "/knowledge-bases", element: <KnowledgeBasesPage /> },
          { path: "/analytics", element: <AnalyticsPage /> },
          { path: "/chat", element: <ChatPage /> },
          { path: "/settings", element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/login" replace /> },
]);
