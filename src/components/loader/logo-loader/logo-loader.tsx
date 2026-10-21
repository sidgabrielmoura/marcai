"use client";

import type { ReactNode } from "react";
import { TarefaiStickerLoader } from "../sticker-loader";

export interface LogoLoaderProps {
  size?: number | string;
  loop?: boolean;
  text?: ReactNode;
  fullPage?: boolean;
  className?: string;
  textClassName?: string;
  label?: string;
}

/** Shared entry point for route, drawer and inline loading states. */
export function LogoLoader({ size = 72, loop = true, text, fullPage = false, className = "", textClassName = "", label = "Carregando" }: LogoLoaderProps) {
  const content = (
    <div className={`inline-flex flex-col items-center justify-center gap-3 select-none ${className}`}>
      <TarefaiStickerLoader size={size} loop={loop} label={label} decorative={Boolean(text)} />
      {text && <div role="status" className={`text-sm font-medium text-[var(--brand-900)] tracking-tight ${textClassName}`}>{text}</div>}
    </div>
  );
  return fullPage ? <div className="fixed inset-0 z-50 flex min-h-dvh w-full items-center justify-center bg-[var(--background,#f4f5f1)]" aria-busy="true">{content}</div> : content;
}

export function LogoLoaderPage({ text, size = 128, className = "" }: { text?: ReactNode; size?: number | string; className?: string }) {
  return <div className={`flex min-h-[60vh] w-full items-center justify-center p-6 ${className}`} aria-busy="true"><LogoLoader size={size} text={text} /></div>;
}

export const LoadingLogo = LogoLoader;
