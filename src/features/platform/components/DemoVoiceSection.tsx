"use client";

import { getPlatformEnvSettings } from "@/modules/phone/core/db";

/**
 * The landing page is only an iframe host. Voice identity, configuration,
 * microphone lifecycle, WebRTC, and AI runtime live inside the public embed
 * route and are authenticated with the real generated KB API key.
 */
export default async function DemoVoiceSection() {

  function setting(settings: Awaited<ReturnType<typeof getPlatformEnvSettings>>, key: string): string {
    return settings.find((s) => s.key === key)?.value?.trim() ?? "";
  }
  const settings = await getPlatformEnvSettings();
  const key = setting(settings, "DEMO_CLARA_API_KEY").toLowerCase() ?? (process.env.NEXT_PUBLIC_LANDING_EMBED_API_KEY?.trim() || process.env.NEXT_PUBLIC_CLARA_EMBED_API_KEY?.trim() || "").toLowerCase();


  if (!key) {
    return (
      <section className="relative z-10 py-24 px-6">
        <div className="max-w-5xl mx-auto rounded-3xl border border-amber-500/20 bg-amber-500/[0.04] px-6 py-10 text-center">
          <p className="text-sm font-semibold text-amber-300">Voice demo configuration is missing</p>
          <p className="mt-2 text-sm text-white/45">
            Set NEXT_PUBLIC_LANDING_EMBED_API_KEY to the active knowledge-base embed key and restart the dev server.
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
