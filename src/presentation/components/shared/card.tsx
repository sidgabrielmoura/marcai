import { ReactNode } from "react";
import { Card as ShadcnCard } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface CardProps {
  children: ReactNode;
  className?: string;
  variant?: "surface" | "muted" | "brand";
  onClick?: () => void;
}

export function Card({
  children,
  className = "",
  variant = "surface",
  onClick,
}: CardProps) {
  const variantStyles = {
    surface:
      "bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] shadow-none ring-0",
    muted:
      "bg-[var(--neutral-200)]/40 text-[var(--text-primary)] border border-[var(--border-subtle)] shadow-none ring-0",
    brand:
      "bg-[var(--brand-900)] text-white shadow-[var(--shadow-card)] ring-0",
  };

  return (
    <ShadcnCard
      onClick={onClick}
      className={cn(
        "rounded-[18px] p-4 sm:p-5 transition-all",
        variantStyles[variant],
        onClick &&
          "cursor-pointer hover:border-[var(--brand-700)] active:scale-[0.99]",
        className,
      )}
    >
      {children}
    </ShadcnCard>
  );
}
