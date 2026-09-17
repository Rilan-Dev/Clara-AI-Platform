"use client";

/**
 * src/app/global-error.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 6.3: last-resort error boundary. Renders a calm maintenance-style
 * screen for unhandled render/runtime failures (e.g. the database being
 * unreachable during SSR) instead of a raw stack trace. The error details
 * are logged server-side; the visitor only ever sees this friendly page.
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the real cause in server/terminal logs only.
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          backgroundColor: "#f8fafc",
          color: "#0f172a",
        }}
      >
        <div
          role="alert"
          style={{
            maxWidth: "480px",
            margin: "24px",
            padding: "40px",
            borderRadius: "16px",
            backgroundColor: "#ffffff",
            border: "1px solid #e2e8f0",
            boxShadow: "0 4px 24px rgba(15, 23, 42, 0.06)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              margin: "0 auto 20px",
              borderRadius: "50%",
              backgroundColor: "#fef3c7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "26px",
            }}
            aria-hidden
          >
            🛠️
          </div>
          <h1 style={{ margin: "0 0 12px", fontSize: "22px", fontWeight: 700 }}>
            We&rsquo;ll be right back
          </h1>
          <p
            style={{
              margin: "0 0 8px",
              fontSize: "15px",
              lineHeight: 1.6,
              color: "#475569",
            }}
          >
            Something interrupted this page — most often a short maintenance
            window or a temporary connection issue. Nothing you did was wrong,
            and your data is safe.
          </p>
          {error.digest ? (
            <p style={{ margin: "0 0 20px", fontSize: "12px", color: "#94a3b8" }}>
              Reference: {error.digest}
            </p>
          ) : (
            <div style={{ height: "20px" }} />
          )}
          <button
            onClick={reset}
            style={{
              padding: "12px 28px",
              borderRadius: "10px",
              border: "none",
              backgroundColor: "#0f172a",
              color: "#ffffff",
              fontSize: "15px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <p style={{ margin: "24px 0 0", fontSize: "13px", color: "#94a3b8" }}>
            Clara AI Platform · If the problem persists, please contact support.
          </p>
        </div>
      </body>
    </html>
  );
}
