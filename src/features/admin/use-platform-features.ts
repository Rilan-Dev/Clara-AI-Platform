"use client";

import { useEffect, useState } from "react";
import type { FeatureAvailability } from "@/lib/feature-availability";

// Fail closed while loading or offline. No localStorage and no build-time
// NEXT_PUBLIC flag: the same JS asset can serve either deployment safely.
const unavailable: FeatureAvailability = { embeddableWidget: false, integrations: false };

export function usePlatformFeatures(): FeatureAvailability {
  const [features, setFeatures] = useState<FeatureAvailability>(unavailable);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/features", { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Feature status unavailable");
        return (await res.json()) as { features?: Partial<FeatureAvailability> };
      })
      .then((value) => {
        if (controller.signal.aborted) return;
        setFeatures({
          embeddableWidget: value.features?.embeddableWidget === true,
          integrations: value.features?.integrations === true,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setFeatures(unavailable);
      });
    return () => controller.abort();
  }, []);
  return features;
}
