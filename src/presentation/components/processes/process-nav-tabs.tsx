"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitMerge, CalendarClock, PlayCircle, Archive } from "lucide-react";
import { cn } from "cn";

export function ProcessNavTabs() {
  const pathname = usePathname();

  const tabs = [
    { label: "Processos", href: "/management/processes", icon: GitMerge },
    { label: "Rotinas", href: "/management/routines", icon: CalendarClock },
    { label: "Execuções", href: "/management/executions", icon: PlayCircle },
    { label: "Arquivados", href: "/management/processes/archived", icon: Archive },
  ];

  function isTabActive(href: string) {
    if (href === "/management/processes/archived") {
      return pathname.startsWith("/management/processes/archived");
    }
    if (href === "/management/processes") {
      return (
        pathname === "/management/processes" ||
        (pathname.startsWith("/management/processes/") &&
          !pathname.startsWith("/management/processes/archived"))
      );
    }
    return pathname.startsWith(href);
  }

  return (
    <nav
      className="flex items-center gap-1 sm:gap-2 border-b border-[var(--border-subtle)] mb-6 overflow-x-auto no-scrollbar"
      aria-label="Navegação do módulo de processos e rotinas"
    >
      {tabs.map((tab) => {
        const active = isTabActive(tab.href);
        const Icon = tab.icon;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-2 px-3.5 py-2.5 text-[length:var(--type-label)] font-medium transition-all whitespace-nowrap -mb-px border-b-2",
              active
                ? "border-[var(--brand-900)] text-[var(--brand-900)] font-semibold"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--neutral-medium)]",
            )}
          >
            <Icon
              className={cn(
                "size-4 shrink-0 transition-colors",
                active
                  ? "text-[var(--brand-900)]"
                  : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]",
              )}
            />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
