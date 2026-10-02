"use client";

import React, { useId } from "react";
import { logoData } from "./logo-data";

/**
 * High-performance, zero-dependency piecewise interpolation matching Remotion's easing curves.
 * Safe for React Server Components (RSC) and Client Components across all Next.js environments.
 */
function interpolate(
  input: number,
  inputRange: readonly number[],
  outputRange: readonly number[],
  options?: {
    easing?: ((t: number) => number) | readonly ((t: number) => number)[];
  }
): number {
  if (input <= inputRange[0]) return outputRange[0];
  if (input >= inputRange[inputRange.length - 1]) {
    return outputRange[outputRange.length - 1];
  }

  let i = 0;
  while (i < inputRange.length - 1 && input > inputRange[i + 1]) {
    i++;
  }

  const inStart = inputRange[i];
  const inEnd = inputRange[i + 1];
  const outStart = outputRange[i];
  const outEnd = outputRange[i + 1];

  let t = (input - inStart) / (inEnd - inStart);
  t = Math.min(Math.max(t, 0), 1);

  if (options?.easing) {
    const easeFn = Array.isArray(options.easing)
      ? options.easing[i] || ((x: number) => x)
      : options.easing;
    t = easeFn(t);
  }

  return outStart + t * (outEnd - outStart);
}

const easeQuadIn = (t: number) => t * t;
const easeQuadOut = (t: number) => t * (2 - t);
const easeQuadInOut = (t: number) =>
  t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

export interface LogoArtworkProps {
  /** Time expressed in 60 fps reference frames (0 to 60) */
  frame: number;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

/**
 * High-fidelity vector animated artwork for the Marcaí logo.
 * Time is expressed in 60 fps reference frames.
 */
export const LogoArtwork: React.FC<LogoArtworkProps> = ({
  frame,
  className,
  style,
  title = "Marcaí - Carregando",
}) => {
  const rawId = useId();
  const id = `ml-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const left = interpolate(frame, [0, 19], [0, 1]);
  const middle = interpolate(frame, [19, 26], [0, 1]);
  const right = interpolate(frame, [26, 39], [0, 1]);

  const dropY = interpolate(
    frame,
    [39, 46, 52, 56],
    [-108, -56, 3, 0],
    {
      easing: [easeQuadIn, easeQuadOut, easeQuadInOut],
    }
  );

  const dropXScale = interpolate(
    frame,
    [39, 44, 49, 53, 56],
    [0, 0.43, 0.72, 1.04, 1]
  );
  const dropYScale = interpolate(
    frame,
    [39, 44, 49, 53, 56],
    [0, 0.55, 0.94, 0.97, 1]
  );
  const neckWidth = interpolate(
    frame,
    [39, 43, 46, 49],
    [0, 19, 12, 0]
  );
  const neckBottom = Math.min(498, 514 + dropY);

  const envelopeRx = interpolate(frame, [39, 49, 56], [54, 56, 135]);
  const envelopeRy = interpolate(frame, [39, 49, 56], [58, 58, 95]);

  return (
    <svg
      viewBox="0 0 737 737"
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
      style={{
        display: "block",
        overflow: "visible",
        ...style,
      }}
    >
      <title>{title}</title>
      <defs>
        <clipPath id={`${id}-body`}>
          <path d="M0 0H737V448H475V737H0Z" />
        </clipPath>
        <clipPath id={`${id}-drop`}>
          <rect x="475" y="450" width="262" height="160" />
        </clipPath>
        <clipPath id={`${id}-envelope`}>
          <ellipse cx="598" cy="514" rx={envelopeRx} ry={envelopeRy} />
        </clipPath>
        <mask
          id={`${id}-reveal`}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="737"
          height="737"
          style={{ maskType: "luminance" }}
        >
          <g
            fill="none"
            stroke="white"
            strokeWidth="128"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {left > 0 && (
              <path
                d="M139 632 L139 328 C139 282 176 240 219 244 C251 244 274 271 294 290 L369 364"
                strokeDasharray="629.54 629.54"
                strokeDashoffset={629.54 * (1 - left)}
              />
            )}
            {middle > 0 && (
              <path
                d="M369 364 L369 521"
                strokeDasharray="157 157"
                strokeDashoffset={157 * (1 - middle)}
              />
            )}
            {right > 0 && (
              <path
                d="M369 364 L484 260 C514 233 540 239 563 261 C586 282 598 302 598 324 L598 392"
                strokeDasharray="386.645 386.645"
                strokeDashoffset={386.645 * (1 - right)}
              />
            )}
          </g>
        </mask>
      </defs>

      {/* Main body of the 'm' glyph */}
      <g
        clipPath={`url(#${id}-body)`}
        mask={frame < 39 ? `url(#${id}-reveal)` : undefined}
      >
        <image href={logoData} width="737" height="737" />
      </g>

      {/* Stretching droplet neck */}
      {frame > 39 && frame < 49 && (
        <path
          d={`M${598 - neckWidth} 420 C${598 - neckWidth} 440 ${
            598 - neckWidth * 0.3
          } ${neckBottom - 28} ${598 - neckWidth * 1.2} ${neckBottom} Q598 ${
            neckBottom + 9
          } ${598 + neckWidth * 1.2} ${neckBottom} C${
            598 + neckWidth * 0.3
          } ${neckBottom - 28} ${598 + neckWidth} 440 ${
            598 + neckWidth
          } 420Z`}
          fill="#1c4b39"
        />
      )}

      {/* Detaching and falling droplet */}
      {frame > 39 && (
        <g
          transform={`translate(598 ${514 + dropY}) scale(${dropXScale} ${dropYScale}) translate(-598 -514)`}
        >
          <g clipPath={`url(#${id}-drop)`}>
            <g clipPath={`url(#${id}-envelope)`}>
              <image href={logoData} width="737" height="737" />
            </g>
          </g>
        </g>
      )}
    </svg>
  );
};
