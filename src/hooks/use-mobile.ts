"use client";

import { useEffect, useState } from "react";

const MOBILE_QUERY = "(max-width: 768px)";

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(MOBILE_QUERY);
    const update = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(event.matches);
    };

    update(mediaQuery);

    const listener = (event: MediaQueryListEvent) => update(event);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", listener);
      return () => mediaQuery.removeEventListener("change", listener);
    }

    mediaQuery.addListener(listener);
    return () => mediaQuery.removeListener(listener);
  }, []);

  return isMobile;
}
