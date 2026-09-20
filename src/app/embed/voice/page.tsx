import { Suspense } from "react";
import VoiceScreen from "@/features/embed/screens/voice-screen";

function VoiceLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
      Loading voice assistant…
    </div>
  );
}

export default function EmbedVoicePage() {
  return (
    <Suspense fallback={<VoiceLoading />}>
      <VoiceScreen />
    </Suspense>
  );
}
