"use client";

import React, { useEffect, useState } from "react";
import { LogoArtwork } from "./logo-artwork";

export interface LogoLoaderProps {
  /**
   * Pixel dimension or CSS size (width and height will be equal).
   * @default 72
   */
  size?: number | string;

  /**
   * Whether to loop the animation continuously.
   * When true, the logo traces, forms the droplet, holds, and repeats smoothly.
   * @default true
   */
  loop?: boolean;

  /**
   * Optional text displayed under the animated logo.
   */
  text?: React.ReactNode;

  /**
   * If true, centers the loader in a full-height container with a subtle backdrop.
   * @default false
   */
  fullPage?: boolean;

  /**
   * Additional CSS classes for the outer wrapper.
   */
  className?: string;

  /**
   * Additional CSS classes for the text label.
   */
  textClassName?: string;

  /**
   * Accessible description for screen readers.
   * @default "Carregando"
   */
  label?: string;
}

/**
 * Official Marcaí animated logo loader.
 * Traces the 'm' letterform, forms and detaches the droplet, and resolves to the brand mark.
 */
export const LogoLoader: React.FC<LogoLoaderProps> = ({
  size = 72,
  loop = true,
  text,
  fullPage = false,
  className = "",
  textClassName = "",
  label = "Carregando",
}) => {
  const [frame, setFrame] = useState(0);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    // Respect reduced-motion preferences
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setFrame(59);
      setOpacity(1);
      return;
    }

    let requestId: number;
    let startTime: number | undefined;

    // Timing constants for a refined loop:
    // 0 -> 1000ms: Drawing & droplet detachment (frame 0 to 59)
    // 1000ms -> 1400ms: Still hold on completed logo
    // 1400ms -> 1700ms: Subtle fade transition into next cycle
    const drawDuration = 1000;
    const holdDuration = 400;
    const fadeDuration = 300;
    const totalCycle = drawDuration + holdDuration + fadeDuration;

    const tick = (now: number) => {
      if (startTime === undefined) startTime = now;
      const elapsed = now - startTime;

      if (!loop) {
        if (elapsed < drawDuration) {
          setFrame(Math.min(59, elapsed * 0.059));
          setOpacity(1);
          requestId = requestAnimationFrame(tick);
        } else {
          setFrame(59);
          setOpacity(1);
        }
        return;
      }

      const cycleProgress = elapsed % totalCycle;

      if (cycleProgress < drawDuration) {
        // Active drawing phase
        setFrame(Math.min(59, cycleProgress * 0.059));
        setOpacity(1);
      } else if (cycleProgress < drawDuration + holdDuration) {
        // Hold phase on finished logo
        setFrame(59);
        setOpacity(1);
      } else {
        // Soft fade out / fade in into next loop
        setFrame(59);
        const fadeProgress =
          (cycleProgress - (drawDuration + holdDuration)) / fadeDuration;
        // Smooth sine fade
        const fadeValue = 0.35 + 0.65 * (1 - Math.sin(fadeProgress * Math.PI));
        setOpacity(Math.max(0.2, fadeValue));
      }

      requestId = requestAnimationFrame(tick);
    };

    requestId = requestAnimationFrame(tick);

    return () => {
      if (requestId) cancelAnimationFrame(requestId);
    };
  }, [loop]);

  const numericSize = typeof size === "number" ? `${size}px` : size;

  const content = (
    <div
      role="status"
      aria-label={label}
      aria-live="polite"
      className={`inline-flex flex-col items-center justify-center gap-3 select-none ${className}`}
    >
      <div
        style={{
          width: numericSize,
          height: numericSize,
          opacity,
          transition: "opacity 120ms ease-out",
        }}
        className="relative flex items-center justify-center shrink-0"
      >
        <LogoArtwork frame={frame} title={label} />
      </div>

      {text && (
        <div
          className={`text-sm font-medium text-[var(--brand-900)] tracking-tight animate-pulse ${textClassName}`}
        >
          {text}
        </div>
      )}
      <span className="sr-only">{label}</span>
    </div>
  );

  if (fullPage) {
    return (
      <div
        className="fixed inset-0 z-50 flex min-h-screen w-full items-center justify-center bg-[var(--background,#f4f5f1)]/80 backdrop-blur-sm transition-all"
        role="alert"
        aria-busy="true"
      >
        <div className="flex flex-col items-center justify-center p-8 rounded-2xl bg-white/70 shadow-sm border border-[var(--brand-100,#d9e3dc)]/60">
          {content}
        </div>
      </div>
    );
  }

  return content;
};

/**
 * Pre-configured full-page loader with backdrop blur and branded styling.
 */
export const LogoLoaderPage: React.FC<{
  text?: React.ReactNode;
  size?: number | string;
  className?: string;
}> = ({ text, size = 128, className = "" }) => {
  return (
    <div
      className={`flex min-h-[60vh] w-full flex-col items-center justify-center p-6 ${className}`}
      role="status"
      aria-busy="true"
    >
      <LogoLoader size={size} text={text} loop={true} />
    </div>
  );
};

// Backwards-compatible alias for the initial component name
export const LoadingLogo = LogoLoader;
