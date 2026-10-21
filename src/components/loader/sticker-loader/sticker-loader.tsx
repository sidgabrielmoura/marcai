"use client";

import { useEffect, useId, useRef, type CSSProperties } from "react";
import styles from "./sticker-loader.module.css";

export interface TarefaiStickerLoaderProps {
  size?: number | string;
  /** A complete stick / peel cycle, capped at 1,500 ms. */
  durationMs?: number;
  /** With false, sticks once and leaves the complete logo visible. */
  loop?: boolean;
  label?: string;
  className?: string;
  style?: CSSProperties;
  /** Hide the artwork when its parent already names the loading state. */
  decorative?: boolean;
}

type Point = { x: number; y: number };
type Layer = "face" | "front" | "back";

// The original vector contours, without the rounded-square background.
// The diagonal inset below the crossbar is part of the T's outline.
const OUTLINES = [
  "M1685.1 758.96H1962.23C2107.2 758.96 2224.72 876.72 2224.72 1021.97C2224.72 1167.2 2107.19 1284.96 1962.23 1284.96H1685.1V2012.6C1685.1 2084.34 1655.01 2149.02 1606.8 2194.68L1600.94 2200.08L1600.78 2200.22L1256.84 2516.33L1255.08 2517.95C1232.53 2538.17 1202.78 2550.45 1170.17 2550.45C1099.82 2550.45 1042.78 2493.32 1042.78 2422.83V1485.63L1283.38 1285.38H1042.78V1284.96H765.63C620.66 1284.96 503.16 1167.2 503.16 1021.97C503.16 876.72 620.67 758.96 765.63 758.96Z",
  "M2496.85 633.65C2496.85 735.32 2414.6 817.75 2313.11 817.75C2281.07 817.75 2250.94 809.53 2224.72 795.08C2207.44 785.57 2191.85 773.34 2178.53 758.96C2148.03 726.11 2129.37 682.04 2129.37 633.65C2129.37 531.98 2211.64 449.55 2313.11 449.55C2414.6 449.55 2496.85 531.99 2496.85 633.65Z",
] as const;

const LEFT = 28.316;
const RIGHT = 227.685;
const WIDTH = RIGHT - LEFT;

function clipAtX(points: Point[], boundary: number, keepLeft: boolean): Point[] {
  if (!points.length) return [];
  const clipped: Point[] = [];
  let previous = points[points.length - 1];
  let previousInside = keepLeft ? previous.x <= boundary : previous.x >= boundary;

  for (const point of points) {
    const inside = keepLeft ? point.x <= boundary : point.x >= boundary;
    if (inside !== previousInside) {
      const fraction = (boundary - previous.x) / (point.x - previous.x);
      clipped.push({ x: boundary, y: previous.y + (point.y - previous.y) * fraction });
    }
    if (inside) clipped.push(point);
    previous = point;
    previousInside = inside;
  }
  return clipped;
}

function ease(value: number) {
  return value * value * (3 - 2 * value);
}

/**
 * Transparent, dependency-free SVG sticker loader. The T and dot share one
 * cylindrical bend: the left edge anchors, contact moves right, then reverses.
 * SVG paths update directly, without rendering React on each animation frame.
 */
