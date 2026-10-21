"use client";

import type { ComponentProps } from "react";
import { cn } from "cn";
import { TarefaiStickerLoader } from "@/components/loader/sticker-loader";

function Spinner({ className, ...props }: ComponentProps<"span">) {
  return <span data-slot="spinner" role="status" aria-label="Carregando" className={cn("inline-flex size-4 shrink-0 items-center justify-center align-middle", className)} {...props}><TarefaiStickerLoader size="100%" decorative /></span>;
}

export { Spinner };
export { LogoLoader, LogoLoaderPage } from "@/components/loader/logo-loader";
