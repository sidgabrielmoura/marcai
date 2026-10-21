import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Pause,
  Lock,
  Ban,
  FileCheck,
  AlertCircle,
  LucideIcon,
} from "lucide-react";
import { uiLabel } from "./ui-labels";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  showIcon?: boolean;
  className?: string;
  size?: "default" | "sm";
}

interface BadgeConfig {
  label: string;
  bg: string;
  text: string;
  border?: string;
  icon?: LucideIcon;
}

export function StatusBadge({
  status,
  showIcon = false,
  className = "",
  size = "default",
}: StatusBadgeProps) {
  const isSm = size === "sm";

  const statusMap: Record<string, BadgeConfig> = {
    OVERDUE: { label: "Atrasada", bg: "bg-amber-50", text: "text-amber-900", icon: Clock },
    COMPLETED: {
      label: "Concluída",
      bg: "bg-emerald-50",
      text: "text-emerald-900",
      border: "border-emerald-200",
      icon: CheckCircle2,
    },
    IN_PROGRESS: {
      label: "Em andamento",
      bg: "bg-[var(--brand-900)]",
      text: "text-white",
      icon: Clock,
    },
    AVAILABLE: {
      label: "Disponível",
      bg: "bg-[var(--sage-400)]/30",
      text: "text-[var(--brand-900)]",
      border: "border-[var(--sage-400)]/40",
      icon: CheckCircle2,
    },
    PAUSED: {
      label: "Pausada",
      bg: "bg-neutral-100",
      text: "text-neutral-700",
      border: "border-neutral-200",
      icon: Pause,
    },
    BLOCKED: {
      label: "Bloqueada",
      bg: "bg-red-50",
      text: "text-red-900",
      border: "border-red-200",
      icon: Lock,
    },
    SUBMITTED: {
      label: "Em revisão",
      bg: "bg-[var(--brand-soft)]",
      text: "text-[var(--brand-900)]",
      border: "border-[var(--neutral-200)]",
      icon: FileCheck,
    },
    PENDING_REVIEW: {
      label: "Aguardando aprovação",
      bg: "bg-[var(--brand-soft)]",
      text: "text-[var(--brand-900)]",
      border: "border-[var(--neutral-200)]",
      icon: FileCheck,
    },
    NEEDS_CORRECTION: {
      label: "Correção solicitada",
      bg: "bg-amber-50",
      text: "text-amber-900",
      border: "border-amber-200",
      icon: AlertTriangle,
    },
    NOT_COMPLETED: {
      label: "Impedimento",
      bg: "bg-rose-50",
      text: "text-rose-900",
      border: "border-rose-200",
      icon: Ban,
    },
    CANCELLED: {
      label: "Cancelada",
      bg: "bg-[var(--neutral-200)]",
      text: "text-[var(--brand-900)]",
      icon: Ban,
    },
    ACTIVE: {
      label: "Ativo",
      bg: "bg-emerald-50",
      text: "text-emerald-900",
      border: "border-emerald-200",
      icon: CheckCircle2,
    },
    SUSPENDED: {
      label: "Suspenso",
      bg: "bg-red-50",
      text: "text-red-900",
      border: "border-red-200",
      icon: Ban,
    },
    ARCHIVED: {
      label: "Arquivado",
      bg: "bg-[var(--neutral-200)]",
      text: "text-[var(--brand-700)]",
      icon: Clock,
    },
  };

  const config = statusMap[status] || {
    label: uiLabel(status),
    bg: "bg-[var(--neutral-200)]",
    text: "text-[var(--brand-900)]",
  };

  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex items-center gap-1 font-semibold rounded-full h-auto",
        isSm
          ? "text-[length:var(--type-caption)] px-2 py-0.5"
          : "text-[length:var(--type-caption)] px-2.5 py-0.5",
        config.bg,
        config.text,
        config.border ? `border ${config.border}` : "border-0",
        className,
      )}
    >
      {showIcon && Icon && <Icon className={isSm ? "size-3" : "size-3.5"} />}
      <span>{config.label}</span>
    </Badge>
  );
}
