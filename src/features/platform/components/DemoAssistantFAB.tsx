"use client";

import { useEffect, useState } from "react";

/**
 * The landing page only hosts the customer-facing embed runtime. The iframe
 * owns the FAB, chat UI, configuration and authenticated API calls.
 */
export default function DemoAssistantFAB() {
  const [open, setOpen] = useState(false);
  const key = process.env.NEXT_PUBLIC_LANDING_EMBED_API_KEY?.trim() ?? "";
  const src = `/embed/landing-demo?mode=fab&key=${encodeURIComponent(key)}`;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "clara:fab-state") setOpen(Boolean(event.data.open));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <iframe
      title="Clara AI chat assistant"
      src={src}
      className="fixed bottom-0 right-0 z-[9998] border-0 bg-transparent"
      style={{
        width: open ? 460 : 120,
        height: open ? 740 : 120,
        pointerEvents: "auto",
      }}
      allow="microphone; autoplay"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
