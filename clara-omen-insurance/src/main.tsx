import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import "./app/globals.css";
import { AppShell } from "./shared/layouts/app-shell";
import { router } from "./router";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppShell>
      <RouterProvider router={router} />
    </AppShell>
  </React.StrictMode>
);
