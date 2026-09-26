import { ReactNode, isValidElement } from "react";
import { LucideIcon, Inbox } from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon | ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon = Inbox,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <Empty
      className={cn(
        "bg-[var(--surface)] rounded-[18px] p-8 sm:p-10 text-center shadow-none border border-[var(--border-subtle)] border-solid",
        className,
      )}
    >
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className="size-14 rounded-full bg-[var(--neutral-200)]/70 text-[var(--brand-900)] mb-3.5 flex items-center justify-center"
        >
          {isValidElement(icon)
            ? icon
            : (() => {
                const IconComp = (icon as LucideIcon) || Inbox;
                return <IconComp className="size-6" />;
              })()}
        </EmptyMedia>
        <EmptyTitle className="font-bold text-[length:var(--type-card-title)] text-[var(--text-primary)] mb-1">
          {title}
        </EmptyTitle>
        <EmptyDescription className="text-[length:var(--type-label)] text-[var(--text-secondary)] max-w-sm mx-auto leading-relaxed">
          {description}
        </EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent className="mt-4">{action}</EmptyContent>}
    </Empty>
  );
}
