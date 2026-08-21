"use client";

/**
 * Landing-page chat is intentionally only a host for the public embed runtime.
 * The UI, identity, styling and API calls live inside the authenticated iframe.
 */
export default function DemoAssistantFAB() {
  const key = process.env.NEXT_PUBLIC_LANDING_EMBED_API_KEY?.trim() ?? "";
  const src = `/embed/landing-demo?mode=fab&key=${encodeURIComponent(key)}`;

  return (
    <iframe
      title="Clara AI chat assistant"
      src={src}
      className="fixed inset-0 z-[9998] h-full w-full border-0 pointer-events-none"
      allow="microphone; autoplay"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
