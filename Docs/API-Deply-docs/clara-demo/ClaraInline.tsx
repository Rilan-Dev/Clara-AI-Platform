/**
 * APPROACH 2 — Inline iFrame Chat
 * src/components/clara/ClaraInline.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Embed the full chat as an inline <iframe> anywhere in your layout.
 * The server controls all design (theme, colours, branding, custom CSS, etc.)
 * via the admin Design tab — no changes needed here.
 *
 * Usage:
 *   <ClaraInline height={520} className="rounded-2xl shadow-xl" />
 *   <ClaraInline height="100%" rounded={false} />
 */
import { CLARA_CONFIG } from "@/lib/clara/config";

interface ClaraInlineProps {
  height?:    number | string;
  width?:     number | string;
  rounded?:   boolean;
  shadow?:    boolean;
  className?: string;
}

export function ClaraInline({
  height    = 600,
  width     = "100%",
  rounded   = true,
  shadow    = true,
  className = "",
}: ClaraInlineProps) {
  const src = `${CLARA_CONFIG.iframeUrl}?key=${CLARA_CONFIG.apiKey}`;
  const borderRadius = rounded ? "16px" : "0";
  const boxShadow    = shadow  ? "0 8px 40px rgba(0,0,0,0.14)" : "none";

  return (
    <iframe
      src={src}
      title="Clara AI Assistant"
      allow="microphone"
      style={{
        width, height, border: "none", borderRadius, boxShadow,
        display: "block",
      }}
      className={className}
    />
  );
}
