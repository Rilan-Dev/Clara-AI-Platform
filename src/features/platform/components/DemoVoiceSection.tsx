"use client";

/**
 * Landing-page voice is intentionally only a host for the public embed runtime.
 * The complete voice UI/session lifecycle is rendered inside the dynamic iframe.
 */
export default function DemoVoiceSection() {
  const key = process.env.NEXT_PUBLIC_LANDING_EMBED_API_KEY?.trim() ?? "";
  const src = `/embed/landing-demo?mode=voice&key=${encodeURIComponent(key)}`;

  return (
    <iframe
      title="Clara AI voice assistant"
      src={src}
      className="block w-full border-0"
      style={{ height: 720 }}
      allow="microphone; autoplay"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
