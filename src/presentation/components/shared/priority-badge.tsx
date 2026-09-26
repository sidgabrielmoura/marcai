import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PriorityBadgeProps {
  priority: string;
  className?: string;
  size?: "default" | "sm";
}

export function PriorityBadge({
  priority,
  className = "",
  size = "default",
}: PriorityBadgeProps) {
  const isSm = size === "sm";

  const configMap: Record<string, { label: string; bg: string; text: string }> =
  {
    CRITICAL: {
      label: "Crítica",
      bg: "bg-red-50 border border-red-200",
      text: "text-red-900",
    },
    HIGH: {
      label: "Alta",
      bg: "bg-amber-50 border border-amber-200",
      text: "text-amber-900",
    },
    MEDIUM: {
      label: "Média",
      bg: "bg-[var(--neutral-200)]/60 border border-[var(--border-subtle)]",
      text: "text-[var(--brand-900)]",
    },
    LOW: {
      label: "Baixa",
      bg: "bg-[var(--canvas)] border border-[var(--border-subtle)]",
      text: "text-[var(--brand-700)]",
    },
  };

  const config = configMap[priority] || {
    label: priority,
    bg: "bg-[var(--neutral-200)]",
    text: "text-[var(--brand-900)]",
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex items-center font-semibold flex-1 rounded-[8px] text-xs! tracking-wider h-auto border-0",
        isSm
          ? "text-[length:var(--type-caption)] px-1.5 py-0.5"
          : "text-[length:var(--type-caption)] px-2 py-0.5",
        config.bg,
        config.text,
        className,
      )}
    >
      {config.label}
    </Badge>
  );
}
