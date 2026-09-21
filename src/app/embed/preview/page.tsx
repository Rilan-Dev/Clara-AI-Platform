import { Suspense } from "react";
import PreviewScreen from "@/features/embed/screens/preview-screen";
export default function EmbedPreviewPage() {
  return (<Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">Loading preview…</div>}><PreviewScreen /></Suspense>);
}