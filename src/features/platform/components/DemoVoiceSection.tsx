"use client";

import { useEffect, useState } from "react";

/**
 * The landing page is only an iframe host. Voice identity, configuration,
 * microphone lifecycle, WebRTC, and AI runtime live inside the public embed
 * route and are authenticated with the generated KB API key.
 */
export default function DemoVoiceSection() {
  const [key, setKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/embed/demo-config", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Demo configuration request failed");
        return response.json() as Promise<{ key?: string }>;
      })
      .then((data) => {
        if (!cancelled) setKey(data.key?.trim() ?? "");
      })
      .catch(() => {
        if (!cancelled) setKey("");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (key === null) {
    return <section className="relative z-10 w-full h-[760px]" aria-hidden="true" />;
  }

  if (!key) {
    return (
      <section className="relative z-10 py-24 px-6">
        <div className="max-w-5xl mx-auto rounded-3xl border border-amber-500/20 bg-amber-500/[0.04] px-6 py-10 text-center">
          <p className="text-sm font-semibold text-amber-300">Voice demo configuration is missing</p>
          <p className="mt-2 text-sm text-white/45">
            Set DEMO_CLARA_API_KEY or NEXT_PUBLIC_LANDING_EMBED_API_KEY and restart the server.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="relative z-10 w-full">
      <iframe
        title="Clara AI voice assistant"
        src={`/embed/voice?key=${encodeURIComponent(key)}`}
        className="block w-full border-0"
        style={{ height: 760 }}
        allow="microphone; autoplay"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </section>
  );
}