export function TarefaiStickerLoader({
  size = 96,
  durationMs = 1500,
  loop = true,
  label = "Carregando",
  className,
  style,
  decorative = false,
}: TarefaiStickerLoaderProps) {
  const id = `tarefai-sticker-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const duration = Number.isFinite(durationMs) ? Math.min(1500, Math.max(200, durationMs)) : 1500;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const sources = Array.from(svg.querySelectorAll<SVGPathElement>("[data-outline]"));
    const layers = Object.fromEntries(
      (["face", "front", "back"] as const).map((layer) => [
        layer,
        Array.from(svg.querySelectorAll<SVGPathElement>(`[data-layer="${layer}"] path`)),
      ]),
    ) as Record<Layer, SVGPathElement[]>;
    const shadow = svg.querySelector<SVGGElement>("[data-contact-shadow]")!;
    const shine = svg.querySelector<SVGLinearGradientElement>("[data-curl-shine]")!;
    const motion = svg.querySelector<SVGGElement>("[data-motion]")!;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");

    // Sample once. Clipping before projection keeps the front and green reverse
    // continuous at the fold, including when the detached dot crosses it.
    const outlines = sources.map((source, index) => {
      const length = source.getTotalLength();
      const count = index === 0 ? 560 : 160;
      return Array.from({ length: count }, (_, sample) => {
        const point = source.getPointAtLength((sample / count) * length);
        return { x: point.x / 10 - 22, y: point.y / 10 - 22 };
      });
    });

    function paint(progress: number, opacity = 1) {
      const contact = LEFT + WIDTH * progress;
      const looseWidth = Math.max(0, RIGHT - contact);
      const radius = Math.max(0.001, looseWidth / 2.65);
      const turningPoint = contact + radius * Math.PI / 2;

      function project(point: Point): Point {
        if (point.x <= contact) return point;
        const angle = (point.x - contact) / radius;
        const depth = radius * (1 - Math.cos(angle));
        const scale = 720 / (720 - depth);
        const bentX = contact + radius * Math.sin(angle);
        return {
          x: LEFT + (bentX - LEFT) * scale,
          y: 128 + (point.y - 128) * scale + depth * 0.035,
        };
      }

      function path(points: Point[], curved = false) {
        if (points.length < 3) return "";
        return points.map((point, index) => {
          const mapped = curved ? project(point) : point;
          return `${index ? "L" : "M"}${mapped.x.toFixed(2)} ${mapped.y.toFixed(2)}`;
        }).join("") + "Z";
      }

      outlines.forEach((outline, index) => {
        if (progress >= 1) {
          layers.face[index].setAttribute("d", path(outline));
          layers.front[index].setAttribute("d", "");
          layers.back[index].setAttribute("d", "");
          return;
        }
        // One continuous face avoids an antialiasing seam at the contact line.
        layers.face[index].setAttribute("d", path(clipAtX(outline, turningPoint + 0.1, true), true));
        layers.front[index].setAttribute("d", path(
          clipAtX(clipAtX(outline, contact, false), turningPoint, true), true,
        ));
        layers.back[index].setAttribute("d", path(clipAtX(outline, turningPoint - 0.1, false), true));
      });

      // This shadow is clipped to the logo itself; there is no rectangular mat.
      const crown = project({ x: turningPoint, y: 128 }).x;
      shadow.setAttribute("transform", `translate(${crown} 0) scale(${-Math.max(0.01, radius / 15)} 1)`);
      shadow.setAttribute("opacity", String(looseWidth < 0.1 ? 0 : 0.22));
      shine.setAttribute("x1", String(crown));
      shine.setAttribute("x2", String(contact));
      motion.setAttribute("opacity", String(opacity));
    }

    let request = 0;
    let started: number | undefined;
    let disposed = false;
    let intersecting = true;
    const isVisible = () => !media.matches && !document.hidden && intersecting;

    function tick(now: number) {
      if (disposed || !isVisible()) return;
      started ??= now;
      const elapsed = now - started;

      if (!loop && elapsed >= duration * 0.44) {
        paint(1);
        return;
      }

      const phase = (elapsed % duration) / duration;
      const progress = phase < 0.44
        ? ease(phase / 0.44)
        : phase < 0.54
          ? 1
          : phase < 0.98
            ? 1 - ease((phase - 0.54) / 0.44)
            : 0;
      const opacity = phase < 0.04
        ? ease(phase / 0.04)
        : phase > 0.94
          ? 1 - ease(Math.min(1, (phase - 0.94) / 0.04))
          : 1;
      paint(progress, opacity);
      request = requestAnimationFrame(tick);
    }

    function restart() {
      cancelAnimationFrame(request);
      started = undefined;
      if (media.matches) paint(1);
      else if (isVisible()) request = requestAnimationFrame(tick);
    }

    const observer = typeof IntersectionObserver === "undefined" ? undefined : new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting;
      restart();
    });
    observer?.observe(svg);
    media.addEventListener("change", restart);
    document.addEventListener("visibilitychange", restart);
    restart();

    return () => {
      disposed = true;
      cancelAnimationFrame(request);
      observer?.disconnect();
      media.removeEventListener("change", restart);
      document.removeEventListener("visibilitychange", restart);
    };
  }, [duration, loop]);

  return (
    <span
      role={decorative ? undefined : "status"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      data-tarefai-loader="sticker"
      className={[styles.root, className].filter(Boolean).join(" ")}
      style={{ width: size, height: size, ...style }}
    >
      <svg ref={svgRef} viewBox="0 0 256 256" fill="none" aria-hidden="true" focusable="false" className={`${styles.artwork} size-full`}>
        <defs>
          {OUTLINES.map((outline, index) => <path key={index} id={`${id}-outline-${index}`} data-outline d={outline} />)}
          <linearGradient id={`${id}-green`} x1="35" y1="35" x2="230" y2="235" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2DCE50" />
            <stop offset="1" stopColor="#079653" />
          </linearGradient>
          <linearGradient id={`${id}-back`} x1="40" y1="30" x2="215" y2="235" gradientUnits="userSpaceOnUse">
            <stop stopColor="#76EA87" />
            <stop offset="1" stopColor="#24B760" />
          </linearGradient>
          <linearGradient id={`${id}-shine`} data-curl-shine x1="256" x2="0" y1="0" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="#063D20" stopOpacity="0.36" />
            <stop offset="0.24" stopColor="#CAFFB5" stopOpacity="0.3" />
            <stop offset="0.7" stopColor="#CAFFB5" stopOpacity="0.04" />
            <stop offset="1" stopColor="#079653" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${id}-shadow`} x1="0" x2="15" y1="0" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="#053A1B" stopOpacity="0.8" />
            <stop offset="1" stopColor="#053A1B" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${id}-silhouette`}>
            {OUTLINES.map((_, index) => <use key={index} href={`#${id}-outline-${index}`} transform="matrix(.1 0 0 .1 -22 -22)" />)}
          </clipPath>
        </defs>

        <g className={styles.static} fill={`url(#${id}-green)`}>
          {OUTLINES.map((_, index) => <use key={index} href={`#${id}-outline-${index}`} transform="matrix(.1 0 0 .1 -22 -22)" />)}
        </g>
        <g data-motion className={styles.motion}>
          <g clipPath={`url(#${id}-silhouette)`}>
            <g data-contact-shadow opacity="0"><rect x="0" y="0" width="15" height="256" fill={`url(#${id}-shadow)`} /></g>
          </g>
          <g data-layer="face" fill={`url(#${id}-green)`}><path /><path /></g>
          <g data-layer="front" fill={`url(#${id}-shine)`}><path /><path /></g>
          <g data-layer="back" fill={`url(#${id}-back)`}><path /><path /></g>
        </g>
      </svg>
    </span>
  );
}
