"use client";

import { useEffect, useState } from "react";
import type { FeatureAvailability } from "@/lib/feature-availability";

// The feature list stays denied until this deployment's own status endpoint
// responds. Readiness is distinct from availability: enabled development
// settings must not redirect before their asynchronous status has loaded.
const unavailable: FeatureAvailability = { embeddableWidget: false, integrations: false };

export type PlatformFeatureStatus = {
  features: FeatureAvailability;
  ready: boolean;
};

export function usePlatformFeatureStatus(): PlatformFeatureStatus {
  const [status, setStatus] = useState<PlatformFeatureStatus>({
    features: unavailable,
    ready: false,
  });
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/features", { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Feature status unavailable");
        return (await res.json()) as { features?: Partial<FeatureAvailability> };
      })
      .then((value) => {
        if (controller.signal.aborted) return;
        setStatus({
          ready: true,
          features: {
            embeddableWidget: value.features?.embeddableWidget === true,
            integrations: value.features?.integrations === true,
          },
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus({ features: unavailable, ready: true });
      });
    return () => controller.abort();
  }, []);
  return status;
}

// Existing navigation callers need only the fail-closed features; the settings
// redirect caller also needs readiness to avoid bouncing valid dev pages.
export function usePlatformFeatures(): FeatureAvailability {
  return usePlatformFeatureStatus().features;
}
