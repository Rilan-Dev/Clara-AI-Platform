"use client";

import { Analytics } from "@vercel/analytics/next";

export function ClaraAnalytics() {
  return (
    <Analytics
      beforeSend={(event) =>
        event.url.includes("/admin") ? null : event
      }
    />
  );
}
