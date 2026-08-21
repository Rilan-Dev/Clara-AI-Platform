"use client";

/**
 * The landing page is only an iframe host. Voice identity, configuration,
 * microphone lifecycle, WebRTC, and AI runtime live inside the public embed
 * route and are authenticated with the real generated KB API key.
 */
export default function DemoVoiceSection() {
  const key = process.env.NEXT_PUBLIC_LANDING_EMBED_API_KEY?.trim() ?? "";
  if (!key) return null;

  return (
    <iframe
      title="Clara AI voice assistant"
      src={`/embed/voice?key=${encodeURIComponent(key)}`}
      className="block w-full border-0"
      style={{ height: 760 }}
      allow="microphone; autoplay"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
