"use client";

import { LogoLoader } from "@/components/loader/logo-loader";

export default function AuthLoading() {
  return (
    <div
      role="status"
      aria-label="Carregando"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--background,#f4f5f1)]"
    >
      <LogoLoader size={128} loop={true} />
    </div>
  );
}
