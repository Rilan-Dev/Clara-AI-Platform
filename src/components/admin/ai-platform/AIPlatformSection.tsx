"use client";

/**
 * src/components/admin/ai-platform/AIPlatformSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform Admin → Settings → AI Platform.
 *
 *   AI Platform
 *   ├── Providers & Models
 *   │   ├── Chat
 *   │   ├── Voice Chat
 *   │   └── Realtime Voice
 *   └── Default Assistant
 *       ├── Identity / Behaviour / Language / Voice / Preview (draft)
 *       └── Versions (immutable, diff, restore)
 *
 * The previous surface (PlatformEnvPanel + per-organisation AI configuration
 * jump list) is REPLACED: provider credentials/defaults move into the
 * provider workspace, and organisation-level AI configuration no longer
 * exists (migration Stage K).
 */

import { useState } from "react";
import { ProvidersWorkspace } from "./ProvidersWorkspace";
import { DefaultAssistantWorkspace } from "./DefaultAssistantWorkspace";
import { WorkspaceTabs } from "./shared";

type Area = "providers" | "default-assistant";

export function AIPlatformSection() {
  const [area, setArea] = useState<Area>("providers");

  return (
    <div className="space-y-6">
      <WorkspaceTabs
        tabs={[
          { id: "providers" as const, label: "Providers & Models" },
          { id: "default-assistant" as const, label: "Default Assistant" },
        ]}
        active={area}
        onChange={setArea}
      />
      {area === "providers" ? <ProvidersWorkspace /> : <DefaultAssistantWorkspace />}
    </div>
  );
}
