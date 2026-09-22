import { Suspense } from "react";
import KbDashboardPage from "@/features/admin/screens/kb-detail-screen";

export const dynamic = "force-dynamic";

function KnowledgeBaseLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-muted" />
      <div className="mt-4 h-32 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

export default function AgentKnowledgeBaseDetailPage() {
  return (
    <Suspense fallback={<KnowledgeBaseLoading />}>
      <KbDashboardPage />
    </Suspense>
  );
}
