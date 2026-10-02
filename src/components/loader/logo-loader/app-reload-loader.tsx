"use client";

import React, { useEffect, useState } from "react";
import { LogoLoader } from "./logo-loader";

export interface AppReloadLoaderProps {
  /**
   * Pixel size of the animated logo.
   * @default 128
   */
  size?: number | string;

  /**
   * Minimum display time in milliseconds on reload before fading out.
   * @default 700
   */
  minDurationMs?: number;
}

/**
 * Full-screen smooth reload overlay.
 * Displays immediately when the application or page is reloaded,
 * holding until initial client mount/hydration, then fades out gracefully.
 */
export const AppReloadLoader: React.FC<AppReloadLoaderProps> = ({
  size = 128,
  minDurationMs = 700,
}) => {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    setMounted(true);

    // If user prefers reduced motion, dismiss immediately
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setVisible(false);
      return;
    }

    const timer = setTimeout(() => {
      setFading(true);
      const removeTimer = setTimeout(() => {
        setVisible(false);
      }, 350);
      return () => clearTimeout(removeTimer);
    }, minDurationMs);

    return () => clearTimeout(timer);
  }, [minDurationMs]);

  if (!visible) return null;

  return (
    <div
      id="marcai-reload-loader"
      aria-hidden={fading}
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--background,#f4f5f1)] transition-opacity duration-300 ease-out select-none ${
        fading ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <div className="flex flex-col items-center justify-center">
        <LogoLoader size={size} loop={true} />
      </div>
    </div>
  );
};
