"use client";

import { useEffect, useRef } from "react";
import { initFluid } from "smokey-fluid-cursor";

type InteractiveGradientBackgroundProps = {
  className?: string;
};

const CANVAS_ID = "landing-smokey-fluid-canvas";
const IDLE_WAKE_DELAY_MS = 2400;
const IDLE_WAKE_INTERVAL_MS = 1400;
const MOBILE_BREAKPOINT = 768;

function pinCanvasToLayer(canvas: HTMLCanvasElement) {
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    zIndex: "0",
    pointerEvents: "none",
  });
}

function syncCanvasSize(canvas: HTMLCanvasElement) {
  const rect = canvas.parentElement?.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const width = Math.max(1, Math.floor((rect?.width || window.innerWidth) * dpr));
  const height = Math.max(1, Math.floor((rect?.height || window.innerHeight) * dpr));

  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

export default function InteractiveGradientBackground({
  className = "",
}: InteractiveGradientBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const isTouchDevice = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    const isSmallScreen = window.innerWidth < MOBILE_BREAKPOINT;

    // The fluid simulation is intentionally disabled on mobile/touch devices.
    // A continuously rendered WebGL simulation behind a long landing page can
    // compete with scrolling, audio, and touch input on lower-power devices.
    if (mediaQuery.matches || isTouchDevice || isSmallScreen) {
      canvas.style.display = "none";
      return;
    }

    let cancelled = false;
    let idleWakeId: number | undefined;
    let resizeFrame = 0;
    let lastUserMove = performance.now();

    pinCanvasToLayer(canvas);
    syncCanvasSize(canvas);

    try {
      initFluid({
        id: CANVAS_ID,
        simResolution: 64,
        dyeResolution: 512,
        captureResolution: 384,
        densityDissipation: 1.45,
        velocityDissipation: 1.1,
        pressure: 0.08,
        pressureIteration: 12,
        curl: 22,
        splatRadius: 0.115,
        splatForce: 3600,
        shading: true,
        colorUpdateSpeed: 2.0,
        paused: false,
        backColor: { r: 0, g: 0, b: 0 },
        transparent: true,
      });

      if (cancelled || !canvas.isConnected) return;

      pinCanvasToLayer(canvas);
      syncCanvasSize(canvas);

      const markUserMove = () => {
        lastUserMove = performance.now();
      };

      const handleResize = () => {
        if (resizeFrame) return;
        resizeFrame = window.requestAnimationFrame(() => {
          resizeFrame = 0;
          if (!cancelled) syncCanvasSize(canvas);
        });
      };

      const dispatchFluidMove = (x: number, y: number) => {
        if (cancelled || document.hidden) return;
        window.dispatchEvent(
          new MouseEvent("mousemove", {
            clientX: x,
            clientY: y,
            bubbles: true,
          }),
        );
      };

      const addIdleWake = () => {
        if (cancelled || document.hidden || performance.now() - lastUserMove < IDLE_WAKE_DELAY_MS) {
          return;
        }

        const rect = canvas.getBoundingClientRect();
        const time = performance.now() * 0.001;
        const x = rect.left + rect.width * (0.62 + Math.sin(time * 0.6) * 0.18);
        const y = rect.top + rect.height * (0.54 + Math.cos(time * 0.5) * 0.14);
        dispatchFluidMove(x, y);
      };

      window.addEventListener("pointermove", markUserMove, { passive: true });
      window.addEventListener("resize", handleResize, { passive: true });
      dispatchFluidMove(window.innerWidth * 0.58, window.innerHeight * 0.44);
      window.setTimeout(() => dispatchFluidMove(window.innerWidth * 0.64, window.innerHeight * 0.5), 120);
      idleWakeId = window.setInterval(addIdleWake, IDLE_WAKE_INTERVAL_MS);

      return () => {
        cancelled = true;
        window.removeEventListener("pointermove", markUserMove);
        window.removeEventListener("resize", handleResize);
        if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
        if (idleWakeId !== undefined) window.clearInterval(idleWakeId);
      };
    } catch {
      canvas.style.display = "none";
      canvas.parentElement?.classList.add("interactive-gradient-background--fallback");
    }

    return () => {
      cancelled = true;
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      if (idleWakeId !== undefined) window.clearInterval(idleWakeId);
    };
  }, []);

  return (
    <div aria-hidden="true" className={`interactive-gradient-background ${className}`}>
      <canvas id={CANVAS_ID} ref={canvasRef} className="interactive-gradient-background__canvas" />
      <span className="interactive-gradient-background__shade" />
    </div>
  );
}
